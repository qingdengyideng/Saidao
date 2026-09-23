"use client";

import dayjs from "dayjs";
import { MessagesSquare } from "lucide-react";
import { Alert, Chip } from "@heroui/react";
import useSWR from "swr";
import { chatMomentsApi } from "@/api/message";
import { UiCard } from "@/components/ui/UiCard";
import { UiEmpty } from "@/components/ui/UiEmpty";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import type { MomentStats } from "@/types/api/message";

/**
 * 聊天时间线覆盖层：展示主播互动摘要（SWR 60s 轮询）。
 * 三态：loading 骨架 → error Alert → 时间线内容（segments 卡片）。
 */
export function ChatMoments() {
  const { data, error, isLoading } = useSWR("chat-moments", () => chatMomentsApi(), {
    refreshInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full max-h-105 flex-col gap-3 overflow-y-auto p-3" aria-busy="true">
        <UiSkeleton heightClass="h-5 w-2/3" />
        <UiSkeleton count={3} heightClass="h-24" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3">
        <Alert status="danger">加载互动摘要失败，请稍后重试</Alert>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const rangeLabel = `${dayjs(data.start).format("HH:mm")} ~ ${dayjs(data.end).format("HH:mm")}`;

  return (
    <div className="flex h-full max-h-105 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-medium">{rangeLabel}</h3>
        <Chip size="sm" variant="soft">
          {data.status}
        </Chip>
      </div>

      {data.segments.length === 0 ? (
        <UiEmpty
          icon={MessagesSquare}
          title="暂无互动摘要"
          description="主播互动数据更新后会自动显示"
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {data.segments.map((segment) => (
            <li key={segment.anchorId} className="relative">
              <span className="absolute bottom-2 left-1 top-2 w-px bg-default" aria-hidden="true" />
              <UiCard className="relative pl-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    {dayjs(segment.start).format("HH:mm")} - {dayjs(segment.end).format("HH:mm")}
                  </span>
                </div>
                <h4 className="mt-1 text-sm font-medium">{segment.title}</h4>
                <p className="mt-1 text-sm text-muted">{segment.summary}</p>
                {segment.stats && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {buildStatsChips(segment.stats).map((chip) => (
                      <Chip key={chip.label} size="sm" variant="soft">
                        {chip.label} {chip.value}
                      </Chip>
                    ))}
                  </div>
                )}
              </UiCard>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type StatChip = { label: string; value: number };

function buildStatsChips(stats: MomentStats): StatChip[] {
  return [
    { label: "消息", value: stats.messageCount },
    { label: "引用", value: stats.quoteCount },
    { label: "提及", value: stats.mentionCount },
    { label: "图片", value: stats.imageCount },
    { label: "表情", value: stats.emojiCount },
    { label: "视频", value: stats.videoCount },
  ].filter((c) => c.value > 0);
}
