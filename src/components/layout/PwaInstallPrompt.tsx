"use client";

import { useCallback, useEffect } from "react";
import { toast } from "@heroui/react";
import { useUiStore } from "@/stores/useUiStore";
import type { BeforeInstallPromptEvent } from "@/lib/pwa/before-install-prompt";

/** 用户取消安装后，等待该时长再重新显示安装按钮（毫秒） */
const REINSTALL_DELAY_MS = 10_000;

/**
 * PWA 安装逻辑核心：
 * - 监听 beforeinstallprompt → 存事件 + 显示安装按钮
 * - 监听 appinstalled → 清除状态
 * - 通过 usePwaInstall() 暴露 visible + triggerInstall 供 Header 渲染按钮
 *
 * 组件本身返回 null，无 UI，仅做事件监听 + 状态管理。
 */
export function PwaInstallPrompt() {
  const setPwaInstallVisible = useUiStore((s) => s.setPwaInstallVisible);
  const setPwaDeferredPrompt = useUiStore((s) => s.setPwaDeferredPrompt);

  useEffect(() => {
    /** beforeinstallprompt：阻止默认弹窗，延迟安装到用户点击时 */
    const onBeforeInstallPrompt = (e: Event) => {
      const promptEvent = e as BeforeInstallPromptEvent;
      // 阻止浏览器默认安装弹窗，改为自定义 UI 触发
      e.preventDefault();
      setPwaDeferredPrompt(promptEvent);
      setPwaInstallVisible(true);
    };

    /** appinstalled：安装完成，清除所有 PWA 状态 */
    const onAppInstalled = () => {
      setPwaInstallVisible(false);
      setPwaDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [setPwaInstallVisible, setPwaDeferredPrompt]);

  return null;
}

/**
 * 供 Header 等组件调用的 hook：
 * - visible：是否显示安装按钮
 * - triggerInstall：触发浏览器安装弹窗
 */
export function usePwaInstall() {
  const visible = useUiStore((s) => s.pwaInstallVisible);
  const pwaDeferredPrompt = useUiStore((s) => s.pwaDeferredPrompt);
  const setPwaInstallVisible = useUiStore((s) => s.setPwaInstallVisible);
  const setPwaDeferredPrompt = useUiStore((s) => s.setPwaDeferredPrompt);

  const triggerInstall = useCallback(async () => {
    if (!pwaDeferredPrompt) {
      toast("安装功能暂时不可用", { variant: "default" });
      return;
    }

    const event = pwaDeferredPrompt;
    await event.prompt();
    const choice = await event.userChoice;

    if (choice.outcome === "accepted") {
      toast("应用已成功安装到桌面！", { variant: "success" });
      setPwaInstallVisible(false);
      setPwaDeferredPrompt(null);
    } else {
      toast("已取消安装", { variant: "default" });
      // 10 秒后重新显示安装按钮（仅当 deferredPrompt 仍存在时）
      setTimeout(() => {
        const current = useUiStore.getState().pwaDeferredPrompt;
        if (current) {
          setPwaInstallVisible(true);
        }
      }, REINSTALL_DELAY_MS);
    }
  }, [pwaDeferredPrompt, setPwaInstallVisible, setPwaDeferredPrompt]);

  return { visible, triggerInstall };
}
