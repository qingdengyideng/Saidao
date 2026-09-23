"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VList, type VListHandle } from "virtua";
import { UiButton } from "@/components/ui/UiButton";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { config } from "@/config";
import { isNearBottom } from "@/lib/chat/scroll-utils";
import { useChatStore } from "@/stores/useChatStore";
import { useUiStore } from "@/stores/useUiStore";
import type { ChatMessage } from "@/types/api/message";
import { ChatMessageItem } from "./ChatMessageItem";

/** 距底部多少 px 内视为"在底部"（对齐旧站 CHAT_BOTTOM_SCROLL_EPSILON = 200） */
const BOTTOM_THRESHOLD = 200;
/** 距顶部多少 px 内触发加载更早历史（与旧站 CHAT_HISTORY_TOP_THRESHOLD 一致） */
const HISTORY_TOP_THRESHOLD = 80;

interface ChatMessageListProps {
  onReply?: (msg: ChatMessage) => void;
  onDelete?: (msg: ChatMessage) => void;
}

/**
 * 聊天消息列表（超过阈值启用 virtua 虚拟滚动）。
 *
 * 自动滚动策略（对齐旧站 chat-room.js）：
 * - 距底部 ≤ BOTTOM_THRESHOLD 视为"在底部"（跟随态），新消息到达自动贴底；
 * - 离底时累加 newMessageCount 并展示"N 条新消息"按钮；用户自己滚回底部时自动恢复跟随并清零计数；
 * - 首次填充（连接建立后的 history 快照 / clear 后重建）与虚拟化开关切换均强制贴底；
 * - 跟随态下内容高度变化（表情/大图 lazy 加载完成）通过 ResizeObserver 补滚到底；
 * - 滚动请求经 requestAnimationFrame 合并，瞬时跳转（无动画），避免高频消息下抖动。
 *
 * 历史消息分页：
 * - 向上滚动到顶部 HISTORY_TOP_THRESHOLD 内触发 loadOlderMessages（prepend，永不触发贴底）；
 * - 普通列表：前置插入后用 requestAnimationFrame 恢复 scrollTop 锚定原视口；
 * - virtua 列表：前置插入后用 scrollToIndex(anchorIndex + addedCount) 锚定首条可见消息。
 *
 * 布局：状态条与滚动容器是 flex 兄弟节点（滚动容器 min-h-0 flex-1），
 * 避免滚动容器溢出父容器导致底部被裁切。
 *
 * aria-live="polite" 保证屏幕阅读器播报新消息。
 */
export function ChatMessageList({ onReply, onDelete }: ChatMessageListProps) {
  const messages = useChatStore((s) => s.messages);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  // 桌面端侧栏收起状态：收起时滚动容器宽度过渡到 0（viewportSize→0）会让 virtua/scrollHeight
  // 重排并把滚动位置钳到顶部，从而误判 isAtBottom=false 并假计未读。收起时保持贴底态即可在
  // 展开后自动恢复跟随（尺寸已稳定，无需重新 scrollToBottom）。
  const isCollapsed = !useUiStore((s) => s.chatSidebarOpen);

  const [newMessageCount, setNewMessageCount] = useState(0);
  const isAtBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);

  const vlistRef = useRef<VListHandle>(null);
  /** 滚动容器（两种模式都挂：virtua 默认以直接父元素为滚动元素） */
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** 普通列表的内容容器（ResizeObserver 观察目标） */
  const contentRef = useRef<HTMLDivElement>(null);
  /** 挂起的滚动帧（rAF 合并去重） */
  const scrollRafRef = useRef<number | null>(null);

  // 普通列表：前置插入历史后用于恢复视口（scrollHeight - prevHeight + prevTop）
  const plainAnchorRef = useRef<{ height: number; top: number } | null>(null);
  // virtua 列表：记录触发加载时的首条 index + 旧消息总数，用于 scrollToIndex 锚定
  const vlistAnchorRef = useRef<{ anchorIndex: number; prevCount: number } | null>(null);

  const virtualize = messages.length > config.chatVirtualizeThreshold;
  const showLoadingBar = isLoadingHistory;

  /**
   * 滚到底部。虚拟列表走 scrollToIndex，普通列表直接设 scrollTop（瞬时，无动画）。
   * 内部从 store 现取消息，刻意保持空依赖——使 rAF 调度与 ResizeObserver 订阅稳定，
   * 不会随每条消息重建。
   */
  const scrollToBottom = useCallback(() => {
    const list = useChatStore.getState().messages;
    if (list.length > config.chatVirtualizeThreshold) {
      vlistRef.current?.scrollToIndex(list.length - 1, { align: "end" });
    } else {
      const el = scrollerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
    setNewMessageCount(0);
    isAtBottomRef.current = true;
  }, []);

  /** 滚动调度：一帧内多次请求只滚一次（对齐旧站 scheduleChatScrollToBottom） */
  const scheduleScrollToBottom = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollToBottom();
    });
  }, [scrollToBottom]);

  // 卸载时取消挂起的滚动帧
  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    },
    [],
  );

  // 侧栏展开（收起→展开）→ 等一帧让 aside 宽度恢复、virtua/scrollHeight 稳定后补滚一次，
  // 消除展开瞬间可能出现的滚动微跳（普通列表 scrollTop 被钳、virtua 重排后未贴底）。
  const prevCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    const prev = prevCollapsedRef.current;
    prevCollapsedRef.current = isCollapsed;
    if (prev && !isCollapsed) {
      // 由收起变为展开：延迟一帧等尺寸稳定再滚
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [isCollapsed, scrollToBottom]);

  // 新消息检测：末尾 messageId 变化时判断是否需要自动滚动
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      // 列表被清空（WS clear）→ 重置基线，下次内容到达按"初次填充"处理
      prevLastIdRef.current = null;
      return;
    }
    const prevLastId = prevLastIdRef.current;
    prevLastIdRef.current = last.messageId;
    if (prevLastId === last.messageId) return;

    if (prevLastId === null) {
      // 初次填充（建连后的 history 快照 / 清空后重建）→ 强制贴底并进入跟随
      isAtBottomRef.current = true;
      setNewMessageCount(0);
      scheduleScrollToBottom();
      return;
    }

    if (isAtBottomRef.current) {
      scheduleScrollToBottom();
    } else {
      setNewMessageCount((c) => c + 1);
    }
  }, [messages, scheduleScrollToBottom]);

  // 普通列表 ↔ 虚拟列表切换会重建 DOM、视口归零 → 跟随时重新贴底
  const prevVirtualizeRef = useRef(virtualize);
  useEffect(() => {
    if (prevVirtualizeRef.current === virtualize) return;
    prevVirtualizeRef.current = virtualize;
    if (isAtBottomRef.current) {
      scheduleScrollToBottom();
    }
  }, [virtualize, scheduleScrollToBottom]);

  // 内容高度变化（表情/大图 lazy 加载完成）→ 跟随时补滚到底
  useEffect(() => {
    const scroller = scrollerRef.current;
    // 普通列表观察内容包裹 div；虚拟列表观察 virtua 的内容容器（滚动容器的直接子元素）
    const content = virtualize ? scroller?.firstElementChild : contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        scheduleScrollToBottom();
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [virtualize, scheduleScrollToBottom]);

  // 桌面端侧栏收起（viewportSize→0 引发滚动重排）→ 强制保持"贴底"态并清未读，
  // 展开后尺寸稳定、内容仍贴底，自然恢复跟随，无需额外滚动。
  useEffect(() => {
    if (isCollapsed) {
      isAtBottomRef.current = true;
      setNewMessageCount(0);
    }
  }, [isCollapsed]);

  /**
   * 加载更早历史。普通列表需先记录视口用于锚定；
   * virtua 列表需记录触发时的首条 index 与旧消息总数。
   */
  const handleLoadOlder = useCallback(() => {
    const state = useChatStore.getState();
    if (state.isLoadingHistory || !state.historyHasMore) return;

    if (!virtualize) {
      const el = scrollerRef.current;
      if (el) {
        plainAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      }
    } else {
      const handle = vlistRef.current;
      const anchorIndex = handle ? handle.findStartIndex() : 0;
      vlistAnchorRef.current = { anchorIndex, prevCount: state.messages.length };
    }
    void loadOlderMessages();
  }, [virtualize, loadOlderMessages]);

  /**
   * 普通列表前置插入历史后恢复视口。
   * 等一帧让 React 提交 DOM 更新、scrollHeight 反映新高度后再设 scrollTop。
   */
  const restorePlainAnchor = useCallback(() => {
    const anchor = plainAnchorRef.current;
    const el = scrollerRef.current;
    if (!anchor || !el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - anchor.height + anchor.top;
    });
  }, []);

  /**
   * virtua 列表前置插入历史后恢复视口。
   * 旧 anchorIndex 的消息现在位于 anchorIndex + addedCount，scrollToIndex 对齐到顶部。
   */
  const restoreVlistAnchor = useCallback(() => {
    const anchor = vlistAnchorRef.current;
    if (!anchor) return;
    const handle = vlistRef.current;
    if (!handle) return;
    const addedCount = useChatStore.getState().messages.length - anchor.prevCount;
    if (addedCount > 0) {
      handle.scrollToIndex(anchor.anchorIndex + addedCount, { align: "start" });
    }
  }, []);

  // 消息列表长度变化后恢复历史加载视口（普通列表与 virtua 列表各自处理）
  useEffect(() => {
    if (plainAnchorRef.current !== null) {
      restorePlainAnchor();
      plainAnchorRef.current = null;
    }
    if (vlistAnchorRef.current !== null) {
      restoreVlistAnchor();
      vlistAnchorRef.current = null;
    }
  }, [messages.length, restorePlainAnchor, restoreVlistAnchor]);

  // 虚拟列表滚动：更新 isAtBottom + 检测顶部触发历史加载
  const handleVlistScroll = useCallback(
    (offset: number) => {
      const handle = vlistRef.current;
      if (!handle) return;
      const atBottom = isNearBottom(
        {
          contentSize: handle.scrollSize,
          offset: handle.scrollOffset,
          viewportSize: handle.viewportSize,
        },
        BOTTOM_THRESHOLD,
      );
      isAtBottomRef.current = atBottom;
      // 用户自己滚回底部 → 恢复跟随并清除未读提示
      if (atBottom) setNewMessageCount(0);
      if (offset <= HISTORY_TOP_THRESHOLD) {
        handleLoadOlder();
      }
    },
    [handleLoadOlder],
  );

  // 普通列表滚动：更新 isAtBottom + 检测顶部触发历史加载
  const handlePlainScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = isNearBottom(
      { contentSize: el.scrollHeight, offset: el.scrollTop, viewportSize: el.clientHeight },
      BOTTOM_THRESHOLD,
    );
    isAtBottomRef.current = atBottom;
    // 用户自己滚回底部 → 恢复跟随并清除未读提示
    if (atBottom) setNewMessageCount(0);
    if (el.scrollTop <= HISTORY_TOP_THRESHOLD) {
      handleLoadOlder();
    }
  }, [handleLoadOlder]);

  // 单条消息渲染（key 由父容器提供 messageId）
  const renderMessage = useCallback(
    (msg: ChatMessage) => (
      <ChatMessageItem
        key={msg.messageId}
        message={msg}
        canDelete={false}
        onReply={onReply}
        onDelete={onDelete}
      />
    ),
    [onReply, onDelete],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* WS 连接状态横幅 */}
      <WsBanner />

      {/* 历史加载指示条 / 没有更多了 */}
      {showLoadingBar && (
        <div
          className="flex shrink-0 items-center justify-center gap-1.5 border-b px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--border)" }}
          aria-live="polite"
        >
          <Loader2 size={12} aria-hidden="true" className="animate-spin" />
          正在加载历史消息
        </div>
      )}

      {/* 消息列表区（滚动容器必须是 VList 的直接父元素）
          桌面端收起时 aside 宽度过渡到 0，若容器随之收缩会触发 viewportSize=0 的重排；
          这里在收起时保持 flex-1 尺寸占位、仅用 visibility 隐藏，避免滚动位置被钳到顶部。 */}
      <div
        ref={scrollerRef}
        onScroll={virtualize ? undefined : handlePlainScroll}
        className={"min-h-0 flex-1 overflow-y-auto " + (isCollapsed ? "invisible" : "visible")}
        role="log"
        aria-live="polite"
        aria-label="聊天消息列表"
      >
        {messages.length === 0 && wsStatus !== "open" ? (
          <div ref={contentRef}>
            <MessageSkeleton />
          </div>
        ) : virtualize ? (
          <VList ref={vlistRef} onScroll={handleVlistScroll} itemSize={60}>
            {messages.map((msg) => renderMessage(msg))}
          </VList>
        ) : (
          <div ref={contentRef}>{messages.map((msg) => renderMessage(msg))}</div>
        )}
      </div>

      {/* 新消息提示按钮 */}
      {newMessageCount > 0 && (
        <UiButton
          variant="secondary"
          size="sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2"
          aria-label={`跳转到 ${newMessageCount} 条新消息`}
          onPress={scrollToBottom}
        >
          <ChevronDown size={14} aria-hidden="true" className="ms-1" />
          {newMessageCount} 条新消息
        </UiButton>
      )}
    </div>
  );
}

/** WS 连接期消息骨架（无数据 + WS 未 open 时显示） */
function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-start gap-2">
          <UiSkeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1">
            <UiSkeleton className="h-3 w-16" />
            <UiSkeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** WS 连接状态横幅（connecting/reconnecting 时展示） */
function WsBanner() {
  const wsStatus = useChatStore((s) => s.wsStatus);
  if (wsStatus !== "connecting" && wsStatus !== "reconnecting") {
    return null;
  }
  const label = wsStatus === "connecting" ? "连接中…" : "重连中…";
  return (
    <div
      className="flex shrink-0 items-center justify-center gap-1.5 border-b px-3 py-1 text-xs"
      style={{
        backgroundColor:
          "var(--warning-soft, color-mix(in oklab, var(--warning) 15%, transparent))",
        color: "var(--warning-soft-foreground, var(--warning))",
        borderColor: "var(--border)",
      }}
      aria-live="polite"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-warning" aria-hidden="true" />
      {label}
    </div>
  );
}
