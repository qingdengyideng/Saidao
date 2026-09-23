import { z } from "zod";

/**
 * 环境变量 schema（唯一 process.env 读取点）。
 * - 带 NEXT_PUBLIC_ 前缀：注入浏览器 bundle，仅可放非敏感配置；
 * - 敏感值（如未来服务端 secret）不加前缀，只能在 RSC/Route Handler 读取。
 * 缺失/格式错误时 parse 抛错 → 启动即失败，报错信息指明具体变量名。
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_API_BASE: z.string().url({ message: "NEXT_PUBLIC_API_BASE 必须是合法 URL" }),
  NEXT_PUBLIC_N8N_BASE: z.string().url(),
  NEXT_PUBLIC_WS_BASE: z.string().refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "wss:" || u.protocol === "ws:";
      } catch {
        return false;
      }
    },
    { message: "NEXT_PUBLIC_WS_BASE 必须是合法的 ws:// 或 wss:// URL" },
  ),
  // 逗号分隔域名列表 → 解析为数组
  NEXT_PUBLIC_IMAGE_HOSTS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  NEXT_PUBLIC_ENABLE_VIDEO_REQUEST: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD: z.coerce.number().int().min(1).default(50),
});
export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  NEXT_PUBLIC_N8N_BASE: process.env.NEXT_PUBLIC_N8N_BASE,
  NEXT_PUBLIC_WS_BASE: process.env.NEXT_PUBLIC_WS_BASE,
  NEXT_PUBLIC_IMAGE_HOSTS: process.env.NEXT_PUBLIC_IMAGE_HOSTS,
  NEXT_PUBLIC_ENABLE_VIDEO_REQUEST: process.env.NEXT_PUBLIC_ENABLE_VIDEO_REQUEST,
  NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD: process.env.NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD,
});
if (!parsed.success) {
  // 启动即失败（dev/build 均生效），错误信息列出所有问题变量
  console.error("❌ 环境变量校验失败：", parsed.error.issues);
  throw new Error("环境变量校验失败，请检查 .env.local 是否完整（参照 .env.example）");
}

export const env: Env = parsed.data;

/**
 * 运行时配置（替代旧 config.js）。
 * 业务代码一律从 config 读取，禁止直接读 process.env。
 */
export const config = {
  apiBaseUrl: env.NEXT_PUBLIC_API_BASE,
  n8nBaseUrl: env.NEXT_PUBLIC_N8N_BASE,
  wsBaseUrl: env.NEXT_PUBLIC_WS_BASE,
  /** 图片域名白名单（content-parser 白名单解析器复用，见 02 §5） */
  imageHosts: env.NEXT_PUBLIC_IMAGE_HOSTS,
  /** 视频点播室 UI 开关（旧站已禁用，默认 false） */
  enableVideoRequest: env.NEXT_PUBLIC_ENABLE_VIDEO_REQUEST,
  /** 聊天消息超过该条数启用虚拟滚动 */
  chatVirtualizeThreshold: env.NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD,
  /** token 存储键（与旧站一致，迁移无感） */
  tokenStorageKey: "ACCESS_TOKEN",
  fingerprintStorageKey: "fingerprint",
} as const;

export type AppConfig = typeof config;
