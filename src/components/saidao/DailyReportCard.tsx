"use client";

import { ArrowUpRight, Calendar } from "lucide-react";
import { Chip } from "@heroui/react";
import { UiCard } from "@/components/ui/UiCard";
import type { DailyReport } from "@/types/api/daily-report";

// 展示层日期格式化走 Intl（AGENTS §2.2），update_time 为 Unix 秒需 ×1000
const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface DailyReportCardProps {
  report: DailyReport;
  isNew?: boolean;
}

export function DailyReportCard({ report, isNew }: DailyReportCardProps) {
  const updateTime = DATE_FORMATTER.format(new Date(report.update_time * 1000));

  return (
    <UiCard bare className="group overflow-hidden transition-shadow duration-300 hover:shadow-lg">
      <a
        href={report.link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`查看日报：${report.title}（新窗口打开）`}
        className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {/* 封面区 16:9 */}
        <div className="relative aspect-video overflow-hidden bg-surface-secondary">
          <img
            src={report.cover}
            alt=""
            width={640}
            height={360}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          {isNew && (
            <Chip size="sm" variant="primary" color="danger" className="absolute left-2 top-2">
              <Chip.Label>NEW</Chip.Label>
            </Chip>
          )}
        </div>
        {/* 信息区 */}
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold transition-colors duration-200 group-hover:text-accent">
            {report.title}
          </h3>
          <div className="mt-auto flex items-center justify-between text-xs text-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Calendar size={12} aria-hidden="true" />
              {updateTime}
            </span>
            {/* 外链标识：悬停向右上位移 */}
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-full bg-default/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
            >
              <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      </a>
    </UiCard>
  );
}
