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
  channel: z.string(),
  startTime: z.string().nullable(),
  /** number！1=直播中（与 PlayerInfo.status 的 string 区分） */
  status: z.number(),
  avatar: z.string().nullable(),
  cover: z.string().nullable(),
  url: z.string(),
  streamUrl: z.string().nullable(),
  /** 反向语义：true = 用户「不想看 TA」 */
  notShow: z.boolean(),
  tag: z.string().nullable(),
  hotScore: z.number(),
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
