"use client";

import { useState } from "react";
import { Tabs } from "@heroui/react";

const TAB_LABELS = {
  live: "直播中",
  all: "全部",
  dailyReport: "抽象日报",
} as const;

export type FilterTab = keyof typeof TAB_LABELS;

/**
 * 筛选 Tab（直播中 / 全部 / 抽象日报）。
 *
 * HeroUI 官方推荐写法：defaultSelectedKey（非受控）+ onSelectionChange 回调。
 * SharedElement 管理内部状态，避开受控模式下的首帧定位 bug。
 * 不写 URL——刷新回首页默认 tab，不保留选择状态。
 */
export function FilterTabs({
  onSelectionChange,
}: {
  onSelectionChange?: (key: FilterTab) => void;
}) {
  const [selected, setSelected] = useState<FilterTab>("live");

  return (
    <Tabs
      defaultSelectedKey="live"
      selectedKey={selected}
      onSelectionChange={(value) => {
        const key = value as FilterTab;
        setSelected(key);
        onSelectionChange?.(key);
      }}
      aria-label="内容筛选"
    >
      <Tabs.ListContainer>
        <Tabs.List>
          <Tabs.Tab id="live">
            {TAB_LABELS.live}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="all">
            {TAB_LABELS.all}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="dailyReport">
            {TAB_LABELS.dailyReport}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
