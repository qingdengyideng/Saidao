# 06 — 性能优化、代码规范与质量保障

> 目标：将 vercel-react-best-practices 70 条规则、web-interface-guidelines 与测试/CI 要求落到本项目具体代码位置，给出 bundle 预算、降级链保留表、风险清单。

---

## 1. Vercel 性能规则落点清单（按类别映射到本项目）

### 1.1 消除瀑布（CRITICAL）

| 规则 | 本项目落点 |
|---|---|
| `async-parallel` | 主页客户端初始数据：`Promise.all([notice, saidaoList, dailyReportList, chatPolls(if 登录)])` 并行；禁止串行 await |
| `async-cheap-condition-before-await` | SWR key 先判登录态（`isLoggedIn ? key : null`）再发请求；PreviewPlayer 先判 `isTouch` 再挂引擎 |
| `async-defer-await` | 弹窗打开时才 await 对应数据（UserDetailModal 打开才调 userDetailApi） |
| `async-suspense-boundaries` | 主页 `<Suspense fallback={<CardsSkeleton/>}>` 包裹卡片网格；播放页状态层独立 Suspense |
| `async-dependencies` | 播放器：playerInfo 与 player WS 无依赖并行建连（开播后） |

### 1.2 Bundle 优化（CRITICAL）

| 规则 | 本项目落点 |
|---|---|
| `bundle-dynamic-imports` | **xgplayer（含插件）/ hls.js / mpegts.js / virtua / FingerprintJS** 全部 `next/dynamic` 或 `await import()` 懒加载：xgplayer/hls.js 仅 PreviewPlayer/VideoPlayer 挂载时 import；FingerprintJS 模块级 `load()` 但首屏不阻塞（`requestIdleCallback` 预热） |
| `bundle-barrel-imports` | lodash-es 按路径（`lodash-es/debounce`）——eslint `no-restricted-imports` 强制；dayjs 插件显式 `extend` |
| `bundle-conditional` | video-request 组件 `next/dynamic`（默认不渲染但代码分割独立 chunk）；ChatMoments/ChatPolls 覆盖层懒加载（首次打开才 import） |
| `bundle-defer-third-party` | FingerprintJS 在 `requestIdleCallback` 中初始化；不引入 Lottie 运行时（动效全走 HeroUI CSS + Tailwind，见 01 §6.2） |
| `bundle-preload` | 卡片 hover 时 `preload` 播放页 chunk（`useRouter` prefetch）；封面图 `loading="lazy"` + 首屏 4 张 `priority` |

**bundle 预算（M6 验收，`next build` 分析）**：

| chunk | 预算（gzip） | 内容 |
|---|---|---|
| 首屏主 chunk（主页） | ≤ 170KB | React + Next + HeroUI 首屏组件 + zustand + swr + dayjs |
| 播放 chunk | ≤ 80KB（不含引擎） | player 组件 |
| xgplayer 引擎（懒） | ≤ 250KB gzip | xgplayer + hls/flv/mp4 插件，单独 chunk（播放页首访才加载） |
| hls.js（懒，回退） | ≤ 50KB gzip | 单独 chunk（仅 xgplayer 不可用时加载） |
| mpegts.js（懒，回退） | ≤ 100KB gzip | 单独 chunk（仅 xgplayer 不可用时加载） |
| 聊天 chunk（emoji/voice/moments/polls） | ≤ 60KB | 覆盖层懒加载 |

> 旧站对比：旧站 f25154c 前用 hls.js + mpegts.js + flv.js 三库 CDN 全量 ~350KB；f25154c 起换本地 xgplayer 3.0.26（xgplayer-hls/flv/mp4，MIT）。新站采用 **xgplayer 主引擎 + hls.js/mpegts.js 回退链**（决策 D2 更新），flv.js 仍不引入；主路径下 hls/mpegts chunk 不加载，回退时才按需取用。

### 1.3 服务端性能（HIGH）

| 规则 | 本项目落点 |
|---|---|
| `server-hoist-static-io` | manifest/robots 用 Next 约定式路由静态化；`/sponsor` `force-static` |
| `server-serialization` | RSC 不传业务数据到客户端（数据全客户端获取——本项目 RSC 只传布局，天然满足） |
| `server-no-shared-module-state` | 模块级单例仅限 socket/fingerprint（客户端）；RSC 层无可变模块状态 |

### 1.4 客户端数据获取（MEDIUM-HIGH）

| 规则 | 本项目落点 |
|---|---|
| `client-swr-dedup` | 全部 REST 走 SWR（去重 + 缓存 + 轮询）；WS 驱动 `mutate` 复用同 key |
| `client-event-listeners` | matchMedia/resize 监听收敛到 `useIsMobile`/`useChatWidth` 单 hook（模块级 Set 去重） |
| `client-passive-event-listeners` | 滚动监听 `{ passive: true }`（ChatMessageList 粘底判定） |
| `client-localstorage-schema` | zustand persist `version: 1` + `migrate`；白名单 key；读取集中到 persist 配置（禁止散落 `localStorage.getItem`） |

### 1.5 重渲染优化（MEDIUM）

| 规则 | 本项目落点 |
|---|---|
| `rerender-memo` | `SaidaoCard`、`ChatMessageItem` `React.memo`（props：数据对象 + 稳定回调） |
| `rerender-derived-state` | 组件订阅派生值（`messages.length`、`canCreate`），不订阅 `messages` 全量（列表组件除外——它必须订阅全量但用虚拟化控制渲染量） |
| `rerender-derived-state-no-effect` | 排序/过滤在 render useMemo；禁止 effect 同步派生状态 |
| `rerender-functional-setstate` | store action 内 `set((s) => ...)` 函数式更新 |
| `rerender-lazy-state-init` | 大对象初始化（波形数组预分配）`useState(() => ...)` |
| `rerender-use-ref-transient-values` | 弹幕队列、滚动位置、录音计时用 ref |
| `rerender-no-inline-components` | 禁止组件内定义组件；子组件提取文件级 |
| `rerender-transitions` | tab 切换、侧栏展开用 `startTransition`（非紧急更新不阻塞输入） |
| `rerender-split-combined-hooks` | `useChatSocket`（ws 生命周期）与 `useChatVisibility`（展示裁剪）分离 |

### 1.6 渲染性能（MEDIUM）

| 规则 | 本项目落点 |
|---|---|
| `rendering-hoist-jsx` | 静态 JSX（空态图标、标签模板）提模块级 |
| `rendering-conditional-render` | 三态用三元（loading ? Skeleton : error ? Alert : content），不用 `&&` 拼 |
| `rendering-usetransition-loading` | 输入框发送中 Spinner 用 useTransition isPending |
| `rendering-content-visibility` | 长列表兜底（虚拟化不可用场景）`content-visibility: auto` |
| `rendering-resource-hints` | `next/font` 自动 preload；API 域 `<link rel="preconnect" href="https://api.saidao.cc">` + `rustfs.saidao.cc`（根布局 metadata.other） |
| `rendering-script-defer-async` | 无手写 script；内联主题 script 走 `next/script beforeInteractive` |
| `rendering-hydration-no-flicker` | 主题防闪烁内联 script（05 §4） |

### 1.7 JavaScript 性能（LOW-MEDIUM）

| 规则 | 本项目落点 |
|---|---|
| `js-set-map-lookups` | 屏蔽判定 Set；消息去重 Map；热词去重 Set |
| `js-hoist-regexp` | 表情白名单 RE、BV 正则、关键词 RegExp[] 预编译（store 层） |
| `js-combine-iterations` | 消息裁剪 + 计数单趟遍历 |
| `js-early-exit` | socket onMessage 路由先判 type 再取字段 |
| `js-request-idle-callback` | fingerprint 预热、SW 注册 |
| `js-batch-dom-css` | 弹幕 200ms flush；波形更新 rAF 合帧 |

### 1.8 高级模式（LOW）

| 规则 | 本项目落点 |
|---|---|
| `advanced-init-once` | socket 单例、fingerprint 单例（模块级） |
| `advanced-event-handler-refs` | 聊天发送 handler 存 ref（socket 实例变化时不重建 handler） |
| `advanced-use-latest` | 风控流程中 pendingMessage 用 ref 保持最新（避免闭包陈旧） |

## 2. 旧站性能降级链保留表（必须 1:1 保留）

| 降级策略 | 旧站位置 | 新站落点 |
|---|---|---|
| 触屏不自动预览 | app.js | `useIsTouch()` → PreviewPlayer 不自动挂载 |
| HLS/FLV 库不可用降级 | player.js | `Hls.isSupported()` / `Mpegts.isSupported()` 判定 → 不可用提示「浏览器不支持，请去源站」 |
| 弹幕车道全占丢弃 + 节点上限 60 | player.js | DanmakuLayer 车道算法（同参数） |
| 弹幕队列上限 500 / 200ms flush / 5s 延迟 | player.js | player-socket（03 §3.4） |
| 评论 200 条裁剪 | player.js | CommentPanel |
| 消息 DOM 上限 1000 / 屏蔽缓冲 500 | app.js | ChatStore（03 §2.2） |
| 热词最多 8 chip | app.js | HotWordsBar |
| 语音 1~60s | app.js | VoiceRecorder |
| 表情/图片 ≤2MB 前端预检 | app.js | 上传前置 `file.size > 2 * 1024 * 1024` 拦截 + Toast |
| 轮询节奏（掰头 15s / 时间线 60s / 播放器 10s 重试） | 各处 | SWR refreshInterval / playerStore.retry（03/04 已定） |
| 低端设备 reduced-motion | index.html 内联检测 | `prefers-reduced-motion` + deviceMemory/hardwareConcurrency 检测 → `useReducedMotion()` hook（关闭 marquee/弹幕动画） |

## 3. 测试策略

### 3.1 分层

| 层 | 框架 | 覆盖对象 | 里程碑 |
|---|---|---|---|
| 纯函数单测 | vitest + vitest（node 环境） | `content-parser`（**注入用例必测**）、`voice-utils`（波形/MIME）、`date utils`（秒/毫秒换算）、`ws-message-types` parse、`polls 倒计时校准`、BV 正则、webhook 前缀白名单 | M1 起增量 |
| 组件测试 | @testing-library/react + jsdom | 关键交互：LoginModal 提交流程、ChatPolls 倒计时/投票、SaidaoCard「不想看 TA」、content-parser 渲染（text/emoji/注入降级） | M3/M5 |
| 集成（手动） | 浏览器 | 里程碑回归清单（07 §4） | 每里程碑 |

### 3.2 不做的测试（控制成本）

- 不做 E2E（Playwright）——旧站无基线，MVP 阶段手动回归足够；M6 后可选引入。
- 不测 HeroUI 组件内部。
- snapshot 测试禁用（脆弱）。

## 4. CI 检查项（每个 PR）

```
1. pnpm install --frozen-lockfile
2. pnpm run typecheck          # tsc --noEmit
3. pnpm run lint               # eslint（no-explicit-any / import/no-cycle / no-relative-parent-imports）
4. pnpm run format:check       # prettier
5. pnpm run test               # vitest
6. pnpm run build              # next build（Turbopack 构建、bundle 警告）
7. bundle 预算检查（M6 后接入 size-limit 或 build 产物脚本）
```

本地 `pre-commit`（husky + lint-staged，经 `pnpm` 安装 devDeps）：对暂存 ts/tsx/css 跑 `eslint --fix` + `prettier --write`。

## 5. 代码规范执行机制

| 规范 | 执行手段 |
|---|---|
| 禁 any / 禁 ignore | eslint `no-explicit-any` error + tsconfig strict |
| 禁组件内 fetch/裸 axios / 路径散落 | 代码评审 + `src/api` 外 grep 路径字符串（CI 可选脚本） |
| 禁 `<div onClick>` | 评审清单（05 §8）；可加 eslint-plugin-jsx-a11y（`click-events-have-key-events`） |
| 禁行内 style / transition:all | 评审清单 + stylelint（可选，M6） |
| import 规范 | eslint-plugin-import（no-cycle error / no-relative-parent-imports error / order warn） |
| 命名/目录 | 评审清单（AGENTS.md §1.5） |
| 提交信息 | commitlint（Conventional Commits，M0 引入 husky） |

## 6. 已知风险与后端协作项（非阻塞，需同步）

| # | 风险 | 影响 | 前端对策 | 后端协作项 |
|---|---|---|---|---|
| R1 | 500 错误回显 SQL 堆栈 | 信息泄露 + Toast 丑 | message 截断 80 字符（02 §2） | 后端屏蔽堆栈，只回业务 message |
| R2 | token 裸存 localStorage + 无 Bearer 前缀 | XSS 可窃取 token；与标准不符 | 保持契约不变（迁移成本）；CSP 降低 XSS 面 | 支持 `Bearer` 前缀 + httpOnly cookie（可选升级，需 CORS 改造） |
| R3 | `m3u8` 未开播返回字符串 `"null"` | 播放崩溃 | 特判归一化（02 §3.5） | 返回 null |
| R4 | `Saidao.status` number vs `PlayerInfo.status` string | 状态判定错误 | 类型层区分（z.number() vs z.string()） | 统一类型 |
| R5 | 赞助收款码写死本地图片 | 换码需发版 | 暂用本地（M6 后后端下发 URL） | 提供收款码接口 |
| R6 | 后端 401 响应体不统一（部分无包裹） | 解析异常 | http-client 容错（res.status 优先） | 统一 401 响应 |
| R7 | WS 无显式心跳帧 | 半开连接难检测 | reconnecting-websocket 自带 ping 探测（`reconnectInterval` + 浏览器 close 事件）；可选加客户端 30s ping（若后端支持） | 确认是否支持 ping/pong |
| R8 | videoSync 废弃多端漂移 | 点播体验（如启用） | 启用时忽略 videoSync（同旧站） | 后端确认废弃 |
| R9 | `fp` 头后端容忍度未知（未就绪时缺失） | 风控降级 | fingerprint 预热尽早；缺失不阻塞请求 | 确认 fp 缺失行为 |
| R10 | 深色模式 `<meta theme-color>` 固定单值 | 暗色下地址栏色差 | manifest 多 theme_color（light/dark media）+ 客户端动态更新 meta | - |

## 7. 安全清单（对照 web-interface-guidelines + 注入面）

- [ ] 全代码 `dangerouslySetInnerHTML` 计数 = 0（唯一例外 content-parser 内部且单测覆盖）
- [ ] 外链 `rel="noopener noreferrer"`（日报 link / 主播 url / 源站）
- [ ] 上传文件类型 + 大小前端预检（image/* ≤2MB；webm/mp4 ≤ 录音时长限制）
- [ ] CSP 头（Next headers 配置）：`default-src 'self'; img-src 'self' data: https://rustfs.saidao.cc https://ali2.a.yximgs.com https://cdnl.iconscout.com; media-src 'self' blob: https://rustfs.saidao.cc; connect-src 'self' https://api.saidao.cc https://n8n.saidao.cc wss://api.saidao.cc; script-src 'self' 'unsafe-inline'`（theme 内联 script 需要 unsafe-inline，可后续 nonce 化）。**风险登记**：CSP（构建期 next.config headers）与 `next.config.ts` 的 `images.remotePatterns` 是构建期静态配置，无法读取运行时 env，其域名与 `NEXT_PUBLIC_IMAGE_HOSTS` / `NEXT_PUBLIC_API_BASE` 等存在"env 与构建期配置双份"的同步风险——修改 env 域名时必须同步改 `next.config.ts`（M6 可加 CI 脚本比对两处域名一致性）
- [ ] `target="_blank"` 全部带 rel
- [ ] 正则输入（keywordPatterns）`new RegExp` try-catch 包裹（防用户输入 DoS/非法语法）
- [ ] 雪花 ID 用 string 传输（JS number 精度陷阱——旧站已 string，保持）

## 8. M6 验收清单（质量收口）

- [ ] `pnpm run build` 0 warning；bundle 预算达标（§1.2）
- [ ] Lighthouse（mobile）：Performance ≥ 85、Accessibility ≥ 95、Best Practices ≥ 95、SEO ≥ 90
- [ ] vitest 全绿；content-parser 注入用例 ≥ 5 条
- [ ] 里程碑全量回归通过（07 §4）
- [ ] PWA 安装 + 图标 + 缓存策略验证（DevTools Application）
- [ ] `prefers-reduced-motion` 全局生效（系统设置开启后动画全部静止）
- [ ] 暗色模式全页面无白块/对比度不足（WCAG AA 4.5:1 关键文本抽检）
- [ ] 旧站对照：支付二维码、logo、PWA 图标资源迁移完整（01 §6.1 清单 6 项逐一核对）
- [ ] AGENTS.md §6 提交自查清单 100% 通过
