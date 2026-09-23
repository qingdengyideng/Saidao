"use client";

import { Input, type InputProps } from "@heroui/react";
import { useId } from "react";

interface UiTextFieldProps extends InputProps {
  /** 错误消息（存在时设置 aria-invalid / data-invalid 并渲染错误文本） */
  errorMessage?: string;
}

/**
 * 统一 TextField：spellCheck={false}、错误时 aria-invalid + data-invalid + 错误文本。
 * - data-invalid 触发 HeroUI 原生错误样式（边框变红等）
 * - aria-invalid / aria-describedby 保证屏幕阅读器可读
 */
export function UiTextField({ errorMessage, ...props }: UiTextFieldProps) {
  const errorId = useId();
  const invalid = !!errorMessage;
  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        data-invalid={invalid ? "true" : undefined}
        spellCheck={false}
        {...props}
      />
      {errorMessage && (
        <p id={errorId} className="text-xs text-danger" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
