import { config } from "@/config";

export type ParsedPart =
  { kind: "text"; text: string } | { kind: "emoji"; src: string } | { kind: "image"; src: string };

export type ParsedContent =
  | { kind: "text"; text: string }
  | { kind: "image"; src: string; emoji: boolean }
  | { kind: "mixed"; parts: ParsedPart[] };

const ALLOWED_IMG_HOSTS = new Set(config.imageHosts);
// 匹配任意 img 标签（属性顺序不敏感）
const ANY_IMG_RE = /<img\s[^>]*>/i;
// 从 img 标签中提取 src 属性（白名单校验前只做提取）
const IMG_SRC_RE = /src\s*=\s*"([^"]+)"/i;
// 从 img 标签中提取 class 属性（用于区分 emoji 小图与普通图片）
const IMG_CLASS_RE = /class\s*=\s*"([^"]*)"/i;

/**
 * 解析聊天消息 content，全程无 dangerouslySetInnerHTML。
 * 组件侧用解析结果渲染 React 节点（文本自动转义 / <img src={src} />）。
 *
 * 白名单：标签只允许 <img>；src 域名限 config.imageHosts；
 * 只读取 src/class 两个属性，其余属性一律忽略（React 渲染时也不会带上）。
 * 带 chat-emoji（含 vip）class → emoji 小图；其余白名单 <img> → 普通图片。
 */
export function parseChatContent(raw: string): ParsedContent {
  if (!raw) return { kind: "text", text: "" };

  // 1) 整条是单个 img → 合法则按 class 区分 emoji/图片，否则降级为转义文本
  if (/^\s*<img\s[^>]*>\s*$/i.test(raw)) {
    const parsed = parseAllowedImg(raw);
    if (parsed) {
      return parsed.emoji
        ? { kind: "image", src: parsed.src, emoji: true }
        : { kind: "image", src: parsed.src, emoji: false };
    }
    return { kind: "text", text: raw };
  }

  // 2) 含 img 标签 → 混合切分
  if (ANY_IMG_RE.test(raw)) {
    return parseMixed(raw);
  }

  // 3) 纯文本
  return { kind: "text", text: raw };
}

/** 混合内容：以 img 标签为分隔符切分文本与图片 */
function parseMixed(raw: string): ParsedContent {
  const imgRe = /<img\s[^>]*>/gi;
  const parts: ParsedPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imgRe.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index);
      if (text) parts.push({ kind: "text", text });
    }
    const parsed = parseAllowedImg(match[0]);
    if (parsed) {
      parts.push(
        parsed.emoji ? { kind: "emoji", src: parsed.src } : { kind: "image", src: parsed.src },
      );
    } else {
      // 非法 img（非白名单域名/协议）→ 降级为文本
      parts.push({ kind: "text", text: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex);
    if (text) parts.push({ kind: "text", text });
  }

  // 全是文本 → 纯文本
  if (parts.every((p) => p.kind === "text")) {
    return { kind: "text", text: parts.map((p) => (p.kind === "text" ? p.text : "")).join("") };
  }
  return { kind: "mixed", parts };
}

/** 解析白名单内的 <img>，返回 src + 是否 emoji class；非法返回 null */
function parseAllowedImg(html: string): { src: string; emoji: boolean } | null {
  const srcMatch = html.match(IMG_SRC_RE);
  if (!srcMatch?.[1]) return null;
  const src = srcMatch[1];
  try {
    const u = new URL(src);
    if (!ALLOWED_IMG_HOSTS.has(u.hostname)) return null;
  } catch {
    return null;
  }
  // chat-emoji class（含 vip 变体）→ 表情小图；其余 → 普通图片
  const classMatch = html.match(IMG_CLASS_RE);
  const classVal = classMatch?.[1];
  const emoji = classVal ? /chat-emoji|vip/.test(classVal) : false;
  return { src, emoji };
}
