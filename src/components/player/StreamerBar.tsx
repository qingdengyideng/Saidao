"use client";

import { ExternalLink } from "lucide-react";
import { UiAvatar } from "@/components/ui/UiAvatar";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { usePlayerStore } from "@/stores/usePlayerStore";

/**
 * 主播信息栏（绝对定位覆盖在视频上，与旧站 player.html .stage-header 对齐）
 *
 * HeroUI 无此复合组件，此组件在白名单内（见 05-heroui-components.md §7）。
 *
 * 视觉：
 * - 绝对定位 z-7，pointer-events: none（子按钮 pointer-events: auto）
 * - LIVE 信号动画（3 条竖线交替 scaleY）
 * - 去源站按钮右上角
 * - 移动端隐藏 streamer-room + origin-btn 文字
 */
export function StreamerBar() {
  const info = usePlayerStore((s) => s.info);
  const phase = usePlayerStore((s) => s.phase);

  // info 未到达：连接中 → 骨架占位；其他阶段 → 不渲染
  if (!info) {
    if (phase !== "connecting") return null;
    return (
      <div
        className="player-stage-header pointer-events-none absolute left-0 right-0 top-0 z-[7] flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5 sm:py-3"
        aria-hidden="true"
      >
        <UiSkeleton className="size-10 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <UiSkeleton className="h-4 w-28" />
          <UiSkeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }

  const isLive = phase === "live";
  const badgeState = isLive ? "live" : phase === "waiting" ? "ended" : "error";
  const statusText = isLive ? "直播中" : phase === "waiting" ? "等待开播" : "未开播";

  return (
    <header className="player-stage-header pointer-events-none absolute left-0 right-0 top-0 z-[7] flex items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5 sm:py-3">
      {/* 主播信息组 */}
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <UiAvatar
          name={info.uname ?? "未知"}
          src={info.avatar ?? undefined}
          size="md"
          className="size-10 shrink-0 border border-white/25"
        />
        <div className="min-w-0">
          <h1 className="mb-1.5 max-w-[380px] truncate text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.4)]">
            {info.uname ?? "未知主播"}
          </h1>
          <div className="flex items-center gap-2 text-[11px] leading-none">
            {/* LIVE 状态徽章（与旧站 .live-badge 一致） */}
            <span
              className="player-live-badge inline-flex items-center gap-1.5 rounded bg-white/8 px-1.5 py-1 text-[#c5c5ce] [&[data-state='live']]:bg-[var(--accent)] [&[data-state='live']]:text-white"
              data-state={badgeState}
            >
              <span className="player-live-signal" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>{statusText}</span>
            </span>
            <span className="hidden truncate text-[#c3c3cd] sm:inline">Saidao 直播</span>
          </div>
        </div>
      </div>

      {/* 去源站按钮（右上角，与旧站 .origin-btn 对齐） */}
      {info.orig && (
        <a
          href={info.orig}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto ml-auto inline-flex items-center justify-center gap-2 rounded-md border border-white/8 bg-white/8 px-3 py-2 text-xs text-foreground transition-colors hover:bg-white/15"
          aria-label="打开主播源站"
          title="打开主播源站"
        >
          <span className="hidden sm:inline">去源站</span>
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </header>
  );
}
