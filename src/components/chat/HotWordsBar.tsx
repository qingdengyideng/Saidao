"use client";

import { Flame } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";

/** 热词条最多展示 8 个 chip */
const MAX_HOT_WORDS = 8;

interface HotWordsBarProps {
  /** 点击热词时回调（父组件负责填入输入框） */
  onWordClick: (word: string) => void;
}

/**
 * 热词条：展示服务端下发的热词（≤8 个）。
 * HeroUI Chip 渲染为 span 无键盘可达性，故按规则 11 用原生 button
 * + HeroUI BEM chip 类（chip--accent chip--soft）保持设计 token 一致。
 */
export function HotWordsBar({ onWordClick }: HotWordsBarProps) {
  const hotWords = useChatStore((s) => s.hotWords);

  if (hotWords.length === 0) {
    return null;
  }

  const words = hotWords.slice(0, MAX_HOT_WORDS);

  return (
    <div className="flex flex-wrap gap-1 overflow-hidden px-3 py-1">
      {words.map((word) => (
        <button
          key={word.text}
          type="button"
          className="chip chip--accent chip--soft inline-flex cursor-pointer items-center gap-0.5 rounded-2xl px-2 py-0.5 text-xs leading-5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`发送热词 ${word.text}`}
          onClick={() => onWordClick(word.text)}
        >
          <Flame size={12} aria-hidden="true" />
          <span className="chip__label px-0.5">{word.text}</span>
          <span className="text-[10px] text-muted">×{word.count}</span>
        </button>
      ))}
    </div>
  );
}
