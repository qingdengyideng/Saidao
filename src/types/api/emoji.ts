import { z } from "zod";

export const EmojiSchema = z.object({
  name: z.string(),
  url: z.string(),
  clickSend: z.boolean(),
});
export type Emoji = z.infer<typeof EmojiSchema>;

export type EmojiGroup = "vip" | "animation";

export const UploadEmojiResultSchema = z.object({
  url: z.string(),
  name: z.string(),
});
export type UploadEmojiResult = z.infer<typeof UploadEmojiResultSchema>;
