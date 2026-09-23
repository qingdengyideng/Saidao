"use client";

import { useCallback } from "react";
import { Alert, Code, toast } from "@heroui/react";
import { ClipboardCopy, Home } from "lucide-react";
import { UiButton } from "@/components/ui/UiButton";
import { useUiStore } from "@/stores/useUiStore";
import type { User } from "@/types/api/user";

interface AllocationResultModalProps {
  user: User;
}

export function AllocationResultModal({ user }: AllocationResultModalProps) {
  const closeModal = useUiStore((s) => s.closeModal);

  const copyCredentials = useCallback(async () => {
    const text = `账号：${user.email}\n昵称：${user.name}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制分配信息", { variant: "success" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "复制失败，请手动记录";
      toast("复制失败", { description: message, variant: "danger" });
    }
  }, [user.email, user.name]);

  const handleEnterHome = useCallback(() => {
    closeModal();
  }, [closeModal]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        账号体系已改为自动分配。请保存以下凭据，登录后可修改密码。
      </p>

      <dl className="flex flex-col gap-3 rounded-lg border border-default p-4">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-muted">账号</dt>
          <dd className="flex items-center gap-2">
            <Code className="max-w-[16rem]">{user.email}</Code>
            <UiButton
              variant="tertiary"
              size="sm"
              aria-label="复制分配信息"
              onPress={() => void copyCredentials()}
            >
              <ClipboardCopy size={16} aria-hidden="true" />
              复制
            </UiButton>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-muted">昵称</dt>
          <dd className="truncate text-sm">{user.name}</dd>
        </div>
      </dl>

      <Alert status="warning">
        仅本次显示。请妥善保存账号信息，初始密码请联系管理员或查看注册邮件。
      </Alert>

      <div className="flex justify-end">
        <UiButton variant="primary" size="md" onPress={handleEnterHome}>
          <Home size={16} aria-hidden="true" />
          进入主页
        </UiButton>
      </div>
    </div>
  );
}
