import { z } from "zod";
import { Faction, FactionFieldSchema, WebhookType } from "./common";

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  faction: FactionFieldSchema,
  canChatBan: z.boolean(),
  canEditSaidaoTag: z.boolean(),
  webhookType: z.union([WebhookType, z.string()]).nullable(),
  webhookUrl: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginResultSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type LoginResult = z.infer<typeof LoginResultSchema>;

/** 用户详情（比 User 少权限位，多 registerDate——注册日期字符串，如 "2026-01-30"） */
export const UserDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  faction: FactionFieldSchema,
  registerDate: z.string(),
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
  base64Image: z.string(),
  expireTime: z.number(),
});
export type CaptchaImage = z.infer<typeof CaptchaImageSchema>;

export const ChatFilterConfigSchema = z.object({
  blockedUserIds: z.array(z.number()),
  blockedNicknames: z.array(z.string()),
  keywordPatterns: z.array(z.string()),
});
export type ChatFilterConfig = z.infer<typeof ChatFilterConfigSchema>;
