"use client";

import { useAuthStore } from "@/stores/useAuthStore";

/**
 * 认证门控：返回 isLoggedIn 布尔值，用于 SWR key 判断。
 * 游客态（!isLoggedIn）时 SWR key 传 null，禁用请求。
 *
 * 用法：
 * const isLoggedIn = useIsAuthenticated();
 * const { data } = useSWR(isLoggedIn ? ["chatPolls"] : null, () => chatPollsApi());
 */
export function useIsAuthenticated(): boolean {
  const status = useAuthStore((s) => s.status);
  return status === "authenticated";
}
