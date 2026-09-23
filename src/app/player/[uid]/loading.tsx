import { Skeleton } from "@heroui/react";

/**
 * 播放页路由级 loading（与 PlayerPage 布局一致的结构骨架）。
 *
 * 结构对齐 PlayerPage：
 * - 视频区（flex-1 + 径向渐变背景）
 * - 右侧评论区（桌面端 360px / 移动端隐藏）
 *
 * 注意：此文件是 Server Component（无 "use client"），不能 import 带
 * "use client" 的 UiSkeleton 封装，故直接用 HeroUI Skeleton（纯 CSS 动画，
 * 无浏览器 API，可在 Server Component 渲染）。
 */
export default function PlayerLoading() {
  return (
    <div className="flex h-dvh flex-col bg-background" aria-label="加载中">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 视频区（径向渐变背景 + 骨架） */}
        <div
          className="flex min-w-0 flex-1 items-center justify-center
          h-[60dvh] bg-[radial-gradient(ellipse_at_22%_35%,#363a41_0%,#25262e_36%,#18191f_76%)]
          md:h-full"
        >
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>

        {/* 评论区骨架（桌面端） */}
        <aside className="hidden w-90 shrink-0 flex-col gap-3 border-l bg-background/50 p-3 md:flex lg:w-95">
          <div className="mb-2 flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-12 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-5/6" />
          ))}
        </aside>
      </div>
    </div>
  );
}
