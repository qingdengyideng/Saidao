import ReconnectingWebSocket from "reconnecting-websocket";
import type { ZodType } from "zod";

/**
 * WS 连接状态机：
 * - connecting  初始状态，尚未收到第一次 open
 * - open        连接已建立，可收发消息
 * - reconnecting 连接断开，reconnecting-websocket 正在按指数退避重试
 * - closed      通过 close() 显式关闭，不可恢复
 */
export type SocketState = "connecting" | "open" | "closed" | "reconnecting";

/**
 * 创建 WS 连接所需的配置。
 * TOut — 接收消息类型（incoming，需与 messageSchema 匹配）
 */
export interface CreateSocketOptions<TOut extends object> {
  /** 构造 WS URL（每次重连时调用，可读取最新 token/fp） */
  buildUrl: () => string;
  /** 处理收到的消息（已 JSON.parse + zod 校验） */
  onMessage: (msg: TOut) => void;
  /** 状态变化回调 */
  onStateChange?: (state: SocketState) => void;
  /** 校验 incoming 消息的 zod schema */
  messageSchema: ZodType<TOut>;
  /** 是否启用 ping/pong 心跳（默认 true） */
  enableHeartbeat?: boolean;
  /** 心跳间隔 ms（默认 30000） */
  heartbeatInterval?: number;
  /** 连接成功后回调 */
  onOpen?: () => void;
  /** 关闭后回调 */
  onClose?: () => void;
}

/** createSocket 返回的句柄，供调用方驱动连接生命周期 */
export interface SocketHandle<TIn extends object> {
  /** 发送消息（JSON.stringify + send） */
  send: (msg: TIn) => void;
  /** 关闭连接（不可恢复） */
  close: () => void;
  /** 获取当前状态（同步） */
  state: () => SocketState;
  /** 是否已关闭（不可再发送） */
  isClosed: () => boolean;
}

const DEFAULT_HEARTBEAT_INTERVAL = 30000;

/**
 * 创建一个带自动重连（reconnecting-websocket 指数退避）的 WS 连接管理器。
 *
 * 用法：
 * ```ts
 * const ws = createSocket<ChatSendMsg, ChatRecvMsg>({
 *   buildUrl: () => `wss://api.saidao.cc/ws?token=${token}&fp=${fp}`,
 *   messageSchema: chatMessageSchema,
 *   onMessage: (msg) => store.handleMessage(msg),
 * });
 * // ... 组件卸载时
 * ws.close();
 * ```
 *
 * 注意：
 * - ReconnectingWebSocket 构造时只接受字符串或函数形式的 UrlProvider。
 *   本实现传 `buildUrl` 函数，使其在每次重连时重新求值，从而支持
 *   token 刷新等动态 URL 场景，无需 close + 重建。
 * - `close()` 调用后状态固定为 `closed`，send() 将被丢弃。
 */
export function createSocket<TIn extends object, TOut extends object>(
  opts: CreateSocketOptions<TOut>,
): SocketHandle<TIn> {
  const heartbeatEnabled = opts.enableHeartbeat !== false;
  const heartbeatMs = opts.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;

  // 连接状态（模块内私有，通过 handle 暴露只读访问）
  let currentState: SocketState = "connecting";
  let explicitlyClosed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** 更新状态并在变化时触发 onStateChange */
  function setState(next: SocketState): void {
    if (currentState === next) return;
    currentState = next;
    opts.onStateChange?.(next);
  }

  /** 启动心跳定时器（仅在 open 时发送 ping） */
  function startHeartbeat(): void {
    stopHeartbeat();
    if (!heartbeatEnabled) return;
    heartbeatTimer = setInterval(() => {
      if (currentState === "open" && !explicitlyClosed) {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // send 在连接异常时可能抛错，忽略即可
        }
      }
    }, heartbeatMs);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ReconnectingWebSocket 的 UrlProvider 接受 () => string，
  // 每次重连都会重新调用，因此 token 刷新后无需重建连接
  const ws = new ReconnectingWebSocket(opts.buildUrl, undefined, {
    minReconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    // maxRetries 不设（默认 Infinity），永不放弃重连
  });

  ws.onopen = () => {
    // 首次连接：connecting → open；重连：reconnecting → open
    setState("open");
    startHeartbeat();
    opts.onOpen?.();
  };

  // ReconnectingWebSocket 在每次重连成功后也会触发 onopen，
  // 因此这里只需判断"当前是否处于 connecting"来区分首次连接
  ws.onclose = () => {
    // 显式关闭时不进入 reconnecting（close() 已处理状态）
    if (explicitlyClosed) return;
    setState("reconnecting");
    stopHeartbeat();
  };

  ws.onmessage = (event: MessageEvent) => {
    if (explicitlyClosed) return;
    const raw: unknown = event.data;
    if (typeof raw !== "string") {
      // 非文本帧（二进制等）跳过
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[ws] JSON.parse 失败，跳过该消息", err, raw.slice(0, 200));
      return;
    }
    const result = opts.messageSchema.safeParse(parsed);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const reason = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "未知";
      console.warn(
        "[ws] zod 校验失败（type=%s），原因: %s，原始 payload 前 200 字符: %s",
        (parsed as { type?: string }).type ?? "unknown",
        reason,
        raw.slice(0, 200),
      );
      return;
    }
    try {
      opts.onMessage(result.data);
    } catch (err) {
      // 业务回调异常不应影响 socket 连接本身
      console.error("[ws] onMessage 回调异常", err);
    }
  };

  ws.onerror = () => {
    // 不在此处打日志：reconnecting-websocket 透传的底层 Event 没有可用的错误信息，
    // 且 error 之后必然紧跟 onclose（状态转为 reconnecting）——该状态已由订阅方
    // 记录或展示（chat-socket 打 info 日志、播放页在 UI 上提示），在此重复输出只会刷屏。
    // 重连由其内部指数退避自动处理，无需额外补救。
  };

  return {
    send(msg: TIn): void {
      if (explicitlyClosed) {
        console.warn("[ws] send 被丢弃：连接已关闭", msg);
        return;
      }
      if (currentState !== "open") {
        console.warn("[ws] send 被丢弃：当前状态非 open（%s）", currentState, msg);
        return;
      }
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        console.error("[ws] send 异常", err, msg);
      }
    },

    close(): void {
      if (explicitlyClosed) return;
      explicitlyClosed = true;
      stopHeartbeat();
      setState("closed");
      try {
        ws.close();
      } catch {
        // close 在已关闭状态下可能抛错，忽略
      }
      opts.onClose?.();
    },

    state(): SocketState {
      return currentState;
    },

    isClosed(): boolean {
      return explicitlyClosed;
    },
  };
}
