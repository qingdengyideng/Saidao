"use client";

import { Card, type CardProps } from "@heroui/react";

interface UiCardProps extends CardProps {
  /** 满幅卡片模式：children 不包 Card.Content，由调用方完全控制布局（如满幅封面卡） */
  bare?: boolean;
}

/**
 * 统一 Card：children 直接放入 Card.Content。
 * - 调用方需要的 header/footer 区域用自定义 div 布局（如 SaidaoCard 封面+信息区）
 * - bare 模式用于满幅封面卡（p-0 + overflow-hidden），绕过 Card.Content 包装
 */
export function UiCard({ className, bare, children, ...props }: UiCardProps) {
  return (
    <Card className={`${className ?? ""} ${bare ? "gap-0 p-0" : ""}`.trim()} {...props}>
      {bare ? children : <Card.Content>{children}</Card.Content>}
    </Card>
  );
}
