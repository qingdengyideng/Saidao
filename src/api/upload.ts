import * as T from "@/types/api/upload";
import { request } from "./http-client";

export const uploadImageApi = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<T.UploadUrlResult>(
    "/api/image/upload",
    { body: form, auth: true },
    T.UploadUrlResultSchema,
  );
};

export const uploadVoiceApi = (blob: Blob, fileName: string) => {
  const form = new FormData();
  form.append("file", blob, fileName);
  return request<T.UploadUrlResult>(
    "/api/voice/upload",
    { body: form, auth: true },
    T.UploadUrlResultSchema,
  );
};
