import { z } from "zod";
import * as T from "@/types/api/video-request";
import { request } from "./http-client";

export const videoRequestSubmitApi = (body: { bvid: string }) =>
  request<null>("/videoRequest/submit", { body, auth: true }, z.null());

export const videoRequestVoteApi = (body: { videoRequestId: number; voteType: T.VoteType }) =>
  request<null>("/videoRequest/vote", { body, auth: true }, z.null());

export const videoRequestListApi = () =>
  request<T.VideoRequestList>("/videoRequest/list", {}, T.VideoRequestListSchema);

export const videoRequestSkipApi = () =>
  request<null>("/videoRequest/skip", { auth: true }, z.null());

export const videoRequestDeleteApi = (videoRequestId: number) =>
  request<null>("/videoRequest/delete", { query: { videoRequestId }, auth: true }, z.null());
