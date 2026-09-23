"use client";

import { ChevronRight, Flame, History, Swords, Users, X } from "lucide-react";
import { Chip } from "@heroui/react";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { useChatStore } from "@/stores/useChatStore";

interface ChatHeaderProps {
  /** 移动端全宽覆盖时传入，渲染关闭按钮而非收起按钮 */
  isMobile?: boolean;
  onCollapse?: () => void;
  /** 热词开关状态（父组件管理，便于 HotWordsBar 显隐联动） */
  showHotWords?: boolean;
  onToggleHotWords?: () => void;
  /** 时间线面板是否展开（提供 onOpenMoments 时渲染入口按钮） */
  showMoments?: boolean;
  onOpenMoments?: () => void;
  /** 掰头面板是否展开（提供 onOpenPolls 时渲染入口按钮） */
  showPolls?: boolean;
  onOpenPolls?: () => void;
}

/**
 * 聊天头部：在线人数 + 热词切换 + 收起/关闭按钮。
 * 热词开关状态由父组件管理（通过 props 传入），
 * 持久化逻辑由父组件负责（useEffect 后读取，避免水合不一致）。
 */
export function ChatHeader({
  isMobile,
  onCollapse,
  showHotWords,
  onToggleHotWords,
  showMoments,
  onOpenMoments,
  showPolls,
  onOpenPolls,
}: ChatHeaderProps) {
  const onlineCount = useChatStore((s) => s.onlineCount);

  return (
    <div className="flex flex-1 items-center gap-2 px-3 py-2">
      {/* 在线人数：success 语义（在线=活跃），图标+文案+数字，tabular-nums 防数字跳动 */}
      <Chip size="sm" variant="soft" color="success">
        <Users size={13} aria-hidden="true" />
        <Chip.Label>
          在线 <span className="tabular-nums">{onlineCount}</span> 人
        </Chip.Label>
      </Chip>

      <UiIconButton
        icon={Flame}
        aria-label="切换热词"
        variant={showHotWords ? "secondary" : "ghost"}
        onPress={onToggleHotWords}
      />

      {onOpenMoments && (
        <UiIconButton
          icon={History}
          aria-label="聊天时间线"
          variant={showMoments ? "secondary" : "ghost"}
          onPress={onOpenMoments}
        />
      )}

      {onOpenPolls && (
        <UiIconButton
          icon={Swords}
          aria-label="掰头投票"
          variant={showPolls ? "secondary" : "ghost"}
          onPress={onOpenPolls}
        />
      )}

      <div className="flex-1" />

      {isMobile ? (
        <UiIconButton icon={X} aria-label="关闭聊天" onPress={onCollapse} />
      ) : (
        <UiIconButton icon={ChevronRight} aria-label="收起聊天栏" onPress={onCollapse} />
      )}
    </div>
  );
}
