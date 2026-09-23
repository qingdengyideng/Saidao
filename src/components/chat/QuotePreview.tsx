"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { parseChatContent } from "@/lib/chat/content-parser";
import { UiClickableImage, renderContentPart } from "@/components/ui/UiClickableImage";

interface QuotePreviewProps {
  replyTo: { uname: string; content: string; messageId: string };
  /** 提供时渲染取消回复按钮（输入框上方场景） */
  onCancel?: () => void;
}

/**
 * 引用/回复预览块：展示被引用消息的 @用户名 + 内容。
 * 左侧 accent 边框标识引用语义。
 *
 * 内容经 content-parser 白名单解析后渲染：文本自动转义，
 * 图片（emoji 小图 / 普通图片）可点击打开全局图片查看器。
 */
export function QuotePreview({ replyTo, onCancel }: QuotePreviewProps) {
  const parsed = useMemo(() => parseChatContent(replyTo.content), [replyTo.content]);

  return (
    <div className="flex items-start gap-2 rounded-lg border-l-2 bg-muted/50 p-2 text-sm">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{replyTo.uname}</span>
        <span className="text-muted">：</span>
        <QuoteContent parsed={parsed} />
      </div>
      {onCancel && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="取消回复"
          onClick={onCancel}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** 引用内容渲染：纯文本截断到 50 字符；含图片则完整渲染（图片可点击） */
function QuoteContent({ parsed }: { parsed: ReturnType<typeof parseChatContent> }) {
  if (parsed.kind === "text") {
    const text = parsed.text;
    return <span className="break-words">{text.length > 50 ? `${text.slice(0, 50)}…` : text}</span>;
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
