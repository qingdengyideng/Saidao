import { z } from "zod";

export const VideoRequestItemSchema = z.object({
  id: z.number(),
  bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/),
  title: z.string(),
  coverUrl: z.string(),
  uploaderName: z.string(),
  duration: z.number(),
  voteApprove: z.number(),
  voteReject: z.number(),
});
export type VideoRequestItem = z.infer<typeof VideoRequestItemSchema>;

export const VideoRequestListSchema = z.object({
  playlist: z.array(VideoRequestItemSchema),
  voting: z.array(VideoRequestItemSchema),
  current: VideoRequestItemSchema.nullable(),
  currentTime: z.number().nullable(),
});
export type VideoRequestList = z.infer<typeof VideoRequestListSchema>;

export type VoteType = "approve" | "reject";
