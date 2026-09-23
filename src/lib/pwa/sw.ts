"use client";
import { Workbox } from "workbox-window";

let registered = false;

export function registerServiceWorker(): void {
  // dev 不注册，避免缓存干扰开发（旧站 disable: NODE_ENV === development 的等价行为）
  if (process.env.NODE_ENV !== "production") return;
  if (registered || typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  registered = true;

  const sw = new Workbox("/service-worker.js", { scope: "/" });
  sw.register().catch((e: unknown) => {
    console.error("[pwa] service worker registration failed", e);
  });
  sw.addEventListener("controlling", () => {
    console.info("[pwa] service worker controlling");
  });
}
