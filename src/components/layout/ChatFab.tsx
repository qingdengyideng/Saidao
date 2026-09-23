"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useUiStore } from "@/stores/useUiStore";
import { useChatStore } from "@/stores/useChatStore";

/** 移动端断点：≤767px 视为移动端（Tailwind md: 断点对齐） */
const MOBILE_QUERY = "(max-width: 767px)";

/** 监听 matchMedia 判断当前是否移动端（初值同步读取，客户端水合即真实断点，避免首帧闪烁） */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

/**
 * 聊天室浮动按钮：
 * - 桌面端：固定在右侧中部，竖排"聊天"文字 + 图标
 * - 移动端：右下角圆形 FAB
 * 侧栏收起时累计新消息数，展示红色 badge
 */
export function ChatFab() {
  const isMobile = useIsMobile();
  const chatSidebarOpen = useUiStore((s) => s.chatSidebarOpen);
  const setChatSidebarOpen = useUiStore((s) => s.setChatSidebarOpen);
  const messages = useChatStore((s) => s.messages);
  /** 侧栏展开时记录"已读消息数"，收起后新增的 = messages.length - lastSeenCount */
  const lastSeenCountRef = useRef(0);

  // 侧栏展开时重置 lastSeenCount，保证收起后只统计"真正新增"的消息
  useEffect(() => {
    if (chatSidebarOpen) {
      lastSeenCountRef.current = messages.length;
    }
  }, [chatSidebarOpen, messages.length]);

  const newCount = !chatSidebarOpen ? Math.max(0, messages.length - lastSeenCountRef.current) : 0;

  const handleToggle = useCallback(() => {
    setChatSidebarOpen(!chatSidebarOpen);
  }, [chatSidebarOpen, setChatSidebarOpen]);

  if (isMobile) {
    // 全屏聊天已打开时不渲染 FAB，避免与全屏层重叠
    if (chatSidebarOpen) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label="打开聊天"
        className="fixed right-3 bottom-3 z-50 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-colors hover:bg-accent/90"
      >
        <MessageSquare size={24} aria-hidden="true" />
        {newCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs text-white"
            aria-label={`${newCount} 条新消息`}
          >
            {newCount > 99 ? "99+" : newCount}
          </span>
        )}
      </button>
    );
  }

  // 桌面端：侧栏展开时不渲染右侧浮动按钮，
  // 避免遮挡聊天对话（侧栏右上角已有"收起"按钮，可正常收起后再展开）
  if (chatSidebarOpen) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={chatSidebarOpen ? "收起聊天" : "展开聊天"}
      className="fixed right-0 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg border border-r-0 border-border bg-background px-1.5 py-3 shadow-md transition-colors hover:bg-muted"
    >
      <MessageSquare size={18} aria-hidden="true" />
      <span className="text-xs [writing-mode:vertical-rl]">聊天</span>
      {newCount > 0 && (
        <span
          className="absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs text-white"
          aria-label={`${newCount} 条新消息`}
        >
          {newCount > 99 ? "99+" : newCount}
        </span>
      )}
    </button>
  );
}
