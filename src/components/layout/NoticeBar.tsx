"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import useSWR from "swr";
import throttle from "lodash-es/throttle";
import { Megaphone } from "lucide-react";
import { noticeApi } from "@/api/daily-report";

/** 跑马条速度（px/s）：恒定线速度，长/短文案观感一致 */
const MARQUEE_SPEED_PX_PER_SEC = 60;

/** 首帧（尚未测量）时的兜底时长 */
const MARQUEE_FALLBACK_DURATION_SEC = 20;

/** resize 重测节流间隔（ms） */
const RESIZE_THROTTLE_MS = 100;

interface MarqueeLayout {
  /** 半段文案的重复份数：保证单份宽 ≥ 视口宽，滚动中不会出现空白间隙 */
  copies: number;
  /** 单次循环时长（秒） */
  durationSec: number;
}

const INITIAL_LAYOUT: MarqueeLayout = {
  copies: 1,
  durationSec: MARQUEE_FALLBACK_DURATION_SEC,
};

/**
 * 公告栏：SWR 轮询 + marquee 无缝滚动，撑满 header 中段剩余宽度。
 * 空公告不渲染。
 *
 * 滚动规则（对齐旧站 updateNoticeScroll 的「始终滚动」诉求，实现为恒定速度）：
 * - 文案按份数重复（2 × copies 个 span），`translateX(-50%)` 位移刚好等于一份，
 *   与旧站 12s 线性循环等价但速度恒定；每份宽度含 `pr-8` 的间隔。
 * - 短文案时增大 copies，保证半段 ≥ 视口宽度，避免滚动到空白区。
 * - 容器尺寸变化（resize 节流）或文案变化时重测。
 * - 动画由 app/globals.css 的 `.marquee-track` 提供
 *   （prefers-reduced-motion 时静止，悬停暂停便于阅读）。
 */
export function NoticeBar() {
  const { data: notice } = useSWR("notice", noticeApi, { refreshInterval: 30000 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const itemRef = useRef<HTMLSpanElement | null>(null);
  const [layout, setLayout] = useState<MarqueeLayout>(INITIAL_LAYOUT);

  const recompute = useCallback(() => {
    const viewport = viewportRef.current;
    const item = itemRef.current;
    if (!viewport || !item) return;

    // offsetWidth 含 span 自身 padding（即份与份之间的间隔），故 groupWidth 即一份的完整步进宽度
    const groupWidth = item.offsetWidth;
    const viewportWidth = viewport.clientWidth;
    if (groupWidth <= 0 || viewportWidth <= 0) return;

    const copies = Math.max(1, Math.ceil(viewportWidth / groupWidth));
    setLayout((prev) =>
      prev.copies === copies
        ? prev
        : {
            copies,
            durationSec: (copies * groupWidth) / MARQUEE_SPEED_PX_PER_SEC,
          },
    );
  }, []);

  // 文案变化或容器尺寸变化时重测（resize 走 lodash 节流）
  useEffect(() => {
    recompute();
    const onResize = throttle(recompute, RESIZE_THROTTLE_MS);
    window.addEventListener("resize", onResize);
    return () => {
      onResize.cancel();
      window.removeEventListener("resize", onResize);
    };
  }, [recompute, notice]);

  if (!notice || notice.trim() === "") return null;

  const trackStyle: CSSProperties & Record<"--marquee-duration", string> = {
    "--marquee-duration": `${layout.durationSec}s`,
  };

  return (
    <div
      className="marquee-shell flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-2 sm:px-3"
      role="status"
      aria-label="公告"
    >
      <Megaphone
        size={16}
        aria-hidden="true"
        className="hidden shrink-0 text-[var(--accent)] sm:block"
      />
      <div
        ref={viewportRef}
        className="marquee-fade relative h-full min-w-0 flex-1 overflow-hidden"
      >
        <div className="marquee-track" style={trackStyle}>
          {Array.from({ length: layout.copies * 2 }, (_, index) => (
            <span
              key={`notice-copy-${index}`}
              ref={index === 0 ? itemRef : undefined}
              aria-hidden={index > 0 ? "true" : undefined}
              className="shrink-0 pr-8 text-sm whitespace-nowrap text-[var(--muted-foreground)]"
            >
              {notice}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
