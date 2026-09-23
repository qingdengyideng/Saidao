"use client";

import { Button, type ButtonProps } from "@heroui/react";

/**
 * 统一 Button：项目内按钮统一 size="sm" 尺寸。
 * - 保留 size="sm" 默认值（36 处调用方依赖此视觉一致性）
 */
export function UiButton({ size = "sm", ...props }: ButtonProps) {
  return (
    <Button size={size} {...props}>
      {props.children}
    </Button>
  );
}
