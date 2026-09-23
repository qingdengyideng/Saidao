import { z } from "zod";

export const PlayerInfoSchema = z.object({
  /** 未开播时是字符串 "null"——特判归一化为 null */
  m3u8: z.string(),
  channel: z.string(),
  userId: z.string(),
  value: z.string(),
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
