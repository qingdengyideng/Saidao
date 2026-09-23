// =============================================================================
// 枚举统一管理中心
//
// 统一管理 Faction（阵营）与 WebhookType（开播通知）的：
// - 归一化后的业务类型（FactionValue / WebhookTypeValue）
// - 中文 label 映射（FACTION_LABELS / WEBHOOK_TYPE_LABELS）
// - UI 颜色 token（FACTION_CHIP_COLORS / FACTION_BADGE_STYLES）
// - 归一化函数（normalizeFaction / normalizeWebhookType）
//
// 设计原则：
// - zod schema 留在 common.ts（API 校验层），本文件只管类型 + 常量 + 工具函数
// - 所有消费方组件只 import 本文件，不重复硬编码
// - 后端实测 faction 值为 "" / "ya" / "juan" / null / 缺省，
//   normalizeFaction 将空串/null/undefined/脏数据统一归一为 null
// =============================================================================

// ===== Faction（阵营） =====

/** faction 原始值（后端可能下发 "" 空串 / "ya" / "juan" / null / undefined） */
export type FactionRaw = string | null | undefined;

/** faction 归一化后的业务值（空串/null/undefined/脏数据 归一为 null） */
export type FactionValue = "ya" | "juan" | null;

/** 阵营中文标签映射 */
export const FACTION_LABELS: Record<"ya" | "juan", string> = {
  ya: "牙",
  juan: "卷",
};

/** 阵营 Chip 颜色（HeroUI Chip color） */
export const FACTION_CHIP_COLORS: Record<"ya" | "juan", "danger" | "accent"> = {
  ya: "danger",
  juan: "accent",
};

/** 阵营徽章样式（UserDetailModal 用） */
export const FACTION_BADGE_STYLES: Record<"ya" | "juan", { label: string; className: string }> = {
  ya: { label: "牙", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  juan: {
    label: "卷",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
};

/**
 * 将后端 faction 原始值归一化为业务值。
 * 空串 / null / undefined / 非枚举值 → null；"ya"/"juan" → 对应枚举。
 */
export function normalizeFaction(raw: FactionRaw): FactionValue {
  if (raw === "ya" || raw === "juan") return raw;
  return null;
}

// ===== WebhookType（开播通知） =====

/** webhookType 原始值 */
export type WebhookTypeRaw = string | null | undefined;

/** webhookType 归一化后的业务值（含 null 表示未设置） */
export type WebhookTypeValue = "dingtalk" | "wecom" | "feishu" | null;

/** webhook 类型中文标签 */
export const WEBHOOK_TYPE_LABELS: Record<"dingtalk" | "wecom" | "feishu", string> = {
  dingtalk: "钉钉",
  wecom: "企微",
  feishu: "飞书",
};

/** webhook 合法地址前缀（用于提交前校验） */
export const WEBHOOK_VALID_PREFIXES: Record<"dingtalk" | "wecom" | "feishu", string> = {
  dingtalk: "https://oapi.dingtalk.com/robot/send",
  wecom: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
  feishu: "https://open.feishu.cn/open-apis/bot",
};

/** webhook 地址占位符 */
export const WEBHOOK_PLACEHOLDERS: Record<"dingtalk" | "wecom" | "feishu", string> = {
  dingtalk: "https://oapi.dingtalk.com/robot/send?access_token=...",
  wecom: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
  feishu: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
};

/**
 * 将后端 webhookType 原始值归一化为业务值。
 * 空串 / null / undefined / 非枚举值 → null；"dingtalk"/"wecom"/"feishu" → 对应枚举。
 */
export function normalizeWebhookType(raw: WebhookTypeRaw): WebhookTypeValue {
  if (raw === "dingtalk" || raw === "wecom" || raw === "feishu") return raw;
  return null;
}
