import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { config } from "@/config";

// 模块级缓存：避免重复计算指纹，Promise 复用防并发
let cached: string | null = null;
let loading: Promise<string> | null = null;

/**
 * 异步获取设备指纹（Promise 复用防并发）。
 * 首次调用：从 localStorage 读取缓存，无缓存则 FingerprintJS 计算并存 localStorage。
 * 后续调用：直接返回 Promise 缓存。
 */
export async function getFingerprint(): Promise<string> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      const stored = localStorage.getItem(config.fingerprintStorageKey);
      if (stored) return (cached = stored);
      const fp = await FingerprintJS.load();
      const { visitorId } = await fp.get();
      cached = visitorId;
      localStorage.setItem(config.fingerprintStorageKey, visitorId);
      return visitorId;
    })();
  }
  return loading;
}

/** http-client 同步取（取不到返回 null，请求不阻塞） */
export function getFingerprintSync(): string | null {
  return cached ?? localStorage.getItem(config.fingerprintStorageKey);
}
