import { describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  config: {
    imageHosts: ["rustfs.saidao.cc", "ali2.a.yximgs.com", "cdnl.iconscout.com"],
  },
}));

import { parseChatContent } from "./content-parser";

const EMOJI_SRC = "https://rustfs.saidao.cc/emoji/1.png";
const IMAGE_SRC = "https://rustfs.saidao.cc/img/pic.png";

describe("parseChatContent", () => {
  describe("正常用例", () => {
    it("纯文本 → text", () => {
      expect(parseChatContent("hello world")).toEqual({
        kind: "text",
        text: "hello world",
      });
    });

    it("空字符串 → 空 text", () => {
      expect(parseChatContent("")).toEqual({ kind: "text", text: "" });
    });

    it("合法单表情（白名单域名 + chat-emoji class）→ image(emoji=true)", () => {
      const raw = `<img class="chat-emoji vip" src="${EMOJI_SRC}" alt="x" />`;
      expect(parseChatContent(raw)).toEqual({ kind: "image", src: EMOJI_SRC, emoji: true });
    });

    it("白名单普通图片（无 chat-emoji class）→ image(emoji=false)", () => {
      const raw = `<img src="${IMAGE_SRC}">`;
      expect(parseChatContent(raw)).toEqual({ kind: "image", src: IMAGE_SRC, emoji: false });
    });

    it("混合（文本+合法表情）→ mixed", () => {
      const raw = `hello <img class="chat-emoji" src="${EMOJI_SRC}"> world`;
      expect(parseChatContent(raw)).toEqual({
        kind: "mixed",
        parts: [
          { kind: "text", text: "hello " },
          { kind: "emoji", src: EMOJI_SRC },
          { kind: "text", text: " world" },
        ],
      });
    });

    it("混合（文本+普通图片）→ mixed 含 image part", () => {
      const raw = `看这个 <img src="${IMAGE_SRC}"> 图`;
      expect(parseChatContent(raw)).toEqual({
        kind: "mixed",
        parts: [
          { kind: "text", text: "看这个 " },
          { kind: "image", src: IMAGE_SRC },
          { kind: "text", text: " 图" },
        ],
      });
    });

    it("多个表情混合 → mixed", () => {
      const raw = `<img class="chat-emoji" src="${EMOJI_SRC}"> and <img class="chat-emoji" src="${EMOJI_SRC}">`;
      const result = parseChatContent(raw);
      expect(result.kind).toBe("mixed");
      if (result.kind !== "mixed") return;
      expect(result.parts).toHaveLength(3);
      expect(result.parts[0]).toEqual({ kind: "emoji", src: EMOJI_SRC });
      expect(result.parts[1]).toEqual({ kind: "text", text: " and " });
      expect(result.parts[2]).toEqual({ kind: "emoji", src: EMOJI_SRC });
    });
  });

  describe("注入攻击用例", () => {
    it("混合（文本+非法域名表情）→ 非法表情降级为文本", () => {
      const raw = `hello <img class="chat-emoji" src="https://evil.com/emoji.png"> world`;
      const result = parseChatContent(raw);
      expect(result.kind).toBe("text");
      if (result.kind !== "text") return;
      expect(result.text).toContain("https://evil.com/emoji.png");
    });

    it("非白名单域名普通图片 → 降级为文本", () => {
      const raw = `<img src="https://evil.com/pic.png">`;
      expect(parseChatContent(raw)).toEqual({ kind: "text", text: raw });
    });

    it("非白名单域名混合 → 非法图片降级为文本", () => {
      const raw = `hello <img src="https://evil.com/pic.png"> world`;
      const result = parseChatContent(raw);
      expect(result.kind).toBe("text");
      if (result.kind !== "text") return;
      expect(result.text).toContain("https://evil.com/pic.png");
    });

    it("onerror 注入（非白名单 src）→ 降级为文本", () => {
      const raw = `<img src="x" onerror="alert(1)">`;
      const result = parseChatContent(raw);
      expect(result).toEqual({ kind: "text", text: raw });
    });

    it("script 注入 → 转义文本", () => {
      const raw = "<script>alert(1)</script>";
      expect(parseChatContent(raw)).toEqual({ kind: "text", text: raw });
    });

    it("域名绕过（evil.com）→ 降级为文本", () => {
      const raw = `<img class="chat-emoji" src="https://evil.com/emoji.png">`;
      const result = parseChatContent(raw);
      expect(result.kind).toBe("text");
      if (result.kind !== "text") return;
      expect(result.text).toBe(raw);
    });

    it("协议绕过（javascript:）→ 降级为文本", () => {
      const raw = `<img class="chat-emoji" src="javascript:alert(1)">`;
      const result = parseChatContent(raw);
      expect(result.kind).toBe("text");
      if (result.kind !== "text") return;
      expect(result.text).toBe(raw);
    });

    it("合法域名但有额外属性（onerror）→ 仍返回图片（src 合法，额外属性被忽略）", () => {
      const raw = `<img class="chat-emoji" src="${EMOJI_SRC}" onerror="alert(1)">`;
      expect(parseChatContent(raw)).toEqual({ kind: "image", src: EMOJI_SRC, emoji: true });
    });

    it("相对路径 src → 降级为文本", () => {
      const raw = `<img src="/local/pic.png">`;
      expect(parseChatContent(raw)).toEqual({ kind: "text", text: raw });
    });
  });
});
