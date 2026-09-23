# Saidao-next 前端重构方案（总览）

> 重构对象：`E:\02-项目\Saidao`（纯原生 JS 静态站，无构建）
> 目标形态：Next.js 16 App Router（Turbopack）+ TypeScript(strict) + HeroUI v3 + Tailwind v4 的现代化 PWA 应用
> 配套规则：[AGENTS.md](../../AGENTS.md)（开发期间的强制性规则，所有方案以此为准）

---

## 1. 重构目标

1. **工程化**：从零建立构建、类型检查、lint、格式化、测试、PWA 完整工程链路（旧站完全没有）。
2. **组件化**：将 169KB 的 `app.js` + 15 个全局 JS 拆分为职责清晰的 React 组件树与模块化 lib。
3. **类型安全**：全接口类型化（zod schema + `z.infer`），禁止 `any`，运行时校验 + 编译期推导双层防线。
4. **状态收敛**：`window.SaidaoState` 全局可变对象 → zustand 分域 store，单向数据流。
5. **实时通信统一**：双份手写 WS 逻辑（app.js / chat-room.js）→ 基于 `reconnecting-websocket` 的统一 socket 层。
6. **UI 现代化**：全部 UI 用 HeroUI v3 组件 + Tailwind v4 原子类，设计 token 化，深色模式/无障碍达标（对照 web-interface-guidelines）。
7. **性能达标**：消除渲染瀑布、控制 bundle（播放器库懒加载）、长列表虚拟化、PWA 缓存策略保留并升级。

## 2. 非目标（明确不做）

- 不改后端 API（契约冻结：裸 token 无 Bearer、fp 头、WS query 传参、统一包裹 `{code,message,data}`）。
- 不做 i18n（产品仅中文）。
- 不做真离线（PWA 仅保留资源缓存 + 安装能力，与旧站一致）。
- 视频点播室（video-request）**默认保留接口与 store 骨架，UI 不启用**（旧站已被注释禁用），启用与否作为独立决策项（见 07 文档 M6）。
- 不做用户端埋点系统（保留 click 上报接口即可）。

## 3. 技术栈决策摘要

| 关注点 | 决策 | 理由（对照 AGENTS.md §0） |
|---|---|---|
| 框架 | Next.js 16 App Router（Turbopack 默认构建器） | 用户指定；SSR/RSC 用于主页 SEO（直播列表可被索引）、路由约定清晰；Turbopack 构建 2–5× 提速 |
| 数据获取 | RSC 直取（无鉴权数据）+ SWR（鉴权数据/客户端） | Next 官方推荐；SWR 轻量且自带去重 |
| 状态 | zustand 6 个分域 store | 用户指定；聊天消息流高频更新，zustand 选择器订阅避免全树 rerender |
| UI | HeroUI v3（无 Provider、复合组件、onPress、语义 variant） | 用户指定；v3 已内置 CSS 动画，免 framer-motion |
| 表单 | zod + HeroUI TextField + 手动状态 | 表单数量少（登录/注册/资料/改密/投票/屏蔽），引入 RHF 收益不大 |
| 图标 | lucide-react | 替代 Font Awesome CDN，可 tree-shaking |
| WS | reconnecting-websocket 封装 | 用户指定；旧站手写重连有竞态 bug（`socket !== currentSocket` 保护散落在多处） |
| 播放 | xgplayer 3.x（hls/flv/mp4 插件）主引擎 + hls.js/mpegts.js 回退链 | 旧站 f25154c 起线上即 xgplayer 3.0.26，主引擎对齐线上行为；回退链保留旧降级能力；flv.js 不再引入 |
| PWA | 原生 SW + `src/app/manifest.ts`（workbox 运行时库） | Next 16 默认 Turbopack，`@ducanh2912/next-pwa` 的 webpack 插件机制会破坏构建；原生方案保留旧站缓存策略（3 前缀/160 条）且零构建期依赖，见 01 §5 |
| 校验 | zod（运行时）+ TS（编译时） | 用户要求"尽可能避免 any + 利用类型推导"的核心手段 |
| HTTP 客户端 | axios（`src/api/http-client.ts` 统一封装） | 用户指定；拦截器统一处理 fp/401/超时，替代旧站散落 fetch；禁止组件内裸 fetch |
| 包管理 | pnpm（直接编辑 package.json + `pnpm install` 一次性安装） | 用户指定；lockfile 锁定、安装快、node_modules 硬链接省空间；禁止逐个 `pnpm add` |

## 4. 方案文档导航

| 文档 | 解决的问题 | 关键产出 |
|---|---|---|
| [01-project-init.md](./01-project-init.md) | 如何从零建立工程 | 脚手架命令、依赖清单（pnpm）、tsconfig/eslint/prettier/postcss 完整配置、env 文件统一管理（.env.example/.env.development/.env.production + zod 校验的 config.ts）、目录结构、pnpm scripts |
| [02-api-layer.md](./02-api-layer.md) | 接口如何统一管理 + 全类型化 | http-client 设计（axios 拦截器：fp/token/解包/401/超时）、zod schema 全集、37 个接口的类型签名、错误模型 |
| [03-state-ws.md](./03-state-ws.md) | 状态与实时通信如何重构 | 6 个 zustand store 切片设计、WS 消息类型联合、socket 生命周期、captchaRequired 风控流程、屏蔽缓冲、WS→store 数据流 |
| [04-routing-pages.md](./04-routing-pages.md) | 页面/路由/布局如何组织 | 路由表、RSC 边界划分、每个页面的组件树与数据获取策略、弹窗（modal）路由化决策、PWA manifest |
| [05-heroui-components.md](./05-heroui-components.md) | 组件如何用 HeroUI 重构 | 组件清单与 HeroUI 映射表、每个业务组件的 props 接口、自定义组件（播放器/弹幕/波形）设计、主题 token、无障碍清单 |
| [06-quality.md](./06-quality.md) | 性能与质量如何保障 | Vercel 70 条规则在本项目的落点清单、bundle 预算、性能降级链保留表、测试策略、CI 检查项、已知风险与后端协作项 |
| [07-roadmap.md](./07-roadmap.md) | 按什么顺序做、怎么验收 | 7 个里程碑 M0–M6、任务清单（含验收标准）、风险决策项、回归测试清单 |

## 5. 旧站 → 新站 模块映射总表

| 旧站资产 | 新站落点 |
|---|---|
| `config.js`（SaidaoConfig/SaidaoState） | `src/config.ts`（常量）+ zustand stores（状态） |
| `api.js`（request + ApiEndpoints，37 接口） | `src/api/*.ts` + `src/api/http-client.ts` + `src/types/api/*.ts` |
| `app.js`（主应用 ~4300 行） | 拆入 `components/saidao` + `components/chat` + `components/layout` + stores |
| `chat-room.js`（重复的聊天逻辑） | **废弃**，统一并入 `components/chat` + `stores/useChatStore`（单一实现，旧站双份逻辑的债） |
| `chat-input-utils / chat-quote-utils / chat-voice-utils / chat-link-preview` | `src/lib/chat/*`（纯函数）+ 对应组件 |
| `sliding-captcha.js`（绕过统一 fetch） | `src/api/captcha.ts`（纳入统一 http-client）+ `components/chat/SliderCaptcha.tsx` |
| `chat-moments.js` | `components/chat/ChatMoments.tsx` + SWR |
| `chat-polls.js` + `battle-ui.js` | `components/chat/ChatPolls.tsx`（含阵营徽章，合并） |
| `video-room.js` | `components/video-request/*` + `stores/useVideoRequestStore`（默认不渲染） |
| `player.js`（播放+弹幕+评论 WS） | `components/player/*` + `src/lib/media/*` + `src/lib/ws/player-socket.ts` |
| 原生 PWA（manifest.json + service-workV3.js） | `src/app/manifest.ts` + `public/service-worker.js`（workbox 运行时）+ `src/lib/pwa/*` |
| Font Awesome CDN | lucide-react |
| 手写 CSS（6 个 css + 行内 style） | Tailwind v4 + HeroUI token（CSS 变量） |
| `window.Toast` / 全局 loading | HeroUI `useToast` + HeroUI `Spinner`/`Skeleton` |
| 8 个 `.modal` 弹窗 | HeroUI Modal/Dialog + `components/account/*` 等（见 04 文档弹窗策略） |

## 6. 核心架构一图流

```
┌────────────────────────────── app/ (路由层, RSC) ──────────────────────────────┐
│  page.tsx(主页: SaidaoList ‖ ChatSidebar)   player/[uid]   sponsor            │
└──────────────┬──────────────────────────────────────────────────────────────────┘
               │ 组合
┌──────────────▼─────────────────── 组件层 (Client Components) ──────────────────┐
│  saidao/*   chat/*   player/*   account/*   layout/*   video-request/*         │
│  └─ 一律 HeroUI v3 组件 + Tailwind 原子类；原生元素仅限播放器/弹幕/波形          │
└──────┬───────────────────────────────┬─────────────────────────────────────────┘
       │ 读写                          │ 调用
┌──────▼──────────────┐        ┌───────▼────────────────────────────────────┐
│ stores/ (zustand)   │◄───────│ lib/ws/ (reconnecting-websocket 封装)       │
│ auth chat saidao    │  事件   │  ├─ chat-socket: 重连/心跳/竞态保护/消息分发 │
│ player ui videoReq  │        │  └─ player-socket: 弹幕队列/延迟入队         │
└──────┬──────────────┘        └───────┬────────────────────────────────────┘
       │ 持久化(localStorage)          │ 消息
┌──────▼──────────────┐        ┌───────▼────────────────────────────────────┐
│ lib/fingerprint.ts  │        │ api/ (唯一接口层: http-client + 模块函数)    │
│ (fp 设备指纹)        │        │  └─ types/api/*.ts (zod schema + z.infer)   │
└─────────────────────┘        └────────────────────────────────────────────┘
```

**数据流原则**：WS 是实时数据的唯一事实来源（消息/在线数/热词/卡片变更）；REST 只负责首屏初始数据与写操作；store 是组件间唯一共享状态通道；组件不直接 import 其他组件。

## 7. 里程碑概览（详见 07）

| 里程碑 | 内容 | 完成标志 |
|---|---|---|
| M0 | 工程初始化 | `pnpm run dev/build/lint/typecheck` 全通，首页可渲染 |
| M1 | API 层 + 类型 + 认证 | 37 接口全类型化，登录/登出/401 流程通 |
| M2 | 主页（卡片列表 + 筛选 + 日报） | 主页静态+数据流完整，RSC 首屏 |
| M3 | 聊天室（WS + 消息 + 表情 + 语音） | 实时聊天闭环，含风控验证 |
| M4 | 播放页（播放器 + 弹幕 + 评论） | 播放页全功能，降级链验证 |
| M5 | 账号体系 + 管理功能 + 投票/时间线 | 全部弹窗与权限位功能 |
| M6 | PWA + 性能优化 + 质量收口 | 安装可用、bundle 达标、回归全绿 |

## 8. 决策记录（ADR 摘要）

1. **D1：不做 RSC 全量 SSR 登录态**——主页的 `GET /saidao/` 需要鉴权（401 时游客看不了），因此主页列表走"游客可见的公开数据兜底 + 客户端 SWR"策略：RSC 不请求鉴权接口，避免 SSR 泄露 token 问题。鉴权数据统一客户端获取。（详细推导见 04 §2）
2. **D2：播放器主引擎选 xgplayer，hls.js/mpegts.js 降为回退链**——旧站 f25154c 起线上播放内核已从三库 CDN（hls.js/mpegts.js/flv.js）换为本地 xgplayer 3.0.26（xgplayer-hls/flv/mp4，MIT）；新站主引擎对齐线上行为（含有声优先/静音重试、tap-play 音量恢复、HLS 404 源判定、destroy 保 <video> 节点与音量状态），hls.js（m3u8）/ mpegts.js（FLV/HEVC）保留为回退链（xgplayer 初始化失败/异常时），flv.js 仍不引入。
3. **D3：表单不引 react-hook-form**——本项目表单 ≤ 7 个且结构简单，zod 校验 + 手动状态足够，减少一层依赖。
4. **D4：token 继续存 localStorage**——与旧站一致，迁移无感；httpOnly cookie 方案需要后端配合改造 CORS，列为"后端协作项"而非阻塞项（见 06 §6）。
5. **D5：video-request 保留骨架不启用 UI**——与旧站行为一致（已注释禁用），接口/store/WS 分支保留，启用时只需恢复渲染入口（见 07 M6 决策项）。
6. **D6：聊天表情 content 白名单解析**——后端契约是 `<img>` HTML，前端必须解析而非整体 innerHTML；白名单解析器是安全关键路径，必须有注入用例单测（见 02 §5、06 §3）。
7. **D7：PWA 弃用 `@ducanh2912/next-pwa`，改原生方案**——Next 16 默认构建器为 Turbopack，该库通过 `withPWA` 注入 webpack 插件（GenerateSW），自定义 webpack 配置会导致 `next build` 直接失败。改为 `src/app/manifest.ts`（Next 约定式路由）+ 手写 `public/service-worker.js`（workbox 运行时库）+ `src/lib/pwa/sw.ts` 客户端注册，缓存策略 1:1 保留旧站（见 01 §5）。
8. **D8：Next 16 动态 API 强制异步**——`params`/`searchParams` 一律 `await`，`cookies()`/`headers()`/`draftMode()` 一律 `await`（16 无同步兼容模式，违反直接构建报错）。播放页 `src/app/player/[uid]/page.tsx` 是本项目唯一用到 `params` 的 Server Component 入口，须 `const { uid } = await params`；客户端组件内用 `React.use()` 解包（见 AGENTS.md §2.2）。
9. **D9：HTTP 客户端选 axios，不封装原生 fetch**——axios 拦截器统一注入 fp/Authorization 头、解包 ApiEnvelope、401 回调、超时（timeout 配置），比手写 fetch 封装少 ~60 行样板代码且生态成熟；唯一例外 `playerInfoApi` 同样用 axios 实例（无包裹特判在响应拦截器外处理）。
10. **D10：包管理选 pnpm，依赖统一编辑 package.json 后一次性安装**——pnpm lockfile 保证环境可复现、硬链接 node_modules 省磁盘；安装依赖时直接修改 `package.json` 的 dependencies/devDependencies，再 `pnpm install`，避免逐个 `pnpm add` 导致 lockfile 多次变动与版本漂移。
