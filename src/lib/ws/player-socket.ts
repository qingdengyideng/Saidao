import {
  WsPlayerDanmakuSchema,
  type WsPlayerDanmaku,
  type WsPlayerDanmakuItem,
} from "./ws-message-types";
import { createSocket, type SocketHandle, type SocketState } from "./base-socket";

/**
 * 播放器弹幕 WebSocket 单例管理器。
 *
 * 设计要点：
 * - 仅下行（只读弹幕流），无鉴权（无 token/fp），客户端不发送任何消息。
 * - 全局唯一连接：多个组件通过 subscribePlayerSocket() 引用计数共享同一条连接。
 * - uid 变更（切换赛道）：关闭旧连接 + 创建新连接。
 * - 心跳关闭：服务器不期望 ping，只读流无需保活。
 *
 * 协议依据：docs/api/websocket.md §2
 */

let socket: SocketHandle<never> | null = null;
let currentUid: string | null = null;
let refCount = 0;

/**
 * 构造 WS URL：同源代理路径，绕过浏览器 CORS 限制。
 *
 * 浏览器从 localhost:4000 直连 wss://api.saidao.cc 时，服务端未配置 CORS 头，
 * 导致 WS 握手响应被浏览器拦截。通过 Next.js 内部代理（rewrites）将
 * /ws-proxy/player/ws 转发到 wss://api.saidao.cc/player/ws，浏览器连同源地址
 * 即可正常工作。生产环境由 nginx 同路径转发。
 */
function buildPlayerUrl(uid: string): string {
  const path = `/ws-proxy/player/ws?uid=${encodeURIComponent(uid)}`;
  if (typeof window !== "undefined") {
    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${host}${path}`;
  }
  return path;
}

/**
 * 获取（或创建）播放器 socket 单例。
 * 若 uid 变化或当前 socket 不存在/已关闭，则关闭旧连接并重建。
 */
function getPlayerSocket(uid: string): SocketHandle<never> {
  if (socket && !socket.isClosed() && currentUid === uid) {
    return socket;
  }

  // uid 变更或 socket 已关闭：关闭旧连接
  if (socket) {
    socket.close();
    socket = null;
  }

  currentUid = uid;

  socket = createSocket<never, WsPlayerDanmaku>({
    buildUrl: () => buildPlayerUrl(uid),
    messageSchema: WsPlayerDanmakuSchema,
    onMessage: (msg: WsPlayerDanmaku) => {
      const comments = msg.comments ?? [];
      onCommentsRef?.(comments);
    },
    onStateChange: (state: SocketState) => {
      onStateChangeRef?.(state);
    },
    enableHeartbeat: false,
  });

  return socket;
}

/** 关闭播放器 socket 并清理模块级状态 */
function closePlayerSocket(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
  currentUid = null;
  onCommentsRef = null;
  onStateChangeRef = null;
}

// 当前订阅者的回调引用（仅最新订阅者生效，引用计数归零时清除）
let onCommentsRef: ((comments: WsPlayerDanmakuItem[]) => void) | null = null;
let onStateChangeRef: ((state: SocketState) => void) | null = null;

/**
 * 引用计数式订阅播放器弹幕：
 * - 首个订阅者触发连接建立
 * - uid 变更时自动切换连接
 * - 最后一个订阅者离开时关闭连接
 * 返回取消订阅函数，在 useEffect cleanup 中调用。
 *
 * @param uid 平台房间 UID
 * @param handlers 回调：onComments（弹幕批）/ onStateChange（连接状态）
 */
export function subscribePlayerSocket(
  uid: string,
  handlers: {
    onComments: (comments: WsPlayerDanmakuItem[]) => void;
    onStateChange?: (state: SocketState) => void;
  },
): () => void {
  refCount += 1;
  onCommentsRef = handlers.onComments;
  onStateChangeRef = handlers.onStateChange ?? null;

  // 若 uid 变更或 socket 不存在，触发重建
  if (refCount === 1 || currentUid !== uid) {
    getPlayerSocket(uid);
  }

  return () => {
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      closePlayerSocket();
    }
  };
}

/** 获取当前播放器 socket 状态（无连接时返回 "closed"） */
export function getPlayerSocketState(): SocketState {
  if (!socket) return "closed";
  return socket.state();
}
