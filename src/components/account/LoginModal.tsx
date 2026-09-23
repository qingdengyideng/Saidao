"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { getCaptchaApi, loginApi } from "@/api/user";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import { config } from "@/config";
import { ApiError } from "@/api/http-client";
import type { CaptchaImage } from "@/types/api/user";

function toBase64Src(image: string): string {
  if (image.startsWith("data:")) return image;
  return `data:image/png;base64,${image}`;
}

function getCaptchaErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "账号或密码错误";
    if (error.message.includes("验证码")) return "需要输入图形验证码";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function LoginModal() {
  const isOpen = useUiStore((s) => s.activeModal === "login");
  const closeModal = useUiStore((s) => s.closeModal);
  const openModal = useUiStore((s) => s.openModal);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaImage | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const captchaCodeId = useId();

  const resetForm = useCallback(() => {
    setEmail("");
    setPassword("");
    setCaptcha(null);
    setCaptchaCode("");
    setShowCaptcha(false);
    setLoading(false);
    setFormError(null);
  }, []);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      setCaptcha(await getCaptchaApi());
      setFormError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "验证码加载失败，请重试";
      setFormError(message);
      toast("验证码加载失败", { description: message, variant: "danger" });
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    closeModal();
  }, [closeModal, resetForm]);

  const openAllocationModal = useCallback(() => {
    openModal("allocation");
  }, [openModal]);

  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setPassword("");
      setCaptcha(null);
      setCaptchaCode("");
      setShowCaptcha(false);
      setLoading(false);
      setFormError(null);
      return;
    }

    resetForm();
  }, [isOpen, resetForm]);

  const handleSubmit = useCallback(async () => {
    const trimmedEmail = email.trim();
    const requiresCaptcha = showCaptcha || captcha !== null;

    if (!trimmedEmail) {
      setFormError("请输入账号或邮箱");
      return;
    }
    if (!password) {
      setFormError("请输入密码");
      return;
    }
    if (requiresCaptcha && !captchaCode.trim()) {
      setFormError("请输入图形验证码");
      return;
    }
    if (requiresCaptcha && !captcha) {
      setFormError("请先加载图形验证码");
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      const result = await loginApi({
        email: trimmedEmail,
        password,
        ...(requiresCaptcha && captcha
          ? { captchaId: captcha.captchaId, captchaCode: captchaCode.trim() }
          : {}),
      });

      localStorage.setItem(config.tokenStorageKey, result.token);
      useAuthStore.getState().setAuthenticated(result.user);
      toast("登录成功", { variant: "success" });
      handleClose();
    } catch (error: unknown) {
      const message = getCaptchaErrorMessage(error, "登录失败，请重试");
      setFormError(message);
      if (error instanceof ApiError && (error.status === 401 || message.includes("验证码"))) {
        setShowCaptcha(true);
        if (!captcha) {
          void loadCaptcha();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [captcha, captchaCode, email, handleClose, loadCaptcha, password, showCaptcha]);

  const handleCaptchaRefresh = useCallback(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  return (
    <UiModal isOpen={isOpen} onClose={handleClose} title="登录">
      <div className="flex flex-col gap-4" aria-live="polite">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <label htmlFor={emailId} className="mb-1 block text-sm">
            账号或邮箱
          </label>
          <UiTextField
            id={emailId}
            type="email"
            autoComplete="username"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
            placeholder="请输入账号或邮箱"
          />

          <label htmlFor={passwordId} className="mb-1 block text-sm">
            密码
          </label>
          <UiTextField
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFormError(null);
            }}
            placeholder="请输入密码"
          />

          {showCaptcha && (
            <div className="flex flex-col gap-2">
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
                    <UiSkeleton className="h-10 w-[120px]" />
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
            </div>
          )}

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
            isDisabled={loading}
            onPress={() => void handleSubmit()}
            className="w-full"
          >
            登录
          </UiButton>
        </form>

        <div className="border-t pt-4 text-center">
          <p className="mb-2 text-xs text-muted">还没有账号？</p>
          <UiButton
            variant="secondary"
            isDisabled={loading}
            onPress={openAllocationModal}
            className="w-full"
          >
            分配账号
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
