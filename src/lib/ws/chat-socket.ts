import type { ChatMessage } from "@/types/api/message";
import type { ContentAnalysis } from "@/types/api/saidao";
import { useChatStore } from "@/stores/useChatStore";
import { useSaidaoStore } from "@/stores/useSaidaoStore";
import { getSliderCaptchaApi } from "@/api/captcha";
import { config } from "@/config";
import { getFingerprintSync } from "@/lib/fingerprint";
import { WsChatMessageSchema, type WsChatMessage, type WsChatMessageIn } from "./ws-message-types";
import { createSocket, type SocketHandle, type SocketState } from "./base-socket";

/**
 * 聊天 WebSocket 单例管理器。
 *
 * 设计要点：
 * - 全局唯一连接：多个组件通过 subscribeChatSocket() 引用计数共享同一条连接，
 *   避免重复握手与重复消息分发。
 * - token 刷新：buildUrl 每次重连时被 reconnecting-websocket 重新调用，
 *   内部读取 localStorage 取最新 token，因此无需手动重建连接。
 * - 登录/登出切换：由 useChatSocket hook 监听 useAuthStore.status 变化，
 *   主动 close + 重建以立即生效（而非等待下一次重连）。
 *
 * 协议依据：docs/api/websocket.md §1
 */

let socket: SocketHandle<WsChatMessageIn> | null = null;
let currentToken: string | null = null;
let refCount = 0;

/** 构造 WS URL：每次调用读取最新 token / 指纹，支持登录态变化后重连取新值 */
function buildChatUrl(): string {
  const token = localStorage.getItem(config.tokenStorageKey) ?? "";
  const fp = getFingerprintSync() ?? "";
  return `${config.wsBaseUrl}/ws/chat?token=${encodeURIComponent(
    token,
  )}&fp=${encodeURIComponent(fp)}`;
}

/** 合成系统/状态消息为 ChatMessage 结构，走统一 appendMessage 流程 */
function makeSystemMessage(content: string, messageId: string): ChatMessage {
  return {
    uid: 0,
    type: "status",
    uname: "系统",
    content,
    deleted: false,
    messageId,
    timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  };
}

/**
 * 风控：后端只下发 captchaRequired 类型、不内联题目，
 * 由客户端拉取滑块题目（docs/api/captcha.md §与聊天室的协作流程）。
 */
async function loadSliderChallenge(): Promise<void> {
  try {
    const challenge = await getSliderCaptchaApi();
    useChatStore.getState().setPendingCaptcha(challenge);
  } catch (err) {
    console.error("[ws/chat] 拉取滑块验证码失败", err);
    useChatStore.getState().setPendingCaptcha(null);
  }
}

/**
 * 解析 saidaoCoverUpdated.content 双形态（对象或 JSON 字符串）。
 * 对齐旧站 app.js:1913-1922：`typeof payload?.content === 'string' ? JSON.parse : content`。
 * parse 失败返回 null（调用方跳过，与旧站 catch 后 console.warn + return 一致）。
 */
function parseCoverContent(
  content: { uid: string; cover: string; liveUrl: string } | string,
): { uid: string; cover: string; liveUrl: string } | null {
  if (typeof content === "object") return content;
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as { uid?: unknown; cover?: unknown; liveUrl?: unknown };
      if (
        typeof obj.uid === "string" &&
        typeof obj.cover === "string" &&
        typeof obj.liveUrl === "string"
      ) {
        return { uid: obj.uid, cover: obj.cover, liveUrl: obj.liveUrl };
      }
    }
    return null;
  } catch (err) {
    console.warn("[ws/chat] 解析赛道封面更新消息失败", err);
    return null;
  }
}

/** 将下行消息按 type 分发到各 store */
function handleChatMessage(msg: WsChatMessage): void {
  const chat = useChatStore.getState();
  const saidao = useSaidaoStore.getState();

  switch (msg.type) {
    case "user":
      // 后端 user 消息是平铺结构（字段直接在顶层），zod 校验后的 msg 即为 ChatMessage 结构
      chat.appendMessage(msg);
      break;

    case "system":
      chat.appendMessage(makeSystemMessage(msg.content, `system-${Date.now()}`));
      break;

    case "status":
      chat.appendMessage(makeSystemMessage(msg.content, `status-${Date.now()}`));
      break;

    case "history": {
      // 快照可能混入 user/system/status 三类（实测 messages.80.uid 缺失即 status 消息），
      // 按 type 分类处理，对齐旧站 chat-room.js:1616-1624
      console.info(`[chat-ws] history 快照收到 ${msg.messages.length} 条消息`);
      const userMsgs: ChatMessage[] = [];
      for (const m of msg.messages) {
        if (m.type === "user") {
          userMsgs.push(m);
        } else if (m.type === "status") {
          chat.appendMessage(makeSystemMessage(m.content, `status-${Date.now()}`));
        }
        // system 类型：入房/退房提示，新站 UI 暂无对应展示，跳过（旧站 addMessageToChat 直接渲染，
        // 若后续启用系统消息展示，此处再补 makeSystemMessage）
      }
      if (userMsgs.length > 0) {
        chat.applyHistory(userMsgs, false);
      }
      break;
    }

    case "link_preview":
      // 实测契约：preview 嵌套在 linkPreview 字段内，按 messageId 键控（对齐旧站 chat-link-preview.js）
      chat.upsertLinkPreview(msg.messageId, msg.linkPreview);
      break;

    case "onlineCount":
      chat.setOnlineCount(msg.count);
      break;

    case "hotWords":
      chat.setHotWords(msg.words);
      break;

    case "saidaoTagUpdated":
      saidao.updateSaidaoTag(msg.saidaoId, msg.tag);
      break;

    case "hotScoreUpdate":
      saidao.updateHotScores(msg.scores);
      break;

    case "clear":
      chat.clearMessages();
      break;

    case "error":
      console.warn("[ws/chat] 服务端错误", msg.content);
      break;

    case "pong":
      // 心跳回包，仅用于保活，无业务处理
      break;

    case "captchaRequired":
      if (msg.challenge) {
        chat.setPendingCaptcha(msg.challenge);
      } else {
        void loadSliderChallenge();
      }
      break;

    case "messageDeleted":
      chat.markDeleted(msg.messageId);
      break;

    case "pollUpdate":
      // 投票更新 → 触发 SWR 重新拉取（M5-2 实现）
      break;

    case "dailyReportUpdate":
      // 日报更新 → 触发 SWR 重新拉取（M2 已实现 SWR）
      break;

    case "saidaoCoverUpdated": {
      const cover = parseCoverContent(msg.content);
      if (cover) {
        saidao.updateSaidaoCover(cover);
      }
      break;
    }

    case "saidaoContentAnalysisUpdated":
      if (msg.contentAnalysis) {
        saidao.updateContentAnalysis(msg.uid, msg.contentAnalysis as ContentAnalysis);
      }
      break;

    default:
      // video* 类型转交 VideoRequestStore（M5-2 实现）
      if (msg.type.startsWith("video")) {
        break;
      }
      console.warn("[ws/chat] 未知消息类型", msg.type);
  }
}

/**
 * 获取（或创建）聊天 socket 单例。
 * 若当前 socket 不存在或已关闭，则用最新 token 重建。
 * token 变化时（含 null→有值）立即 close 旧连接并用新 token 重建，
 * 确保登录态切换后下次重连取到新 token。
 */
export function getChatSocket(): SocketHandle<WsChatMessageIn> {
  if (socket && !socket.isClosed()) {
    // 检测 token 是否变化（如登录/登出/401 刷新）：
    // 若 token 已变，关闭旧连接以让 buildUrl 取到新 token
    const latest = localStorage.getItem(config.tokenStorageKey);
    if (latest !== currentToken) {
      console.info(
        "[chat-ws] token 变更检测：当前=%s → 最新=%s，关闭旧连接重建",
        currentToken ? "有值" : "空",
        latest ? "有值" : "空",
      );
      socket.close();
      socket = null;
    } else {
      return socket;
    }
  }

  currentToken = localStorage.getItem(config.tokenStorageKey);
  const hasToken = currentToken !== null;
  console.info(
    "[chat-ws] 创建新连接（token=%s，fp=%s）",
    hasToken ? "有值" : "空",
    getFingerprintSync() ? "有值" : "空",
  );

  socket = createSocket<WsChatMessageIn, WsChatMessage>({
    buildUrl: buildChatUrl,
    messageSchema: WsChatMessageSchema,
    onMessage: handleChatMessage,
    onStateChange: (state: SocketState) => {
      console.info("[chat-ws] 连接状态变更: %s", state);
      useChatStore.getState().setWsStatus(state);
    },
  });

  return socket;
}

/** 关闭聊天 socket 并清理模块级状态（不可恢复） */
export function closeChatSocket(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
  currentToken = null;
}

/**
 * 引用计数式订阅：
 * - 首个订阅者触发连接建立
 * - 最后一个订阅者离开时关闭连接
 * 返回取消订阅函数，在 useEffect cleanup 中调用。
 */
export function subscribeChatSocket(): () => void {
  refCount += 1;
  if (refCount === 1) {
    getChatSocket();
  }
  return () => {
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      closeChatSocket();
    }
  };
}
