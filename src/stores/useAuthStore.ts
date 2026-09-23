"use client";

import { create } from "zustand";
import { config } from "@/config";
import { setOnUnauthorized } from "@/api/http-client";
import type { User } from "@/types/api/user";

export type AuthStatus = "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** 初始化状态（从 localStorage 恢复 token 后异步验证用户） */
  initialized: boolean;
  /** 设置认证状态（内部用，http-client 401 回调调用） */
  setAuthenticated: (user: User) => void;
  /** 清除认证（登出 / 401） */
  clearAuth: () => void;
  /** 标记初始化完成 */
  markInitialized: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "anonymous",
  user: null,
  initialized: false,
  setAuthenticated: (user) => {
    set({ status: "authenticated", user });
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(config.tokenStorageKey);
    }
    set({ status: "anonymous", user: null });
  },
  markInitialized: () => {
    set({ initialized: true });
  },
}));

/**
 * 注册 http-client 401 回调（由 layout 或首次 API 调用时执行一次）。
 * 401 → clearAuth（登出）。
 */
export function registerAuthCallbacks(): void {
  setOnUnauthorized(() => {
    useAuthStore.getState().clearAuth();
  });
}
