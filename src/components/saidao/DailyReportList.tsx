"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Newspaper } from "lucide-react";
import { dailyReportListApi } from "@/api/daily-report";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { UiEmpty } from "@/components/ui/UiEmpty";
import { DailyReportCard } from "./DailyReportCard";

const LAST_SEEN_KEY = "DAILY_REPORT_LAST_SEEN_ID";

export function DailyReportList() {
  const { data, isLoading } = useSWR("dailyReportList", () => dailyReportListApi(), {
    refreshInterval: 60000,
  });

  // baselineId：挂载时从 localStorage 冻结的基线，用于 isNew 判定（"本次会话新增"语义）
  const [baselineId, setBaselineId] = useState<number | null>(null);
  // lastSeenId：随新数据推进的水位，用于写入 localStorage
  const [lastSeenId, setLastSeenId] = useState(0);

  // 读取 localStorage 中上次看到的最新 id（水合安全）
  useEffect(() => {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    const value = stored ? parseInt(stored, 10) || 0 : 0;
    setBaselineId(value);
    setLastSeenId(value);
  }, []);

  // 新数据到达时推进 lastSeen 水位
  useEffect(() => {
    if (data && data.length > 0) {
      const maxId = Math.max(...data.map((r) => r.id));
      if (maxId > lastSeenId) {
        localStorage.setItem(LAST_SEEN_KEY, String(maxId));
        setLastSeenId(maxId);
      }
    }
  }, [data, lastSeenId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <UiSkeleton key={i} heightClass="h-60" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <UiEmpty icon={Newspaper} title="暂无日报" description="日报更新后会自动显示" />;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {data.map((report) => (
        <DailyReportCard
          key={report.id}
          report={report}
          // 首访（baseline=0）不批量标 NEW，仅标记大于基线的新增日报
          isNew={baselineId !== null && baselineId > 0 && report.id > baselineId}
        />
      ))}
    </div>
  );
}
