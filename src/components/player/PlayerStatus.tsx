"use client";

import { Play, Radio } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";

/**
 * 播放器状态覆盖层（与旧站 player.html .status-overlay 对齐）
 *
 * - connecting: loading spinner（CSS 动画）+ "正在连接直播"
 * - waiting: Radio 图标圆形卡片 + "等待开播"
 * - error: Radio 图标圆形卡片 + "连接中断" + 重试提示
 * - live + autoplayBlocked: tap-play 按钮（"点击播放并开启声音"）
 * - live（已播放）: 不渲染
 *
 * HeroUI Spinner 不适用于深色视频背景（视觉突兀），改用 CSS 动画 spinner。
 */
export function PlayerStatus() {
  const phase = usePlayerStore((s) => s.phase);
  const retryCount = usePlayerStore((s) => s.retryCount);
  const autoplayBlocked = usePlayerStore((s) => s.autoplayBlocked);

  // live 且无自动播放阻止 → 不渲染
  if (phase === "live" && !autoplayBlocked) return null;

  return (
    <div
      className="absolute inset-0 z-4 flex items-center justify-center bg-black/70"
      role="status"
      aria-live="polite"
      aria-busy={phase === "connecting"}
    >
      {/* connecting: loading spinner + 文字 */}
      {phase === "connecting" && (
        <div className="flex flex-col items-center gap-4">
          <div className="player-loading-spinner" aria-hidden="true" />
          <div className="status-card flex flex-col items-center gap-1">
            <p className="text-lg font-medium text-white">正在连接直播</p>
            <p className="text-sm text-white/60">精彩即将开始，请稍候</p>
          </div>
        </div>
      )}

      {/* waiting: Radio 图标 + 文字 */}
      {phase === "waiting" && (
        <div className="flex flex-col items-center gap-4">
          <div className="grid size-13 place-items-center rounded-full border border-white/10 bg-white/5">
            <Radio className="size-6 text-white/60" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-lg font-medium text-white">等待开播</p>
            <p className="text-sm text-white/60">每 10 秒自动检测</p>
          </div>
        </div>
      )}

      {/* error: Radio 图标 + 文字 */}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-4">
          <div className="grid size-13 place-items-center rounded-full border border-white/10 bg-white/5">
            <Radio className="size-6 text-white/60" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-lg font-medium text-white">连接中断</p>
            <p className="text-sm text-white/60">
              {retryCount > 0 ? `已重试 ${retryCount} 次 · ` : ""}每 10 秒自动重试
            </p>
          </div>
        </div>
      )}

      {/* live + autoplayBlocked: tap-play 按钮（与旧站 .tap-play 一致） */}
      {phase === "live" && autoplayBlocked && (
        <button
          type="button"
          className="flex flex-col items-center gap-3 rounded-full bg-white/10 px-8 py-5
            backdrop-blur-sm transition-colors hover:bg-white/20
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="点击播放并开启声音"
        >
          <span className="grid size-14 place-items-center rounded-full bg-white/15">
            <Play className="ml-0.5 size-7 fill-current" aria-hidden="true" />
          </span>
          <span className="text-sm text-white/90">点击播放并开启声音</span>
        </button>
      )}
    </div>
  );
}
