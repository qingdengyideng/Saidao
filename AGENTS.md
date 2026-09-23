<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.
This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Saidao-next 重构开发规则

> 本文件是 Saidao-next 重构期间所有 AI 代理与开发者的**强制性开发规则**。
> 任何代码修改、新增文件之前，必须先阅读并遵守本文件。
> 重构方案详见 `docs/plans/refactor/`，本文件是方案中"规则"部分的浓缩执行版。

---

## 0. 技术栈（固定，不得替换）

| 层     | 选型                                                                                                              | 版本约束                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 框架   | Next.js（App Router，**Turbopack 为默认构建器**）                                                                 | **16.x**（16.0+，Node.js 20.9+）                                                                             |
| 语言   | TypeScript                                                                                                        | strict 模式，5.x（Next 16 最低 5.1）                                                                         |
| UI     | @heroui/react + @heroui/styles（**HeroUI v3**）                                                                   | 3.x                                                                                                          |
| 样式   | Tailwind CSS v4（`@import "tailwindcss"` + `@import "@heroui/styles"`）                                           | 4.x                                                                                                          |
| 状态   | zustand                                                                                                           | 5.x                                                                                                          |
| 校验   | zod                                                                                                               | 3.x                                                                                                          |
| HTTP   | axios                                                                                                             | 1.x                                                                                                          |
| 工具库 | lodash-es / dayjs / qs                                                                                            | -                                                                                                            |
| WS     | reconnecting-websocket                                                                                            | 4.x                                                                                                          |
| 播放   | xgplayer 3.x（xgplayer-hls/flv/mp4 插件）主引擎（与旧站 f25154c 一致）+ hls.js/mpegts.js 回退链，flv.js 不引入 | 3.0.26 / 1.x |
| 指纹   | @fingerprintjs/fingerprintjs                                                                                      | 4.x                                                                                                          |
| PWA    | 原生 SW + `src/app/manifest.ts`（`public/service-worker.js` + `src/lib/pwa/sw.ts` 注册；不引 `@ducanh2912/next-pwa`） | -                                                                                                            |
| 图标   | lucide-react                                                                                                      | -                                                                                                            |
| Lint   | ESLint 9 flat config + eslint-config-next + eslint-plugin-import + eslint-plugin-react-hooks                      | -                                                                                                            |
| 格式化 | Prettier                                                                                                          | 3.x                                                                                                          |
| 包管理 | pnpm                                                                                                              | 9.x+（锁定 lockfile；安装依赖统一直接编辑 `package.json` 后 `pnpm install` 一次性安装，禁止逐个 `pnpm add`） |

**已选定的替代方案（禁止再引入同类库）**：

- 表单：**zod 校验 + HeroUI 组件 + 手动状态管理**，不引入 react-hook-form。
- 图标：**lucide-react**，不引入 Font Awesome（旧站使用，重构移除）。
- 动画/动效：**HeroUI 自带 CSS 动画 + Tailwind 原子类**；**不引入 lottie-react**（旧站 `animation/` 下 13 个 Lottie 素材经核实从未被线上引用，属遗留素材，迁移为 2.2MB 负资产；未来确需具象动效时按需取单文件 + 单独 PR 重新评估，见 01 §6.2）。不引入 framer-motion（HeroUI v3 已不依赖）。
- 路由状态（URL 参数同步）：**next 原生 `searchParams` + qs**，不引入 nuqs（降低依赖面）。
- 虚拟列表：**virtua**（仅聊天消息等超长列表用）。
- HTTP 客户端：**axios**（统一 `src/api/http-client.ts` 封装，禁止在组件/store 内直接 `fetch` 或裸用 axios 实例）。
- PWA：**原生 `service-worker.js` + `src/app/manifest.ts` 约定式路由 + 客户端手动注册**，不引入 `@ducanh2912/next-pwa`（其依赖 webpack 插件机制，与 Next 16 默认 Turbopack 构建器冲突——自定义 `webpack` 配置会导致 `next build` 失败）。

---

## 1. 铁律（违反即返工）

### 1.1 类型安全

1. `tsconfig.json` 必须开启 `"strict": true`，禁止 `strict: false`。
2. **禁止使用 `any`**。以下类型同样禁止：`unknown as T` 无校验强转、`@ts-ignore`、`@ts-expect-error`（确需时必须有注释说明原因 + TODO 链接）。
3. 所有后端数据必须经过 **zod schema 运行时校验**后再进入应用状态；schema 定义在 `src/types/api/`，类型由 `z.infer` 推导，**禁止手写与 zod 重复的 interface**。
4. 禁止 `as` 强转绕过结构检查；只允许在"已知安全的窄化点"使用（如 `as const`、枚举收窄）。
5. 函数参数、返回值、状态切片、事件 payload 必须显式或可推导类型，禁止隐式 `any`。

### 1.2 原生代码最小化

6. **优先用库/插件实现，禁止手写已有库能覆盖的功能**：
   - 数组/对象操作 → `lodash-es`（按路径 import：`import debounce from "lodash-es/debounce"`，禁止 barrel `import _ from "lodash-es"`）。
   - 日期时间 → `dayjs`（含 `utc`/`timezone` 插件，按路径 import）。
   - URL query 编解码 → `qs`。
   - 表单校验 → `zod`。
   - WS 重连 → `reconnecting-websocket`，禁止手写 `setTimeout` 重连。
   - HTTP 请求 → 统一 `src/api/http-client.ts`（axios 封装），**禁止在组件/store 内直接 `fetch` 或裸用 axios**（旧站 sliding-captcha.js/player.js 各自 fetch 的教训）。
   - 防抖节流 → `lodash-es`，禁止手写。
7. 确实需要手写浏览器 API（`getUserMedia`、`MediaRecorder`、`beforeinstallprompt`、`requestFullscreen` 等）时，必须封装为 `src/lib/` 下的独立模块并集中管理，组件不直接碰原生 API。

### 1.3 HeroUI 优先

8. 所有 UI 元素**必须优先使用 HeroUI v3 组件**（Button、Card、Modal、Dialog、TextField、Textarea、Select、Autocomplete、Dropdown、Popover、Tabs、Chip、Avatar、Badge、Skeleton、Spinner、Toast、Alert、Table、Pagination、Tooltip、Switch、RadioGroup、Checkbox、NumberInput、Datepicker、Image、Code、Kbd、Link、Listbox、Menu、Modal、Progress、Snippet、Steps、Accordion、Breadcrumbs、Calendar、Checkbox、Divider、Form、Input、Link、Popover、ProgressBar、SearchField、Sidebar、Skeleton、Table、Tag、ToggleGroup、Tooltip、User、Accordion…）。
9. HeroUI 没有覆盖的场景（视频播放器、弹幕层、波形图、拖拽条）才允许用原生元素，且必须：
   - 用 Tailwind CSS 原子类组织样式，**禁止行内 style**（动态值除外）；
   - 保持与 HeroUI 设计 token（`--accent`、`--background` 等 CSS 变量）一致；
   - 在组件头部注释说明为何不能用 HeroUI。
10. **HeroUI v3 规则**（与 v2 不同，违反必错）：
    - **不需要 `<HeroUIProvider>`**；
    - 复合组件写法：`<Card><Card.Header>…</Card.Header><Card.Body>…</Card.Body></Card>`，禁止 v2 扁平 props；
    - 交互事件用 `onPress` 而非 `onClick`（Button/Dropdown 等）；
    - 语义化 variant：`primary`/`secondary`/`tertiary`/`ghost`/`outline`/`danger`，禁止裸颜色类（`text-red-500`）做按钮语义；
    - 实现任何组件前，先通过 skill 脚本 `node scripts/get_component_docs.mjs <Component>` 拉取最新文档确认 API。
11. 禁止 `<div onClick>` 做交互；用 HeroUI Button（`isIconOnly` + `aria-label`）或 `<a>`/`next/link`。

### 1.4 API 层

12. 所有接口定义在 `src/api/` 下按模块拆分（`user.ts`、`saidao.ts`、`message.ts`、`emoji.ts`、`polls.ts`、`daily-report.ts`、`video-request.ts`、`captcha.ts`、`upload.ts`、`webhook.ts`、`player.ts`），每个模块导出带类型的函数。
13. 禁止在组件/store 中出现接口路径字符串（`/user/login` 等只能出现在 `src/api/`）。
14. 统一响应包裹 `ApiEnvelope<T>` = `{ code: "0" | "1", message: string, data: T | null }`；客户端层负责解包 + 401 处理，业务层只拿 `data`。
15. 唯一例外：`GET /saidao/player/{uid}` 无包裹，`src/api/player.ts` 单独处理。

### 1.5 文件与命名

16. 目录结构见 `docs/plans/refactor/01-project-init.md` §4，**新增文件必须落在对应目录**，禁止在 `src/` 根放散文件。
17. 组件文件 PascalCase（`SaidaoCard.tsx`），工具/库文件 kebab-case（`chat-voice-utils.ts`），store 文件 `useXxxStore.ts`，API 模块 kebab-case。
18. 组件必须是**独立文件**，禁止在一个 tsx 里定义多个导出组件（唯一例外：同文件内的私有子组件，且不可导出）。
19. 禁止循环依赖；`eslint-plugin-import` 的 `import/no-cycle` 为 error。

---

## 2. 代码规范

### 2.1 通用

- 缩进 2 空格；单引号；分号必须；行宽 100（Prettier 统一）。
- 文件末尾保留一个空行。
- 导出用 `export function` / `export const`，禁止 `export default`（页面组件除外）。
- 类型 import 用 `import type { ... }`。
- 常量用 `UPPER_SNAKE_CASE`，枚举语义值优先用字面量联合类型 + `as const`。
- 注释：只解释"为什么"，不解释"是什么"；复杂协议（WS 消息、风控流程）必须有中文注释块。

### 2.2 React/Next

- 组件默认 Server Component；需要交互/浏览器 API 才加 `"use client"`，且 `use client` 写在文件第一行（注释除外）。
- 禁止在 Server Component 中 import 带副作用的客户端模块（zustand store、reconnecting-websocket 等）。
- 路由级代码放 `app/` 下对应目录；页面级数据获取用 Server Component + 并行 `Promise.all`，禁止串行 await 瀑布。
- 客户端数据获取用 SWR（`@tanstack/react-query` 二选一，本项目选 **SWR**，与 Next 生态更轻）；SWR key 必须稳定、序列化简单。
- 列表渲染必须有稳定 `key`（用 messageId/id，禁止 index）。
- 长列表（聊天消息 > 50 条）必须虚拟化（virtua）或 `content-visibility: auto`。
- 禁止在 render 中读 `getBoundingClientRect`/`offsetHeight` 等布局属性；测量放 effect 并节流。
- 事件处理器内的非紧急更新用 `useTransition`/`startTransition`。
- 派生状态在 render 中计算（`const x = list.filter(...)`），禁止用 useEffect 同步派生状态。
- **动态 API 强制异步（Next 16 破坏性变更，无兼容模式）**：`params`/`searchParams` 一律 `const { ... } = await params`；`cookies()`/`headers()`/`draftMode()` 一律 `await`。客户端组件内用 `React.use()` 解包 Promise。同步访问会直接报构建错误。
- 昂贵初始化用 `useState(() => compute())` 惰性初始化。
- 稳定引用：`useMemo`/`useCallback` 只用在真实昂贵的计算/传给 memo 子组件的回调上，禁止滥用。
- 禁止在组件内部定义组件（每次 render 重建导致卸载重挂）。
- 水合安全：服务端/客户端不一致的内容（时间、随机数、localStorage 读值）必须 `useEffect` 后渲染或 `suppressHydrationWarning`，禁止首屏直接读 localStorage 渲染。

### 2.3 样式（Tailwind v4）

- 样式只写在组件 JSX 的 `className`（Tailwind 原子类）或 `globals.css` 的全局 token 中。
- 主题色必须用 CSS 变量（`var(--accent)` 等 HeroUI token），禁止硬编码色值。
- 深色模式：`class="dark"` + `data-theme` 属性切换，由 `ThemeProvider` 统一管理；`<html>` 加 `suppressHydrationWarning`。
- 动画只动 `transform`/`opacity`；禁止 `transition: all`；必须响应 `prefers-reduced-motion`。
- 全出血布局加 `env(safe-area-inset-*)`。

### 2.4 错误与边界

- 每个路由段必须有 `error.tsx`（HeroUI Alert 展示错误 + 重试按钮）。
- 数据加载必须 `loading.tsx`（HeroUI Skeleton）。
- 异步操作失败：Toast（HeroUI `useToast`）展示 `message`，且错误信息要包含下一步指引（如"网络异常，请检查网络后重试"）。
- 全局未捕获：`global-error.tsx` + 客户端 `window.onerror` 上报（预留）。

### 2.5 可访问性（硬性清单）

- 图标按钮必须 `aria-label`；装饰性图标 `aria-hidden="true"`。
- 表单控件必须有 `label`（HeroUI `TextField` 自带）或 `aria-label`。
- 所有交互元素键盘可达；焦点态用 `focus-visible`，禁止无替代的 `outline-none`。
- 异步更新（Toast、校验错误）容器加 `aria-live="polite"`。
- 破坏性操作（删消息、封禁、删点播）必须二次确认（HeroUI Modal 确认框）。
- 日期时间展示用 `Intl.DateTimeFormat`（dayjs 仅用于计算/格式化参数，展示层走 Intl 或 dayjs locale）。
- 图片必须有 `alt`（装饰图 `alt=""`）；`<img>` 必须给 `width`/`height` 防 CLS（HeroUI `Image` 组件优先）。
- 链接用 `<a>`/`next/link`，保留中键/Ctrl+点击行为。
- 触控：`touch-action: manipulation`；弹窗加 `overscroll-behavior: contain`。

### 2.6 安全

- 任何用户生成内容（弹幕、昵称、消息 content、链接标题）**禁止 `dangerouslySetInnerHTML`**。
- 唯一例外：聊天表情 content 是 `<img class="chat-emoji vip" .../>` HTML——必须经过白名单解析器（`src/lib/chat/content-parser.ts`）：只允许 `<img>` 标签 + 白名单 class/属性（src 限内部图床域名 `rustfs.saidao.cc`/`ali2.a.yximgs.com`），其余内容走 React 文本节点自动转义。解析器必须单测覆盖注入用例。
- token 存 `localStorage`（与旧站一致，降低迁移成本；安全升级项见 06 文档"已知风险"）。
- `Authorization` 头：保持旧站行为——**裸 token，无 `Bearer` 前缀**（后端契约，不可擅自修改）。
- WS 连接参数 `token`/`fp` 走 query string（后端契约）。
- 外链（日报 link、主播 url）必须 `rel="noopener noreferrer"` + `target="_blank"`。

### 原始资源保留与迁移（图标/图片等）

- 重构后**线上实际使用**的资源文件（PWA 图标、logo、支付二维码等）**一律保留旧站原始版本**，从 `E:\02-项目\Saidao` 原样复制到 `public/` 对应目录后使用；禁止重新设计/裁剪/压缩/改格式（视觉 1:1 一致）。
- **适用边界**：该原则仅覆盖旧站线上实际使用的资源；遗留未引用素材（如 `animation/` 下 13 个从未被引用的 Lottie，见 01 §6.2）不迁移。
- 代码引用一律走 `public/` 绝对路径（`/images/...` 等），禁止旧站 `assets/images/...` 相对路径残留。
- 图片优先 HeroUI `Image`（`width`/`height` 防 CLS + `alt`）；动效用 HeroUI 自带 CSS 动画 + Tailwind，不引入 Lottie 运行时。
- 迁移清单（6 个文件）、复制脚本、不迁移项（Lottie/manifest.json/service-workV3.js/CSS/JS/Font Awesome/内联 SVG symbol 等）与受控变更流程见 `docs/plans/refactor/01-project-init.md` §6。

---

## 3. 目录结构（强制）

```
Saidao-next/
├─ AGENTS.md                    # 本文件
├─ src/
│  ├─ app/                      # Next.js App Router（路由层）
│  │  ├─ layout.tsx             # 根布局：字体、Theme、Toaster、SW 注册
│  │  ├─ page.tsx               # 主页（SaidaoList + ChatRoom 组合）
│  │  ├─ player/
│  │  │  └─ [uid]/page.tsx      # 播放页（无鉴权；params 须 await）
│  │  ├─ sponsor/page.tsx       # 赞助页
│  │  ├─ global-error.tsx
│  │  └─ manifest.ts / robots.ts # PWA manifest（Next 约定式路由）
│  ├─ api/                      # 接口层：按模块拆分，唯一允许出现路径字符串的地方
│  │  ├─ http-client.ts         # axios 封装：fp 头、token、解包、401、超时
│  │  ├─ user.ts / saidao.ts / message.ts / emoji.ts / polls.ts
│  │  ├─ daily-report.ts / video-request.ts / captcha.ts / upload.ts / webhook.ts / player.ts
│  │  └─ index.ts               # 仅做 re-export 聚合（禁止 barrel 之外的逻辑）
│  ├─ types/api/                # zod schema + z.infer 推导类型（按模块与 src/api 对应）
│  ├─ stores/                   # zustand store（useAuthStore、useChatStore、useSaidaoStore、usePlayerStore、useUiStore、useVideoRequestStore）
│  ├─ components/
│  │  ├─ ui/                    # 对 HeroUI 的薄封装（统一默认值/图标/a11y），不重复造轮子
│  │  ├─ layout/                # Header、NoticeBar、ChatSidebar、Footer
│  │  ├─ saidao/                # SaidaoCard、CardsGrid、FilterTabs、DailyReportCard、PreviewPlayer
│  │  ├─ chat/                  # ChatMessageList、ChatMessageItem、ChatInput、EmojiPanel、VoiceRecorder、HotWords、ChatMoments、ChatPolls、LinkPreview、ChatFilterSettings
│  │  ├─ player/                # VideoPlayer、DanmakuLayer、CommentPanel、PlayerControls、PlayerStatus
│  │  ├─ account/               # LoginModal、AllocationModal、ProfileModal、ChangePasswordModal、UserDetailModal、TagEditorModal
│  │  └─ video-request/         # VideoRequestPanel（如启用）
│  ├─ lib/                      # 纯工具（无 React 依赖）
│  │  ├─ ws/                    # chat-socket.ts（reconnecting-websocket 封装）、player-socket.ts、ws-message-types.ts
│  │  ├─ chat/                  # content-parser（表情白名单）、waveform、quote-utils、voice-utils
│  │  ├─ media/                 # xgplayer 引擎封装（hls/mpegts 回退）、pip、fullscreen
│  │  ├─ pwa/                   # SW 注册（src/lib/pwa/sw.ts 注册 public/service-worker.js）、beforeinstallprompt
│  │  ├─ fingerprint.ts         # FingerprintJS 封装（缓存 localStorage）
│  │  └─ utils.ts               # 其他小工具（cls 合并等）
│  └─ hooks/                    # 客户端 hooks（useChatSocket、usePlayerSocket、useTheme、useOnlineCount、useMediaRecorder、useBeforeInstallPrompt…）
├─ public/                      # 静态资源（支付二维码、favicon、PWA 图标、service-worker.js）
├─ docs/                        # 调研与方案文档（本目录）
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ .prettierrc
├─ postcss.config.mjs
├─ package.json
└─ .env.local                   # NEXT_PUBLIC_API_BASE 等（不提交）
```

**路径别名**：`tsconfig.json` 配 `"@/*": ["./src/*"]`，import 一律走 `@/` 别名，禁止 `../../` 跨层级相对路径。

---

## 4. 提交规范（Conventional Commits）

```
<type>(<scope>): <subject>     # 中文 subject，≤ 72 字符
[空行]
<body>                         # 可选，说明 why
```

- type：`feat` / `fix` / `refactor` / `perf` / `style` / `docs` / `test` / `chore` / `build`
- scope：模块名（`api`、`chat`、`player`、`saidao`、`auth`、`ui`、`pwa`、`config`）
- 示例：`feat(chat): 实现表情白名单解析器`、`fix(player): 修复未开播 m3u8="null" 特判`

## 5. 分支与验收

- 主干 `main` 保护，开发走 `feat/*` / `fix/*` / `refactor/*` 分支。
- 每次修改或任务完成交付，必须通过质检检查：
  - **检查**：`pnpm run check`（= `eslint . && tsc --noEmit && prettier --check "src/**/*.{ts,tsx,css}"`，ESLint 0 error + 类型检查 0 error + Prettier 格式校验通过）。
  - **自动修复**：检查不通过时运行 `pnpm run fix`（= `eslint . --fix && prettier --write "src/**/*.{ts,tsx,css}"`），修复后重新执行 `pnpm run check` 确认通过。
  - **构建与测试**（PR 级别）：`pnpm run test`（vitest 单测全绿）、`pnpm run build`（Next 16 默认 Turbopack 构建成功）。
- 包管理一律 **pnpm**：依赖安装统一直接编辑 `package.json`（新增依赖写入 dependencies/devDependencies），然后 `pnpm install` 一次性安装；禁止逐个 `pnpm add xxx` 分次安装。
- 重构里程碑（见 07 文档）每个里程碑完成后必须人工回归：登录→聊天→发语音→投票→播放页→PWA 安装。

## 6. 禁止事项汇总（Checklist，每次提交前自查）

- [ ] 无 `any`、无 `@ts-ignore`
- [ ] 无组件内 `fetch`/裸 axios、无散落接口路径
- [ ] 无 `<div onClick>`、无裸颜色按钮
- [ ] 无 `innerHTML`/`dangerouslySetInnerHTML`（除白名单解析器）
- [ ] 无行内 style（动态值除外）、无 `transition: all`
- [ ] 无 localStorage 首屏直读导致水合不一致
- [ ] 图标按钮有 aria-label、列表有稳定 key
- [ ] 破坏性操作有确认框
- [ ] 无 `src/config.ts` 外读 `process.env`、无硬编码地址/开关（新配置走 env 三步流程）
- [ ] 无旧站 `assets/images/...` 相对路径残留；静态资源引用走 `public/` 绝对路径（资源保留原版，见 01 §6）
- [ ] 无新增同类依赖（对照 §0 已选定方案）
- [ ] `onPress` 用于 HeroUI 交互组件
- [ ] `pnpm run check` 全部通过（ESLint 0 error + tsc 0 error + Prettier 格式校验通过）

## 7. 与旧站（E:\02-项目\Saidao）的契约

- REST 基址 `https://api.saidao.cc`、N8N `https://n8n.saidao.cc`、WS `wss://api.saidao.cc`——全部走 `src/config.ts`（`NEXT_PUBLIC_*` 环境变量），禁止硬编码（旧站 player.js 硬编码域名的教训）。

### env 文件统一管理（新增配置必须遵循）

- 所有需配置项一律收敛到 `.env` 文件；`src/config.ts` 是**唯一 `process.env` 读取点**（zod `EnvSchema` 启动校验，缺变量 fail-fast）。
- 文件分工：`.env.example`（模板，提交）/ `.env.development` / `.env.production`（分环境默认值，提交）/ `.env.local`、`.env.*.local`（本地覆盖，gitignore）。
- 新增环境变量三步：① 同步 `.env.example` → ② `EnvSchema` 加字段 → ③ 代码只从 `config` 对象读取；禁止在其他文件读 `process.env` 或硬编码地址/开关。
- `NEXT_PUBLIC_*` 会内联进客户端 bundle，**禁止放敏感值**。
- 详情与完整变量清单见 `docs/plans/refactor/01-project-init.md` §2.7。
- 响应契约、WS 消息契约、认证契约（裸 token、fp 头、query 传参）以 `docs/api/` 与 `docs/schema/openapi.yaml` 为准，**不得假设后端行为**。
- 后端数据陷阱（必须特判）：
  - `Saidao.status` 是 number（1=直播中）；`PlayerInfo.status` 是 string（"1"=开播）。
  - `PlayerInfo.m3u8` 未开播时是字符串 `"null"`，必须特判为无流。
  - `UserDetail.registerDate` 是日期字符串（如 `"2026-01-30"`），直接格式化展示，禁止 ×1000。
  - `DailyReport.update_time` 是 Unix 秒。
  - `Saidao.notShow=true` 语义是"用户不想看 TA"（反向语义），UI 文案按"不想看"处理。
  - 掰头倒计时必须以 `serverTime` 校准本地时钟差。
  - 后端 500 可能回显 SQL 堆栈，Toast 展示时截断到 80 字符并附"稍后重试"。

## 8. 文档索引

| 文档                                          | 内容                          |
| --------------------------------------------- | ----------------------------- |
| `docs/plans/refactor/README.md`               | 重构方案总览与导航            |
| `docs/plans/refactor/01-project-init.md`      | 项目初始化与工程规范          |
| `docs/plans/refactor/02-api-layer.md`         | API 层与类型系统设计          |
| `docs/plans/refactor/03-state-ws.md`          | 状态管理与 WebSocket 实时通信 |
| `docs/plans/refactor/04-routing-pages.md`     | 路由、布局与页面重构          |
| `docs/plans/refactor/05-heroui-components.md` | HeroUI 组件库集成与组件重构   |
| `docs/plans/refactor/06-quality.md`           | 性能、代码规范与质量保障      |
| `docs/plans/refactor/07-roadmap.md`           | 重构任务清单与实施路线图      |
