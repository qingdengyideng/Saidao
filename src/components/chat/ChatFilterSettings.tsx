"use client";

import { Settings } from "lucide-react";
import { UiIconButton } from "@/components/ui/UiIconButton";

interface ChatFilterSettingsProps {
  onPress: () => void;
}

/**
 * 聊天过滤设置入口按钮。
 */
export function ChatFilterSettings({ onPress }: ChatFilterSettingsProps) {
  return <UiIconButton icon={Settings} aria-label="聊天过滤设置" onPress={onPress} />;
}
