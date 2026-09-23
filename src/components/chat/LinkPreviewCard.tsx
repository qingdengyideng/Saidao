"use client";

import { Link } from "@heroui/react";
import type { LinkPreview } from "@/types/api/message";

interface LinkPreviewCardProps {
  preview: LinkPreview;
}

/**
 * 链接预览卡片：展示链接标题 + URL。
 * 外链必须 rel="noopener noreferrer" + target="_blank"（安全规则 2.6）。
 */
export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <div className="mt-1 max-w-full rounded-lg border p-2">
      <Link
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sm no-underline hover:underline"
      >
        {preview.title}
      </Link>
      <p className="truncate text-xs text-muted">{preview.url}</p>
    </div>
  );
}
