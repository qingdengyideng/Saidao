# 02 — API 层与类型系统设计

> 目标：37 个 REST 接口统一管理、全类型化（zod + z.infer），禁止 `any`，运行时校验 + 编译期推导。
> 约束来源：`docs/schema/openapi.yaml`（契约冻结）、`docs/api/*.md`、AGENTS.md §1.1/§1.4。

---

## 1. 总体架构

```
组件/store
   │ 调用（带类型）
   ▼
src/api/user.ts ... （模块函数，唯一允许出现路径字符串）
   │
   ▼
src/api/http-client.ts （axios 封装）
   ├─ 自动头：Accept / fp / Authorization（裸 token，无 Bearer——后端契约）
   ├─ 统一解包 ApiEnvelope<T>：code !== "0" → throw ApiError
   ├─ 401 → 触发全局 onUnauthorized 回调（弹登录框 + Toast「请先登录」）
   ├─ 网络错误（axios 无 response）→ throw NetworkError
   └─ 超时（axios timeout 配置）→ throw TimeoutError
   │
   ▼
zod schema（src/types/api/*.ts）parse 后再返回 T
```

**分层职责**：
- `http-client.ts`：只懂 HTTP，不懂业务（不 import 业务 schema）。
- 模块函数：路径 + 方法 + 参数序列化 + schema parse。
- 业务层（store/组件）：只拿类型化 `data`，不接触 `code/message` 结构。

## 2. http-client 设计

`src/api/http-client.ts`（基于 **axios**，用户指定不封装原生 fetch）：

```ts
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import qs from "qs";
import { config } from "@/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: "1" | "biz",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("网络异常，请检查网络后重试");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export class TimeoutError extends NetworkError {
  constructor(timeoutMs: number) {
    super();
    this.name = "TimeoutError";
    this.message = `请求超时（${Math.round(timeoutMs / 1000)}s），请稍后重试`;
  }
}

/** 401 统一回调（由 auth store 注入，弹登录框 + Toast） */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

let fingerprintProvider: (() => string | null) | null = null;
export function setFingerprintProvider(cb: () => string | null): void {
  fingerprintProvider = cb;
}

/** 统一实例：拦截器负责 fp / 401 / 错误归一化 */
export const http = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { Accept: "application/json" },
  // 超时默认不设（聊天相关以 WS 为主，REST 多为短请求）；单独接口传 timeout 覆盖
});

// 请求拦截器：自动头（fp / Authorization 裸 token——后端契约，无 Bearer 前缀）
http.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const fp = fingerprintProvider?.();
  if (fp) req.headers.set("fp", fp);
  if (req.headers.get("x-auth") === "true") {
    const token = readToken(); // localStorage 读取封装
    if (!token) throw new ApiError("请先登录", "1", 401);
    req.headers.set("Authorization", token);
  }
  // 清理标记头
  req.headers.delete("x-auth");
  return req;
});

// 响应拦截器：401 全局回调 + 错误归一化（业务包裹解包仍在 request() 内做，见下）
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      onUnauthorized?.();
      return Promise.reject(new ApiError("请先登录", "1", 401));
    }
    if (err.code === "ECONNABORTED") {
      return Promise.reject(new TimeoutError(err.config?.timeout ?? 0));
    }
    // 无 response（断网/DNS/CORS）或 HTTP 4xx/5xx 非 JSON
    return Promise.reject(
      err.response ? new ApiError(`HTTP ${err.response.status}`, "biz", err.response.status) : new NetworkError(err),
    );
  },
);

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSON body 或 FormData（上传） */
  body?: unknown;
  /** query 参数，用 qs 序列化（自动处理 null/数组/嵌套） */
  query?: Record<string, string | number | boolean | undefined>;
  /** 需要 Authorization 头（裸 token，无 Bearer——后端契约，勿改） */
  auth?: boolean;
  /** 走 N8N 域（仅 webhook 测试） */
  fromN8N?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  schema: { parse: (v: unknown) => T }, // 结构化参数，避免 zod 类型耦合
): Promise<T> {
  const res = await http.request({
    url: path,
    method: options.method ?? (options.body !== undefined ? "post" : "get"),
    baseURL: options.fromN8N ? config.n8nBaseUrl : config.apiBaseUrl,
    params: options.query,
    // qs 风格序列化（数组 [0] 索引、嵌套 obj），与旧站行为一致
    paramsSerializer: (v) => qs.stringify(v, { skipNulls: true }),
    data: options.body, // JSON / FormData（axios 自动处理 Content-Type，FormData 自动加 boundary）
    headers: options.auth ? { "x-auth": "true" } : undefined,
    timeout: options.timeoutMs,
    signal: options.signal,
  });

  const json: unknown = res.data;

  // 统一包裹解包（playerInfo 无包裹，走独立函数，见 api/player.ts）
  const envelope = json as { code: string; message: string; data: unknown };
  if (envelope.code !== "0") {
    // 后端 500 可能回显 SQL 堆栈 → 截断（AGENTS.md §7）
    const safeMsg =
      envelope.message.length > 80 ? `${envelope.message.slice(0, 80)}…（稍后重试）` : envelope.message;
    throw new ApiError(safeMsg, "biz", res.status);
  }
  return schema.parse(envelope.data); // 运行时校验兜底
}
```

**设计说明**：
1. **axios 拦截器统一横切逻辑**：请求拦截器注入 `fp`/`Authorization` 头（裸 token，无 Bearer——后端契约）；响应拦截器统一处理 401 回调、超时（`ECONNABORTED`）、网络错误归一化。业务代码不再碰 headers 细节。
2. `x-auth: "true"` 是**内部标记头**（请求拦截器识别后替换为真实 token 头并删除），避免把 token 读取逻辑散落到每个调用点。
3. `schema` 用结构化参数 `{ parse }` 而非直接 import zod 类型——http-client 保持零业务依赖（testability + 无循环依赖）。
4. `qs` 通过 `paramsSerializer` 处理 query（`skipNulls` + 数组/嵌套序列化），与旧站行为一致。
5. 上传走 FormData：axios 自动设置 `Content-Type`（含 boundary），无需手动处理。
6. 超时默认不设；`playerInfo` 单独 8s 超时（旧站行为），通过 `timeoutMs` 参数传入（axios 原生 `timeout` 字段）。
7. 401 回调模式（回调注入）避免 http-client ↔ auth store 循环依赖。
8. 组件/store 禁止直接 `fetch` 或裸用 `axios`——一律走本模块的 `request()`（`playerInfoApi` 是唯一例外，见 4.3）。

## 3. 类型系统：zod schema 全集

目录：`src/types/api/`，按模块与 `src/api/` 一一对应。所有类型由 `z.infer` 推导，**禁止手写重复 interface**。

### 3.1 `common.ts`（通用包裹 + 共享）

```ts
import { z } from "zod";

/** 统一响应包裹（除 GET /saidao/player/{uid}） */
export const ApiEnvelopeSchema = z.object({
  code: z.enum(["0", "1"]),
  message: z.string(),
  data: z.unknown().nullable(),
});
export type ApiEnvelope = z.infer<typeof ApiEnvelopeSchema>;

export const WebhookType = z.enum(["dingtalk", "wecom", "feishu"]);
export const Faction = z.enum(["ya", "juan"]); // 阵营（30 天锁定，见 specs/05）
```

### 3.2 `user.ts`

```ts
import { z } from "zod";
import { Faction, WebhookType } from "./common";

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  faction: z.string().nullable(),
  canChatBan: z.boolean().default(false),
  canEditSaidaoTag: z.boolean().default(false),
  webhookType: z.string().nullable(),
  webhookUrl: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginResultSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type LoginResult = z.infer<typeof LoginResultSchema>;

/** 用户详情（比 User 少权限位，多 registerDate——秒级时间戳，展示 ×1000） */
export const UserDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  faction: z.string().nullable(),
  registerDate: z.number(),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;

export const ProfileUpdateRequestSchema = z.object({
  name: z.string().min(1).max(32),
  avatar: z.string().nullable(),
  bio: z.string().max(200).nullable(),
  faction: Faction.nullable(),
  webhookType: WebhookType.nullable(),
  webhookUrl: z.string().url().nullable(),
});
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;

export const CaptchaImageSchema = z.object({
  captchaId: z.string(),
  base64Image: z.string(), // dataURL
  expireTime: z.number(), // 秒
});
export type CaptchaImage = z.infer<typeof CaptchaImageSchema>;

export const ChatFilterConfigSchema = z.object({
  blockedUserIds: z.array(z.number()).default([]),
  blockedNicknames: z.array(z.string()).default([]),
  keywordPatterns: z.array(z.string()).default([]),
});
export type ChatFilterConfig = z.infer<typeof ChatFilterConfigSchema>;
```

### 3.3 `captcha.ts`

```ts
import { z } from "zod";

export const SliderCaptchaSchema = z.object({
  challengeId: z.string(),
  background: z.string(), // dataURL
  piece: z.string(),      // dataURL
  pieceY: z.number(),
  width: z.number(),
  height: z.number(),
});
export type SliderCaptcha = z.infer<typeof SliderCaptchaSchema>;

export const VerifySliderRequestSchema = z.object({
  challengeId: z.string(),
  x: z.number(), // 滑块水平位移 px
});
export type VerifySliderRequest = z.infer<typeof VerifySliderRequestSchema>;

/** verify 返回 data 为 ticket 字符串（如 "bypass"） */
export const CaptchaTicketSchema = z.string();
export type CaptchaTicket = z.infer<typeof CaptchaTicketSchema>;
```

### 3.4 `saidao.ts`

```ts
import { z } from "zod";

export const ContentAnalysisSchema = z.object({
  is_game: z.boolean(),
  game_name: z.string().nullable(),
  live_type: z.string().nullable(),
  is_outdoor: z.boolean(),
  is_virtual: z.boolean(),
  screen_orientation: z.string().nullable(),
  streamer_status: z.string().nullable(),
  overall_confidence: z.number(),
  game_confidence: z.number(),
  live_type_label: z.string().nullable(),
  streamer_status_label: z.string().nullable(),
  screen_orientation_label: z.string().nullable(),
  ai_label: z.string().nullable(),
});
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;

export const SaidaoSchema = z.object({
  id: z.number(),
  uid: z.string(),
  name: z.string(),
  channel: z.string(), // bilibili / youtube / douyu / ...
  startTime: z.string().nullable(),
  /** number！1=直播中（与 PlayerInfo.status 的 string 区分，AGENTS.md §7） */
  status: z.number(),
  avatar: z.string().nullable(),
  cover: z.string().nullable(),
  url: z.string(),
  streamUrl: z.string().nullable(),
  /** 反向语义：true = 用户「不想看 TA」 */
  notShow: z.boolean().default(false),
  tag: z.string().nullable(),
  hotScore: z.number().default(0),
  hotLevel: z.string().nullable(),
  contentAnalysis: ContentAnalysisSchema.nullable(),
});
export type Saidao = z.infer<typeof SaidaoSchema>;

export const UpdateOptionsRequestSchema = z.object({
  id: z.number(),
  notShow: z.boolean().optional(),
  hotLevel: z.string().optional(),
  status: z.number().optional(),
});
export type UpdateOptionsRequest = z.infer<typeof UpdateOptionsRequestSchema>;

export const UpdateSaidaoTagRequestSchema = z.object({
  id: z.number(),
  tag: z.string().max(20),
});
export type UpdateSaidaoTagRequest = z.infer<typeof UpdateSaidaoTagRequestSchema>;
```

### 3.5 `player.ts`（⚠️ 无 ApiEnvelope 包裹）

```ts
import { z } from "zod";

export const PlayerInfoSchema = z.object({
  /** 未开播时是字符串 "null"——特判归一化为 null（见 api/player.ts） */
  m3u8: z.string(),
  channel: z.string(),
  userId: z.string(),
  value: z.string(), // 原始 JSON 串
  uid: z.string(),
  live_url: z.string().nullable(),
  orig: z.string().nullable(),
  token: z.string().nullable(),
  avatar: z.string().nullable(),
  /** 与 Saidao.status 区分：string，"1"=开播 */
  status: z.string(),
  roomid: z.string().nullable(),
  uname: z.string().nullable(),
  cover: z.string().nullable(),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

/** 归一化后给组件用的播放器信息（m3u8 "null" → null） */
export const NormalizedPlayerInfoSchema = PlayerInfoSchema.extend({
  m3u8: z.string().nullable(),
});
export type NormalizedPlayerInfo = z.infer<typeof NormalizedPlayerInfoSchema>;
```

### 3.6 `message.ts`

```ts
import { z } from "zod";

export const ReplyToSchema = z.object({
  uid: z.number(),
  uname: z.string(),
  content: z.string(),
  messageId: z.string(),
});
export type ReplyTo = z.infer<typeof ReplyToSchema>;

export const LinkPreviewSchema = z.object({
  url: z.string(),
  title: z.string(),
});
export type LinkPreview = z.infer<typeof LinkPreviewSchema>;

export const ChatMessageSchema = z.object({
  /** 0 = 匿名/游客 */
  uid: z.number(),
  type: z.enum(["user", "status"]),
  ipGeo: z.string().nullable().optional(),
  uname: z.string(),
  avatar: z.string().nullable().optional(),
  /** 正文；表情消息为 <img .../> HTML，必须走 content-parser 白名单解析 */
  content: z.string(),
  deleted: z.boolean().default(false),
  faction: z.string().nullable().optional(),
  mentions: z.array(z.string()).optional(),
  messageId: z.string(), // 雪花 ID 字符串
  timestamp: z.string(), // HH:mm:ss
  createdAt: z.string().datetime({ offset: true }).optional(), // ISO 8601（window/WS 携带）
  replyTo: ReplyToSchema.nullable().optional(),
  linkPreview: LinkPreviewSchema.nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const HistoryWindowRequestSchema = z.object({
  beforeCursor: z.string().optional(),
  afterCursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type HistoryWindowRequest = z.infer<typeof HistoryWindowRequestSchema>;

export const HistoryWindowResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
  beforeCursor: z.string().nullable(),
  afterCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type HistoryWindowResponse = z.infer<typeof HistoryWindowResponseSchema>;

export const MomentStatsSchema = z.object({
  messageCount: z.number(),
  quoteCount: z.number(),
  mentionCount: z.number(),
  imageCount: z.number(),
  emojiCount: z.number(),
  videoCount: z.number(),
});
export type MomentStats = z.infer<typeof MomentStatsSchema>;

export const MomentSegmentSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  title: z.string(),
  summary: z.string(),
  anchorId: z.string(),
  stats: MomentStatsSchema,
});
export type MomentSegment = z.infer<typeof MomentSegmentSchema>;

export const ChatMomentsSchema = z.object({
  status: z.string(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  formatVersion: z.number(),
  segments: z.array(MomentSegmentSchema),
});
export type ChatMoments = z.infer<typeof ChatMomentsSchema>;
```

### 3.7 `emoji.ts`

```ts
import { z } from "zod";

export const EmojiSchema = z.object({
  name: z.string(),
  url: z.string(),
  clickSend: z.boolean().default(false),
});
export type Emoji = z.infer<typeof EmojiSchema>;

export type EmojiGroup = "vip" | "animation";

export const UploadEmojiResultSchema = z.object({
  url: z.string(),
  name: z.string(),
});
export type UploadEmojiResult = z.infer<typeof UploadEmojiResultSchema>;
```

### 3.8 `polls.ts`

```ts
import { z } from "zod";

export const PollOptionSchema = z.string(); // options 为字符串数组

export const PollSchema = z.object({
  id: z.number(),
  question: z.string(),
  options: z.array(PollOptionSchema).min(2),
  createdAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  active: z.boolean(),
  totalVoters: z.number().default(0),
  counts: z.array(z.number()),
  myOptions: z.array(z.number()).default([]),
  multiple: z.boolean().default(false),
  creatorId: z.number(),
  creatorName: z.string(),
  resultsVisible: z.boolean().default(true),
});
export type Poll = z.infer<typeof PollSchema>;

export const ChatPollsSchema = z.object({
  canCreate: z.boolean(),
  serverTime: z.string().datetime({ offset: true }),
  current: PollSchema.nullable(),
  recent: z.array(PollSchema).default([]),
});
export type ChatPolls = z.infer<typeof ChatPollsSchema>;

export const ChatPollStatusSchema = z.object({
  serverTime: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  activeEndsAt: z.string().datetime({ offset: true }),
});
export type ChatPollStatus = z.infer<typeof ChatPollStatusSchema>;

export const CreateChatPollRequestSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.string().min(1).max(20)).min(2),
  durationSeconds: z.enum([300, 600, 1800]).optional(), // 5/10/30 分钟
  multiple: z.boolean().optional(),
  resultsVisible: z.boolean().optional(),
});
export type CreateChatPollRequest = z.infer<typeof CreateChatPollRequestSchema>;
```

### 3.9 `daily-report.ts`

```ts
import { z } from "zod";

export const DailyReportSchema = z.object({
  id: z.number(),
  title: z.string(),
  link: z.string().url(),
  cover: z.string(),
  /** Unix 秒（×1000 展示） */
  update_time: z.number(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

/** 公告：data 为纯字符串 */
export const NoticeSchema = z.string();
export type Notice = z.infer<typeof NoticeSchema>;
```

### 3.10 `video-request.ts`

```ts
import { z } from "zod";

export const VideoRequestItemSchema = z.object({
  id: z.number(),
  bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/), // 旧站校验过弱，收紧（specs/07）
  title: z.string(),
  coverUrl: z.string(),
  uploaderName: z.string(),
  duration: z.number(),
  voteApprove: z.number().default(0),
  voteReject: z.number().default(0),
});
export type VideoRequestItem = z.infer<typeof VideoRequestItemSchema>;

export const VideoRequestListSchema = z.object({
  playlist: z.array(VideoRequestItemSchema).default([]),
  voting: z.array(VideoRequestItemSchema).default([]),
  current: VideoRequestItemSchema.nullable(),
  currentTime: z.number().nullable(),
});
export type VideoRequestList = z.infer<typeof VideoRequestListSchema>;

export type VoteType = "approve" | "reject";
```

### 3.11 `upload.ts` / `webhook.ts`

```ts
// upload.ts
import { z } from "zod";
export const UploadUrlResultSchema = z.object({ url: z.string() });
export type UploadUrlResult = z.infer<typeof UploadUrlResultSchema>;

// webhook.ts
import { z } from "zod";
import { WebhookType } from "./common";
export const TestWebhookRequestSchema = z.object({
  webhookType: WebhookType,
  webhookUrl: z.string().url(),
  testMessage: z.string().optional(),
});
export type TestWebhookRequest = z.infer<typeof TestWebhookRequestSchema>;
```

## 4. API 模块函数签名（37 接口全量）

### 4.1 `src/api/user.ts`

```ts
import { request } from "./http-client";
import * as T from "@/types/api/user";

export const loginApi = (body: {
  email: string;
  password: string;
  captchaId?: string;
  captchaCode?: string;
}) => request<T.LoginResult>("/user/login", { body }, T.LoginResultSchema);

export const currentUserApi = () =>
  request<T.User | null>("/user/", { auth: true }, T.UserSchema.nullable());

export const allocateApi = (body: {
  email: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}) => request<T.User>("/user/allocate", { body }, T.UserSchema);

export const changePasswordApi = (body: { oldPassword: string; newPassword: string }) =>
  request<null>("/user/changePassword", { body, auth: true }, z.null());

export const profileUpdateApi = (body: T.ProfileUpdateRequest) =>
  request<T.User>("/user/update", { body, auth: true }, T.UserSchema);

export const sendVerificationCodeApi = (body: { email: string }) =>
  request<null>("/user/sendVerificationCode", { body }, z.null());

export const getCaptchaApi = () =>
  request<T.CaptchaImage>("/user/captcha", {}, T.CaptchaImageSchema);

export const userDetailApi = (id: number) =>
  request<T.UserDetail>(`/user/${id}`, {}, T.UserDetailSchema);

export const getChatFilterConfigApi = () =>
  request<T.ChatFilterConfig>("/user/chatFilterConfig", { auth: true }, T.ChatFilterConfigSchema);

export const updateChatFilterConfigApi = (body: T.ChatFilterConfig) =>
  request<null>("/user/chatFilterConfig", { body, auth: true }, z.null());

export const chatBanApi = (body: { userId: number; banned: boolean; reason?: string }) =>
  request<null>("/user/chatBan", { body, auth: true }, z.null());
```

### 4.2 `src/api/saidao.ts`

```ts
export const saidaoListApi = () =>
  request<T.Saidao[]>("/saidao/", { auth: true }, z.array(T.SaidaoSchema));

export const updateOptionsApi = (body: T.UpdateOptionsRequest) =>
  request<null>("/saidao/options", { body, auth: true }, z.null());

export const updateSaidaoTagApi = (body: T.UpdateSaidaoTagRequest) =>
  request<null>("/saidao/tag", { body, auth: true }, z.null());

export const clickSaidaoApi = (saidaoId: number) =>
  request<null>("/saidao/click", { query: { saidaoId } }, z.null()); // 静默失败，fire-and-forget
```

### 4.3 `src/api/player.ts`（特例：无包裹）

```ts
import { http } from "./http-client";
import * as T from "@/types/api/player";

/**
 * GET /saidao/player/{uid} —— 唯一无 ApiEnvelope 包裹的接口。
 * 特判：m3u8 === "null"（字符串）→ null（AGENTS.md §7）。
 * 用 http 实例（复用 fp 头注入拦截器），不走 request()（无包裹契约）。
 */
export async function playerInfoApi(uid: string, signal?: AbortSignal): Promise<T.NormalizedPlayerInfo> {
  const res = await http.get(`/saidao/player/${uid}`, {
    signal,
    timeout: 8000, // 8s 超时（旧站行为）
  });
  const info = T.PlayerInfoSchema.parse(res.data);
  return { ...info, m3u8: info.m3u8 === "null" ? null : info.m3u8 };
}
```

> `playerInfoApi` 直连 `http` 实例（不走 `request()` 包裹解包）是**唯一允许**绕过 `request()` 的地方（无包裹契约），已封装在 api 层内，组件不感知。fp 头由请求拦截器自动注入。

### 4.4 `src/api/message.ts`

```ts
export const messageDeleteApi = (messageId: string) =>
  request<null>("/message/delete", { body: { messageId }, auth: true }, z.null());

export const messageHistoryApi = (messageId: string) =>
  request<T.ChatMessage[]>("/message/history", { query: { messageId }, auth: true }, z.array(T.ChatMessageSchema));

export const messageHistoryWindowApi = (params: T.HistoryWindowRequest) =>
  request<T.HistoryWindowResponse>("/message/history/window", { query: params, auth: true }, T.HistoryWindowResponseSchema);

export const chatMomentsApi = () =>
  request<T.ChatMoments>("/message/moments", { auth: true }, T.ChatMomentsSchema);
```

### 4.5 `src/api/emoji.ts`

```ts
export const queryEmojisApi = (group: T.EmojiGroup) =>
  request<T.Emoji[]>(`/emoji/${group}`, { auth: true }, z.array(T.EmojiSchema));

export const uploadEmojiApi = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<T.UploadEmojiResult>("/emoji/upload", { body: form, auth: true }, T.UploadEmojiResultSchema);
};
```

### 4.6 `src/api/polls.ts`

```ts
export const chatPollsApi = () =>
  request<T.ChatPolls>("/chat/polls", { auth: true }, T.ChatPollsSchema);

export const createChatPollApi = (body: T.CreateChatPollRequest) =>
  request<T.Poll>("/chat/polls", { body, auth: true }, T.PollSchema);

export const chatPollStatusApi = () =>
  request<T.ChatPollStatus>("/chat/polls/status", {}, T.ChatPollStatusSchema);

export const voteChatPollApi = (id: number, optionIds: number[]) =>
  request<null>(`/chat/polls/${id}/ballots`, { body: { optionIds }, auth: true }, z.null());
```

### 4.7 `src/api/captcha.ts` / `daily-report.ts` / `upload.ts` / `video-request.ts` / `webhook.ts`

```ts
// captcha.ts
export const getSliderCaptchaApi = () =>
  request<T.SliderCaptcha>("/captcha/slider", {}, T.SliderCaptchaSchema);

export const verifySliderCaptchaApi = (body: T.VerifySliderRequest) =>
  request<T.CaptchaTicket>("/captcha/slider/verify", { body }, T.CaptchaTicketSchema);

// daily-report.ts
export const dailyReportListApi = () =>
  request<T.DailyReport[]>("/dailyReport/list", {}, z.array(T.DailyReportSchema));

export const noticeApi = () =>
  request<T.Notice>("/notice", {}, T.NoticeSchema);

// upload.ts
export const uploadImageApi = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<T.UploadUrlResult>("/api/image/upload", { body: form, auth: true }, T.UploadUrlResultSchema);
};

export const uploadVoiceApi = (blob: Blob, fileName: string) => {
  const form = new FormData();
  form.append("file", blob, fileName);
  return request<T.UploadUrlResult>("/api/voice/upload", { body: form, auth: true }, T.UploadUrlResultSchema);
};

// video-request.ts
export const videoRequestSubmitApi = (body: { bvid: string }) =>
  request<null>("/videoRequest/submit", { body, auth: true }, z.null());

export const videoRequestVoteApi = (body: { videoRequestId: number; voteType: T.VoteType }) =>
  request<null>("/videoRequest/vote", { body, auth: true }, z.null());

export const videoRequestListApi = () =>
  request<T.VideoRequestList>("/videoRequest/list", {}, T.VideoRequestListSchema);

export const videoRequestSkipApi = () =>
  request<null>("/videoRequest/skip", { auth: true }, z.null());

export const videoRequestDeleteApi = (videoRequestId: number) =>
  request<null>("/videoRequest/delete", { query: { videoRequestId }, auth: true }, z.null());

// webhook.ts（N8N 域）
export const testWebhookApi = (body: T.TestWebhookRequest) =>
  request<null>("/webhook/testWebhook", { body, auth: true, fromN8N: true }, z.null());
```

## 5. 表情 content 白名单解析器（安全关键）

`src/lib/chat/content-parser.ts` —— 消息 `content` 是文本或 `<img>` HTML 的混合（表情消息整条为 `<img .../>`）：

```ts
/**
 * 解析聊天消息 content：
 * - 纯文本 → { kind: "text", text }
 * - <img> 表情（白名单）→ { kind: "emoji", src }
 * - 其余 HTML → 降级为转义文本（React 文本节点自动转义）
 * 白名单：标签只允许 <img>；src 域名限 config.imageHosts（来自 env，默认 rustfs.saidao.cc / ali2.a.yximgs.com / cdnl.iconscout.com）；
 * class 限 chat-emoji（vip/animation）。
 */
export type ParsedContent =
  | { kind: "text"; text: string }
  | { kind: "emoji"; src: string }
  | { kind: "mixed"; parts: Array<{ kind: "text"; text: string } | { kind: "emoji"; src: string }> };

const ALLOWED_IMG_HOSTS = new Set(config.imageHosts); // 白名单域名来自 env（.env → config.imageHosts，见 01 §2.7）
const EMOJI_IMG_RE = /<img\s+[^>]*class="chat-emoji[^"]*"[^>]*src="([^"]+)"[^>]*\/?>/i;

export function parseChatContent(raw: string): ParsedContent {
  // 1) 整条是单个表情 img → emoji
  const single = raw.match(/^(\s*)<img\s+[^>]+>\s*$/i);
  if (single) {
    const src = extractAllowedEmojiSrc(raw);
    if (src) return { kind: "emoji", src };
  }
  // 2) 混合：切分 img 与文本
  // 3) 纯文本
  // （实现细节 M3 里程碑落地；必须配注入用例单测：
  //   '<img src=x onerror=alert(1)>' / '<script>' / '"><img src=evil>' 等）
}

function extractAllowedEmojiSrc(html: string): string | null {
  const m = html.match(EMOJI_IMG_RE);
  if (!m?.[1]) return null;
  try {
    const u = new URL(m[1]);
    return ALLOWED_IMG_HOSTS.has(u.hostname) ? m[1] : null;
  } catch {
    return null;
  }
}
```

组件侧渲染：`<EmojiImage src />` 或 `{text}`，**全程无 `dangerouslySetInnerHTML`**。

## 6. 数据获取模式（与 SWR 集成）

- 组件内用 SWR 调 api 函数：
  ```ts
  const { data: polls, isLoading } = useSWR<ChatPolls>(
    isLoggedIn ? ["chatPolls"] : null,
    () => chatPollsApi(),
    { refreshInterval: 15_000 }, // 掰头 15s 轮询（保留旧站节奏）
  );
  ```
- key 约定：`[模块, 标识...]` 元组（字符串化稳定）。
- 写操作统一用 `useSWRMutation` 或 SWR `mutate`；成功后 `mutate` 相关 key。
- **SWR key 禁用不稳定对象**（直接传对象会每次 render 重建 key）。
- 游客态：依赖登录的 SWR 在 `!isLoggedIn` 时 key 传 `null`（禁用请求）。

## 7. 错误处理约定

| 错误类型 | 来源 | UI 处理 |
|---|---|---|
| `ApiError(code="1")` 401 | token 失效 | 全局 onUnauthorized → 登录框 + Toast「请先登录」；写操作中止 |
| `ApiError(code="biz")` 400 | 业务校验（如"每天限 1 次"） | Toast 展示 message（已截断 80 字符） |
| `NetworkError` / `TimeoutError` | 断网/超时 | Toast「网络异常…/请求超时…」（含下一步指引） |
| `ZodError` | 后端数据契约漂移 | Toast「数据异常，请刷新重试」+ console.error（开发态展示 issue 详情） |
| `clickSaidaoApi` 失败 | 任何 | **静默**（fire-and-forget，`.catch(() => {})`） |

## 8. M1 验收清单

- [ ] 37 个接口全部有类型化函数 + zod schema（数量对账：user 11 / saidao 4 / player 1 / message 4 / emoji 2 / polls 4 / captcha 2 / dailyReport 2 / videoRequest 5 / upload 2 / webhook 1 = 38，其中 sendVerificationCode 保留但前端不调用）
- [ ] 组件内 grep 不到 `/user/`、`/saidao/` 等路径字符串
- [ ] grep 不到 `any`（eslint 强制）
- [ ] 登录 → token 存储 → 鉴权接口带裸 token 头（DevTools 验证无 Bearer 前缀）
- [ ] 401 → 登录框 + Toast（模拟改 token 验证）
- [ ] playerInfo 的 `m3u8 === "null"` 特判单测通过
- [ ] content-parser 注入用例单测通过（M3 交付，schema 先行）
