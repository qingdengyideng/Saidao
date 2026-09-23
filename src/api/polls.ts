import { z } from "zod";
import * as T from "@/types/api/polls";
import { request } from "./http-client";

export const chatPollsApi = () =>
  request<T.ChatPolls>("/chat/polls", { auth: true }, T.ChatPollsSchema);

export const createChatPollApi = (body: T.CreateChatPollRequest) =>
  request<T.Poll>("/chat/polls", { body, auth: true }, T.PollSchema);

export const chatPollStatusApi = () =>
  request<T.ChatPollStatus>("/chat/polls/status", {}, T.ChatPollStatusSchema);

export const voteChatPollApi = (id: number, optionIds: number[]) =>
  request<null>(`/chat/polls/${id}/ballots`, { body: { optionIds }, auth: true }, z.null());
