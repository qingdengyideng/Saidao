"use client";

import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "@/stores/useUiStore";

/**
 * 主题提供者（水合安全）：
 * - 首屏：SSR 不读 localStorage，html 无 dark class（默认浅色）
 * - useEffect：读 uiStore.theme（persist）→ 应用 <html class="dark" data-theme="dark">
 * - 提供 useTheme() = { theme, toggle }
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);

  // 水合后同步 theme 到 <html> class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  return <>{children}</>;
}

export function useTheme() {
  return useUiStore(
    useShallow((s) => ({
      theme: s.theme,
      toggle: () => s.setTheme(s.theme === "dark" ? "light" : "dark"),
    })),
  );
}
