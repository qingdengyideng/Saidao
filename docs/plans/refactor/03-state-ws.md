# 03 — 状态管理与 WebSocket 实时通信

> 目标：替换 `window.SaidaoState` 全局可变对象与双份手写 WS 逻辑，建立 zustand 分域 store + `reconnecting-websocket` 统一 socket 层。
> 约束来源：`docs/api/websocket.md`、`openapi.yaml`（WsChatMessageIn/Out、WsPlayerDanmaku）、AGENTS.md §1.2/§2.2。

---

## 1. 状态分域原则

旧站问题：`window.SaidaoState` 一个全局对象混装登录态/聊天宽度/tab 状态/权限位，所有模块随意读写，无依赖追踪。

重构原则：
1. **按变更频率与领域分 store**——聊天消息流（高频、逐条追加）与 UI 状态（低频）分离，避免消息到达导致整站 rerender。
2. **选择器订阅**——组件只订阅自己用的切片：`useChatStore(s => s.messages.length)` 而非 `useChatStore()` 全量。
3. **store 是 WS 事件的唯一写入者**——socket 层解析消息后调用 store action，组件不直接收 WS 事件。
4. **持久化用 zustand/middleware persist**（白名单 key，版本化，与旧站 localStorage key 对齐保证迁移）。

## 2. Store 清单与切片设计

### 2.1 `src/stores/useAuthStore.ts`（认证域）

```ts
interface AuthState {
  /** null = 未登录；undefined = 尚未拉取（首屏判定中） */
  user: User | null;
  token: string | null;
  status: "idle" | "loading" | "authenticated" | "guest";

  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setStatus: (s: AuthState["status"]) => void;
  login: (email: string, password: string, captcha?: { id: string; code: string }) => Promise<void>;
  logout: () => void;
  refreshCurrentUser: () => Promise<void>; // GET /user/ 增量更新（替代旧站 reload）
}
```

要点：
- `token` 持久化到 `localStorage[ACCESS_TOKEN]`（persist 白名单只有 `token`）；`user` 不持久化，启动时 `refreshCurrentUser()` 拉取（权限位 `canChatBan/canEditSaidaoTag` 以服务端为准）。
- `login` 成功后：**不 reload 整页**，`setToken + setUser + status="authenticated"`，各 store 响应 token 变化重建 WS（旧站 `location.reload()` 债务）。
- 注入 http-client 的 `setOnUnauthorized`：401 → `status="guest"` + 打开登录框（UiStore 的 `loginModalOpen`）+ Toast。
- 注入 `setFingerprintProvider`（见 §3.1 fingerprint）。

### 2.2 `src/stores/useChatStore.ts`（聊天域，高频）

```ts
interface ChatState {
  messages: ChatMessage[];          // 展示用，上限 1000（超出裁剪最旧）
  messageBuffer: ChatMessage[];     // 被屏蔽消息缓冲，上限 500（取消屏蔽可恢复）
  onlineCount: number;
  hotWords: string[];               // 最多 8 个
  linkPreviews: Map<string, LinkPreview>; // url → 预览（可能先于消息到达）
  blockedUserIds: Set<number>;
  blockedNicknames: Set<string>;
  keywordPatterns: string[];        // 正则，预编译存 RegExp[]
  blockImageMessages: boolean;
  blockGameLive: boolean;
  wsStatus: "connecting" | "open" | "reconnecting" | "closed";
  pendingCaptcha: boolean;          // 等待滑动验证中

  // actions（由 chat-socket 事件或用户操作触发）
  appendMessage: (msg: ChatMessage) => void;   // 内置屏蔽判定：命中 → messageBuffer
  applyHistory: (msgs: ChatMessage[]) => void; // 重连 history 批量
  markDeleted: (messageId: string) => void;
  clearMessages: () => void;
  setOnlineCount: (n: number) => void;
  setHotWords: (words: string[]) => void;
  upsertLinkPreview: (url: string, title: string) => void;
  setWsStatus: (s: ChatState["wsStatus"]) => void;
  applyFilterConfig: (cfg: ChatFilterConfig) => void; // 重新判定 buffer 中消息可见性
  addBlockedUser: (uid: number) => void; // 加入屏蔽 → 已展示消息标记 + 新消息入 buffer
  removeBlockedUser: (uid: number) => void;
}
```

要点：
- **屏蔽是本地过滤**（后端不删消息）：`appendMessage` 内判 `blockedUserIds.has(uid) || blockedNicknames.has(uname) || keyword 命中` → 入 `messageBuffer`（FIFO 500），不入 `messages`。
- `Map`/`Set` 存于 state，但**组件订阅派生 boolean/数组**（`rerender-derived-state` 规则），不直接订阅 Set 引用。
- 消息裁剪：`messages.length > 1000` 时 `slice(-1000)`（与旧站 DOM 上限一致）。
- 虚拟列表（virtua）按 `messages` 渲染，`key=messageId`。

### 2.3 `src/stores/useSaidaoStore.ts`（主播卡片域）

```ts
interface SaidaoState {
  list: Saidao[];
  loading: boolean;
  status: "live" | "all";           // 筛选 tab（URL 同步，见 04）
  hotScoreVersion: number;          // hotScoreUpdate 时自增，触发重排 memo 失效

  setList: (list: Saidao[]) => void;
  refresh: () => Promise<void>;     // SWR 之外手动刷新入口
  /** WS 局部更新（避免整列表重拉） */
  applyTagUpdate: (id: number, tag: string) => void;
  applyCoverUpdate: (content: { uid: string; cover: string; liveUrl: string }) => void;
  applyContentAnalysis: (uid: string, analysis: ContentAnalysis) => void;
  applyHotScore: (scores: { saidaoId: number; hotScore: number; level: string }[]) => void;
  applyStatusChange: () => void;    // WS status 消息 → 触发 refresh
  setNotShow: (id: number, notShow: boolean) => void; // 调 updateOptionsApi 后本地更新
}
```

要点：
- 列表数据 SWR 初始 + WS 增量更新（`saidaoTagUpdated`/`saidaoCoverUpdated`/`saidaoContentAnalysisUpdated`/`hotScoreUpdate`/`status`）。
- 热度重排：`applyHotScore` 只更新分数并 `hotScoreVersion++`，排序在组件 render 中 `useMemo([list, hotScoreVersion, status])` 完成（`rerender-derived-state-no-effect`）。

### 2.4 `src/stores/usePlayerStore.ts`（播放页域）

```ts
interface PlayerState {
  info: NormalizedPlayerInfo | null;
  /** "connecting" | "live" | "waiting" | "error"（旧站状态机：连接中/直播中/等待开播/连接中断） */
  phase: "connecting" | "live" | "waiting" | "error";
  retryCount: number;               // 10s 重试（旧站节奏）
  danmakuEnabled: boolean;
  volume: number;
  muted: boolean;

  setInfo: (info: NormalizedPlayerInfo) => void;
  setPhase: (p: PlayerState["phase"]) => void;
  setRetryCount: (n: number) => void;
  setDanmakuEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
}
```

弹幕队列**不进 store**（高频，60fps 级），由 `DanmakuLayer` 组件内 `useRef` 队列管理（`rerender-use-ref-transient-values`），store 只存开关与音量。

### 2.5 `src/stores/useUiStore.ts`（UI 域，低频）

```ts
interface UiState {
  theme: "light" | "dark";
  chatExpanded: boolean;            // 聊天侧栏（移动端全屏覆盖 / 桌面侧栏）
  chatWidth: number;                // 桌面拖拽 250~600（persist）
  emojiExpanded: boolean;
  emojiGroup: "vip" | "animation";
  hotWordsCollapsed: boolean;       // persist（对齐旧 chatHotWordsCollapsed）
  loginModalOpen: boolean;
  profileModalOpen: boolean;
  changePasswordModalOpen: boolean;
  userDetailUserId: number | null;
  tagEditorSaidaoId: number | null;
  chatFilterModalOpen: boolean;
  allocationCaptchaOpen: boolean;
  allocationResult: { account: string; password: string } | null;
  dailyReportTabActive: boolean;
  dailyReportUnread: boolean;       // 红点（对齐 DAILY_REPORT_LAST_SEEN_ID 逻辑）

  setTheme: (t: UiState["theme"]) => void;
  setChatExpanded: (v: boolean) => void;
  setChatWidth: (w: number) => void;
  // …其余 setter 略
  markDailyReportSeen: (latestId: number) => void;
}
```

persist 白名单：`theme`（对齐旧 `darkMode`）、`chatWidth`、`hotWordsCollapsed`、`blockImageMessages`（实际在 ChatStore）、`DAILY_REPORT_LAST_SEEN_ID`。

### 2.6 `src/stores/useVideoRequestStore.ts`（点播域，默认不启用 UI）

```ts
interface VideoRequestState {
  list: VideoRequestList | null;
  userVotes: Map<number, VoteType>; // 本地投票记录（旧 video-room-votes，增加清理逻辑）
  setList: (l: VideoRequestList) => void;
  vote: (id: number, type: VoteType) => Promise<void>;
  applyWsEvent: (msg: VideoWsMessage) => void; // 9 种 video* 事件
}
```

## 3. WebSocket 层设计

### 3.1 统一封装原则（`src/lib/ws/`）

旧站问题：app.js 与 chat-room.js 各写一套 `setupWebSocket`（重连定时器、`socket !== currentSocket` 竞态保护散落），player.js 又一套 2s 重连。

重构：`reconnecting-websocket` 接管重连（指数退避 1s→30s 封顶、断线自动恢复），自定义封装只负责**鉴权参数注入、消息路由、竞态保护、重连回调**：

`src/lib/ws/base-socket.ts`：

```ts
import ReconnectingWebSocket from "reconnecting-websocket";

interface BaseSocketOptions<TIn, TOut> {
  buildUrl: () => string;                       // 每次重连重新构建（token 可能变化）
  onMessage: (msg: TOut) => void;
  onStateChange?: (state: "connecting" | "open" | "reconnecting" | "closed") => void;
  reconnectDelay?: (retry: number) => number;   // 默认 min(1000 * 2 ** retry, 30000)
  /** 关闭时是否抑制重连（页面卸载/用户主动关） */
  preventReconnect?: () => boolean;
}

export function createSocket<TIn, TOut>(opts: BaseSocketOptions<TIn, TOut>): {
  send: (msg: TIn) => void;
  close: () => void;
  state: () => "connecting" | "open" | "reconnecting" | "closed";
} {
  const socket = new ReconnectingWebSocket(opts.buildUrl(), {
    reconnectInterval: opts.reconnectDelay ?? ((r) => Math.min(1000 * 2 ** r, 30000)),
    maxReconnectionDelay: 30000,
  });

  socket.onopen = () => {
    if (opts.preventReconnect?.()) socket.close(); // 竞态：已要求关闭则不复活
    else opts.onStateChange?.("open");
  };
  socket.onmessage = (ev) => {
    try {
      const data: TOut = JSON.parse(String(ev.data));
      opts.onMessage(data); // 路由在调用方组装（store action）
    } catch {
      console.warn("[ws] 非法 JSON 消息已丢弃", ev.data);
    }
  };
  socket.onclose = () => {
    // ReconnectingWebSocket 会自动重连；state 语义映射
    if (opts.preventReconnect?.()) opts.onStateChange?.("closed");
    else opts.onStateChange?.("reconnecting");
  };
  socket.onerror = () => opts.onStateChange?.("reconnecting");

  return {
    send: (msg) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
    close: () => {
      socket.reconnectInterval = () => Infinity; // 抑制后续重连
      socket.close();
    },
    state: () =>
      socket.readyState === WebSocket.OPEN ? "open"
      : socket.readyState === WebSocket.CONNECTING ? "connecting"
      : "reconnecting",
  };
}
```

> 关键：**`buildUrl` 每次重连执行**，token 刷新后重连自动携带新 token（旧站重连不重取 token 的隐患修复）。

### 3.2 WS 消息类型联合（`src/lib/ws/ws-message-types.ts`）

用 **discriminated union** 精确表达下行消息（`type` 字段判别），消灭旧站 `switch` 里的字段猜测：

```ts
import type { ChatMessage, ContentAnalysis, LinkPreview } from "@/types/api/message";
import type { ContentAnalysis as CA } from "@/types/api/saidao";

/** 聊天室下行（type 判别） */
export type WsChatMessage =
  | { type: "user"; ...ChatMessage }                                  // 用户消息（结构同 ChatMessage）
  | { type: "system"; content: string }
  | { type: "status"; content: string }                               // 主播状态变更 → 刷新列表
  | { type: "history"; messages: ChatMessage[] }
  | { type: "link_preview"; url: string; title: string }
  | { type: "onlineCount"; count: number }
  | { type: "hotWords"; hotWords: string[] }
  | { type: "saidaoTagUpdated"; saidaoId: number; tag: string }
  | { type: "saidaoCoverUpdated"; content: { uid: string; cover: string; liveUrl: string } }
  | { type: "saidaoContentAnalysisUpdated"; uid: string; contentAnalysis: CA }
  | { type: "hotScoreUpdate"; scores: { saidaoId: number; hotScore: number; level: string }[] }
  | { type: "dailyReportUpdate" }
  | { type: "pollUpdate" }
  | { type: "clear" }
  | { type: "error"; content?: string }
  | { type: "captchaRequired" }
  | { type: "messageDeleted"; messageId: string }
  | { type: "videoVoting" | "videoVoteUpdate" | "videoApproved" | "videoRejected"
      | "videoPlay" | "videoSync" | "videoPlayEnd" | "videoFailed"
      | "videoSkipped" | "videoDeleted"; payload?: unknown }; // video* 转交 VideoRequestStore

/** 聊天室上行 */
export type WsChatMessageIn =
  | { type: "chat"; content: string; reply?: { messageId: string; uname: string }; captchaTicket?: string }
  | { type: "voice"; audioUrl: string; duration: number; waveform: number[]; reply?: { messageId: string; uname: string } };

/** 播放器弹幕下行（仅下行） */
export interface WsPlayerDanmaku {
  comments: { user: string; text: string }[];
}
```

> `WsChatMessage` 的各分支字段以 `docs/api/websocket.md` 实测为准（probe 数据 `.tmp_probe/out/44_*.json`、`85_*.json`）；M3 落地时用 zod 再包一层 parse 兜底（`parseWsChatMessage(raw: unknown): WsChatMessage | null`，未知 type → null + warn）。

### 3.3 聊天室 socket（`src/lib/ws/chat-socket.ts`）

生命周期由 `useChatSocket` hook 管理（`src/hooks/useChatSocket.ts`），**单例**（模块级持有，多组件共享）：

```
挂载（首个需要聊天的组件 effect）
  ├─ buildUrl: `${wsBaseUrl}/ws/chat?token=${token ?? ""}&fp=${fp}`
  ├─ onMessage → 按 type 路由到 store：
  │    user → chatStore.appendMessage
  │    system/status → chatStore.appendMessage（status 同时 saidaoStore.applyStatusChange）
  │    history → chatStore.applyHistory
  │    link_preview → chatStore.upsertLinkPreview
  │    onlineCount → chatStore.setOnlineCount
  │    hotWords → chatStore.setHotWords
  │    saidaoTagUpdated/Cover/ContentAnalysis/hotScore → saidaoStore.apply*
  │    dailyReportUpdate → SWR mutate("dailyReportList") + uiStore 红点
  │    pollUpdate → SWR mutate("chatPolls")
  │    clear → chatStore.clearMessages
  │    messageDeleted → chatStore.markDeleted
  │    error → toast(content)
  │    captchaRequired → 触发风控流程（§3.5）
  │    video* → videoRequestStore.applyWsEvent
  └─ token 变化（useAuthStore.subscribe）→ close + 重建（携带新 token）
卸载（最后一个组件）→ close()（preventReconnect 生效）
```

发送消息（含引用回复）：

```ts
export function sendChatMessage(input: {
  content: string;
  reply?: { messageId: string; uname: string };
  captchaTicket?: string;
}): void {
  const msg: WsChatMessageIn = { type: "chat", ...input };
  chatSocket.send(msg);
}
```

### 3.4 播放器 socket（`src/lib/ws/player-socket.ts`）

```
连接：`${wsBaseUrl}/player/ws?uid=${uid}`（无 token）
重连：2s 起步（旧站节奏），ReconnectingWebSocket 指数退避
onMessage({ comments }) → 弹幕队列（组件内 ref）
  ├─ 每条 comment 入队时间 = now + 5000ms（源站评论比画面快 ~5s，统一延迟）
  ├─ 队列上限 500（超出丢弃最旧）
  └─ 每 200ms flush 一批到 DanmakuLayer（批量 DOM，旧站节奏）
页面卸载/关播 → close + preventReconnect（防刷新竞态）
```

### 3.5 captchaRequired 风控流程（滑动验证闭环）

旧站 `pendingMessage` 机制保留，集中实现于 `useChatSocket`：

```
用户发送 → sendChatMessage(msg)
  └─ 若 wsStatus === "open"：直接发
     （乐观渲染：本地先 append 一条 pending 态消息，收到 user 回显后替换为真实 messageId）
  └─ 收到 { type: "captchaRequired" }：
       1. chatStore.pendingCaptcha = true
       2. 缓存 pendingMessage（最后一次待发消息，覆盖式）
       3. 打开 SliderCaptcha 弹窗（UiStore）
       4. 用户完成拖动 → getSliderCaptchaApi() → verifySliderCaptchaApi({challengeId, x})
          → 得 ticket
       5. 重发 pendingMessage + captchaTicket
       6. 收到回显 → pendingCaptcha = false，关弹窗
       7. 验证失败（isBanned）→ Toast 提示，不自动重试（旧站行为）
```

### 3.6 重连与历史恢复

- 重连成功后服务端自动推 `history` 消息（`messages[]` 快照）→ `applyHistory` 合并（按 messageId 去重，不覆盖本地更新）。
- 在线数/热词随重连后首帧到达，无需额外拉取。
- 掰头倒计时用 `serverTime` 校准：`clockOffset = serverTime - Date.now()`，倒计时渲染 `endsAt - (now + clockOffset)`。

## 4. 设备指纹（`src/lib/fingerprint.ts`）

```ts
import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: string | null = null;
let loading: Promise<string> | null = null;

export async function getFingerprint(): Promise<string> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      const stored = localStorage.getItem(config.fingerprintStorageKey);
      if (stored) return (cached = stored);
      const fp = await FingerprintJS.load();
      const { visitorId } = await fp.get();
      cached = visitorId;
      localStorage.setItem(config.fingerprintStorageKey, visitorId);
      return visitorId;
    })();
  }
  return loading;
}

/** http-client 同步取（取不到返回 null，请求不阻塞） */
export function getFingerprintSync(): string | null {
  return cached ?? localStorage.getItem(config.fingerprintStorageKey);
}
```

- 首次启动：`getFingerprint()`（异步预热，Promise 复用防并发）；
- http-client 注入 `setFingerprintProvider(getFingerprintSync)`——fp 未就绪时请求不带 fp 头（后端容忍），就绪后自动带上；
- WS `buildUrl` 同步取 fp（socket 建立时机在 fingerprint 就绪之后，由 hook 依赖保证）。

## 5. 状态流转全景

```
用户操作 ──► 组件（HeroUI 事件 onPress）
   │
   ├─ 写操作 ──► api/*.ts ──► 成功：SWR mutate / store action 增量更新
   │                    └─ 401：authStore → 登录框
   │
   └─ WS 消息 ──► chat-socket / player-socket（reconnecting-websocket）
                    │
                    ├─ chatStore（消息/在线/热词/屏蔽）
                    ├─ saidaoStore（卡片增量/热度）
                    ├─ uiStore（红点/弹窗）
                    ├─ videoRequestStore（video* 事件）
                    └─ SWR mutate（polls/dailyReport 等低频数据）

组件渲染 ◄── 选择器订阅（最小切片）
```

## 6. 性能要点（对照 vercel-react-best-practices）

| 规则 | 落点 |
|---|---|
| `rerender-derived-state-no-effect` | 热度排序、tab 过滤在 render 中 useMemo，不用 effect 同步 |
| `rerender-use-ref-transient-values` | 弹幕队列、滚动位置用 ref，不入 store |
| `rerender-defer-reads` | 只在回调里用的值（如发送时的内容）不订阅 store |
| `js-set-map-lookups` | 屏蔽判定 Set.has O(1)；消息去重 Map<messageId> |
| `js-batch-dom-css` | 弹幕 200ms 批量 flush；消息追加走虚拟化列表 |
| `client-swr-dedup` | polls 15s / moments 60s 轮询走 SWR refreshInterval，自动去重 |
| `advanced-init-once` | fingerprint、socket 单例模块级初始化一次 |
| `client-localstorage-schema` | persist 白名单 + version 字段，升级时 migrate |

## 7. M3/M4 验收清单

- [ ] 断网重连：拔网线 10s 恢复 → 聊天自动重连、history 补全、无重复消息（messageId 去重验证）
- [ ] 双开浏览器标签页互发消息实时可见
- [ ] 屏蔽用户/关键词：消息入 buffer、取消屏蔽恢复展示
- [ ] captchaRequired → 滑块弹窗 → 带 ticket 重发成功；isBanned 不重试
- [ ] 游客 WS（token 空）可收消息，发消息触发验证
- [ ] 播放页弹幕延迟 5s 对齐画面，队列上限 500 验证（脚本灌入 1000 条）
- [ ] 页面刷新后 socket 干净关闭（DevTools 无残留连接）
- [ ] token 刷新（改密）后 socket 重建携带新 token
