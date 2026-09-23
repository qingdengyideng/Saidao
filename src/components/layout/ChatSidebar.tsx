"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useUiStore } from "@/stores/useUiStore";
import { useChatSocket } from "@/hooks/useChatSocket";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { HotWordsBar } from "@/components/chat/HotWordsBar";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatFilterSettings } from "@/components/chat/ChatFilterSettings";
import { ChatFilterModal } from "@/components/chat/ChatFilterModal";
import { ChatMoments } from "@/components/chat/ChatMoments";
import { ChatPolls } from "@/components/chat/ChatPolls";
import { EmojiPanel } from "@/components/chat/EmojiPanel";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { SliderCaptcha } from "@/components/chat/SliderCaptcha";
import type { Emoji } from "@/types/api/emoji";
import type { ChatMessage } from "@/types/api/message";

/** 移动端断点：与 Tailwind md 一致 */
const MOBILE_QUERY = "(max-width: 767px)";
/** 分隔条键盘调节步长（px） */
const SEPARATOR_STEP = 10;

/** 监听媒体查询（初值同步读取，客户端水合即真实断点，避免首帧闪烁；<html> 已 suppressHydrationWarning） */
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
 * 聊天侧栏容器：集成 ChatHeader / HotWordsBar / ChatMessageList / ChatInput
 * + 风控滑块验证 + 过滤设置 + 表情/语音面板。
 *
 * 桌面端：右侧侧栏，宽度从 useUiStore.chatWidth（250~600px），
 * 可拖拽分隔条（role="separator"、方向键可调）。
 * 移动端：全屏覆盖 + 关闭按钮。
 *
 * 风控流程：
 * 1. 发送消息前将内容存入 pendingMessage
 * 2. WS 收到 captchaRequired → store 设置 pendingCaptcha
 * 3. 本组件检测到 pendingCaptcha 非空 → 渲染 SliderCaptcha
 * 4. 验证成功 → 携带 ticket 重发 pendingMessage
 * 5. 清除 pendingCaptcha / pendingMessage
 */
export function ChatSidebar() {
  const isMobile = useIsMobile();

  // 聊天侧栏宽度（桌面端，persist 250~600）
  const chatWidth = useUiStore((s) => s.chatWidth);
  const setChatWidth = useUiStore((s) => s.setChatWidth);

  // 风控状态
  const pendingCaptcha = useChatStore((s) => s.pendingCaptcha);
  const pendingMessage = useChatStore((s) => s.pendingMessage);
  const setPendingCaptcha = useChatStore((s) => s.setPendingCaptcha);
  const setPendingMessage = useChatStore((s) => s.setPendingMessage);
  const markDeleted = useChatStore((s) => s.markDeleted);

  // 本地 UI 状态
  // 侧栏显隐已提升到 useUiStore（chatSidebarOpen），桌面/移动端共用同一状态
  const chatSidebarOpen = useUiStore((s) => s.chatSidebarOpen);
  const setChatSidebarOpen = useUiStore((s) => s.setChatSidebarOpen);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showHotWords, setShowHotWords] = useState(false);
  const [showMoments, setShowMoments] = useState(false);
  const [showPolls, setShowPolls] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const lastSentRef = useRef<{ content: string; replyTo?: { messageId: string } } | null>(null);

  // 语音需登录（对齐旧站：游客可看可发文字/表情，语音需登录）
  const authStatus = useAuthStore((s) => s.status);
  const openModal = useUiStore((s) => s.openModal);

  const { sendMessage: rawSend, sendVoice, isOnline } = useChatSocket();

  // 从 localStorage 恢复热词开关（挂载后，避免水合不一致）
  useEffect(() => {
    setShowHotWords(localStorage.getItem("saidao-chat-hot-words") === "1");
  }, []);

  // 移动端关闭时重置面板状态
  useEffect(() => {
    if (!chatSidebarOpen) {
      setShowEmoji(false);
      setShowVoice(false);
      setShowMoments(false);
      setShowPolls(false);
      setInputValue("");
      setReplyTo(null);
    }
  }, [chatSidebarOpen]);

  /** 发送消息（发送前缓存内容，供风控拦截后重发） */
  const handleSend = useCallback(
    (content: string, replyToMsg?: { messageId: string }) => {
      lastSentRef.current = { content, replyTo: replyToMsg };
      setPendingMessage({ content, replyTo: replyToMsg });
      rawSend(
        content,
        replyToMsg ? { reply: { messageId: replyToMsg.messageId, uname: "" } } : undefined,
      );
      setInputValue("");
      setReplyTo(null);
    },
    [rawSend, setPendingMessage],
  );

  /** 风控验证成功：携带 ticket 重发 */
  const handleCaptchaSuccess = useCallback(
    (ticket: string) => {
      const msg = pendingMessage ?? lastSentRef.current;
      if (msg) {
        rawSend(msg.content, {
          captchaTicket: ticket,
          reply: msg.replyTo ? { messageId: msg.replyTo.messageId, uname: "" } : undefined,
        });
      }
      setPendingCaptcha(null);
      setPendingMessage(null);
      lastSentRef.current = null;
    },
    [pendingMessage, rawSend, setPendingCaptcha, setPendingMessage],
  );

  /** 取消风控验证：丢弃 pendingMessage */
  const handleCaptchaCancel = useCallback(() => {
    setPendingCaptcha(null);
    setPendingMessage(null);
    lastSentRef.current = null;
  }, [setPendingCaptcha, setPendingMessage]);

  /** 热词点击 → 填入输入框 */
  const handleHotWordClick = useCallback((word: string) => {
    setInputValue(word);
  }, []);

  /** 表情选择 → 追加到输入框 */
  const handleEmojiSelect = useCallback((emoji: Emoji) => {
    setInputValue((prev) => prev + emoji.url);
    setShowEmoji(false);
  }, []);

  /** 语音发送（上传后由 VoiceRecorder 回调） */
  const handleVoiceSend = useCallback(
    (audioUrl: string, duration: number, waveform: number[]) => {
      sendVoice(audioUrl, duration, waveform);
      setShowVoice(false);
    },
    [sendVoice],
  );

  /** 语音入口：未登录时打开登录弹窗（对齐旧站） */
  const handleOpenVoice = useCallback(() => {
    if (authStatus === "anonymous") {
      openModal("login");
      return;
    }
    setShowVoice((v) => !v);
  }, [authStatus, openModal]);

  /** 消息回复 */
  const handleReply = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
  }, []);

  /** 取消回复 */
  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  /** 消息删除（本地标记） */
  const handleDelete = useCallback(
    (msg: ChatMessage) => {
      markDeleted(msg.messageId);
    },
    [markDeleted],
  );

  /** 时间线开关（与掰头互斥） */
  const handleToggleMoments = useCallback(() => {
    setShowMoments((v) => {
      if (!v) setShowPolls(false);
      return !v;
    });
  }, []);

  /** 掰头开关（与时间线互斥） */
  const handleTogglePolls = useCallback(() => {
    setShowPolls((v) => {
      if (!v) setShowMoments(false);
      return !v;
    });
  }, []);

  /** 分隔条键盘调节（方向键，步长 10px） */
  const handleSeparatorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setChatWidth(chatWidth - SEPARATOR_STEP);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setChatWidth(chatWidth + SEPARATOR_STEP);
      }
    },
    [chatWidth, setChatWidth],
  );

  /** 分隔条拖拽（pointer 事件） */
  const handleSeparatorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startWidth = chatWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        setChatWidth(startWidth + delta);
      };

      const onUp = (upEvent: PointerEvent) => {
        e.currentTarget.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [chatWidth, setChatWidth],
  );

  const toggleHotWords = useCallback(() => {
    setShowHotWords((prev) => {
      const next = !prev;
      localStorage.setItem("saidao-chat-hot-words", next ? "1" : "0");
      return next;
    });
  }, []);

  /** 关闭聊天（防抖）：仅当展开时执行，避免收起过渡期连点 X 重复触发 */
  const handleCollapse = useCallback(() => {
    if (chatSidebarOpen) {
      setChatSidebarOpen(false);
    }
  }, [chatSidebarOpen, setChatSidebarOpen]);

  // 移动端渲染：全屏覆盖（DOM 常驻，收起时 transform 滑出 + invisible 隐藏）。
  // 面板始终挂载 → useChatSocket 持续订阅（WS 不断连）、ChatMessageList 状态保留，
  // 避免"收起再开启"时重新建连 + 列表重置导致无法自动滚动。
  if (isMobile) {
    return (
      <div
        className={
          "fixed inset-0 z-50 flex flex-col overscroll-contain bg-background transition-[transform,visibility] duration-300 ease-out " +
          (chatSidebarOpen ? "visible translate-x-0" : "invisible translate-x-full")
        }
        aria-label="聊天室"
        aria-hidden={!chatSidebarOpen}
      >
        <div className="flex items-center gap-1 border-b">
          <ChatHeader
            isMobile
            onCollapse={handleCollapse}
            showHotWords={showHotWords}
            onToggleHotWords={toggleHotWords}
            showMoments={showMoments}
            onOpenMoments={handleToggleMoments}
            showPolls={showPolls}
            onOpenPolls={handleTogglePolls}
          />
          <ChatFilterSettings onPress={() => setFilterModalOpen(true)} />
        </div>

        {showHotWords && <HotWordsBar onWordClick={handleHotWordClick} />}

        {/* 消息列表 / 时间线 / 掰头（互斥覆盖） */}
        {showMoments ? (
          <div className="flex-1 overflow-y-auto">
            <ChatMoments />
          </div>
        ) : showPolls ? (
          <div className="flex-1 overflow-y-auto">
            <ChatPolls />
          </div>
        ) : (
          <ChatMessageList onReply={handleReply} onDelete={handleDelete} />
        )}

        {showEmoji && (
          <EmojiPanel onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
        )}
        {showVoice && (
          <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setShowVoice(false)} />
        )}

        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={() =>
            handleSend(inputValue, replyTo ? { messageId: replyTo.messageId } : undefined)
          }
          onOpenEmoji={() => setShowEmoji((v) => !v)}
          onOpenVoice={handleOpenVoice}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
          isOnline={isOnline}
        />

        {pendingCaptcha && (
          <SliderCaptcha
            captcha={pendingCaptcha}
            onSuccess={handleCaptchaSuccess}
            onCancel={handleCaptchaCancel}
          />
        )}

        <ChatFilterModal isOpen={filterModalOpen} onOpenChange={setFilterModalOpen} />
      </div>
    );
  }

  // 桌面端：收起时宽度过渡到 0（overflow-hidden 裁切），DOM 保留（WS 不断连）
  const isCollapsed = !chatSidebarOpen;

  // 桌面端：右侧侧栏 + 可拖拽分隔条
  return (
    <aside
      // will-change-contents：把聊天室子树提前提升到独立合成层，展开/收起的 width
      // 过渡期只需合成该子树，不连带左侧列表整页重排，降低掉帧。
      className={`relative h-full shrink-0 overflow-hidden will-change-contents transition-[width] duration-200 ${
        isCollapsed ? "w-0 border-l-0 pointer-events-none" : "border-l"
      }`}
      style={{ width: isCollapsed ? 0 : chatWidth }}
      aria-label="聊天室"
    >
      {/* 分隔条（拖拽调宽），收起时隐藏；absolute 相对 aside 定位 */}
      {!isCollapsed && (
        <div
          role="separator"
          aria-label="调整聊天栏宽度"
          aria-valuemin={250}
          aria-valuemax={600}
          aria-valuenow={chatWidth}
          aria-orientation="vertical"
          tabIndex={0}
          className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize bg-border transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent hidden"
          onPointerDown={handleSeparatorPointerDown}
          onKeyDown={handleSeparatorKeyDown}
        />
      )}

      {/* 内层固定宽度：收起时外层 w-0 裁切，内容不变形 */}
      <div className="flex h-full flex-col" style={{ width: chatWidth }}>
        {/* 头部：在线人数 + 热词切换 + 过滤设置 + 收起按钮 */}
        <div className="flex items-center gap-1 border-b">
          <ChatHeader
            onCollapse={() => setChatSidebarOpen(false)}
            showHotWords={showHotWords}
            onToggleHotWords={toggleHotWords}
            showMoments={showMoments}
            onOpenMoments={handleToggleMoments}
            showPolls={showPolls}
            onOpenPolls={handleTogglePolls}
          />
          <ChatFilterSettings onPress={() => setFilterModalOpen(true)} />
        </div>

        {/* 热词条（开关打开时） */}
        {showHotWords && <HotWordsBar onWordClick={handleHotWordClick} />}

        {/* 消息列表 / 时间线 / 掰头（互斥覆盖） */}
        {showMoments ? (
          <div className="flex-1 overflow-y-auto">
            <ChatMoments />
          </div>
        ) : showPolls ? (
          <div className="flex-1 overflow-y-auto">
            <ChatPolls />
          </div>
        ) : (
          <ChatMessageList onReply={handleReply} onDelete={handleDelete} />
        )}

        {/* 表情面板 */}
        {showEmoji && (
          <EmojiPanel onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
        )}

        {/* 语音录制面板 */}
        {showVoice && (
          <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setShowVoice(false)} />
        )}

        {/* 输入框 */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={() =>
            handleSend(inputValue, replyTo ? { messageId: replyTo.messageId } : undefined)
          }
          onOpenEmoji={() => setShowEmoji((v) => !v)}
          onOpenVoice={handleOpenVoice}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
          isOnline={isOnline}
        />

        {/* 风控滑块验证弹窗 */}
        {pendingCaptcha && (
          <SliderCaptcha
            captcha={pendingCaptcha}
            onSuccess={handleCaptchaSuccess}
            onCancel={handleCaptchaCancel}
          />
        )}

        {/* 过滤设置弹窗 */}
        <ChatFilterModal isOpen={filterModalOpen} onOpenChange={setFilterModalOpen} />
      </div>
    </aside>
  );
}
