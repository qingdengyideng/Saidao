import { z } from "zod";

export const SliderCaptchaSchema = z.object({
  challengeId: z.string(),
  background: z.string(),
  piece: z.string(),
  pieceY: z.number(),
  width: z.number(),
  height: z.number(),
});
export type SliderCaptcha = z.infer<typeof SliderCaptchaSchema>;

export const VerifySliderRequestSchema = z.object({
  challengeId: z.string(),
  x: z.number(),
});
export type VerifySliderRequest = z.infer<typeof VerifySliderRequestSchema>;

/** verify 返回 data 为 ticket 字符串（如 "bypass"） */
export const CaptchaTicketSchema = z.string();
export type CaptchaTicket = z.infer<typeof CaptchaTicketSchema>;
