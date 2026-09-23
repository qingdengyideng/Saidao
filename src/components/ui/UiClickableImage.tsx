"use client";

import { useUiStore } from "@/stores/useUiStore";
import type { ParsedPart } from "@/lib/chat/content-parser";

interface UiClickableImageProps {
  /** 图片 URL（白名单解析后的 src） */
  src: string;
  /** 是否为 emoji 小图（32px 内联），否则为普通大图（max-w 240px 气泡） */
  emoji: boolean;
  /** 无障碍标签，默认"查看图片" */
  label?: string;
  /** 自定义图片尺寸类（覆盖 emoji/大图默认尺寸），如头像场景 */
  imgClassName?: string;
}

/**
 * 可点击图片：点击打开全局图片查看器（GlobalImageViewer）。
 *
 * 为何用原生 <button> 而非 HeroUI Button：
 * 图片本身是展示主体，HeroUI Button 的 isIconOnly 会强制方形容器/固定尺寸，
 * 破坏图片的自然比例（emoji 32px / 大图 max-w 240px object-contain），
 * 故用原生 button + Tailwind 原子类保持视觉自然，同时满足 a11y（aria-label + focus-visible）。
 */
export function UiClickableImage({
  src,
  emoji,
  label = "查看图片",
  imgClassName,
}: UiClickableImageProps) {
  const openViewer = useUiStore((s) => s.openViewer);
  const defaultImgClass = emoji
    ? "h-8 w-8 object-contain"
    : "max-h-60 max-w-60 rounded object-contain";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => openViewer([src], 0)}
      className="inline-block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <img
        src={src}
        alt={emoji ? "表情" : "图片"}
        loading="lazy"
        className={imgClassName ?? defaultImgClass}
      />
    </button>
  );
}

/** 聊天内容 part → 可渲染节点（文本自动转义 / 图片走 UiClickableImage） */
export function renderContentPart(part: ParsedPart, key: number): React.ReactNode {
  if (part.kind === "text") {
    return <span key={key}>{part.text}</span>;
  }
  const emoji = part.kind === "emoji";
  return (
    <UiClickableImage
      key={key}
      src={part.src}
      emoji={emoji}
      label={emoji ? "查看表情" : "查看图片"}
    />
  );
}
