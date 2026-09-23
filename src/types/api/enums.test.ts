import { describe, expect, it } from "vitest";
import {
  normalizeFaction,
  normalizeWebhookType,
  FACTION_LABELS,
  FACTION_CHIP_COLORS,
  FACTION_BADGE_STYLES,
  WEBHOOK_TYPE_LABELS,
  WEBHOOK_VALID_PREFIXES,
  WEBHOOK_PLACEHOLDERS,
} from "./enums";

describe("normalizeFaction", () => {
  it('正常值 "ya" → "ya"', () => {
    expect(normalizeFaction("ya")).toBe("ya");
  });
  it('正常值 "juan" → "juan"', () => {
    expect(normalizeFaction("juan")).toBe("juan");
  });
  it("空串 → null", () => {
    expect(normalizeFaction("")).toBeNull();
  });
  it("null → null", () => {
    expect(normalizeFaction(null)).toBeNull();
  });
  it("undefined → null", () => {
    expect(normalizeFaction(undefined)).toBeNull();
  });
  it('脏数据 "foo" → null', () => {
    expect(normalizeFaction("foo")).toBeNull();
  });
});

describe("normalizeWebhookType", () => {
  it("正常值 → 对应枚举", () => {
    expect(normalizeWebhookType("dingtalk")).toBe("dingtalk");
    expect(normalizeWebhookType("wecom")).toBe("wecom");
    expect(normalizeWebhookType("feishu")).toBe("feishu");
  });
  it("空串 → null", () => {
    expect(normalizeWebhookType("")).toBeNull();
  });
  it("null → null", () => {
    expect(normalizeWebhookType(null)).toBeNull();
  });
  it("undefined → null", () => {
    expect(normalizeWebhookType(undefined)).toBeNull();
  });
  it('脏数据 "foo" → null', () => {
    expect(normalizeWebhookType("foo")).toBeNull();
  });
});

describe("FACTION_LABELS", () => {
  it("ya → 牙, juan → 卷", () => {
    expect(FACTION_LABELS.ya).toBe("牙");
    expect(FACTION_LABELS.juan).toBe("卷");
  });
});

describe("FACTION_CHIP_COLORS", () => {
  it("ya → danger, juan → accent", () => {
    expect(FACTION_CHIP_COLORS.ya).toBe("danger");
    expect(FACTION_CHIP_COLORS.juan).toBe("accent");
  });
});

describe("FACTION_BADGE_STYLES", () => {
  it("label 正确", () => {
    expect(FACTION_BADGE_STYLES.ya.label).toBe("牙");
    expect(FACTION_BADGE_STYLES.juan.label).toBe("卷");
  });
  it("className 非空", () => {
    expect(FACTION_BADGE_STYLES.ya.className).toBeTruthy();
    expect(FACTION_BADGE_STYLES.juan.className).toBeTruthy();
  });
});

describe("WEBHOOK_TYPE_LABELS", () => {
  it("label 正确", () => {
    expect(WEBHOOK_TYPE_LABELS.dingtalk).toBe("钉钉");
    expect(WEBHOOK_TYPE_LABELS.wecom).toBe("企微");
    expect(WEBHOOK_TYPE_LABELS.feishu).toBe("飞书");
  });
});

describe("WEBHOOK_VALID_PREFIXES", () => {
  it("prefix 正确", () => {
    expect(WEBHOOK_VALID_PREFIXES.dingtalk).toContain("oapi.dingtalk.com");
    expect(WEBHOOK_VALID_PREFIXES.wecom).toContain("qyapi.weixin.qq.com");
    expect(WEBHOOK_VALID_PREFIXES.feishu).toContain("open.feishu.cn");
  });
});

describe("WEBHOOK_PLACEHOLDERS", () => {
  it("placeholder 非空且为 URL 格式", () => {
    expect(WEBHOOK_PLACEHOLDERS.dingtalk).toContain("https://");
    expect(WEBHOOK_PLACEHOLDERS.wecom).toContain("https://");
    expect(WEBHOOK_PLACEHOLDERS.feishu).toContain("https://");
  });
});
