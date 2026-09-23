import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import qs from "qs";
import { config } from "@/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: "1" | "biz",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("网络异常，请检查网络后重试");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export class TimeoutError extends NetworkError {
  constructor(timeoutMs: number) {
    super();
    this.name = "TimeoutError";
    this.message = `请求超时（${Math.round(timeoutMs / 1000)}s），请稍后重试`;
  }
}

/** 401 统一回调（由 auth store 注入，弹登录框 + Toast） */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

/** 指纹提供器（由 fingerprint 模块注入，同步取） */
let fingerprintProvider: (() => string | null) | null = null;
export function setFingerprintProvider(cb: () => string | null): void {
  fingerprintProvider = cb;
}

/** 统一实例：拦截器负责 fp / 401 / 错误归一化 */
export const http = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { Accept: "application/json" },
});

/** localStorage 读取封装（仅 http-client 内部使用） */
function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(config.tokenStorageKey);
}

// 请求拦截器：自动头（fp / Authorization 裸 token——后端契约，无 Bearer 前缀）
http.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const fp = fingerprintProvider?.();
  if (fp) req.headers.set("fp", fp);
  if (req.headers.get("x-auth") === "true") {
    const token = readToken();
    if (!token) throw new ApiError("请先登录", "1", 401);
    req.headers.set("Authorization", token);
  }
  // 清理标记头
  req.headers.delete("x-auth");
  return req;
});

// 响应拦截器：401 全局回调 + 错误归一化
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      onUnauthorized?.();
      return Promise.reject(new ApiError("请先登录", "1", 401));
    }
    if (err.code === "ECONNABORTED") {
      return Promise.reject(new TimeoutError(err.config?.timeout ?? 0));
    }
    // 无 response（断网/DNS/CORS）或 HTTP 4xx/5xx 非 JSON
    return Promise.reject(
      err.response
        ? new ApiError(`HTTP ${err.response.status}`, "biz", err.response.status)
        : new NetworkError(err),
    );
  },
);

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSON body 或 FormData（上传） */
  body?: unknown;
  /** query 参数，用 qs 序列化 */
  query?: Record<string, string | number | boolean | undefined>;
  /** 需要 Authorization 头（裸 token，无 Bearer——后端契约） */
  auth?: boolean;
  /** 走 N8N 域（仅 webhook 测试） */
  fromN8N?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  const res = await http.request({
    url: path,
    method: options.method ?? (options.body !== undefined ? "post" : "get"),
    baseURL: options.fromN8N ? config.n8nBaseUrl : config.apiBaseUrl,
    params: options.query,
    paramsSerializer: (v) => qs.stringify(v, { skipNulls: true }),
    data: options.body,
    headers: options.auth ? { "x-auth": "true" } : undefined,
    timeout: options.timeoutMs,
    signal: options.signal,
  });

  const json: unknown = res.data;
  const envelope = json as { code: string; message: string; data: unknown };
  if (envelope.code !== "0") {
    const safeMsg =
      envelope.message.length > 80
        ? `${envelope.message.slice(0, 80)}…（稍后重试）`
        : envelope.message;
    throw new ApiError(safeMsg, "biz", res.status);
  }
  return schema.parse(envelope.data);
}
