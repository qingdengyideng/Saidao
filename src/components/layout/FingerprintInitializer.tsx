"use client";

import { useEffect } from "react";
import { getFingerprint, getFingerprintSync } from "@/lib/fingerprint";
import { setFingerprintProvider } from "@/api";

/**
 * 指纹初始化器。
 *
 * 为什么放在根布局的无 UI 组件中：
 * - http-client 的 fp 请求头与 chat-socket 的 fp 查询参数都依赖指纹，
 *   而 FingerprintJS 计算是异步的，必须在应用启动时尽早触发；
 * - 先同步注入 getFingerprintSync：fp 未就绪时返回 null，请求不阻塞，
 *   就绪后（localStorage 已缓存或首次计算完成）自动带上真实指纹；
 * - 计算放在 requestIdleCallback 中，避免 FingerprintJS 的同步采集
 *   阻塞首屏渲染（Safari 无此 API，回退 setTimeout 2s）。
 */
export function FingerprintInitializer() {
  useEffect(() => {
    setFingerprintProvider(getFingerprintSync);

    // 变量名加 Idle 后缀，避免遮蔽 DOM 全局 requestIdleCallback/cancelIdleCallback
    const scheduleIdle: (cb: IdleRequestCallback) => number =
      typeof requestIdleCallback === "function"
        ? (cb) => requestIdleCallback(cb)
        : (cb) => window.setTimeout(cb, 2000);
    const cancelIdle = (id: number) => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };

    const handle = scheduleIdle(() => {
      // 计算失败不致命：后续请求/重连会重试 getFingerprintSync
      getFingerprint().catch((err: unknown) => console.warn("[fingerprint] 初始化失败", err));
    });

    return () => cancelIdle(handle);
  }, []);
  return null;
}
