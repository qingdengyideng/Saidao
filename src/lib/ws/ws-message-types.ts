import { z } from "zod";

import type { SliderCaptcha } from "@/types/api/captcha";
import { SliderCaptchaSchema } from "@/types/api/captcha";
import { FactionFieldSchema } from "@/types/api/common";

// =============================================================================
// 聊天室下行消息（服务端 → 客户端）
//
// 协议依据：docs/api/websocket.md §1.2
// 按 `type` 字段判别（discriminated union），客户端按类型分发。
// =============================================================================

/**
 * 用户聊天消息（平铺结构：字段直接在顶层，type 字段为 "user"）。
 *
 * 后端下行 user 消息与 ChatMessage 结构一致（字段平铺 + type:"user"），
 * 旧站 chat-room.js:1611-1612 直接 addMessageToChat(data) 平铺使用整个 data，
 * 不取 data.message。见 docs/api/websocket.md §1.2 及 message.md §5。
 */
export interface WsChatMessageUser {
  uid: number;
  type: "user";
  ipGeo?: string | null;
  uname: string;
  /** 头像：后端不同路径下可能缺失或为 null（展示层 ?? 默认图兜底），故可选+可空 */
  avatar?: string | null;
  content: string;
  /** WS 广播帧不下发该字段，缺省视为未删除（docs/api/message.md §5） */
  deleted?: boolean;
  faction?: string | null;
  mentions?: string[];
  messageId: string;
  timestamp: string;
  createdAt?: string;
  replyTo?: { uid?: number; uname: string; content: string; messageId: string } | null;
  linkPreview?: { url: string; title: string } | null;
}
export const WsChatMessageUserSchema = z.object({
  uid: z.number(),
  type: z.literal("user"),
  ipGeo: z.string().nullable().optional(),
  uname: z.string(),
  avatar: z.string().nullable().optional(),
  content: z.string(),
  deleted: z.boolean().optional(),
  faction: FactionFieldSchema,
  mentions: z.array(z.string()).optional(),
  messageId: z.string(),
  timestamp: z.string(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  replyTo: z
    .object({
      uid: z.number().optional(),
      uname: z.string(),
      content: z.string(),
      messageId: z.string(),
    })
    .nullable()
    .optional(),
  linkPreview: z
    .object({
      url: z.string(),
      title: z.string(),
    })
    .nullable()
    .optional(),
});

/** 系统消息（入房/退房等） */
export interface WsChatMessageSystem {
  type: "system";
  content: string;
}
export const WsChatMessageSystemSchema = z.object({
  type: z.literal("system"),
  content: z.string(),
});

/** 状态消息（直播状态变更等，前端额外触发列表刷新） */
export interface WsChatMessageStatus {
  type: "status";
  content: string;
}
export const WsChatMessageStatusSchema = z.object({
  type: z.literal("status"),
  content: z.string(),
});

/** 历史消息批量推送（连接建立时服务端下发）
 *
 * 实测快照会混入 system/status 类消息（无 uid/messageId 等字段），
 * 故 messages 为 user/system/status 三者 union（旧站 chat-room.js:1616-1619 按 type 分类处理）。
 */
export interface WsChatMessageHistory {
  type: "history";
  messages: (WsChatMessageUser | WsChatMessageSystem | WsChatMessageStatus)[];
}
export const WsChatMessageHistorySchema = z.object({
  type: z.literal("history"),
  messages: z.array(
    z.union([WsChatMessageUserSchema, WsChatMessageSystemSchema, WsChatMessageStatusSchema]),
  ),
});

/** 链接预览（实测契约：按 messageId 键控，preview 嵌套在 linkPreview 字段内，
 * 旧站 chat-link-preview.js:18-19 `previews.get(data.messageId) || normalize(data.linkPreview)`） */
export interface WsChatMessageLinkPreview {
  type: "link_preview";
  messageId: string;
  linkPreview: { url: string; title: string };
}
export const WsChatMessageLinkPreviewSchema = z.object({
  type: z.literal("link_preview"),
  messageId: z.string(),
  linkPreview: z.object({
    url: z.string(),
    title: z.string(),
  }),
});

/** 在线人数更新 */
export interface WsChatMessageOnlineCount {
  type: "onlineCount";
  count: number;
}
export const WsChatMessageOnlineCountSchema = z.object({
  type: z.literal("onlineCount"),
  count: z.number(),
});

/** 热词条目（旧站 app.js:536 renderHotWords 消费 {text, count}） */
export interface HotWord {
  text: string;
  count: number;
}
export const HotWordSchema = z.object({
  text: z.string(),
  count: z.number(),
});

/** 热词列表更新（字段名 words 对齐旧站 app.js:3883 data.words） */
export interface WsChatMessageHotWords {
  type: "hotWords";
  words: HotWord[];
}
export const WsChatMessageHotWordsSchema = z.object({
  type: z.literal("hotWords"),
  words: z.array(HotWordSchema),
});

/** 赛道标签更新广播 */
export interface WsChatMessageSaidaoTagUpdated {
  type: "saidaoTagUpdated";
  saidaoId: number;
  tag: string;
}
export const WsChatMessageSaidaoTagUpdatedSchema = z.object({
  type: z.literal("saidaoTagUpdated"),
  saidaoId: z.number(),
  tag: z.string(),
});

/** 热度分更新 */
export interface WsChatMessageHotScoreUpdate {
  type: "hotScoreUpdate";
  /** level：WS 下发 number（如 1），REST 的 hotLevel 为 string | null，store 侧统一归一化为 string */
  scores: { saidaoId: number; hotScore: number; level: string | number }[];
}
export const WsChatMessageHotScoreUpdateSchema = z.object({
  type: z.literal("hotScoreUpdate"),
  scores: z.array(
    z.object({
      saidaoId: z.number(),
      hotScore: z.number(),
      level: z.union([z.string(), z.number()]),
    }),
  ),
});

/** 清空消息（前端 reset + 清除 linkPreview） */
export interface WsChatMessageClear {
  type: "clear";
}
export const WsChatMessageClearSchema = z.object({
  type: z.literal("clear"),
});

/** 错误消息 */
export interface WsChatMessageError {
  type: "error";
  content?: string;
}
export const WsChatMessageErrorSchema = z
  .object({
    type: z.literal("error"),
    content: z.string().optional(),
  })
  .passthrough();

/** 心跳回包：客户端每 30s 发 {type:"ping"}（base-socket.ts 心跳），服务端回 pong */
export interface WsChatMessagePong {
  type: "pong";
  timestamp?: number;
}
export const WsChatMessagePongSchema = z.object({
  type: z.literal("pong"),
  timestamp: z.number().optional(),
});

/** 风控：要求滑块验证（前端验证后携带 ticket 重发原消息） */
export interface WsChatMessageCaptchaRequired {
  type: "captchaRequired";
  /**
   * 后端只下发 type，题目由客户端调 GET /captcha/slider 拉取
   * （docs/api/captcha.md §与聊天室的协作流程）；保留内联字段以兼容直接下发题目的形态。
   */
  challenge?: SliderCaptcha;
}
export const WsChatMessageCaptchaRequiredSchema = z.object({
  type: z.literal("captchaRequired"),
  challenge: SliderCaptchaSchema.optional(),
});

/** 消息被删除（撤回/管理删除） */
export interface WsChatMessageDeleted {
  type: "messageDeleted";
  messageId: string;
}
export const WsChatMessageDeletedSchema = z.object({
  type: z.literal("messageDeleted"),
  messageId: z.string(),
});

/** 投票更新（前端刷新投票状态） */
export interface WsChatMessagePollUpdate {
  type: "pollUpdate";
}
export const WsChatMessagePollUpdateSchema = z.object({
  type: z.literal("pollUpdate"),
});

/** 日报更新（前端刷新日报列表） */
export interface WsChatMessageDailyReportUpdate {
  type: "dailyReportUpdate";
}
export const WsChatMessageDailyReportUpdateSchema = z.object({
  type: z.literal("dailyReportUpdate"),
});

/** 赛道封面/直播流 URL 更新
 *
 * 实测 content 双形态：对象或 JSON 字符串（旧站 app.js:1913-1922 兼容双形态，
 * `typeof payload?.content === 'string' ? JSON.parse : content`）。
 * 分发处统一 parse 后消费。
 */
export interface WsChatMessageSaidaoCoverUpdated {
  type: "saidaoCoverUpdated";
  content: { uid: string; cover: string; liveUrl: string } | string;
}
export const WsChatMessageSaidaoCoverUpdatedSchema = z.object({
  type: z.literal("saidaoCoverUpdated"),
  content: z.union([
    z.object({
      uid: z.string(),
      cover: z.string(),
      liveUrl: z.string(),
    }),
    z.string(),
  ]),
});

/** 赛道内容分析更新 */
export interface WsChatMessageSaidaoContentAnalysisUpdated {
  type: "saidaoContentAnalysisUpdated";
  uid: string;
  contentAnalysis?: unknown;
}
export const WsChatMessageSaidaoContentAnalysisUpdatedSchema = z.object({
  type: z.literal("saidaoContentAnalysisUpdated"),
  uid: z.string(),
  contentAnalysis: z.unknown().nullish(),
});

/** 视频点播相关（转交 VideoRequestStore） */
export type VideoWsType =
  | "videoVoting"
  | "videoVoteUpdate"
  | "videoApproved"
  | "videoRejected"
  | "videoPlay"
  | "videoSync"
  | "videoPlayEnd"
  | "videoFailed"
  | "videoSkipped"
  | "videoDeleted";

export interface WsChatMessageVideo {
  type: VideoWsType;
  payload?: unknown;
}
export const WsChatMessageVideoSchema = z.object({
  type: z.enum([
    "videoVoting",
    "videoVoteUpdate",
    "videoApproved",
    "videoRejected",
    "videoPlay",
    "videoSync",
    "videoPlayEnd",
    "videoFailed",
    "videoSkipped",
    "videoDeleted",
  ]),
  payload: z.unknown().optional(),
});

/** 聊天室下行消息判别联合 */
export type WsChatMessage =
  | WsChatMessageUser
  | WsChatMessageSystem
  | WsChatMessageStatus
  | WsChatMessageHistory
  | WsChatMessageLinkPreview
  | WsChatMessageOnlineCount
  | WsChatMessageHotWords
  | WsChatMessageSaidaoTagUpdated
  | WsChatMessageHotScoreUpdate
  | WsChatMessageClear
  | WsChatMessageError
  | WsChatMessagePong
  | WsChatMessageCaptchaRequired
  | WsChatMessageDeleted
  | WsChatMessagePollUpdate
  | WsChatMessageDailyReportUpdate
  | WsChatMessageSaidaoCoverUpdated
  | WsChatMessageSaidaoContentAnalysisUpdated
  | WsChatMessageVideo;

/**
 * 聊天室下行消息 zod 判别联合，用于运行时校验。
 * 使用 z.ZodType<WsChatMessage> 显式标注输出类型，
 * 避免各 schema 中可选字段导致的 input/output 类型不一致。
 */
export const WsChatMessageSchema: z.ZodType<WsChatMessage> = z.discriminatedUnion("type", [
  WsChatMessageUserSchema,
  WsChatMessageSystemSchema,
  WsChatMessageStatusSchema,
  WsChatMessageHistorySchema,
  WsChatMessageLinkPreviewSchema,
  WsChatMessageOnlineCountSchema,
  WsChatMessageHotWordsSchema,
  WsChatMessageSaidaoTagUpdatedSchema,
  WsChatMessageHotScoreUpdateSchema,
  WsChatMessageClearSchema,
  WsChatMessageErrorSchema,
  WsChatMessagePongSchema,
  WsChatMessageCaptchaRequiredSchema,
  WsChatMessageDeletedSchema,
  WsChatMessagePollUpdateSchema,
  WsChatMessageDailyReportUpdateSchema,
  WsChatMessageSaidaoCoverUpdatedSchema,
  WsChatMessageSaidaoContentAnalysisUpdatedSchema,
  WsChatMessageVideoSchema,
]);

// =============================================================================
// 聊天室上行消息（客户端 → 服务端）
//
// 协议依据：docs/api/websocket.md §1.1
// =============================================================================

/** 发送文本/表情消息（表情为 <img .../> HTML 内容） */
export interface WsChatMessageInChat {
  type: "chat";
  content: string;
  /** 引用回复目标 */
  reply?: { messageId: string; uname: string };
  /** 滑块验证 ticket（风控重试时携带） */
  captchaTicket?: string;
}
export const WsChatMessageInChatSchema = z.object({
  type: z.literal("chat"),
  content: z.string(),
  reply: z
    .object({
      messageId: z.string(),
      uname: z.string(),
    })
    .optional(),
  captchaTicket: z.string().optional(),
});

/** 发送语音消息（先经 upload API 上传获取 audioUrl） */
export interface WsChatMessageInVoice {
  type: "voice";
  audioUrl: string;
  /** 语音时长（秒） */
  duration: number;
  /** 波形采样（约 32 个值，用于播放条渲染） */
  waveform: number[];
  /** 引用回复目标 */
  reply?: { messageId: string; uname: string };
  /** 滑块验证 ticket（风控重试时携带） */
  captchaTicket?: string;
}
export const WsChatMessageInVoiceSchema = z.object({
  type: z.literal("voice"),
  audioUrl: z.string(),
  duration: z.number(),
  waveform: z.array(z.number()),
  reply: z
    .object({
      messageId: z.string(),
      uname: z.string(),
    })
    .optional(),
  captchaTicket: z.string().optional(),
});

/** 聊天室上行消息判别联合 */
export type WsChatMessageIn = WsChatMessageInChat | WsChatMessageInVoice;

/** 聊天室上行消息 zod 判别联合，用于运行时校验 */
export const WsChatMessageInSchema: z.ZodType<WsChatMessageIn> = z.discriminatedUnion("type", [
  WsChatMessageInChatSchema,
  WsChatMessageInVoiceSchema,
]);

// =============================================================================
// 播放器弹幕下行消息（M4 使用，先定义）
//
// 协议依据：docs/api/websocket.md §2
// 客户端不发送，仅接收。
// =============================================================================

export interface WsPlayerDanmakuItem {
  /** 昵称可能缺失/为空，展示层兜底为「匿名」（旧站 player.js `item.user || "匿名"`） */
  user?: string;
  text: string;
}
export const WsPlayerDanmakuItemSchema = z.object({
  user: z.string().optional(),
  text: z.string(),
});

export interface WsPlayerDanmaku {
  comments: WsPlayerDanmakuItem[];
}
export const WsPlayerDanmakuSchema = z.object({
  comments: z.array(WsPlayerDanmakuItemSchema),
});
