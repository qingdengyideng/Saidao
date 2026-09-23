"use client";

import { ChevronDown, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { UiButton } from "@/components/ui/UiButton";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import type { SocketState } from "@/lib/ws/base-socket";

/** 评论列表单条（纯文本，与弹幕同源） */
export interface PlayerComment {
  id: number;
  user: string;
  text: string;
}

interface CommentPanelProps {
  /** 评论列表（由 PlayerPage 管理，200 条裁剪） */
  comments: PlayerComment[];
  /** WS 连接状态（connecting/reconnecting 时展示横幅） */
  wsStatus: SocketState;
}

/** 距底部多少 px 内视为"在底部" */
const BOTTOM_THRESHOLD = 80;

/**
 * 评论区面板（与旧站 player.html .comment-panel 结构对齐）
 *
 * 结构（与旧站一致）：
 * - panel-header：聊天图标 + "直播评论" + 连接状态文字
 * - comment-tab："全部评论" + 下划线
 * - comment-body：评论列表 / 空状态
 * - panel-footer："此刻，一起看直播" + "P 声音" 快捷键提示
 *
 * 粘底滚动策略：
 * - 处于底部时新评论自动滚到底部；
 * - 不在底部时累加新评论数并展示"回到最新"按钮。
 *
 * 纯文本渲染（React 文本节点自动转义），绝不使用 dangerouslySetInnerHTML。
 */
export function CommentPanel({ comments, wsStatus }: CommentPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevLastIdRef = useRef<number | null>(null);
  const [newCount, setNewCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    isAtBottomRef.current = true;
    setNewCount(0);
  }, []);

  // 新评论检测：末尾 id 变化时判断是否自动滚动
  useEffect(() => {
    const last = comments[comments.length - 1];
    if (!last) return;
    const prevLastId = prevLastIdRef.current;
    prevLastIdRef.current = last.id;
    if (prevLastId === null || prevLastId === last.id) return;

    if (isAtBottomRef.current) {
      requestAnimationFrame(scrollToBottom);
    } else {
      setNewCount((c) => c + 1);
    }
  }, [comments, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  const wsStatusText =
    wsStatus === "open" ? "已连接" : wsStatus === "connecting" ? "连接中…" : "重连中…";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── panel-header（与旧站 .panel-header 一致）────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-[#d0d0d9]" aria-hidden="true" />
          <h2 className="text-sm font-medium">直播评论</h2>
        </div>
        <span className="text-[11px] text-[#9292a0]" aria-live="polite">
          {wsStatusText}
        </span>
      </div>

      {/* ── comment-tab（与旧站 .comment-tab 一致，带下划线）────────────── */}
      <div className="relative shrink-0 px-5">
        <div className="flex h-12 items-center border-b border-[var(--line)] text-[13px] font-medium sm:h-12">
          <span>全部评论</span>
        </div>
        {/* 下划线（与旧站 .comment-tab::after 一致） */}
        <div
          className="absolute -bottom-px left-5 h-0.5 w-6 rounded bg-[var(--accent)]"
          aria-hidden="true"
        />
      </div>

      {/* ── comment-body（与旧站 .comment-body 一致）───────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 评论列表 */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex w-full flex-col gap-2 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-5 sm:py-5
            overscroll-behavior-contain
            [&::-webkit-scrollbar]:w-1
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-white/15
            [&::-webkit-scrollbar-thumb:hover]:bg-white/25"
          role="log"
          aria-live="polite"
          aria-label="直播评论列表"
        >
          {comments.length === 0 ? (
            wsStatus !== "open" ? (
              <div className="flex flex-col gap-2 py-2" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <UiSkeleton key={i} className="h-4 w-5/6" />
                ))}
              </div>
            ) : (
              /* 空状态（与旧站 .comment-empty 一致） */
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <MessageSquare className="mb-2.5 size-6 text-[#777785]" aria-hidden="true" />
                <p className="mb-1 text-sm text-[#777785]">等待第一条评论</p>
                <span className="text-xs text-[#777785]">直播间的热闹，即将在这里出现</span>
              </div>
            )
          ) : (
            comments.map((c) => (
              <div key={c.id} className="min-w-0 text-[13px] leading-7 break-words">
                {/* 用户名（与旧站 .comment-user 颜色一致） */}
                <span className="font-medium text-[#82c8df]">
                  {c.user}
                  <span className="mx-1">:</span>
                </span>
                <span className="text-foreground">{c.text}</span>
              </div>
            ))
          )}
        </div>

        {/* 回到最新按钮（与旧站 .scroll-bottom-btn 一致） */}
        {newCount > 0 && (
          <UiButton
            variant="secondary"
            size="sm"
            className="absolute bottom-3 left-1/2 -translate-x-1/2"
            aria-label={`跳转到 ${newCount} 条新评论`}
            onPress={scrollToBottom}
          >
            <ChevronDown size={14} aria-hidden="true" className="ms-1" />
            {newCount} 条新评论
          </UiButton>
        )}
      </div>

      {/* ── panel-footer（与旧站 .panel-footer 一致）───────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[var(--line)] px-4 py-3 text-[11px] text-[#777785] sm:px-4">
        <span className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-[#858592]" aria-hidden="true" />
          此刻，一起看直播
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-white/10 px-1 py-0.5 text-[10px] text-[#9393a0]">
            P
          </kbd>
          声音
        </span>
      </div>
    </div>
  );
}
