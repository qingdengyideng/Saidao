import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 测试用常量
const STORAGE_KEY = "fingerprint";
const MOCK_VISITOR_ID = "mock-visitor-id-12345";

// mock FingerprintJS：load 返回 agent，agent.get 返回 GetResult
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn(),
  },
}));

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import type { Agent } from "@fingerprintjs/fingerprintjs";

const mockedLoad = vi.mocked(FingerprintJS.load);

/**
 * 构造"可手动控制 get() 完成时机"的 agent mock，用于并发场景：
 * load 立即 resolve agent，get() 返回一个悬挂 Promise，测试手动调用 resolver 后才完成。
 */
let pendingGetResolver: (() => void) | null = null;

function makeManualAgentMock(): void {
  mockedLoad.mockImplementation(() =>
    Promise.resolve({
      get: () =>
        new Promise((res: (v: unknown) => void) => {
          pendingGetResolver = () =>
            res({
              visitorId: MOCK_VISITOR_ID,
              confidence: { score: 1 },
              components: {},
              version: "test",
            });
        }),
    } as unknown as Agent),
  );
}

/** 立即 resolve visitorId 的 agent mock（默认场景） */
function makeImmediateAgentMock(): void {
  mockedLoad.mockImplementation(() =>
    Promise.resolve({
      get: () =>
        Promise.resolve({
          visitorId: MOCK_VISITOR_ID,
          confidence: { score: 1 },
          components: {},
          version: "test",
        }),
    } as unknown as Agent),
  );
}

/**
 * 重新加载 fingerprint 模块，拿到干净的模块级缓存状态。
 * 因为 cached/loading 是模块级变量，无法从外部重置，
 * 必须通过 vi.resetModules() + 动态 import 拿全新实例。
 */
async function loadFreshFingerprint(): Promise<typeof import("@/lib/fingerprint")> {
  vi.resetModules();
  return import("@/lib/fingerprint");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  pendingGetResolver = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getFingerprint", () => {
  it("首次调用（无缓存）→ 调用 FingerprintJS.load() + fp.get()，存入 localStorage", async () => {
    makeImmediateAgentMock();
    const mod = await loadFreshFingerprint();

    const result = await mod.getFingerprint();

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(result).toBe(MOCK_VISITOR_ID);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_VISITOR_ID);
  });

  it("再次调用（有缓存）→ 直接返回缓存，不再调用 FingerprintJS", async () => {
    makeImmediateAgentMock();
    const mod = await loadFreshFingerprint();

    const first = await mod.getFingerprint();
    const second = await mod.getFingerprint();

    expect(first).toBe(MOCK_VISITOR_ID);
    expect(second).toBe(MOCK_VISITOR_ID);
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("并发调用 → 只调用一次 FingerprintJS（Promise 复用）", async () => {
    makeManualAgentMock();
    const mod = await loadFreshFingerprint();

    // 并发触发 3 个调用，此时 get() 尚未 resolve
    const p1 = mod.getFingerprint();
    const p2 = mod.getFingerprint();
    const p3 = mod.getFingerprint();

    // 等待微任务，确保 load 已被调用
    await Promise.resolve();
    await Promise.resolve();

    // load 应该只被调用一次
    expect(mockedLoad).toHaveBeenCalledTimes(1);

    // 手动 resolve get()
    expect(pendingGetResolver).not.toBeNull();
    pendingGetResolver!();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(MOCK_VISITOR_ID);
    expect(r2).toBe(MOCK_VISITOR_ID);
    expect(r3).toBe(MOCK_VISITOR_ID);
    // 仍然只调用一次
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("localStorage 已有缓存 → getFingerprint 直接读 localStorage，不调用 FingerprintJS", async () => {
    localStorage.setItem(STORAGE_KEY, "pre-stored-fp");
    const mod = await loadFreshFingerprint();

    const result = await mod.getFingerprint();

    expect(result).toBe("pre-stored-fp");
    expect(mockedLoad).not.toHaveBeenCalled();
  });
});

describe("getFingerprintSync", () => {
  it("在 getFingerprint 完成前 → 返回 localStorage 中的值或 null", async () => {
    const mod = await loadFreshFingerprint();

    // 场景 A：localStorage 有值
    localStorage.setItem(STORAGE_KEY, "sync-stored");
    expect(mod.getFingerprintSync()).toBe("sync-stored");

    // 场景 B：localStorage 无值
    localStorage.clear();
    expect(mod.getFingerprintSync()).toBeNull();
  });

  it("在 getFingerprint 完成后 → 返回缓存值", async () => {
    makeImmediateAgentMock();
    const mod = await loadFreshFingerprint();

    const result = await mod.getFingerprint();
    expect(mod.getFingerprintSync()).toBe(result);
    expect(mod.getFingerprintSync()).toBe(MOCK_VISITOR_ID);
  });
});
