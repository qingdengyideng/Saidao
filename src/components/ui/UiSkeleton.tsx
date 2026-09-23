"use client";

import { Skeleton, type SkeletonProps } from "@heroui/react";

interface UiSkeletonProps extends SkeletonProps {
  /** 骨架条数量（列表骨架） */
  count?: number;
  /** 骨架条高度 class */
  heightClass?: string;
}

/**
 * 列表骨架统一节奏。
 * - count>1 时骨架条宽度交错（w-full / w-5/6 / w-4/6 循环），提升视觉自然度
 * - key 用 skeleton-${i}：骨架条是无状态纯视觉占位，无稳定业务 id，带前缀 index 是合理妥协
 */
const WIDTH_PATTERN = ["w-full", "w-5/6", "w-4/6"] as const;

export function UiSkeleton({ count = 1, heightClass = "h-4", ...props }: UiSkeletonProps) {
  if (count === 1) {
    return <Skeleton className={heightClass} {...props} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={`skeleton-${i}`}
          className={`${heightClass} ${WIDTH_PATTERN[i % 3]}`}
          {...props}
        />
      ))}
    </div>
  );
}
