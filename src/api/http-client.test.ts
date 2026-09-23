import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from "axios";

// 模块级状态（onUnauthorized / fingerprintProvider）跨测试共享，
// 通过 vi.resetModules + 动态 import 拿全新模块实例隔离，无需手动重置
let requestInterceptor: ((req: unknown) => unknown) | null = null;
let responseRejected: ((err: unknown) => Promise<never>) | null = null;

/** 重新加载 http-client，拿到干净的模块级状态 */
async function loadFreshModule(): Promise<typeof import("@/api/http-client")> {
  vi.resetModules();
  const mod = await import("@/api/http-client");
  requestInterceptor = (mod.http.interceptors.request.handlers?.[0]?.fulfilled ?? null) as
    ((req: unknown) => unknown) | null;
  responseRejected = (mod.http.interceptors.response.handlers?.[0]?.rejected ?? null) as
    ((err: unknown) => Promise<never>) | null;
  return mod;
}

/** 构造请求拦截器入参：InternalAxiosRequestConfig（headers 为 AxiosHeaders） */
function makeRequestConfig(headers: Record<string, string> = {}): object {
  return { headers: new AxiosHeaders(headers) };
}

/** 构造 axios 错误对象（无 response：断网/DNS/CORS） */
function makeNetworkError(cause?: unknown): object {
  const err = new Error("Network Error");
  err.cause = cause;
  return err;
}

/** 构造带 response 的 axios 错误对象 */
function makeResponseError(status: number, opts?: { timeout?: number; code?: string }): object {
  const err = new Error("Request failed");
  Object.assign(err, {
    response: { status } as AxiosResponse,
    config: opts?.timeout !== undefined ? { timeout: opts.timeout } : undefined,
    code: opts?.code,
  });
  return err;
}

beforeEach(() => {
  // 拦截器引用在 loadFreshModule 中从真实实例捕获，
  // 这里只 mock 实例的 request 方法（解包/错误处理逻辑测试）
  (globalThis as { window?: unknown }).window = undefined;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { window?: unknown }).window = undefined;
});

describe("request() 解包", () => {
  it("成功：code='0' → 返回 schema.parse(data)，schema.parse 被调用", async () => {
    const mod = await loadFreshModule();
    const parse = vi.fn((v: unknown) => v);
    const mockResponse = {
      data: { code: "0", message: "ok", data: { id: 1 } },
      status: 200,
    };
    const reqSpy = vi.spyOn(mod.http, "request").mockResolvedValue(mockResponse as AxiosResponse);

    const result = await mod.request("/user/me", {}, { parse });

    expect(parse).toHaveBeenCalledWith({ id: 1 });
    expect(result).toEqual({ id: 1 });
    expect(reqSpy).toHaveBeenCalledWith(expect.objectContaining({ url: "/user/me" }));
  });

  it("业务错误：code='1' → 抛出 ApiError code='biz'", async () => {
    const mod = await loadFreshModule();
    const mockResponse = {
      data: { code: "1", message: "未登录", data: null },
      status: 200,
    };
    vi.spyOn(mod.http, "request").mockResolvedValue(mockResponse as AxiosResponse);

    await expect(mod.request("/user/me", {}, { parse: (v: unknown) => v })).rejects.toMatchObject({
      name: "ApiError",
      message: "未登录",
      code: "biz",
      status: 200,
    });
  });

  it("长消息截断：message 长度 > 80 → 截断到 80 字符 + '…（稍后重试）'", async () => {
    const mod = await loadFreshModule();
    const longMessage = "A".repeat(100);
    const mockResponse = {
      data: { code: "1", message: longMessage, data: null },
      status: 500,
    };
    vi.spyOn(mod.http, "request").mockResolvedValue(mockResponse as AxiosResponse);

    const err = await mod.request("/saidao/list", {}, { parse: (v: unknown) => v }).then(
      () => {
        throw new Error("不应到达");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(mod.ApiError);
    expect(err).toMatchObject({ name: "ApiError", code: "biz" });
    expect((err as Error).message).toBe("A".repeat(80) + "…（稍后重试）");
    // "…（稍后重试）" 共 7 字符（… （ 稍 后 重 试 ），80 + 7 = 87
    expect((err as Error).message.length).toBe(87);
  });
});

describe("响应拦截器（错误归一化）", () => {
  it("401 响应 → onUnauthorized 回调被调用 + 抛出 ApiError code='1'", async () => {
    const mod = await loadFreshModule();
    const cb = vi.fn();
    mod.setOnUnauthorized(cb);

    const err = makeResponseError(401);
    await expect(responseRejected!(err)).rejects.toMatchObject({
      name: "ApiError",
      message: "请先登录",
      code: "1",
      status: 401,
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ECONNABORTED → 抛出 TimeoutError（含超时秒数）", async () => {
    const mod = await loadFreshModule();
    const err = makeResponseError(408, { timeout: 3000, code: "ECONNABORTED" });
    const rejected = await responseRejected!(err).then(
      () => {
        throw new Error("不应到达");
      },
      (e: unknown) => e,
    );

    expect(rejected).toBeInstanceOf(mod.TimeoutError);
    expect((rejected as Error).message).toBe("请求超时（3s），请稍后重试");
    expect(rejected).toBeInstanceOf(mod.NetworkError);
  });

  it("无 response（断网）→ 抛出 NetworkError", async () => {
    const mod = await loadFreshModule();
    const cause = new Error("ECONNREFUSED");
    const err = makeNetworkError(cause);
    const rejected = await responseRejected!(err).then(
      () => {
        throw new Error("不应到达");
      },
      (e: unknown) => e,
    );

    expect(rejected).toBeInstanceOf(mod.NetworkError);
    expect((rejected as Error).message).toBe("网络异常，请检查网络后重试");
    expect((rejected as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
  });
});

describe("请求拦截器（自动头）", () => {
  it("fp 注入：setFingerprintProvider 返回 'test-fp' → 请求头含 fp", async () => {
    const mod = await loadFreshModule();
    mod.setFingerprintProvider(() => "test-fp");

    const cfg = makeRequestConfig();
    const result = requestInterceptor!(cfg) as { headers: AxiosHeaders };
    expect(result.headers.get("fp")).toBe("test-fp");
  });

  it("fp 为 null → 不设置 fp 头", async () => {
    const mod = await loadFreshModule();
    mod.setFingerprintProvider(() => null);

    const cfg = makeRequestConfig();
    const result = requestInterceptor!(cfg) as { headers: AxiosHeaders };
    expect(result.headers.get("fp")).toBeUndefined();
  });

  it("auth 头：localStorage 有 token + x-auth=true → Authorization 为裸 token（无 Bearer）", async () => {
    await loadFreshModule();
    (globalThis as { window?: unknown }).window = {};
    localStorage.setItem("ACCESS_TOKEN", "raw-token-123");

    const cfg = makeRequestConfig({ "x-auth": "true" });
    const result = requestInterceptor!(cfg) as { headers: AxiosHeaders };
    expect(result.headers.get("Authorization")).toBe("raw-token-123");
    // 标记头被清理
    expect(result.headers.get("x-auth")).toBeUndefined();
  });

  it("auth 无 token → 抛出 ApiError '请先登录'", async () => {
    await loadFreshModule();
    (globalThis as { window?: unknown }).window = {};
    // localStorage 已 clear，无 token

    const cfg = makeRequestConfig({ "x-auth": "true" });
    expect(() => requestInterceptor!(cfg)).toThrow("请先登录");
  });

  it("非 auth 请求（无 x-auth）→ 不读取 localStorage，不设置 Authorization", async () => {
    await loadFreshModule();
    (globalThis as { window?: unknown }).window = {};
    localStorage.setItem("ACCESS_TOKEN", "should-not-be-read");

    const cfg = makeRequestConfig();
    const result = requestInterceptor!(cfg) as { headers: AxiosHeaders };
    expect(result.headers.get("Authorization")).toBeUndefined();
  });
});

describe("request() 配置透传", () => {
  it("fromN8N=true → baseURL 使用 n8nBaseUrl", async () => {
    const mod = await loadFreshModule();
    const mockResponse = {
      data: { code: "0", message: "ok", data: null },
      status: 200,
    };
    const reqSpy = vi.spyOn(mod.http, "request").mockResolvedValue(mockResponse as AxiosResponse);

    await mod.request("/webhook/test", { fromN8N: true }, { parse: (v: unknown) => v });

    const passedConfig = reqSpy.mock.calls[0]?.[0] as AxiosRequestConfig;
    expect(passedConfig.baseURL).toBe("https://n8n.saidao.cc");
  });

  it("默认 → baseURL 使用 apiBaseUrl", async () => {
    const mod = await loadFreshModule();
    const mockResponse = {
      data: { code: "0", message: "ok", data: null },
      status: 200,
    };
    const reqSpy = vi.spyOn(mod.http, "request").mockResolvedValue(mockResponse as AxiosResponse);

    await mod.request("/saidao/list", {}, { parse: (v: unknown) => v });

    const passedConfig = reqSpy.mock.calls[0]?.[0] as AxiosRequestConfig;
    expect(passedConfig.baseURL).toBe("https://api.saidao.cc");
  });
});
