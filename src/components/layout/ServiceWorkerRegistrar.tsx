"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/sw";

/**
 * SW 注册器：仅生产环境注册 public/service-worker.js，dev 不注册（避免缓存干扰开发）。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
