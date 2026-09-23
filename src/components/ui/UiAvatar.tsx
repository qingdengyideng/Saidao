"use client";

import { Avatar, type AvatarProps } from "@heroui/react";

interface UiAvatarProps extends AvatarProps {
  /** 用户名字（用于 fallback 首字母） */
  name?: string;
  /** 头像 URL */
  src?: string;
}

/**
 * 头像统一（fallback 首字母、size 档位）。
 * - fallback 首字符用 [...name][0] 展开为 Unicode 码点，安全处理多字节字符（emoji/中文 surrogate pair）
 * - 支持透传 HeroUI 原生 color / variant
 */
export function UiAvatar({ name, src, size = "md", className, ...props }: UiAvatarProps) {
  // 展开为码点数组取首字符，避免 charAt(0) 截断多字节字符
  const initial = name ? ([...name][0]?.toUpperCase() ?? "?") : "?";
  return (
    <Avatar size={size} className={className} {...props}>
      {src && <Avatar.Image src={src} alt={name ?? ""} />}
      <Avatar.Fallback>{initial}</Avatar.Fallback>
    </Avatar>
  );
}
