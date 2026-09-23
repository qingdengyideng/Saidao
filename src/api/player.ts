import * as T from "@/types/api/player";
import { http } from "./http-client";

/**
 * GET /saidao/player/{uid} —— 唯一无 ApiEnvelope 包裹的接口。
 * 特判：m3u8 === "null"（字符串）→ null。
 * 用 http 实例（复用 fp 头注入拦截器），不走 request()（无包裹契约）。
 */
export async function playerInfoApi(
  uid: string,
  signal?: AbortSignal,
): Promise<T.NormalizedPlayerInfo> {
  const res = await http.get(`/saidao/player/${uid}`, {
    signal,
    timeout: 8000,
  });
  const info = T.PlayerInfoSchema.parse(res.data);
  return { ...info, m3u8: info.m3u8 === "null" ? null : info.m3u8 };
}
