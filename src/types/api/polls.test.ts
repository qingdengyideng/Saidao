import { describe, it, expect } from "vitest";
import {
  PollSchema,
  ChatPollsSchema,
  ChatPollStatusSchema,
  CreateChatPollRequestSchema,
} from "./polls";

const NOW = "2026-01-01T00:00:00.000+08:00";
const LATER = "2026-01-01T01:00:00.000+08:00";

function makePoll(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    question: "你选哪个？",
    options: ["A", "B"],
    createdAt: NOW,
    endsAt: LATER,
    active: true,
    totalVoters: 3,
    counts: [2, 1],
    myOptions: [0],
    multiple: false,
    creatorId: 10,
    creatorName: "creator",
    resultsVisible: true,
    ...overrides,
  };
}

describe("PollSchema", () => {
  it("合法完整 Poll → parse 成功", () => {
    const input = makePoll();
    expect(PollSchema.parse(input)).toEqual(input);
  });

  it("缺必填字段 → safeParse 失败", () => {
    const input = makePoll();
    const noQuestion = { ...input };
    delete noQuestion.question;
    expect(PollSchema.safeParse(noQuestion).success).toBe(false);

    const noOptions = { ...input };
    delete noOptions.options;
    expect(PollSchema.safeParse(noOptions).success).toBe(false);
  });

  it("createdAt/endsAt 带时区偏移 → 通过", () => {
    const parsed = PollSchema.parse(makePoll({ createdAt: NOW, endsAt: LATER }));
    expect(parsed.createdAt).toBe(NOW);
    expect(parsed.endsAt).toBe(LATER);
  });

  it("createdAt 无时区偏移（纯 UTC 无 offset 后缀）→ 失败", () => {
    const result = PollSchema.safeParse(makePoll({ createdAt: "2026-01-01T00:00:00.000" }));
    expect(result.success).toBe(false);
  });

  it("options 少于 2 个 → 失败", () => {
    expect(PollSchema.safeParse(makePoll({ options: ["A"] })).success).toBe(false);
    expect(PollSchema.safeParse(makePoll({ options: [] })).success).toBe(false);
  });
});

describe("ChatPollsSchema", () => {
  it("合法结构 → parse 成功", () => {
    const input = {
      canCreate: true,
      serverTime: NOW,
      current: makePoll(),
      recent: [makePoll({ id: 2 })],
    };
    expect(ChatPollsSchema.parse(input)).toEqual(input);
  });

  it("current 为 null → parse 成功", () => {
    const input = {
      canCreate: false,
      serverTime: NOW,
      current: null,
      recent: [] as object[],
    };
    expect(ChatPollsSchema.parse(input)).toEqual(input);
  });

  it("缺字段 → safeParse 失败", () => {
    const noRecent = {
      canCreate: true,
      serverTime: NOW,
      current: makePoll(),
    };
    expect(ChatPollsSchema.safeParse(noRecent).success).toBe(false);

    const noCurrent = {
      canCreate: true,
      serverTime: NOW,
      recent: [makePoll()],
    };
    expect(ChatPollsSchema.safeParse(noCurrent).success).toBe(false);
  });
});

describe("ChatPollStatusSchema", () => {
  it("合法结构 → parse 成功", () => {
    const input = {
      serverTime: NOW,
      endsAt: LATER,
      activeEndsAt: [LATER],
    };
    expect(ChatPollStatusSchema.parse(input)).toEqual(input);
  });

  it("无进行中投票（endsAt=null / activeEndsAt=[]，probe 79_polls_status_auth）→ parse 成功", () => {
    const input = {
      serverTime: NOW,
      endsAt: null,
      activeEndsAt: [],
    };
    expect(ChatPollStatusSchema.parse(input)).toEqual(input);
  });

  it("缺字段 → safeParse 失败", () => {
    const noActiveEndsAt = { serverTime: NOW, endsAt: LATER };
    expect(ChatPollStatusSchema.safeParse(noActiveEndsAt).success).toBe(false);
  });
});

describe("CreateChatPollRequestSchema", () => {
  it("durationSeconds 合法值 → 通过", () => {
    for (const d of [300, 600, 1800]) {
      const result = CreateChatPollRequestSchema.safeParse({
        question: "q",
        options: ["A", "B"],
        durationSeconds: d,
      });
      expect(result.success).toBe(true);
    }
  });

  it("durationSeconds 非法值（400）→ 失败", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "q",
      options: ["A", "B"],
      durationSeconds: 400,
    });
    expect(result.success).toBe(false);
  });

  it("durationSeconds 省略 → 通过（optional）", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "q",
      options: ["A", "B"],
    });
    expect(result.success).toBe(true);
  });

  it("options 2 个 → 通过", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "q",
      options: ["A", "B"],
    });
    expect(result.success).toBe(true);
  });

  it("options 1 个 → 失败（min(2)）", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "q",
      options: ["A"],
    });
    expect(result.success).toBe(false);
  });

  it("options 0 个 → 失败（min(2)）", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "q",
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it("question 空字符串 → 失败（min(1)）", () => {
    const result = CreateChatPollRequestSchema.safeParse({
      question: "",
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
  });
});
