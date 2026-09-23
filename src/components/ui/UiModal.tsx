"use client";

import { Modal, type ModalBackdropProps } from "@heroui/react";
import { useState } from "react";
import type { ReactNode } from "react";

interface UiModalProps extends Omit<ModalBackdropProps, "isOpen" | "onOpenChange"> {
  isOpen: boolean;
  onClose: () => void;
  /** 标题（aria-labelledby 关联） */
  title: string;
  children: ReactNode;
  /** 是否显示默认 header（标题 + 关闭按钮） */
  showHeader?: boolean;
}

let modalIdCounter = 0;

/**
 * 统一 Modal：默认 header（标题 + 关闭按钮）、overscroll-behavior、ESC/遮罩关闭。
 */
export function UiModal({
  isOpen,
  onClose,
  title,
  children,
  showHeader = true,
  className,
  ...props
}: UiModalProps) {
  const [id] = useState(() => `ui-modal-${++modalIdCounter}`);
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onClose} className={className} {...props}>
      <Modal.Container>
        <Modal.Dialog aria-labelledby={showHeader ? id : undefined}>
          {showHeader && (
            <>
              <Modal.CloseTrigger />
              <Modal.Header className="flex items-center justify-between gap-2">
                <Modal.Heading id={id}>{title}</Modal.Heading>
              </Modal.Header>
            </>
          )}
          <Modal.Body className="overscroll-contain">{children}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
