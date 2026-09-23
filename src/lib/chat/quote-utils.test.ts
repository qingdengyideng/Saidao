import { describe, expect, it } from "vitest";

import { extractVoiceDuration, isVoiceMessage, truncateContent } from "./quote-utils";

describe("truncateContent", () => {
  it("空串 → 空串", () => {
    expect(truncateContent("")).toBe("");
  });

  it("短串（≤50）→ 原样返回", () => {
    expect(truncateContent("hello")).toBe("hello");
    expect(truncateContent("a".repeat(30))).toBe("a".repeat(30));
  });

  it("长串（>50）→ 前50字符 + '…'", () => {
    const content = "a".repeat(60);
    expect(truncateContent(content)).toBe(`${"a".repeat(50)}…`);
  });

  it("自定义 maxLen → 前N字符 + '…'", () => {
    expect(truncateContent("abcdefghij", 5)).toBe("abcde…");
  });

  it("恰好50字符 → 原样返回（不截断）", () => {
    const content = "a".repeat(50);
    expect(truncateContent(content)).toBe(content);
  });
});

describe("isVoiceMessage", () => {
  it(".webm 结尾 → true", () => {
    expect(isVoiceMessage("https://x.com/a.webm")).toBe(true);
  });

  it(".mp4 结尾 → true", () => {
    expect(isVoiceMessage("a.mp4")).toBe(true);
  });

  it(".ogg 结尾 → true", () => {
    expect(isVoiceMessage("a.ogg")).toBe(true);
  });

  it("大写 .WEBM → true（大小写不敏感）", () => {
    expect(isVoiceMessage("a.WEBM")).toBe(true);
  });

  it("带 query → true", () => {
    expect(isVoiceMessage("a.webm?d=10")).toBe(true);
  });

  it("带 hash → true", () => {
    expect(isVoiceMessage("a.webm#frag")).toBe(true);
  });

  it("非语音扩展 .png → false", () => {
    expect(isVoiceMessage("a.png")).toBe(false);
  });

  it("空串 → false", () => {
    expect(isVoiceMessage("")).toBe(false);
  });
});

describe("extractVoiceDuration", () => {
  it("无 ? → null", () => {
    expect(extractVoiceDuration("a.webm")).toBeNull();
  });

  it("?duration=10 → 10", () => {
    expect(extractVoiceDuration("a.webm?duration=10")).toBe(10);
  });

  it("?duration=0 → 0", () => {
    expect(extractVoiceDuration("a.webm?duration=0")).toBe(0);
  });

  it("?duration=abc（非数字）→ null", () => {
    expect(extractVoiceDuration("a.webm?duration=abc")).toBeNull();
  });

  it("?duration=-5（负数）→ null", () => {
    expect(extractVoiceDuration("a.webm?duration=-5")).toBeNull();
  });

  it("无 duration 参数 → null", () => {
    expect(extractVoiceDuration("a.webm?x=1")).toBeNull();
  });

  it("空串 → null", () => {
    expect(extractVoiceDuration("")).toBeNull();
  });
});
