import { z } from "zod";
import { FactionFieldSchema } from "./common";

/** 引用回复快照：uid 后端部分路径（WS history 快照）不下发，且无消费方，故可选 */
export const ReplyToSchema = z.object({
  uid: z.number().optional(),
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
  /** 部分路径（WS 广播、/message/history/window）不下发该字段，缺省视为未删除 */
  deleted: z.boolean().optional(),
  faction: FactionFieldSchema,
  mentions: z.array(z.string()).optional(),
  messageId: z.string(),
  timestamp: z.string(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  replyTo: ReplyToSchema.nullable().optional(),
  linkPreview: LinkPreviewSchema.nullable().optional(),
});

/**
 * 聊天消息类型（手写，避免 zod `.default()` 导致 input/output 类型不一致）。
 * WS 层用 ChatMessageSchema 做运行时校验，业务层用此类型。
 */
export type ChatMessage = {
  uid: number;
  type: "user" | "status";
  ipGeo?: string | null;
  uname: string;
  avatar?: string | null;
  content: string;
  /** 缺省视为未删除（后端部分路径不下发） */
  deleted?: boolean;
  faction?: string | null;
  mentions?: string[];
  messageId: string;
  timestamp: string;
  createdAt?: string;
  replyTo?: ReplyTo | null;
  linkPreview?: LinkPreview | null;
};

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
