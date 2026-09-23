import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { ChatMessage } from "@/types/api/message";
import { messageHistoryApi } from "@/api/message";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";

// mock 消息 API：loadOlderMessages 内部调用，单测中隔离网络
vi.mock("@/api/message");

/** 模块级 MAX_MESSAGES / MAX_BUFFER 常量（与源文件保持一致，仅用于构造超限用例） */
const MAX_MESSAGES = 1000;
const MAX_BUFFER = 500;

/** 构造符合 ChatMessage 结构的测试对象 */
let msgSeq = 0;
function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  msgSeq += 1;
  return {
    uid: 1,
    type: "user",
    uname: "test",
    content: `hello-${msgSeq}`,
    deleted: false,
    messageId: `msg-${msgSeq}`,
    timestamp: new Date(Date.now() + msgSeq).toISOString(),
    ...overrides,
  };
}

/** 重置 store 为初始状态（含正则缓存共享，但屏蔽配置为空时不影响） */
function resetStore() {
  useChatStore.setState({
    messages: [],
    messageBuffer: [],
    onlineCount: 0,
    hotWords: [],
    blockedUserIds: [],
    blockedNicknames: [],
    keywordPatterns: [],
    wsStatus: "closed",
    pendingCaptcha: null,
    pendingMessage: null,
    linkPreviews: new Map(),
    currentPoll: null,
    historyHasMore: true,
    isLoadingHistory: false,
  });
}

beforeEach(() => {
  vi.mocked(messageHistoryApi).mockReset();
  useAuthStore.setState({ status: "authenticated" });
  resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appendMessage", () => {
  it("正常追加 → 消息位于列表末尾", () => {
    const m1 = makeMsg({ messageId: "a", content: "first" });
    const m2 = makeMsg({ messageId: "b", content: "second" });
    useChatStore.getState().appendMessage(m1);
    useChatStore.getState().appendMessage(m2);

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0]!.messageId).toBe("a");
    expect(messages[1]).toBe(m2);
  });

  it("deleted=true 且 messageId 已存在 → 只标记 deleted，不新增条目", () => {
    const m1 = makeMsg({ messageId: "a", content: "first" });
    useChatStore.getState().appendMessage(m1);

    useChatStore.getState().appendMessage({ ...m1, deleted: true });

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("a");
    expect(messages[0]!.deleted).toBe(true);
  });

  it("deleted=true 且 messageId 不存在 → 不追加", () => {
    useChatStore.getState().appendMessage({
      ...makeMsg({ messageId: "not-exist" }),
      deleted: true,
    });

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(0);
  });

  it("命中 blockedUserIds → 不追加", () => {
    useChatStore.setState({ blockedUserIds: [42] });
    useChatStore.getState().appendMessage(makeMsg({ uid: 42 }));

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(0);
  });

  it("命中 blockedNicknames → 不追加", () => {
    useChatStore.setState({ blockedNicknames: ["bad-user"] });
    useChatStore.getState().appendMessage(makeMsg({ uname: "bad-user" }));

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(0);
  });

  it("追加超过 MAX_MESSAGES → 只保留最新 MAX_MESSAGES 条", () => {
    // 预填 MAX_MESSAGES 条，再追加 1 条 → 最旧的一条被裁剪
    const prefill = Array.from({ length: MAX_MESSAGES }, (_, i) =>
      makeMsg({ messageId: `old-${i}` }),
    );
    useChatStore.setState({ messages: prefill });

    const newest = makeMsg({ messageId: "newest" });
    useChatStore.getState().appendMessage(newest);

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(MAX_MESSAGES);
    expect(messages[0]!.messageId).toBe(`old-1`);
    expect(messages[messages.length - 1]!).toBe(newest);
  });
});

describe("markDeleted", () => {
  it("messageId 存在 → 标记 deleted=true，其余不变", () => {
    const m1 = makeMsg({ messageId: "a" });
    const m2 = makeMsg({ messageId: "b" });
    useChatStore.setState({ messages: [m1, m2] });

    useChatStore.getState().markDeleted("a");

    const { messages } = useChatStore.getState();
    expect(messages[0]!.deleted).toBe(true);
    expect(messages[1]!.deleted).toBe(false);
  });

  it("messageId 不存在 → 无变化", () => {
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    useChatStore.getState().markDeleted("missing");

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.deleted).toBe(false);
  });
});

describe("clearMessages", () => {
  it("有消息 + 有缓冲 → messages 与 messageBuffer 均清空", () => {
    useChatStore.setState({
      messages: [makeMsg({ messageId: "a" })],
      messageBuffer: [makeMsg({ messageId: "b" })],
    });

    useChatStore.getState().clearMessages();

    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.messageBuffer).toHaveLength(0);
  });
});

describe("upsertLinkPreview", () => {
  it("新 messageId → 追加到 Map", () => {
    useChatStore.getState().upsertLinkPreview("m1", { url: "https://a.com", title: "A" });
    useChatStore.getState().upsertLinkPreview("m2", { url: "https://b.com", title: "B" });

    const { linkPreviews } = useChatStore.getState();
    expect(linkPreviews.size).toBe(2);
    expect(linkPreviews.get("m1")).toEqual({ url: "https://a.com", title: "A" });
    expect(linkPreviews.get("m2")).toEqual({ url: "https://b.com", title: "B" });
  });

  it("已存在 messageId → 原位更新 preview", () => {
    useChatStore.getState().upsertLinkPreview("m1", { url: "https://a.com", title: "old" });
    useChatStore.getState().upsertLinkPreview("m1", { url: "https://a.com", title: "new" });

    const { linkPreviews } = useChatStore.getState();
    expect(linkPreviews.size).toBe(1);
    expect(linkPreviews.get("m1")).toEqual({ url: "https://a.com", title: "new" });
  });
});

describe("applyFilterConfig", () => {
  it("设置 blockedUserIds 后，已有命中消息被移除，未命中保留", () => {
    const hit = makeMsg({ uid: 9, messageId: "hit" });
    const keep = makeMsg({ uid: 1, messageId: "keep" });
    useChatStore.setState({ messages: [hit, keep] });

    useChatStore.getState().applyFilterConfig({
      blockedUserIds: [9],
      blockedNicknames: [],
      keywordPatterns: [],
    });

    const { messages, blockedUserIds } = useChatStore.getState();
    expect(blockedUserIds).toEqual([9]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("keep");
  });
});

describe("bufferMessage + flushBuffer", () => {
  it("bufferMessage 追加到 messageBuffer，受 MAX_BUFFER 上限裁剪", () => {
    const prefill = Array.from({ length: MAX_BUFFER }, (_, i) =>
      makeMsg({ messageId: `buf-${i}` }),
    );
    useChatStore.setState({ messageBuffer: prefill });

    useChatStore.getState().bufferMessage(makeMsg({ messageId: "extra" }));

    const { messageBuffer } = useChatStore.getState();
    expect(messageBuffer).toHaveLength(MAX_BUFFER);
    expect(messageBuffer[0]!.messageId).toBe("buf-1");
    expect(messageBuffer[messageBuffer.length - 1]!.messageId).toBe("extra");
  });

  it("flushBuffer 将 buffer 合并回 messages（按 timestamp 排序），buffer 清空", () => {
    const mEarly = makeMsg({ messageId: "m1", timestamp: "2026-01-01T00:00:00.000Z" });
    const mLate = makeMsg({ messageId: "m2", timestamp: "2026-01-01T00:00:02.000Z" });
    // buffer 中的消息时间戳介于两者之间
    const mBuf = makeMsg({ messageId: "m3", timestamp: "2026-01-01T00:00:01.000Z" });
    useChatStore.setState({ messages: [mLate], messageBuffer: [mBuf, mEarly] });

    useChatStore.getState().flushBuffer();

    const s = useChatStore.getState();
    expect(s.messageBuffer).toHaveLength(0);
    expect(s.messages.map((m) => m.messageId)).toEqual(["m1", "m3", "m2"]);
  });

  it("flushBuffer 合并时按 messageId 去重，buffer 中已存在的消息不重复", () => {
    const existing = makeMsg({ messageId: "dup", timestamp: "2026-01-01T00:00:00.000Z" });
    const buffered = makeMsg({ messageId: "dup", timestamp: "2026-01-01T00:00:00.000Z" });
    useChatStore.setState({ messages: [existing], messageBuffer: [buffered] });

    useChatStore.getState().flushBuffer();

    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("dup");
  });

  it("空 buffer → flushBuffer 不改变 messages", () => {
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    useChatStore.getState().flushBuffer();

    const { messages, messageBuffer } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(m1);
    expect(messageBuffer).toHaveLength(0);
  });
});

describe("loadOlderMessages", () => {
  it("未登录（anonymous）→ 不调用 API，messages 不变", async () => {
    useAuthStore.setState({ status: "anonymous" });
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    await useChatStore.getState().loadOlderMessages();

    expect(messageHistoryApi).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it("已登录 + 有消息 + hasMore → 用首条 messageId 作游标，历史前置插入，historyHasMore 保持 true", async () => {
    const older1 = makeMsg({ messageId: "older-1" });
    const older2 = makeMsg({ messageId: "older-2" });
    vi.mocked(messageHistoryApi).mockResolvedValue([older1, older2]);

    const m1 = makeMsg({ messageId: "a" });
    const m2 = makeMsg({ messageId: "b" });
    useChatStore.setState({ messages: [m1, m2], historyHasMore: true });

    await useChatStore.getState().loadOlderMessages();

    expect(messageHistoryApi).toHaveBeenCalledWith("a");
    const { messages, historyHasMore } = useChatStore.getState();
    expect(messages.map((m) => m.messageId)).toEqual(["older-1", "older-2", "a", "b"]);
    expect(historyHasMore).toBe(true);
    expect(useChatStore.getState().isLoadingHistory).toBe(false);
  });

  it("API 返回空数组 → historyHasMore 置 false（到底）", async () => {
    vi.mocked(messageHistoryApi).mockResolvedValue([]);
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1], historyHasMore: true });

    await useChatStore.getState().loadOlderMessages();

    expect(useChatStore.getState().historyHasMore).toBe(false);
    expect(useChatStore.getState().isLoadingHistory).toBe(false);
  });

  it("isLoadingHistory=true（防重入）→ 不调用 API", async () => {
    useChatStore.setState({ isLoadingHistory: true });
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    await useChatStore.getState().loadOlderMessages();

    expect(messageHistoryApi).not.toHaveBeenCalled();
  });

  it("historyHasMore=false → 不调用 API", async () => {
    useChatStore.setState({ historyHasMore: false });
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    await useChatStore.getState().loadOlderMessages();

    expect(messageHistoryApi).not.toHaveBeenCalled();
  });

  it("messages 为空 → 不调用 API", async () => {
    useChatStore.setState({ messages: [] });

    await useChatStore.getState().loadOlderMessages();

    expect(messageHistoryApi).not.toHaveBeenCalled();
  });

  it("API 抛错 → isLoadingHistory 重置为 false，messages 不变", async () => {
    vi.mocked(messageHistoryApi).mockRejectedValue(new Error("网络异常，请检查网络后重试"));
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    await useChatStore.getState().loadOlderMessages();

    expect(useChatStore.getState().isLoadingHistory).toBe(false);
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it("加载过程中 isLoadingHistory 应为 true（异步窗口内）", async () => {
    let resolveFn: ((v: ChatMessage[]) => void) | null = null;
    vi.mocked(messageHistoryApi).mockImplementation(
      () =>
        new Promise<ChatMessage[]>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const m1 = makeMsg({ messageId: "a" });
    useChatStore.setState({ messages: [m1] });

    const p = useChatStore.getState().loadOlderMessages();
    // 等待一个微任务让 async 函数执行到 await
    await Promise.resolve();
    expect(useChatStore.getState().isLoadingHistory).toBe(true);

    resolveFn!([makeMsg({ messageId: "older" })]);
    await p;
    expect(useChatStore.getState().isLoadingHistory).toBe(false);
  });
});

describe("clearMessages 重置历史加载状态", () => {
  it("clearMessages 后 isLoadingHistory=false 且 historyHasMore=true", () => {
    useChatStore.setState({
      messages: [makeMsg({ messageId: "a" })],
      isLoadingHistory: true,
      historyHasMore: false,
    });

    useChatStore.getState().clearMessages();

    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.isLoadingHistory).toBe(false);
    expect(s.historyHasMore).toBe(true);
  });
});
