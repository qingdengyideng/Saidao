import { z } from "zod";
import * as T from "@/types/api/emoji";
import type { UploadUrlResult } from "@/types/api/upload";
import { request } from "./http-client";

export const queryEmojisApi = (group: T.EmojiGroup) =>
  request<T.Emoji[]>(`/emoji/${group}`, { auth: true }, z.array(T.EmojiSchema));

export const uploadEmojiApi = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<UploadUrlResult>(
    "/emoji/upload",
    { body: form, auth: true },
    T.UploadEmojiResultSchema,
  );
};
