/**
 * 引用/回复工具：内容截断、语音消息识别、语音时长提取。
 */

/** 支持的语音扩展名（小写，带点） */
const VOICE_EXTENSIONS = [".webm", ".mp4", ".ogg"] as const;

/**
 * 截断内容，超过 maxLen 时以 "…" 结尾。
 */
export function truncateContent(content: string, maxLen = 50): string {
  if (!content) return "";
  if (content.length <= maxLen) return content;
  return `${content.slice(0, maxLen)}…`;
}

/**
 * 判断 content 是否为语音消息 URL（以 .webm/.mp4/.ogg 结尾，忽略 query/hash）。
 */
export function isVoiceMessage(content: string): boolean {
  if (!content) return false;
  // 去掉 query 和 hash，只看 path 部分
  const path = content.split(/[?#]/)[0] ?? "";
  const lower = path.toLowerCase();
  return VOICE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * 从语音 URL 的 query 参数中提取时长（秒）。
 * 后端契约：query 上带 `duration` 参数（数字，秒）。
 * 提取失败返回 null，由调用方降级（如默认 0 或隐藏时长）。
 */
export function extractVoiceDuration(content: string): number | null {
  if (!content) return null;
  const queryIndex = content.indexOf("?");
  if (queryIndex < 0) return null;
  try {
    const params = new URLSearchParams(content.slice(queryIndex + 1));
    const raw = params.get("duration");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
