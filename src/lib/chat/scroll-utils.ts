/**
 * 滚动位置度量（普通元素与 virtua 虚拟列表的字段映射到同一组语义）。
 */
export interface ScrollMetrics {
  /** 内容总高：DOM scrollHeight / virtua scrollSize */
  contentSize: number;
  /** 当前偏移：DOM scrollTop / virtua scrollOffset */
  offset: number;
  /** 可视区高：DOM clientHeight / virtua viewportSize */
  viewportSize: number;
}

/**
 * 是否视为「在底部」（距底部 ≤ threshold 即算贴底）。
 *
 * 必须减去 viewportSize：贴底时 contentSize - offset 恰好等于一屏高度，
 * 漏减会把「已贴底」误判为「离底一屏」，导致自动跟随永久失效。
 */
export function isNearBottom(metrics: ScrollMetrics, threshold: number): boolean {
  return metrics.contentSize - metrics.offset - metrics.viewportSize <= threshold;
}
