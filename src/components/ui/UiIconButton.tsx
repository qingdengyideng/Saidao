"use client";

import { Button, Spinner, type ButtonProps } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

interface UiIconButtonProps extends Omit<ButtonProps, "children" | "isIconOnly"> {
  /** lucide 图标组件 */
  icon: LucideIcon;
  /** aria-label（必填） */
  "aria-label": string;
  /** 原生 title（悬浮提示） */
  title?: string;
  /** isPending 时是否在图标位置渲染 Spinner（默认 false，仅透传 isPending 状态） */
  showSpinnerWhenPending?: boolean;
}

/** 图标尺寸映射：与 HeroUI 按钮内图标惯例一致 */
const ICON_SIZE: Record<NonNullable<ButtonProps["size"]>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * 图标按钮统一入口：isIconOnly + aria-label 必填。
 * - 图标尺寸按按钮 size 映射（sm→16 / md→20 / lg→24），避免硬编码
 */
export function UiIconButton({
  icon: Icon,
  size = "sm",
  variant = "ghost",
  className,
  showSpinnerWhenPending,
  isPending,
  ...props
}: UiIconButtonProps) {
  return (
    <Button
      isIconOnly
      size={size}
      variant={variant}
      isPending={isPending}
      className={className}
      {...props}
    >
      {showSpinnerWhenPending && isPending ? (
        <Spinner color="current" size="sm" aria-label="加载中" />
      ) : (
        <Icon size={ICON_SIZE[size]} aria-hidden="true" />
      )}
    </Button>
  );
}
