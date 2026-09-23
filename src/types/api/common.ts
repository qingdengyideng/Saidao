import { z } from "zod";

/** 统一响应包裹（除 GET /saidao/player/{uid}） */
export const ApiEnvelopeSchema = z.object({
  code: z.enum(["0", "1"]),
  message: z.string(),
  data: z.unknown().nullable(),
});
export type ApiEnvelope = z.infer<typeof ApiEnvelopeSchema>;

export const WebhookType = z.enum(["dingtalk", "wecom", "feishu"]);
export const Faction = z.enum(["ya", "juan"]);

/**
 * 宽松 faction 字段 schema（读取侧用）。
 * 真实 payload 显示后端 faction 值为 "" / "ya" / "juan" / null / 缺省，
 * 若用严格 Faction 枚举（z.enum(["ya","juan"])），空串 "" 会校验失败导致整条消息被静默丢弃。
 * 故用 z.union([Faction, z.string()])——运行时不拒任何字符串（空串/脏数据都通过），
 * 消费方统一走 normalizeFaction() 归一化，不直接信任原始值。
 * 提交侧（ProfileUpdateRequestSchema）仍用严格 Faction.nullable()，因为提交值由前端控制。
 */
export const FactionFieldSchema = z.union([Faction, z.string()]).nullable().optional();
