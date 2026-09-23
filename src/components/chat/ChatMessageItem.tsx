"use client";

import { Reply, Shield, Trash2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Chip, toast } from "@heroui/react";
import { UiAvatar } from "@/components/ui/UiAvatar";
import { UiConfirm } from "@/components/ui/UiConfirm";
import { parseChatContent } from "@/lib/chat/content-parser";
import { UiClickableImage, renderContentPart } from "@/components/ui/UiClickableImage";
import { isVoiceMessage, extractVoiceDuration } from "@/lib/chat/quote-utils";
import { messageDeleteApi } from "@/api/message";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { ChatMessage } from "@/types/api/message";
import { normalizeFaction, FACTION_CHIP_COLORS, FACTION_LABELS } from "@/types/api/enums";
import { VoiceBubble } from "./VoiceBubble";
import { QuotePreview } from "./QuotePreview";
import { LinkPreviewCard } from "./LinkPreviewCard";

interface ChatMessageItemProps {
  message: ChatMessage;
  /** 是否为自己发送的消息 */
  isOwn: boolean;
  /** 是否有删除权限（canChatBan 或本人） */
  canDelete?: boolean;
  onReply?: (msg: ChatMessage) => void;
  onDelete?: (msg: ChatMessage) => void;
  /** 屏蔽该用户回调（由父组件写入屏蔽配置） */
  onBlockUser?: (uid: number) => void;
}

/**
 * 单条聊天消息展示。
 * 表情/文本内容经 content-parser 白名单解析后渲染为 React 节点，
 * 全程无 dangerouslySetInnerHTML（安全规则 2.6）。
 */
function ChatMessageItemInner({
  message,
  canDelete = false,
  onReply,
  onDelete,
  onBlockUser,
}: Omit<ChatMessageItemProps, "isOwn">) {
  const user = useAuthStore((s) => s.user);
  const blockedUserIds = useChatStore((s) => s.blockedUserIds);

  const parsed = useMemo(() => parseChatContent(message.content), [message.content]);
  const isVoice = useMemo(() => isVoiceMessage(message.content), [message.content]);
  const voiceDuration = useMemo(
    () => (isVoice ? (extractVoiceDuration(message.content) ?? 3) : 0),
    [isVoice, message.content],
  );

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canBlock =
    message.uid !== 0 && message.uid !== user?.id && !blockedUserIds.includes(message.uid);

  /** 删除消息：调用后端 API 成功后本地标记 */
  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await messageDeleteApi(message.messageId);
      onDelete?.(message);
      toast("消息已删除");
    } catch {
      toast("删除失败，请稍后重试");
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  /** 屏蔽 TA：非匿名、非本人时可操作 */
  const handleBlockUser = () => {
    if (message.uid === 0) return;
    onBlockUser?.(message.uid);
  };

  // 系统/状态消息：居中显示，无头像
  if (message.type === "status") {
    return (
      <div className="px-3 py-1 text-center">
        <span
          className="text-xs italic text-muted"
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      </div>
    );
  }

  // 已删除消息：占位提示
  if (message.deleted) {
    return (
      <div className="px-3 py-1 text-center">
        <span className="text-xs text-muted line-through">消息已删除</span>
      </div>
    );
  }

  return (
    <div className="group relative flex gap-2 px-3 py-1.5 transition-colors hover:bg-muted/30">
      <UiAvatar size="sm" name={message.uname} src={message.avatar ?? undefined} />

      <div className="min-w-0 flex-1">
        {/* 头部行：用户名 + 阵营 + 地区 + 时间 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{message.uname}</span>
          {normalizeFaction(message.faction) && (
            <Chip
              color={FACTION_CHIP_COLORS[normalizeFaction(message.faction)!]}
              variant="soft"
              size="sm"
            >
              {FACTION_LABELS[normalizeFaction(message.faction)!]}
            </Chip>
          )}
          {message.uid !== 0 && message.ipGeo && (
            <span className="text-xs text-muted">{message.ipGeo}</span>
          )}
          <span className="text-xs text-muted">{message.timestamp}</span>
        </div>

        {/* 引用回复预览 */}
        {message.replyTo && (
          <div className="mt-1">
            <QuotePreview replyTo={message.replyTo} />
          </div>
        )}

        {/* 内容区 */}
        <div className="mt-0.5 break-words text-sm">
          {isVoice ? (
            <VoiceBubble url={message.content} duration={voiceDuration} />
          ) : (
            <MessageContent parsed={parsed} />
          )}
        </div>

        {/* 链接预览卡片 */}
        {message.linkPreview && <LinkPreviewCard preview={message.linkPreview} />}
      </div>

      {/* 悬停操作按钮 */}
      <div className="absolute right-2 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-1 text-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="回复"
          onClick={() => onReply?.(message)}
        >
          <Reply size={14} aria-hidden="true" />
        </button>
        {canDelete && (
          <button
            type="button"
            className="rounded p-1 text-muted transition-colors hover:bg-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
            aria-label="删除消息"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
        {canBlock && (
          <button
            type="button"
            className="rounded p-1 text-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="屏蔽 TA"
            onClick={handleBlockUser}
          >
            <Shield size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 删除二次确认（破坏性操作，规则 2.5） */}
      <UiConfirm
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="删除消息"
        description="确定要删除这条消息吗？此操作不可撤销。"
        confirmText="删除"
        onConfirm={handleDelete}
        isLoading={deleting}
      />
    </div>
  );
}

export const ChatMessageItem = memo(ChatMessageItemInner);

/** 解析结果 → React 节点（文本自动转义 / 图片可点击打开查看器） */
function MessageContent({ parsed }: { parsed: ReturnType<typeof parseChatContent> }) {
  if (parsed.kind === "text") {
    return <div dangerouslySetInnerHTML={{ __html: parsed.text }} />;
  }
  if (parsed.kind === "image") {
    return (
      <UiClickableImage
        src={parsed.src}
        emoji={parsed.emoji}
        label={parsed.emoji ? "查看表情" : "查看图片"}
      />
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {parsed.parts.map((part, i) => renderContentPart(part, i))}
    </span>
  );
}
