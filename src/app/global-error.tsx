"use client";

/**
 * 全局错误边界（最后一道防线）。
 * 此时 CSS/HeroUI 可能完全未加载成功，
 * 因此使用内联 style 和裸 HTML 元素做兜底展示。
 * 这是 AGENTS.md §2.3/§1.3 的合理例外（CSS 不可用场景）。
 */
import { Alert } from "@heroui/react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "oklch(12% 0.005 285.823)", color: "var(--snow)" }}>
        <main className="flex min-h-dvh items-center justify-center p-6">
          <Alert status="danger" className="max-w-md">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>应用出错了</Alert.Title>
              <Alert.Description>
                {error.message || "未知错误"}
                {error.digest ? `（${error.digest}）` : ""}
              </Alert.Description>
            </Alert.Content>
            <button
              onClick={reset}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
            >
              重试
            </button>
          </Alert>
        </main>
      </body>
    </html>
  );
}
