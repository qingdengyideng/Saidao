import { z } from "zod";

export const PollOptionSchema = z.string();

export const PollSchema = z.object({
  id: z.number(),
  question: z.string(),
  options: z.array(PollOptionSchema).min(2),
  createdAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  active: z.boolean(),
  totalVoters: z.number(),
  counts: z.array(z.number()),
  myOptions: z.array(z.number()),
  multiple: z.boolean(),
  creatorId: z.number(),
  creatorName: z.string(),
  resultsVisible: z.boolean(),
});
export type Poll = z.infer<typeof PollSchema>;

export const ChatPollsSchema = z.object({
  canCreate: z.boolean(),
  serverTime: z.string().datetime({ offset: true }),
  current: PollSchema.nullable(),
  recent: z.array(PollSchema),
});
export type ChatPolls = z.infer<typeof ChatPollsSchema>;

export const ChatPollStatusSchema = z.object({
  serverTime: z.string().datetime({ offset: true }),
  /** 当前投票结束时间；无进行中投票时为 null（probe 79_polls_status_auth） */
  endsAt: z.string().datetime({ offset: true }).nullable(),
  /** 进行中投票的结束时间列表；无则为空数组（probe 79_polls_status_auth / 11_polls_status） */
  activeEndsAt: z.array(z.string().datetime({ offset: true })),
});
export type ChatPollStatus = z.infer<typeof ChatPollStatusSchema>;

export const CreateChatPollRequestSchema = z.object({
  question: z.string().min(1).max(100),
  options: z.array(z.string().min(1).max(20)).min(2),
  durationSeconds: z.union([z.literal(300), z.literal(600), z.literal(1800)]).optional(),
  multiple: z.boolean().optional(),
  resultsVisible: z.boolean().optional(),
});
export type CreateChatPollRequest = z.infer<typeof CreateChatPollRequestSchema>;
