"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { UiModal } from "./UiModal";

interface UiConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  /** 确认按钮语义：danger（破坏性，默认）/ primary（非破坏性如保存） */
  variant?: "danger" | "primary";
}

/**
 * 二次确认弹窗（破坏性操作统一入口）。
 * - variant 默认 danger（破坏性操作）；非破坏性确认（如保存）传 variant="primary"
 * - isLoading 期间取消按钮禁用，防止请求进行中关闭弹窗导致状态不一致
 */
export function UiConfirm({
  isOpen,
  onClose,
  title,
  description,
  confirmText = "确认",
  onConfirm,
  isLoading,
  variant = "danger",
}: UiConfirmProps) {
  return (
    <UiModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {description && <p className="text-sm text-muted">{description}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="tertiary" isDisabled={isLoading} onPress={onClose}>
            取消
          </Button>
          <Button variant={variant} isPending={isLoading} onPress={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </UiModal>
  );
}
