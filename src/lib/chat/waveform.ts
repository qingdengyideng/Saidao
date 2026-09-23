/**
 * 波形生成工具：从 URL 字符串生成确定性的伪随机波形，用于语音消息展示。
 *
 * 真实语音波形需要解码音频文件（成本较高），聊天列表里语音气泡只需要
 * "看起来像波形"的视觉占位，因此用 URL 做 seed 生成确定性伪随机值——
 * 同一 URL 永远生成同一波形（列表重渲染不闪烁）。
 */

/**
 * 简单字符串 hash（djb2 变体），返回 uint32。
 * 仅作伪随机 seed 用，不追求分布质量。
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // 经典 djb2：hash = hash * 33 + charCode，强制无符号
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * 基于 seed 的伪随机数生成器（mulberry32）。
 * 返回 0~1 的伪随机浮点数，确定性（同 seed 同序列）。
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从 URL 字符串生成 `points` 个 0.2~1.0 之间的伪随机值。
 * 确定性：同一 URL 永远生成同一波形。
 */
export function generateWaveform(url: string, points = 32): number[] {
  const seed = hashString(url);
  const rng = mulberry32(seed);
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    // 0.2 起步避免全 0 显得"死板"，1.0 封顶
    const v = 0.2 + rng() * 0.8;
    result.push(Math.round(v * 1000) / 1000);
  }
  return result;
}

/**
 * 把波形数值转成 CSS 样式对象数组（用于渲染竖条）。
 * height 用百分比（10%~100%），保证最矮的条也可见。
 */
export function formatWaveformToStyle(values: number[]): Array<{ height: string }> {
  return values.map((v) => {
    const clamped = Math.min(1, Math.max(0.1, v));
    return { height: `${Math.round(clamped * 100)}%` };
  });
}
