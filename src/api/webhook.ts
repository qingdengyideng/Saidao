import { z } from "zod";
import * as T from "@/types/api/webhook";
import { request } from "./http-client";

export const testWebhookApi = (body: T.TestWebhookRequest) =>
  request<null>("/webhook/testWebhook", { body, auth: true, fromN8N: true }, z.null());
