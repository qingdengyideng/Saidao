import { z } from "zod";
import * as T from "@/types/api/message";
import { request } from "./http-client";

export const messageDeleteApi = (messageId: string) =>
  request<null>("/message/delete", { body: { messageId }, auth: true }, z.null());

export const messageHistoryApi = (messageId: string) =>
  request<T.ChatMessage[]>(
    "/message/history",
    { query: { messageId }, auth: true },
    z.array(T.ChatMessageSchema),
  );

export const messageHistoryWindowApi = (params: T.HistoryWindowRequest) =>
  request<T.HistoryWindowResponse>(
    "/message/history/window",
    { query: params, auth: true },
    T.HistoryWindowResponseSchema,
  );

export const chatMomentsApi = () =>
  request<T.ChatMoments>("/message/moments", { auth: true }, T.ChatMomentsSchema);
