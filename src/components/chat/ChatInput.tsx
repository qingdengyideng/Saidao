"use client";

import { useCallback, useRef } from "react";
import { Mic, Send, Smile, X } from "lucide-react";
import { Chip } from "@heroui/react";
import { UiButton } from "@/components/ui/UiButton";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { UiTextarea } from "@/components/ui/UiTextarea";
import { truncateContent } from "@/lib/chat/quote-utils";

interface ReplyTarget {
  uname: string;
  content: string;
  messageId: string;
}

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onOpenEmoji: () => void;
  onOpenVoice: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  isOnline: boolean;
}

/** 最大字符数（后端契约） */
const MAX_LENGTH = 256;
/** 自动撑高的最大行数 */
const MAX_LINES = 4;

/**
 * 聊天文本输入框。
 *
 * - Enter 发送，Ctrl+Enter 换行
 * - 自动撑高（1~4 行）
 * - 剩余字数 Chip（>0 且正在输入时显示）
 * - 回复预览（QuotePreview，可取消）
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onOpenEmoji,
  onOpenVoice,
  replyTo,
  onCancelReply,
  isOnline,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = MAX_LENGTH - value.length;
  const isTyping = value.length > 0;

  // 自动撑高：根据 scrollHeight 调整 height，限制在 MAX_LINES 行内
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24; // 14px font + 8px line-height 估算
    const maxH = lineHeight * MAX_LINES;
    const nextH = Math.min(el.scrollHeight, maxH);
    el.style.height = `${nextH}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter 发送（无 Shift/Ctrl/Alt/Meta）
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!value.trim() || !isOnline) return;
        onSend();
      }
    },
    [value, isOnline, onSend],
  );

  const handleSend = useCallback(() => {
    if (!value.trim()) return;
    if (!isOnline) return;
    onSend();
  }, [value, isOnline, onSend]);

  return (
    <div className="flex flex-col gap-2 border-t border-border p-2" aria-live="polite">
      {replyTo && (
        <div
          className="flex items-start justify-between gap-2 rounded-md bg-muted px-2 py-1.5 text-sm"
          role="note"
        >
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">回复 {replyTo.uname}：</span>
            <span className="block truncate text-[var(--muted-foreground)]">
              {truncateContent(replyTo.content, 80)}
            </span>
          </div>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="取消回复"
              className="shrink-0 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <UiTextarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          adjustHeight();
        }}
        onKeyUp={adjustHeight}
        onKeyDown={handleKeyDown}
        aria-label="聊天消息输入"
        placeholder={isOnline ? "说点什么…" : "连接中…"}
        maxLength={MAX_LENGTH}
        className="min-h-[40px] resize-none text-sm"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <UiIconButton icon={Smile} aria-label="表情" onPress={onOpenEmoji} variant="ghost" />
          <UiIconButton icon={Mic} aria-label="语音" onPress={onOpenVoice} variant="ghost" />
        </div>

        <div className="flex items-center gap-2">
          {isTyping && remaining > 0 && (
            <Chip size="sm" variant="soft" className="text-xs">
              {remaining}
            </Chip>
          )}
          <UiButton
            variant="primary"
            size="sm"
            onPress={handleSend}
            isDisabled={!isOnline || !value.trim()}
          >
            <Send size={14} aria-hidden="true" />
            发送
          </UiButton>
        </div>
      </div>
    </div>
  );
}
