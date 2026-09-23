"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "@heroui/react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { verifySliderCaptchaApi } from "@/api/captcha";
import type { SliderCaptcha } from "@/types/api/captcha";

interface SliderCaptchaProps {
  captcha: SliderCaptcha;
  onSuccess: (ticket: string) => void;
  onCancel: () => void;
}

/**
 * 风控滑块验证弹窗。
 *
 * HeroUI 无滑块组件，此处用原生元素实现：
 * - 背景图容器 + 拼图块绝对定位
 * - Pointer 事件实现鼠标/触屏拖拽
 * - 键盘方向键微调（每步 5px）
 */
export function SliderCaptcha({ captcha, onSuccess, onCancel }: SliderCaptchaProps) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startDragXRef = useRef(0);

  const maxDrag = captcha.width;

  const clamp = useCallback((x: number) => Math.max(0, Math.min(maxDrag, x)), [maxDrag]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      setHasMoved(true);
      startXRef.current = e.clientX;
      startDragXRef.current = dragX;
    },
    [dragX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startXRef.current;
      setDragX(clamp(startDragXRef.current + dx));
    },
    [isDragging, clamp],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
    },
    [isDragging],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 5;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setHasMoved(true);
        setDragX((prev) => clamp(prev + step));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setHasMoved(true);
        setDragX((prev) => clamp(prev - step));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (hasMoved && !verifying) {
          void handleVerify(dragX);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clamp, hasMoved, verifying, dragX],
  );

  const handleVerify = useCallback(
    async (x: number) => {
      setVerifying(true);
      try {
        const ticket = await verifySliderCaptchaApi({
          challengeId: captcha.challengeId,
          x: Math.round(x),
        });
        onSuccess(ticket);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "验证失败，请重试";
        toast("验证失败", { description: msg, variant: "danger" });
        setDragX(0);
        setHasMoved(false);
      } finally {
        setVerifying(false);
      }
    },
    [captcha.challengeId, onSuccess],
  );

  // 拖拽释放后自动验证（仅当已移动过）
  useEffect(() => {
    if (!isDragging && hasMoved && !verifying && dragX > 0) {
      void handleVerify(dragX);
    }
  }, [isDragging, hasMoved, verifying, dragX, handleVerify]);

  return (
    <UiModal isOpen onClose={onCancel} title="安全验证">
      <div className="flex flex-col gap-4" aria-live="polite">
        {/* 背景图容器 */}
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden rounded-lg"
          style={{ width: captcha.width, height: captcha.height }}
        >
          <img
            src={captcha.background}
            alt="验证背景图"
            width={captcha.width}
            height={captcha.height}
            className="pointer-events-none block h-full w-full object-cover"
            draggable={false}
          />
          {/* 拼图块：可拖拽 */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="拖动滑块完成验证"
            aria-valuemin={0}
            aria-valuemax={maxDrag}
            aria-valuenow={dragX}
            aria-valuetext={`当前位置 ${dragX}，最大值 ${maxDrag}`}
            className="absolute cursor-grab touch-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{
              left: dragX,
              top: captcha.pieceY,
              width: 50,
              height: 70,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
          >
            <img
              src={captcha.piece}
              alt="拼图块"
              width={50}
              height={70}
              className="pointer-events-none h-full w-full object-contain drop-shadow-md"
              draggable={false}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between">
          <UiButton variant="tertiary" onPress={onCancel} isDisabled={verifying}>
            <X size={14} aria-hidden="true" />
            取消
          </UiButton>
          <UiButton
            variant="primary"
            onPress={() => void handleVerify(dragX)}
            isPending={verifying}
            isDisabled={!hasMoved}
          >
            {verifying ? (
              <Loader2 size={14} aria-hidden="true" className="animate-spin" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            验证
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
