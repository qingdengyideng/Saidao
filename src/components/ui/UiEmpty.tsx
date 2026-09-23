"use client";

import { Button } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

interface UiEmptyProps {
  /** 图标（可选，无图标场景传 undefined） */
  icon?: LucideIcon;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 操作按钮 */
  action?: { text: string; onPress: () => void };
}

/**
 * 空态统一组件（列表空/无权限/无直播）。
 * HeroUI v3 无 EmptyState 组件，按 AGENTS.md §1.3 第 9 条用原生元素 + Tailwind 原子类。
 * - aria-live="polite"：空态切换时屏幕阅读器可感知
 */
export function UiEmpty({ icon: Icon, title, description, action }: UiEmptyProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-12 text-center"
      aria-live="polite"
    >
      {Icon && <Icon size={40} className="text-muted" aria-hidden="true" />}
      <h3 className="text-base font-medium">{title}</h3>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action && (
        <Button size="sm" onPress={action.onPress}>
          {action.text}
        </Button>
      )}
    </div>
  );
}
