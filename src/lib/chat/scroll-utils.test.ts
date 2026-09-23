import { describe, expect, it } from "vitest";

import { isNearBottom } from "./scroll-utils";

/** 与组件内一致的贴底阈值（对齐旧站 CHAT_BOTTOM_SCROLL_EPSILON） */
const THRESHOLD = 200;

describe("isNearBottom 贴底判定", () => {
  it("正好滚到底部 → true", () => {
    expect(isNearBottom({ contentSize: 5000, offset: 4300, viewportSize: 700 }, THRESHOLD)).toBe(
      true,
    );
  });

  it("距底部 150px（≤ 200）→ true", () => {
    expect(isNearBottom({ contentSize: 5000, offset: 4150, viewportSize: 700 }, THRESHOLD)).toBe(
      true,
    );
  });

  it("距底部 350px（> 200）→ false", () => {
    expect(isNearBottom({ contentSize: 5000, offset: 3950, viewportSize: 700 }, THRESHOLD)).toBe(
      false,
    );
  });

  it("内容不足一屏 → true", () => {
    expect(isNearBottom({ contentSize: 300, offset: 0, viewportSize: 700 }, THRESHOLD)).toBe(true);
  });

  it("回归：漏减 viewportSize 的旧实现会把贴底误判为离底", () => {
    const metrics = { contentSize: 5000, offset: 4300, viewportSize: 700 };
    // 旧实现（contentSize - offset = 700）会 > 200 而误判为「不在底部」
    const legacyAtBottom = metrics.contentSize - metrics.offset <= THRESHOLD;
    expect(legacyAtBottom).toBe(false);
    expect(isNearBottom(metrics, THRESHOLD)).toBe(true);
  });
});
