"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { allocateApi, getCaptchaApi } from "@/api/user";
import { AllocationResultModal } from "@/components/account/AllocationResultModal";
import { useUiStore } from "@/stores/useUiStore";
import type { CaptchaImage, User } from "@/types/api/user";

type AllocationStage = "captcha" | "result";

function toBase64Src(image: string): string {
  if (image.startsWith("data:")) return image;
  return `data:image/png;base64,${image}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export function AllocationCaptchaModal() {
  const isOpen = useUiStore((s) => s.activeModal === "allocation");
  const closeModal = useUiStore((s) => s.closeModal);

  const [stage, setStage] = useState<AllocationStage>("captcha");
  const [captcha, setCaptcha] = useState<CaptchaImage | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [allocatedUser, setAllocatedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const captchaCodeId = useId();

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      setCaptcha(await getCaptchaApi());
      setFormError(null);
    } catch (error: unknown) {
      const message = getErrorMessage(error, "验证码加载失败，请重试");
      setFormError(message);
      toast("验证码加载失败", { description: message, variant: "danger" });
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  const resetForm = useCallback(() => {
    setStage("captcha");
    setCaptcha(null);
    setCaptchaCode("");
    setAllocatedUser(null);
    setLoading(false);
    setFormError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    closeModal();
  }, [closeModal, resetForm]);

  useEffect(() => {
    if (isOpen) {
      setStage("captcha");
      setCaptchaCode("");
      setAllocatedUser(null);
      setLoading(false);
      setFormError(null);
      void loadCaptcha();
    }
  }, [isOpen, loadCaptcha]);

  const handleCaptchaRefresh = useCallback(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  const handleAllocate = useCallback(async () => {
    if (!captcha) {
      setFormError("请先加载图形验证码");
      return;
    }
    if (!captchaCode.trim()) {
      setFormError("请输入图形验证码");
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      const user = await allocateApi({
        email: "",
        password: "",
        captchaId: captcha.captchaId,
        captchaCode: captchaCode.trim(),
      });

      setAllocatedUser(user);
      setStage("result");
      toast("账号分配成功", { variant: "success" });
    } catch (error: unknown) {
      const message = getErrorMessage(error, "账号分配失败，请重试");
      setFormError(message);
    } finally {
      setLoading(false);
    }
  }, [captcha, captchaCode]);

  return (
    <UiModal
      isOpen={isOpen}
      onClose={handleClose}
      title={stage === "captcha" ? "安全验证" : "账号已分配"}
    >
      <div className="flex flex-col gap-4" aria-live="polite">
        {stage === "captcha" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAllocate();
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="刷新图形验证码"
                className="shrink-0 overflow-hidden rounded-md border border-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={handleCaptchaRefresh}
              >
                {captcha ? (
                  <img
                    src={toBase64Src(captcha.base64Image)}
                    alt="图形验证码"
                    width={120}
                    height={40}
                    className="block h-10 w-[120px] object-contain"
                    draggable={false}
                  />
                ) : (
                  <span className="flex h-10 w-[120px] items-center justify-center text-xs text-muted">
                    加载中
                  </span>
                )}
              </button>
              <UiIconButton
                icon={RefreshCw}
                aria-label="刷新图形验证码"
                onPress={handleCaptchaRefresh}
                isDisabled={captchaLoading}
                variant="outline"
              />
            </div>

            <label htmlFor={captchaCodeId} className="mb-1 block text-sm">
              验证码
            </label>
            <UiTextField
              id={captchaCodeId}
              value={captchaCode}
              onChange={(e) => {
                setCaptchaCode(e.target.value);
                setFormError(null);
              }}
              placeholder="请输入图中验证码"
            />

            {formError && (
              <p className="text-sm text-danger" aria-live="polite">
                {formError}
              </p>
            )}

            <UiButton
              type="submit"
              variant="primary"
              size="md"
              isPending={loading}
              isDisabled={loading || !captcha}
              onPress={() => void handleAllocate()}
              className="w-full"
            >
              确认并分配账号
            </UiButton>
          </form>
        ) : (
          allocatedUser && <AllocationResultModal user={allocatedUser} />
        )}
      </div>
    </UiModal>
  );
}
