# 05 — HeroUI 组件库集成与组件重构

> 目标：全部 UI 用 HeroUI v3 组件 + Tailwind v4 原子类；明确每个业务组件的 props 接口；自定义组件（播放器/弹幕/波形）的设计与边界；主题 token 映射旧站色板。
> 约束：HeroUI **v3**（无 Provider、复合组件、onPress、语义 variant）；实现任何组件前先拉官方文档核对 API（skill 脚本 `get_component_docs.mjs`）。

---

## 1. HeroUI v3 集成规范（硬性）

| 项 | 规范 |
|---|---|
| Provider | **无**（v3 不需要 `<HeroUIProvider>`） |
| 导入 | 一律 `import { Button, Card } from "@heroui/react"`（根导入，允许且推荐） |
| 组件写法 | 复合：`<Card><Card.Header/><Card.Body/></Card>`；禁止 v2 扁平 props |
| 事件 | 交互组件用 `onPress`（Button/DropdownItem/Menu 等）；输入类用 `onChange`/`onPressEnter` |
| variant | `primary`/`secondary`/`tertiary`/`ghost`/`outline`/`danger`；禁止裸颜色类表达按钮语义 |
| 尺寸 | `size="sm"|"md"|"lg"` 语义化，禁止自造高度（特殊场景除外并注释） |
| 样式扩展 | `classNames={{}}` / `classNames` 覆盖点 + Tailwind 原子类；禁止修改组件内部 DOM |
| 动画 | HeroUI 自带 CSS 动画（Modal/Popover 进出场）；自定义动画只动 transform/opacity + 响应 `prefers-reduced-motion` |
| 文档 | 实现前 `node .trae/skills/heroui-react/scripts/get_component_docs.mjs <Name>` 拉最新 MDX |

## 2. 通用 UI 薄封装层（`src/components/ui/`）

对 HeroUI 做**默认值 + a11y + 品牌一致性**的薄封装（不造功能，只固化约定），业务组件只 import 封装层：

| 封装 | 基于 | 固化内容 |
|---|---|---|
| `UiButton` | Button | 默认 `size="sm"`；`isIconOnly` 时必须传 `aria-label`（类型强制：`isIconOnly` 为 true 时 label 必填） |
| `UiIconButton` | Button(isIconOnly) | 图标按钮统一入口，label 必填 |
| `UiCard` | Card | 统一 padding/radius token |
| `UiModal` | Modal + ModalContent | 统一 header 样式、`overscroll-behavior: contain`、ESC/遮罩关闭、标题 `id` 关联 `aria-labelledby` |
| `UiConfirm` | Modal（danger 按钮） | 二次确认弹窗（破坏性操作统一入口）：title/description/confirmText/onConfirm/isLoading |
| `UiTextField` | Input | 默认 `size="md"`、错误态 `isInvalid + errorMessage`、`spellCheck={false}`（email/code/用户名场景） |
| `UiTextarea` | Textarea | 同上传；自适应高度逻辑外置 |
| `UiSkeleton` | Skeleton | 列表骨架统一节奏 |
| `UiEmpty` | 组合（图标 + 文案 + 操作按钮） | 空态统一组件（列表空/无权限/无直播） |
| `UiBadge` | Badge | 计数/状态徽章（红点 = `dot`） |
| `UiAvatar` | Avatar | 头像统一（fallback 首字母、size 档位） |

> 薄封装文件内**禁止写业务逻辑**；每个封装 ≤ 60 行。

## 3. 业务组件清单与 HeroUI 映射（全量）

### 3.1 layout（`components/layout/`）

| 组件 | HeroUI 基础 | 关键 props / 说明 |
|---|---|---|
| `Header` | Container + 布局 | logo/NoticeBar/操作区组合；sticky top + `z-50`；`safe-area-inset-top` |
| `NoticeBar` | 自定义滚动区 + Link | SWR notice；marquee（`prefers-reduced-motion` 静止）；空公告不渲染 |
| `ThemeToggle` | UiIconButton(Sun/Moon) | 切换 uiStore.theme；`aria-label` |
| `UserMenu` | Dropdown + DropdownMenu + Avatar | 头像触发；菜单：个人资料/修改密码/退出（退出走 UiConfirm） |
| `PwaInstallPrompt` | Button | `beforeinstallprompt` 后显示；accepted Toast；dismissed 10s 重显 |
| `ChatSidebar` | 自定义容器（拖拽手柄 + 内容） | 桌面 250~600px 拖拽（`role="separator"` 键盘可达）；移动端全屏覆盖 |

### 3.2 saidao（`components/saidao/`）

| 组件 | HeroUI 基础 | 说明 |
|---|---|---|
| `FilterTabs` | SegmentedControl（或 Tabs） | 直播中/全部/抽象日报；URL `?tab=` 同步（qs 解析） |
| `SaidaoGrid` | grid 布局（`grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`） | useMemo 排序（直播优先 + hotScore 降序）；notShow 过滤；Suspense 内 Skeleton |
| `SaidaoCard` | Card + Image + Badge + DropdownMenu | 封面（next/image，aspect-video，width/height 防 CLS）；LIVE Badge（status=1）；开播时间（dayjs fromNow）；热度 🔥（hotScore 格式化）；标签 Chip（tag + AI label）；hover/长按 → 内嵌 `PreviewPlayer`（触屏不自动预览——旧站降级链保留）；点封面 → `/player/[uid]` + `clickSaidaoApi`（fire-and-forget）；右上角 DropdownMenu「不想看 TA」（updateOptionsApi notShow=true）；canEditSaidaoTag 时「编辑标签」 |
| `DailyReportCard` | Card + Image + Link | 封面 + 标题 + 更新时间（update_time×1000，dayjs）；红点（最新 id 未读）；点击 `window.open(link)`（微信外链） |
| `PreviewPlayer` | 原生 video + 引擎层（xgplayer 优先，hls.js/mpegts.js 回退） | 懒加载（hover 后 `next/dynamic` 挂引擎）；静音自动播；失败静默降级为静态封面 |

### 3.3 chat（`components/chat/`）

| 组件 | HeroUI 基础 | 说明 |
|---|---|---|
| `ChatHeader` | 布局 + Badge + UiIconButton | 在线人数（onlineCount）；热词开关；收起/展开；移动端关闭 |
| `HotWordsBar` | Chip 组 | ≤8 个；点击 = 填入输入框；折叠 persist |
| `ChatMessageList` | virtua（Virtualizer） | 1000 条虚拟化；`key=messageId`；粘底滚动逻辑（新消息且用户已粘底 → 自动滚；否则显示「N 条新消息 ↓」按钮） |
| `ChatMessageItem` | Avatar + 自定义气泡 | 头像点击 → UserDetailModal；阵营徽章（ya 红/juan 蓝，faction）；昵称 + ipGeo + timestamp；content 走 `parseChatContent`（text/emoji/mixed）；deleted → 「消息已删除」占位；replyTo → 引用块（hover 展开上下文）；linkPreview → 预览卡（url/title）；语音 → `VoiceBubble`；管理权限（canChatBan/本人）→ 悬浮「删除」（UiConfirm） |
| `VoiceBubble` | 原生 audio + 波形 | 波形 = waveform[32] 桶渲染（div 高度，transform-only 动画）；宽度按时长（旧 getVoiceBubbleWidth 公式）；点击播放/暂停 |
| `LinkPreviewCard` | Card(small) + Link | url/title；点击新标签（noopener） |
| `ChatInput` | Textarea + 按钮组 | maxlength 256 计数（Chip 展示剩余）；Enter 发送 / Ctrl+Enter 换行；高度自适应（1~4 行）；游客 → 点发送弹登录框 |
| `EmojiPanel` | Tabs + grid | vip/animation 双 tab；SWR `["emoji", group]`；表情 item = 图片按钮（`aria-label=name`）；animation 组 `<video muted loop autoplay playsinline>` 预览（prefers-reduced-motion 时静态图）；vip「+」上传（≤2MB 预检 → uploadEmojiApi → mutate） |
| `VoiceRecorder` | 自定义面板（MediaRecorder） | 录音 1~60s 计时（>60s 自动停）；32 桶实时波形（AnalyserNode 采样）；试听/发送/取消；MIME 选择逻辑（webm;opus → webm → mp4）收敛到 `src/lib/chat/voice-utils.ts` |
| `ChatMoments` | 自定义时间线 + Card | SWR 60s；segments 卡片（start-end 时间区间 + title + summary + stats 徽章组）；anchorId → 定位对应主播 |
| `ChatPolls` | 自定义对战 UI（红蓝渐变）+ Button | 当前 poll：question + 双选项红蓝对战条（counts 比例条，transform 动画）+ 倒计时（serverTime 校准，1s tick）+ 已选 myOptions 高亮；canCreate → 创建按钮（每日 1 次/注册>3天，disabled + Tooltip 说明原因）；recent 历史折叠 |
| `CreatePollDialog` | UiModal + Textfield ×N + Select | question≤100；选项 ≥2 可增删（≤20 字）；时长 Select（5/10/30 分钟）；multiple/resultsVisible Switch |
| `ChatFilterSettings`（入口按钮）+ `ChatFilterModal` | UiModal + Switch + 列表管理 | 屏蔽游戏直播 Switch；blockedNicknames 列表（添加输入 + 删除）；keywordPatterns 正则列表（添加 + 删除 + 格式校验 `new RegExp` try）；blockedUserIds（从消息「屏蔽 TA」入口添加）；整体覆盖提交 |
| `SliderCaptcha` | UiModal + 自定义滑块 | 背景图 + 拼图块（拖拽 x 位移）；验证成功 → 回调 ticket；失败可重试；`aria` 滑块键盘 ←/→ 支持 |
| `QuotePreview` | 自定义条 | 回复预览（uname + content 截断）+ 取消按钮；点击消息「回复」入口（气泡 hover 操作区） |

### 3.4 player（`components/player/`）

| 组件 | HeroUI 基础 | 说明 |
|---|---|---|
| `PlayerStatus` | Spinner + 自定义覆盖层 | connecting（Spinner + 「连接中…」）/ waiting（「等待开播…」+ 10s 轮询提示）/ error（「连接中断」+ 倒计时重试 Ns）；文字按 guidelines 用「…」 |
| `VideoPlayer` | 原生 `<video>` + 引擎封装（`src/lib/media/engine.ts`） | 主引擎 **xgplayer 3.x**（xgplayer-hls/flv/mp4 插件，与旧站 f25154c 一致）：m3u8/FLV/mp4 均优先走 xgplayer；**回退链**：xgplayer 初始化失败/抛异常 → hls.js（`Hls.isSupported()`）/ mpegts.js（`Mpegts.isSupported()`）/ 原生 HLS（Safari）；自动播放策略对齐旧站：首次优先有声、NotAllowedError 拦截后静音重试（不覆盖用户手动选择）、tap-play 点击恢复音量（volume===0 → 0.6）、HLS 404 判定"直播源暂不可用"；`playsinline`；引擎实例生命周期与组件 effect 绑定（切流/卸载时 destroy，`retainMediaAfterDestroy` 保 `<video>` 节点并保留音量/静音状态） |
| `DanmakuLayer` | 绝对定位层 + ref 队列 | 车道制（车道全占丢弃，节点上限 60——旧站降级链）；90px/s；5s 延迟入队；200ms 批量 flush；弹幕文本纯 React 节点（**无 innerHTML**——旧站注入面修复）；`prefers-reduced-motion` 时不渲染动画（静态显示或隐藏） |
| `PlayerControls` | UiIconButton 组 + Slider | 刷新/音量（Slider + M 静音 / P 步进）/弹幕开关/PiP/全屏/去源站；全屏降级链（requestFullscreen → webkitRequestFullscreen → iOS 原生 → CSS 假全屏）收敛到 `src/lib/media/fullscreen.ts` |
| `CommentPanel` | 自定义列表（200 条裁剪）+ 按钮 | 评论与弹幕同源（player WS comments）；粘底滚动 + 「回到最新」按钮；纯文本渲染 |
| `StreamerBar` | Avatar + 文本 | 来自 playerInfo（uname/avatar/cover/status） |

### 3.5 account（`components/account/`）

| 组件 | HeroUI 基础 | 说明 |
|---|---|---|
| `LoginModal` | UiModal + UiTextField | email（autocomplete=username, spellCheck=false）+ password（autocomplete=current-password）；图形验证码（风控触发时展开：base64 图 + 输入）；登录中 Spinner；底部「分配账号」入口 |
| `AllocationCaptchaModal` | UiModal + 验证码 | 账号/密码/验证码 → allocate |
| `AllocationResultModal` | UiModal + Code | 账号 + 6 位初始密码；Copy 按钮（Clipboard API + Toast）；「仅本次显示」警示（Alert） |
| `ProfileModal` | UiModal + 表单 | 头像（UiAvatar + 上传，≤2MB 预检）；昵称（≤32）；签名（≤200）；阵营（RadioGroup ya/juan，30 天锁 disable + Tooltip）；webhook（Select 类型：dingtalk/wecom/feishu + URL TextField + 前缀白名单校验 + 「测试」按钮 → testWebhookApi → Toast 结果）；保存 → profileUpdateApi → authStore.setUser（无 reload） |
| `ChangePasswordModal` | UiModal + 双密码字段 | 新密码强度提示（可选）；成功 Toast |
| `UserDetailModal` | UiModal + 信息列表 | 头像/昵称/签名/阵营/注册时间（registerDate×1000 → dayjs 格式化） |
| `TagEditorModal` | UiModal + TextField | tag ≤20；保存 → updateSaidaoTagApi |

### 3.6 video-request（`components/video-request/`，默认不启用）

| 组件 | 说明 |
|---|---|
| `VideoRequestPanel` | 提交 BV（正则 `^BV[0-9A-Za-z]{10}$` 校验）/ 播放列表 / 投票（approve/reject）/ 当前播放；数据 = videoRequestListApi + WS video* 事件；**M6 决策是否启用渲染入口** |

## 4. 主题与 token（映射旧站色板）

旧站 CSS 变量 → HeroUI v3 oklch token（`globals.css` 扩展）：

| 旧站变量 | 值 | 新 token | 用途 |
|---|---|---|---|
| `--primary-color` | #7A6F69 | `--accent`（oklch 近似 0.62 0.03 70） | 品牌主色（按钮/链接） |
| `--bg-color` | 浅色 #F5F3F0 系 | `--background` | 页面背景 |
| `--live-color` | #E53935 | `--live`（oklch 0.577 0.24 27.35） | LIVE 徽章/直播态 |
| `--text-primary/secondary/light` | - | `--foreground` / `--muted-foreground` | 文本层级 |
| `--tag-*` | 多色 | `--tag-game` 等局部变量 | 标签 Chip 配色 |
| `--glass-*` | 毛玻璃 | `--glass-bg`（oklch + alpha） | 覆盖层背景（backdrop-blur） |
| 阵营 ya/juan | 红/蓝 | `--faction-ya` / `--faction-juan` | 徽章/对战条 |
| 深色 #202027 系 | - | `.dark --background` 等 | 暗色主题 |

实现规则：
- 所有颜色走 CSS 变量，Tailwind 中用 `bg-[var(--background)]` 或注册 `@theme` 映射（`--color-accent: var(--accent)` → `bg-accent` 类名可用）；
- 深色模式 = `<html class="dark" data-theme="dark">`（HeroUI v3 约定）；
- `ThemeProvider` 实现（水合安全）：
  ```tsx
  // 首屏：SSR 不读 localStorage，html 无 dark class（默认浅色）
  // useEffect：读 localStorage.darkMode → 应用 class + 写回
  // 提供 useTheme() = { theme, toggle }
  ```
  避免闪烁：`<head>` 内联 script（Next `metadata.other` 或 `next/script` beforeInteractive）提前读 localStorage 设 class（旧站同样策略）。

## 5. 图标规范（lucide-react）

| 场景 | 图标 | 说明 |
|---|---|---|
| 直播 | `Radio` / `CircleDot` | LIVE 态 |
| 热度 | `Flame` | 🔥 替代 emoji（可 aria-label） |
| 赞助 | `Heart` | |
| 主题 | `Sun` / `Moon` | |
| 用户菜单 | `User` / `LogOut` | |
| 聊天操作 | `Smile`（表情）/ `Mic`（语音）/ `Send`（发送）/ `Shield`（屏蔽）/ `Timeline`（时间线）/ `Swords`（掰头） | |
| 播放控制 | `RefreshCw` / `Volume2` / `VolumeX` / `MessageSquare`（弹幕）/ `PictureInPicture2` / `Maximize2` / `ExternalLink` | |
| 管理 | `Ban`（封禁）/ `Trash2`（删除）/ `Tag`（标签编辑） | |
- 全部 `size={16}`（sm）/`18`（md）统一档位；装饰性图标 `aria-hidden="true"`；功能图标按钮 `aria-label`。
- 移除旧站 Font Awesome 依赖（CDN → bundle）。

## 6. 无障碍实现清单（对照 web-interface-guidelines，落地到组件）

| 要求 | 落点 |
|---|---|
| 图标按钮 aria-label | `UiIconButton` 类型强制 label 必填 |
| 表单 label/aria | HeroUI TextField 自带 label；无 label 场景 `aria-label` |
| 键盘可达 | 所有交互 = Button/Link/Input（HeroUI 内置）；拖拽手柄 ←/→；滑块 ←/→；弹幕/语音有点击替代 |
| 焦点态 | HeroUI focus-visible 内置；自定义组件（弹幕开关等）补 `focus-visible:ring-2 ring-[var(--accent)]` |
| 语义 HTML | 操作用 `<button>`（HeroUI），导航用 `<Link>`，表格用 `<table>`（UserDetail 信息列表可 Listbox） |
| 标题层级 | 每页单一 h1（sr-only 或可见）；区块 h2/h3 顺序 |
| 跳链 | 根布局 `<a class="sr-only focus:not-sr-only" href="#main">跳到主要内容</a>` |
| aria-live | Toaster 容器（HeroUI 内置 polite）；「N 条新消息」按钮 `aria-live="polite"` |
| 破坏性确认 | UiConfirm（删消息/封禁/退出/删点播） |
| URL 状态 | tab 在 `?tab=`；弹窗不入 URL（任务浮层） |
| touch | 全局 `touch-action: manipulation`；Modal `overscroll-behavior: contain`；`-webkit-tap-highlight-color: transparent` |
| 暗色 | `color-scheme: dark`（已入 globals.css）；`<meta theme-color>` 跟随 |
| 动效 | 全部响应 `prefers-reduced-motion`（marquee/弹幕/PreviewPlayer autoplay）；动效用 HeroUI CSS 动画 + Tailwind 实现，无 Lottie 运行时（01 §6.2） |
| 图片 | next/image 显式尺寸；alt 文案准确（修复旧站支付宝 alt 错误） |
| 数字 | 在线人数/投票数 `tabular-nums`（`font-variant-numeric: tabular-nums`） |
| 加载文案 | 「连接中…」「加载中…」「保存中…」（用 `…` 不用 `...`） |

## 7. 自定义（原生元素）组件白名单

**只有以下组件允许原生元素**（均已在 03/04 文档给出设计，此处为最终白名单，新增需 PR 评审）：

1. `VideoPlayer`（`<video>`——HeroUI 无播放器）
2. `DanmakuLayer`（绝对定位动画层）
3. `VoiceBubble` / `VoiceRecorder`（`<audio>` + 波形 div + MediaRecorder 交互）
4. `SliderCaptcha`（拖拽滑块——需 pointer 事件 + 位移计算）
5. `ChatSidebar` 拖拽手柄（separator）
6. `NoticeBar` marquee 滚动容器

白名单外出现原生交互元素（`<div onClick>`、手写 input 等）→ lint 人工评审拒绝。

## 8. 组件质量验收（每个组件 PR 必查）

- [ ] HeroUI 可用时无原生等价物
- [ ] `onPress` 而非 `onClick`（HeroUI 交互组件）
- [ ] props 全类型（zod/字面量联合，无 any）
- [ ] 图标按钮有 aria-label；装饰图标 aria-hidden
- [ ] 无行内 style（动态值除外）；无 `transition: all`
- [ ] 动画响应 prefers-reduced-motion
- [ ] 加载/空/错误三态齐全（Skeleton / UiEmpty / Alert）
- [ ] 文本容器 `truncate`/`line-clamp`/`break-words` 处理长内容
- [ ] 单测覆盖纯逻辑（parser/formatter 类）；组件级用 Testing Library 覆盖关键交互（M6）
