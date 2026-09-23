"use client";

import { useMemo } from "react";
import { Radio } from "lucide-react";
import { UiEmpty } from "@/components/ui/UiEmpty";
import { useSaidaoStore } from "@/stores/useSaidaoStore";
import type { FilterTab } from "./FilterTabs";
import { SaidaoCard } from "./SaidaoCard";
import { CardsSkeleton } from "./CardsSkeleton";

export function SaidaoGrid({ tab }: { tab: FilterTab }) {
  const saidaos = useSaidaoStore((s) => s.saidaos);
  const hiddenIds = useSaidaoStore((s) => s.hiddenIds);
  const loaded = useSaidaoStore((s) => s.loaded);

  // 排序：直播优先（status=1）+ hotScore 降序；过滤 notShow
  const visible = useMemo(() => {
    return saidaos
      .filter((s) => !hiddenIds.has(s.id))
      .filter((s) => (tab === "live" ? s.status === 1 : true))
      .sort((a, b) => {
        if (a.status === 1 && b.status !== 1) return -1;
        if (a.status !== 1 && b.status === 1) return 1;
        return b.hotScore - a.hotScore;
      });
  }, [saidaos, hiddenIds, tab]);

  // 空态 / 加载态
  if (visible.length === 0) {
    // SWR 数据未到 → 骨架屏；数据已加载但确实无数据 → 空态
    if (!loaded) return <CardsSkeleton />;
    return (
      <UiEmpty
        icon={Radio}
        title={tab === "live" ? "暂无直播" : "暂无主播"}
        description={tab === "live" ? "当前没有主播在直播" : "稍后再来看看"}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      {visible.map((saidao) => (
        <SaidaoCard key={saidao.id} saidao={saidao} />
      ))}
    </div>
  );
}
