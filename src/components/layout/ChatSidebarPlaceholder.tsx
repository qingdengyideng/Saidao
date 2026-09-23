"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { UiIconButton } from "@/components/ui/UiIconButton";

/**
 * 聊天侧栏占位（M3 实现完整 ChatSidebar）。
 * 当前仅显示开关按钮。
 */
export function ChatSidebarPlaceholder() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 p-4">
      <UiIconButton icon={MessageSquare} aria-label="打开聊天" onPress={() => setOpen(!open)} />
      <span className="text-sm text-muted">聊天室即将上线…</span>
    </div>
  );
}
