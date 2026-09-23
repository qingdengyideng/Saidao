"use client";

/**
 * SWR 全局配置辅助：
 * - 统一 error 处理（ZodError → Toast 提示）
 * - 游客态 key 禁用（!isLoggedIn 时 key=null）
 */

/** 检查是否为 ZodError（后端数据契约漂移） */
export function isZodError(err: unknown): boolean {
  return err instanceof Error && err.name === "ZodError";
}

/** 检查是否为 ApiError */
export function isApiError(err: unknown): boolean {
  return err instanceof Error && err.name === "ApiError";
}

/** 检查是否为 NetworkError / TimeoutError */
export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && (err.name === "NetworkError" || err.name === "TimeoutError");
}
