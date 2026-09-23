import { z } from "zod";
import { WebhookType } from "./common";

export const TestWebhookRequestSchema = z.object({
  webhookType: WebhookType,
  webhookUrl: z.string().url(),
  testMessage: z.string().optional(),
});
export type TestWebhookRequest = z.infer<typeof TestWebhookRequestSchema>;
