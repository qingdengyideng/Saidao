# 01 — 项目初始化与工程规范

> 目标：从零建立 Saidao-next 的完整工程链路，产出可运行、可检查、可发布的 Next.js 16 应用骨架。
> 验收：`pnpm run dev` 可访问、`pnpm run build` 成功、`pnpm run lint` / `pnpm run typecheck` 0 error。
> 运行环境要求：**Node.js ≥ 20.9**（Next 16 最低要求，Node 18 不再支持）；浏览器 Chrome 111+ / Edge 111+ / Firefox 111+ / Safari 16.4+。

---

## 1. 脚手架初始化

### 1.1 创建项目

```bash
# 在 Saidao-next 根目录（已有 docs/、AGENTS.md，保留不动）
npx --yes pnpm@latest create-next-app@16 . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm
```

> 说明：
>
> - `--src-dir` 启用 `src/` 目录（与 AGENTS.md §3 一致）；
> - Next 16 默认 Tailwind v4（`@import "tailwindcss"` 写法）；
> - Next 16 默认使用 **Turbopack**（dev/build 均无需 `--turbopack` 参数，已内置为默认）；
> - create-next-app 16 简化版模板已默认 App Router + TypeScript + ESLint flat config + Tailwind v4；
> - 完成后删除模板生成的 `src/app/page.tsx` 内容（后续里程碑重写），保留 `layout.tsx` 结构；
> - 包管理器用 **pnpm**（`--use-pnpm`）；`packageManager` 字段由 create-next-app 自动写入，建议配合 corepack 锁定版本；
> - **不要**自定义 `webpack` 配置——Next 16 下自定义 webpack 配置会导致 `next build` 直接失败（防止配置错误问题）。

### 1.2 安装依赖

> **规则：不逐个 `pnpm add`。** 先把所有依赖写入 `package.json`（dependencies / devDependencies，版本号按 §1.3 约束），再执行一次 `pnpm install`。这样 lockfile 一次性生成、版本不漂移，也便于 code review 审 diff。

`package.json` 依赖片段（在 create-next-app 生成基础上合并）：

```jsonc
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    // UI
    "@heroui/react": "^3.0.0",
    "@heroui/styles": "^3.0.0",
    "tailwind-variants": "^3.0.0",
    // 状态 / 数据
    "zustand": "^5.0.0",
    "swr": "^2.0.0",
    // HTTP 客户端（用户指定：axios，不封装原生 fetch）
    "axios": "^1.7.0",
    // 工具库（用户指定）
    "lodash-es": "^4.17.21",
    "dayjs": "^1.11.0",
    "qs": "^6.12.0",
    // 类型校验
    "zod": "^3.23.0",
    // WebSocket（用户指定）
    "reconnecting-websocket": "^4.4.0",
    // 设备指纹（风控契约要求）
    "@fingerprintjs/fingerprintjs": "^4.0.0",
    // 播放（xgplayer 主引擎，与旧站 f25154c 线上行为一致；hls/mpegts 为回退链）
    "xgplayer": "^3.0.26",
    "xgplayer-hls": "^3.0.26",
    "xgplayer-flv": "^3.0.26",
    "xgplayer-mp4": "^3.0.26",
    "hls.js": "^1.5.0",
    "mpegts.js": "^1.8.0",
    // 图标
    "lucide-react": "^0.400.0",
    // PWA：workbox 运行时缓存（在 public/service-worker.js 中运行，见 §5）
    "workbox-window": "^7.1.0",
    "workbox-core": "^7.1.0",
    "workbox-precaching": "^7.1.0",
    "workbox-routing": "^7.1.0",
    "workbox-strategies": "^7.1.0",
    "workbox-expiration": "^7.1.0",
    "workbox-cacheable-response": "^7.1.0",
    // 虚拟列表（聊天超长列表）
    "virtua": "^0.40.0",
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0",
    "eslint-plugin-import": "^2.29.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-config-prettier": "^10.0.0",
    "prettier": "^3.3.0",
    "@types/lodash-es": "^4.17.12",
    "@types/qs": "^6.9.15",
    "@fingerprintjs/fingerprintjs-types": "^2.0.0",
    "@types/node": "^20.14.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
  },
}
```

```bash
# 一次性安装（lockfile 首次生成，需提交 pnpm-lock.yaml）
pnpm install
```

> 注意：`@heroui/styles` 要求 `tailwindcss@4` 与 `@tailwindcss/postcss`（create-next-app 16 已带）。
>
> PWA 不再使用 `@ducanh2912/next-pwa`：该库通过 `withPWA` 向 Next 注入 **webpack 插件**（GenerateSW），而 Next 16 默认构建器是 Turbopack，自定义 webpack 配置会导致 `next build` 直接失败。因此 PWA 采用**原生方案**：`src/app/manifest.ts`（Next 约定式路由）+ 手写 `public/service-worker.js`（workbox 运行时库，浏览器直接加载）+ `src/lib/pwa/sw.ts` 客户端注册。

### 1.3 依赖版本约束

| 包                             | 版本        | 备注                                                      |
| ------------------------------ | ----------- | --------------------------------------------------------- |
| next                           | 16.x        | App Router + Turbopack（默认构建器）；要求 Node.js ≥ 20.9 |
| react / react-dom              | 19.2        | Next 16 配套                                              |
| typescript                     | 5.x（≥5.1） | strict                                                    |
| @heroui/react + @heroui/styles | 3.x         | **禁止 v2 包（@heroui/system、@heroui/theme）**           |
| tailwindcss                    | 4.x         | **禁止 v3**（HeroUI v3 强依赖 v4）                        |
| zustand                        | 5.x         |                                                           |
| axios                          | 1.x         | HTTP 客户端（http-client 封装基础）                       |
| xgplayer + hls/flv/mp4 插件    | 3.0.26      | 播放主引擎（与旧站 f25154c 一致）；按路径 import          |
| hls.js / mpegts.js             | 1.x         | 回退链（xgplayer 不可用时）                               |
| reconnecting-websocket         | 4.x         |                                                           |
| zod                            | 3.x         |                                                           |

## 2. 配置清单

### 2.1 `tsconfig.json`（create-next-app 基础上强化）

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    // 额外加固：
    "noUncheckedIndexedAccess": true, // 数组/索引访问返回 T | undefined，逼迫处理越界
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true, // 强制 import type
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".tmp_probe", "docs"],
}
```

> `noUncheckedIndexedAccess` 是对"禁止 any + 类型推导"策略的补充：让 `list[i]`、`map[key]` 的返回类型自带 `undefined`，从类型层面消灭越界隐患。

### 2.2 `postcss.config.mjs`

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### 2.3 `app/globals.css`（样式入口，顺序强制）

```css
/* 1. Tailwind v4 必须在前 */
@import "tailwindcss";
/* 2. HeroUI v3 样式必须在后 */
@import "@heroui/styles";

/* 3. 设计 token（主题变量，深色模式覆盖） */
:root {
  --accent: oklch(0.6204 0.195 253.83);
  --accent-foreground: var(--snow);
  --background: oklch(0.9702 0 0);
  --foreground: var(--eclipse);
  --live: oklch(0.577 0.24 27.35); /* 直播红，对应旧站 --live-color */
  color-scheme: light;
}

.dark,
[data-theme="dark"] {
  --background: oklch(0.145 0.004 46.6); /* 对应旧站 #202027 系 */
  --foreground: oklch(0.93 0.004 71.7);
  color-scheme: dark; /* web-interface-guidelines: 修复暗色滚动条/输入框 */
}

/* 4. 全局基础 */
html {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
body {
  background: var(--background);
  color: var(--foreground);
}
```

> HeroUI v3 主题变量完整清单通过 `node .trae/skills/heroui-react/scripts/get_theme.mjs` 获取；上表为最小启动集，M5 里程碑按旧站色板完整映射（见 05 §5）。

### 2.4 `eslint.config.mjs`（flat config，Next 16 模板基础上加固）

```js
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**", "docs/**", ".tmp_probe/**"] },
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "no-explicit-any": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import/no-cycle": "error",
      "import/no-relative-parent-imports": "error", // 强制 @/ 别名
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
        },
      ],
      "react/no-children-prop": "error",
      "react/jsx-key": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lodash-es",
              message: "禁止 barrel import，请按路径导入：lodash-es/debounce",
            },
            {
              name: "dayjs",
              importNames: ["default"],
              message: "dayjs 插件请用 extend 显式启用",
            },
          ],
          patterns: [
            {
              group: ["@heroui/react/**"],
              message: "只允许从 @heroui/react 根导入",
            },
          ],
        },
      ],
    },
  },
  prettier, // 必须放最后，关闭与格式冲突的规则
];
```

### 2.5 `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "auto"
}
```

### 2.6 `next.config.ts`（图片域名；PWA 不在此配置）

```ts
import type { NextConfig } from "next";

/**
 * Next 16 注意事项：
 * - 构建器为 Turbopack（默认），不要写 `webpack` 配置（会导致构建失败）；
 * - 需要调整打包行为时用顶层 `turbopack` 配置键（如 resolveAlias），不是 webpack 字段；
 * - 本项目 PWA 采用原生方案（public/service-worker.js + src/app/manifest.ts），
 *   不经过 next.config，因此此处无 PWA 字段。
 */
const nextConfig: NextConfig = {
  images: {
    // 自建图床 + 表情 CDN（HeroUI Image / next/image 需要远程域名白名单）
    remotePatterns: [
      { protocol: "https", hostname: "rustfs.saidao.cc" },
      { protocol: "https", hostname: "ali2.a.yximgs.com" },
      { protocol: "https", hostname: "cdnl.iconscout.com" },
    ],
  },
  // 旧站 player 域名统一走环境变量，此处无需重写
};

export default nextConfig;
```

> Next 16 其他可用配置（本项目暂不需要，记录备查）：`cacheComponents: true`（Cache Components / PPR，全量动态默认下显式开启缓存，M6 性能阶段再评估）、`experimental.turbopackFileSystemCacheForDev`（16.3+ 已默认开启 dev 磁盘缓存）。

### 2.7 env 文件统一管理 + `src/config.ts`（zod 运行时校验）

> 原则：**所有需配置项一律收敛到 `.env` 文件**，代码中禁止出现硬编码地址/开关；`src/config.ts` 是唯一读取 `process.env` 的入口，启动时用 **zod 运行时校验**，缺配置时 fail-fast（给出可读报错），而不是运行到某个页面才发现变量缺失。

**（1）env 文件分工**

| 文件                                               | 用途                                     | 提交                                      |
| -------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| `.env.example`                                     | 配置模板，列出全部变量（含注释与示例值） | ✅ 提交                                   |
| `.env.local`                                       | 本地覆盖（个人开发），优先级最高         | ❌ gitignore                              |
| `.env.development`                                 | 开发环境默认值（团队共享）               | ✅ 提交                                   |
| `.env.production`                                  | 生产环境默认值                           | ✅ 提交（无敏感值，敏感值走部署平台注入） |
| `.env.development.local` / `.env.production.local` | 分环境本地覆盖                           | ❌ gitignore                              |

加载优先级（Next 内置）：`process.env`（部署平台注入）> `.env.local` > `.env.{NODE_ENV}.local` > `.env.{NODE_ENV}` > `.env`。

`.env.example`（完整变量清单，新增配置必须同步此文件）：

```bash
# ===== 服务基址（REST / N8N / WS）=====
NEXT_PUBLIC_API_BASE=https://api.saidao.cc
NEXT_PUBLIC_N8N_BASE=https://n8n.saidao.cc
NEXT_PUBLIC_WS_BASE=wss://api.saidao.cc

# ===== 第三方域名（图片白名单 / CSP，与 next.config.ts remotePatterns、06 §7 CSP 保持一致）=====
NEXT_PUBLIC_IMAGE_HOSTS=rustfs.saidao.cc,ali2.a.yximgs.com,cdnl.iconscout.com

# ===== 应用开关 / 运行时调参 =====
# 视频点播室 UI 是否启用（旧站已注释禁用，默认 false；M6 决策项，见 07）
NEXT_PUBLIC_ENABLE_VIDEO_REQUEST=false
# 聊天消息虚拟滚动阈值（超过该条数启用 virtua）
NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD=50
```

> 新增环境变量流程：① 改 `.env.example` 加变量 + 注释 → ② 改 `EnvSchema` 加字段 → ③ 代码中只从 `config` 对象读取。三者缺一即视为配置泄漏。

**（2）`src/config.ts`：zod schema + 启动校验**

```ts
import { z } from "zod";

/**
 * 环境变量 schema（唯一 process.env 读取点）。
 * - 带 NEXT_PUBLIC_ 前缀：注入浏览器 bundle，仅可放非敏感配置；
 * - 敏感值（如未来服务端 secret）不加前缀，只能在 RSC/Route Handler 读取。
 * 缺失/格式错误时 parse 抛错 → 启动即失败，报错信息指明具体变量名。
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_API_BASE: z
    .string()
    .url({ message: "NEXT_PUBLIC_API_BASE 必须是合法 URL" }),
  NEXT_PUBLIC_N8N_BASE: z.string().url(),
  NEXT_PUBLIC_WS_BASE: z.string().url(),
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
  NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1)
    .default(50),
});
export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // 启动即失败（dev/build 均生效），错误信息列出所有问题变量
  console.error("❌ 环境变量校验失败：", parsed.error.flatten().fieldErrors);
  throw new Error(
    "环境变量校验失败，请检查 .env.local 是否完整（参照 .env.example）",
  );
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
```

> 设计说明：
>
> 1. **fail-fast**：`safeParse` 失败即抛错，dev 启动、`next build` 都会暴露缺失变量，避免线上才发现 `.env` 漏配。
> 2. **单一读取点**：`process.env` 只出现在本文件（eslint 可加 `no-restricted-globals` 规则兜底，见 02/06 检查项）。
> 3. **派生常量与 env 分离**：`tokenStorageKey` 等与部署无关的常量留在 config 内，不进 env（避免无意义配置面）。
> 4. `NEXT_PUBLIC_*` 会被内联进客户端 bundle，**禁止放敏感值**；本项目的 token 在 localStorage（旧站契约），env 中无敏感项。
> 5. `imageHosts` 由 env 提供后，`src/lib/chat/content-parser.ts` 的 `ALLOWED_IMG_HOSTS` 改从 `config.imageHosts` 构建（02 §5 同步），`next.config.ts` 的 `remotePatterns` 因构建期无法读运行时 env 仍保持硬编码白名单（两处需人工同步，已在 06 §7 风险项登记）。

### 2.8 `package.json` scripts

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    // Next 16 已移除 next lint 命令（next build 也不再自动跑 lint），直接用 ESLint CLI
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"app/**/*.{ts,tsx,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\" \"app/**/*.{ts,tsx,css}\"",
    "test": "vitest run",
    "test:watch": "vitest",
  },
}
```

> - `lint` 必须走 ESLint CLI（`eslint .`），flat config 即 `eslint.config.mjs`；CI 中 lint/typecheck/build 三道关卡缺一不可（Next 16 build 不再内置 lint）。
> - `dev`/`build` 无需 `--turbopack` 参数（Next 16 已默认）；**禁止**加 `--webpack`（除非有不可迁移的 webpack-only 需求，本项目无）。
> - 测试框架选 **Vitest**（M6 引入 `vitest + @testing-library/react`），M0 阶段 `test` 脚本可先指向空跑。
> - 所有脚本通过 `pnpm run xxx` 调用；`packageManager` 字段锁定 pnpm 版本（create-next-app 写入），建议 `corepack enable`。

### 2.9 `.gitignore` 增补

```
.env.local
.env.*.local
next-env.d.ts
```

> `pnpm-lock.yaml`、`.env.example`、`.env.development`、`.env.production` 必须提交；`*.local` 一律忽略。

> PWA 的 `public/service-worker.js` 是**手写源码文件，必须提交**（不像 next-pwa 的生成产物）。

## 3. 根布局骨架（M0 交付）

`src/app/layout.tsx`：

```tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@heroui/react";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { PwaInstallPrompt } from "@/components/layout/PwaInstallPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saidao · 抽象赛道", template: "%s · Saidao" },
  description: "主播直播 + 实时聊天室社区",
  manifest: "/manifest.webmanifest",
  // 图标为旧站原样复制的 public/ 资源（见 §6.1）；favicon.ico 走 Next 约定式无需声明
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Saidao" },
};

export const viewport: Viewport = {
  themeColor: "var(--background)", // 与页面背景一致（web-interface-guidelines）
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // PWA 体验（禁止缩放是 PWA standalone 常见取舍，见 06 §6 风险表）
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          {children}
          {/* HeroUI v3 全局 Toast 容器 */}
          <Toaster />
          <PwaInstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

要点：

- **无 `<HeroUIProvider>`**（v3 不需要）；
- `suppressHydrationWarning` 用于 `<html>`（主题 class 水合安全）；
- `ThemeProvider` 负责 `dark`/`data-theme` 切换 + 读取 `localStorage.darkMode`（水合安全写法见 05 §4）；
- `PwaInstallPrompt` 封装 `beforeinstallprompt`（`src/lib/pwa/install.ts`），默认隐藏、触发后显示 HeroUI Button；
- **SW 注册**：`src/app/layout.tsx` 中挂载 `<ServiceWorkerRegistrar />`（或 `useEffect` 内调 `src/lib/pwa/sw.ts` 的 `registerServiceWorker()`），仅生产环境（`process.env.NODE_ENV === "production"`）注册 `public/service-worker.js`，dev 下不注册（避免缓存干扰开发）。

## 4. 目录结构落地

按 AGENTS.md §3 创建目录骨架（M0 只建空目录 + 占位 `index.ts`，具体文件在后续里程碑填充）：

```
src/
├─ api/           # M1
├─ types/api/     # M1
├─ stores/        # M1
├─ components/
│  ├─ ui/         # M2 起
│  ├─ layout/     # M2
│  ├─ saidao/     # M2
│  ├─ chat/       # M3
│  ├─ player/     # M4
│  ├─ account/    # M5
│  └─ video-request/ # M6（骨架）
├─ lib/
│  ├─ ws/         # M3
│  ├─ chat/       # M3
│  ├─ media/      # M4
│  ├─ pwa/        # M0（sw.ts 注册 + install.ts 安装提示）
│  ├─ fingerprint.ts  # M1
│  └─ utils.ts
└─ hooks/         # M2 起
```

## 5. PWA 实现（原生 Service Worker，替代 next-pwa）

> 设计动机：保留旧站"只缓存图片类 CDN + 自建图床，不缓存应用自身"的运行时策略，同时彻底摆脱对 webpack 的依赖（Next 16 Turbopack 兼容）。

### 5.1 `public/service-worker.js`（workbox 运行时库，M0 落地骨架 / M6 完善策略）

```js
/* public/service-worker.js
 * workbox 运行时库在 SW 线程执行（浏览器直接从 public/ 加载，不经过 Next 构建）。
 * 策略对齐旧站 service-workV3.js：3 个图片前缀 CacheFirst，160 条，30 天过期。
 */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

self.skipWaiting();
clientsClaim();

// 1. Next.js 构建产物预缓存（Turbopack 输出的静态资源，版本号天然变化，安全）
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// 2. 图片 CDN 运行时缓存（旧站策略 1:1 保留）
registerRoute(
  ({ url }) =>
    /^https:\/\/(ali2\.a\.yximgs\.com\/bs2\/emotion|cdnl\.iconscout\.com|rustfs\.saidao\.cc\/images)\/.*/i.test(
      url.href,
    ),
  new CacheFirst({
    cacheName: "images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 160,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// 3. 导航请求 NetworkFirst（应用外壳始终取线上最新，离线时回退到已缓存壳）
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 16,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  ),
);
```

> 关于 `self.__WB_MANIFEST`：原生方案没有 GenerateSW 构建期注入，`precacheAndRoute` 的 manifest 在 M6 通过两个途径之一补齐：
> (a) **简化路径（推荐）**：不预缓存构建产物，仅保留 §2/§3 的运行时策略（CDN 图片 + 导航 NetworkFirst），`precacheAndRoute` 传空数组；
> (b) 构建期用 `turbopack` 顶层配置或 postbuild 脚本扫描 `.next/` 静态资源清单注入（M6 再评估，不作为 M0 交付项）。

### 5.2 `src/lib/pwa/sw.ts`（客户端注册，M0 落地）

```ts
"use client";
import { register } from "workbox-window";

let registered = false;

export function registerServiceWorker(): void {
  // dev 不注册，避免缓存干扰开发（旧站 disable: NODE_ENV === development 的等价行为）
  if (process.env.NODE_ENV !== "production") return;
  if (registered || typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  registered = true;

  const sw = register("/service-worker.js", { scope: "/" });
  sw.addEventListener("controlling", () => {
    console.info("[pwa] service worker controlling");
  });
  sw.addEventListener("error", (e) => {
    console.error("[pwa] service worker registration failed", e);
  });
}
```

### 5.3 文件清单

| 文件                                     | 职责                       | 里程碑            |
| ---------------------------------------- | -------------------------- | ----------------- |
| `public/service-worker.js`               | workbox 运行时缓存策略     | M0 骨架 / M6 完善 |
| `src/lib/pwa/sw.ts`                      | 客户端注册（生产环境）     | M0                |
| `src/lib/pwa/install.ts`                 | `beforeinstallprompt` 封装 | M0                |
| `src/app/manifest.ts`                        | PWA manifest（约定式路由） | M0（见 04 §6）    |
| `components/layout/PwaInstallPrompt.tsx` | 安装按钮（HeroUI Button）  | M6                |

## 6. 原始资源迁移规范（旧站 `E:\02-项目\Saidao` → 新项目 `public/`）

> 原则：**重构后线上仍使用的资源文件（PWA 图标、logo、支付二维码等）一律保留旧站原始版本**，从 `E:\02-项目\Saidao` 原样复制到 `public/` 对应目录后引用；不重新设计/裁剪/压缩（保证视觉 1:1 一致，降低回归面）。**适用边界**：该原则仅适用于旧站线上实际使用的资源；遗留未引用素材（如 `animation/` 下 13 个 Lottie，已核实旧站无任何代码引用，见 §6.2）不迁移。字体、Font Awesome 图标、CSS 不在此列（字体用系统栈，图标改 lucide-react，样式改 Tailwind）。

**6.1 迁移清单（6 个文件，M0 一次性复制）**

| #   | 旧站路径                                   | 新项目路径                                 | 用途                                                                | 引用方                             |
| --- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------- |
| 1   | `favicon.ico`                              | `public/favicon.ico`                       | 浏览器标签图标（Next 约定式，无需 `<link>`）                        | Next 自动                          |
| 2   | `icon-192x192.png`                         | `public/icon-192x192.png`                  | PWA 192 图标 + apple-touch-icon                                     | `src/app/manifest.ts`、根布局 metadata |
| 3   | `icon-512x512.png`                         | `public/icon-512x512.png`                  | PWA 512 图标                                                        | `src/app/manifest.ts`                  |
| 4   | `assets/images/saidao_logo_0915-no-bg.png` | `public/images/saidao_logo_0915-no-bg.png` | 头部 logo（1469×743 透明底）                                        | `Header` 组件                      |
| 5   | `images/wechat-pay.png`                    | `public/images/wechat-pay.png`             | 微信支付收款码                                                      | `SponsorPage`                      |
| 6   | `images/alipay.jpg`                        | `public/images/alipay.jpg`                 | 支付宝收款码（旧站 alt 文案错写"微信"，迁移时修正为"支付宝收款码"） | `SponsorPage`                      |

**6.2 不迁移项（明确排除）**

| 旧站文件                                     | 不迁移原因                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `animation/*.json`（13 个 Lottie，约 2.2MB） | **已核实旧站无任何代码引用**（无 lottie-web/lottie-player 引入、无 `animationData`/`loadAnimation`/`.json` 路径）——属遗留素材库，线上从未呈现；旧站真实"直播中/阵营"视觉均为纯 CSS 徽章实现，HeroUI + Tailwind 可覆盖，引入 Lottie 纯属 2.2MB 负资产。**后路**：未来若产品确实需要具象动效，从旧站目录按需取单个文件 + 单独 PR 重新引入 lottie-react，不预支 |
| `manifest.json`                              | 用 `src/app/manifest.ts` 约定式路由重写（Next 自动暴露 `/manifest.webmanifest`）                                                                                                                                                                                                                                                                                 |
| `service-workV3.js`                          | 重写为 `public/service-worker.js`（workbox 运行时）+ `src/lib/pwa/sw.ts`，见 §5                                                                                                                                                                                                                                                                              |
| `L2Dwidget.min.js`                           | 旧站无任何引用，遗留文件                                                                                                                                                                                                                                                                                                                                     |
| `assets/css/*`（6 个）                       | Tailwind v4 + HeroUI 重写，不原样复制                                                                                                                                                                                                                                                                                                                        |
| `assets/js/*`（14 个）                       | 按 AGENTS.md 重写为 `src/api/` + `src/lib/` + `src/hooks/`                                                                                                                                                                                                                                                                                                   |
| Font Awesome（CDN 引用）                     | 改用 `lucide-react`，彻底移除 FA                                                                                                                                                                                                                                                                                                                             |
| 字体文件                                     | 旧站无本地字体（仅系统字体栈 + FA 图标字体），无迁移项                                                                                                                                                                                                                                                                                                       |
| `player.html` 内联 SVG symbol（12 个）       | 改用 `lucide-react` 等价图标                                                                                                                                                                                                                                                                                                                                 |

**6.3 复制步骤（M0 任务 0.10 执行）**

```powershell
# PowerShell，在 Saidao-next 根目录执行（一次性，复制后 git add 提交）
$src = "E:\02-项目\Saidao"

# 1) PWA 图标（根级）
Copy-Item "$src\favicon.ico", "$src\icon-192x192.png", "$src\icon-512x512.png" -Destination ".\public\"

# 2) 图片（logo + 支付二维码 → public/images/）
New-Item -ItemType Directory -Force ".\public\images" | Out-Null
Copy-Item "$src\assets\images\saidao_logo_0915-no-bg.png" -Destination ".\public\images\"
Copy-Item "$src\images\wechat-pay.png", "$src\images\alipay.jpg" -Destination ".\public\images\"
```

> 复制为**二进制原样**，不转格式、不改名、不压缩（保证与旧站视觉 1:1）。若后续发现个别文件过大（>1MB）需优化，单独提交 `perf` 变更并保留原文件对照。

**6.4 引用规则（迁移后代码如何引用）**

- **一律绝对路径**：`/favicon.ico`、`/images/saidao_logo_0915-no-bg.png` 等；禁止 `assets/images/...` 旧路径残留。
- **图片组件**：优先 HeroUI `Image`（自带 `width`/`height` 防 CLS）；logo/二维码必须有 `alt`（二维码 alt 写收款方式，logo `alt="Saidao logo"`）。
- **动效实现**：全部用 HeroUI 自带 CSS 动画 + Tailwind 原子类（如 LIVE 角标 `animate-pulse`），不引入 Lottie 运行时（理由见 §6.2）。
- **PWA manifest**：`src/app/manifest.ts` 的 `icons` 指向 `/icon-192x192.png`（192）与 `/icon-512x512.png`（512，可另加 maskable 用途标记）；根布局 `metadata` 配 `icons.icon` 与 `icons.apple` 指向同文件。
- **SW 缓存**：`public/` 本地静态资源（logo/二维码）**不**纳入 §5 的 CDN CacheFirst 策略（该策略仅针对 3 个第三方图床前缀）；本地资源走 Next 构建产物/静态路由缓存，SW 不额外预缓存（M6 评估）。
- **域名白名单联动**：外部图床（`rustfs.saidao.cc` / `ali2.a.yximgs.com`）是运行时数据源不复制文件，但 `content-parser` 白名单（`config.imageHosts`）与 SW 缓存前缀必须保留这两个域名。

**6.5 变更流程**

- 资源文件视为**受控资产**：新增/替换必须 PR 说明原因 + 旧文件对比截图（或保留旧版本在 `public/images/legacy/` 一个周期后删除）。
- 文件名禁止空格/中文（沿用旧站命名，本身合规）；新增资源命名沿用 kebab-case 小写。

## 7. M0 验收清单

- [ ] `pnpm run dev` → http://localhost:3000 渲染占位页（含 ThemeProvider 深色切换正常）
- [ ] `pnpm run build` 成功（Turbopack 构建，无 webpack 告警）
- [ ] `pnpm run lint`（eslint CLI）/ `pnpm run typecheck` 0 error
- [ ] `eslint.config.mjs` 中 `no-explicit-any` 生效（故意写 `any` 应报错）
- [ ] env 文件链就位：`.env.example` / `.env.development` 提交、`.env.local` 生效；故意删一个变量启动应 fail-fast 报错
- [ ] `src/config.ts` zod 校验通过，`config.apiBaseUrl` 读取正确
- [ ] HeroUI v3 冒烟：渲染一个 `Button`（`onPress` 回调触发）
- [ ] `public/images/`（logo + 支付二维码 2 个）从旧站复制完成（§6.1 第 4–6 项）
- [ ] PWA 图标（favicon.ico / icon-192x192.png / icon-512x512.png）就位（§6.1 第 1–3 项）
- [ ] `public/service-worker.js` + `src/lib/pwa/sw.ts` 就位，生产构建后 DevTools 可见 SW 注册
- [ ] `src/app/manifest.ts` 约定式路由产出 manifest（Next 16 支持，替代手写 manifest.json；字段见 04 §6）
