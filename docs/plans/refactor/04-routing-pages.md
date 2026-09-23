# 04 — 路由、布局与页面重构

> 目标：将旧站 3 个 HTML + 8 个弹窗映射为 Next.js App Router 路由树，明确 RSC/客户端边界、每个页面的组件树与数据获取策略、PWA manifest。
> 约束来源：`docs/specs/01–08`、AGENTS.md §2.2/§2.5。

---

## 1. 路由表

| 路由            | 文件                            | 鉴权       | 对应旧站         | 说明                                  |
| --------------- | ------------------------------- | ---------- | ---------------- | ------------------------------------- |
| `/`             | `src/app/page.tsx`              | 游客可浏览 | index.html       | 主页：卡片网格 + 筛选 tabs + 聊天侧栏 |
| `/player/[uid]` | `src/app/player/[uid]/page.tsx` | 无         | player.html?uid= | 播放页（HLS/FLV + 弹幕 + 评论）       |
| `/sponsor`      | `src/app/sponsor/page.tsx`      | 无         | sponsor.html     | 赞助页（静态）                        |
| `/not-found`    | `src/app/not-found.tsx`         | -          | -                | 404（HeroUI Alert）                   |
| 弹窗            | 非路由，Modal 组件          | -          | 8 个 .modal      | 见 §4 弹窗策略                        |

**不支持旧站 `player.html?src=...&url=...` 直连流参数**（无产品价值的调试参数，specs 未要求）；仅保留 `?uid=`。

### 1.1 Next 16 动态路由规范（强制）

- `params` / `searchParams` **必须异步访问**（Next 16 无同步兼容模式，同步读取直接构建报错）：
  - Server Component（`page.tsx` / `layout.tsx` / route handler）：`const { uid } = await params;`、`const sp = await searchParams;`
  - Client Component：`const { uid } = React.use(params);`（或经 props 从 Server Component 传入已解包的值，优先后者，减少 Suspense 边界）
- 本项目动态路由仅 `/player/[uid]` 一处：`src/app/player/[uid]/page.tsx` 为**薄壳 Server Component**，`await params` 后把 `uid` 字符串 props 传给 `"use client"` 的 `<PlayerPage>`（与 D1 客户端数据获取策略一致，Server 壳只负责解包 + SEO meta）；
- `cookies()` / `headers()` / `draftMode()` 同样必须 `await`（本项目暂不使用，预留规则）；
- 路由配置如需调整，用顶层 `turbopack` 键或 Route Segment Config，**禁止 webpack 配置**。

## 2. RSC / 客户端边界划分（关键决策 D1）

### 2.1 判定逻辑

- `GET /saidao/`（卡片列表）是**鉴权接口**（游客 401）。Next RSC 在服务器端执行，无法安全携带用户 token（token 在浏览器 localStorage，SSR 拿不到，且代理 token 有泄露/滥用风险）。
- 因此：**主页所有数据一律客户端获取**，RSC 只负责布局骨架与 SEO meta。这不是"放弃 SSR"，而是该后端契约下的正确选择。
- 播放页 `GET /saidao/player/{uid}` **无鉴权**，理论上可 RSC 预取——但播放页是动态流地址 + 10s 重试状态机，RSC 首屏价值低，同样客户端获取（保持简单）。

### 2.2 边界图

```
src/app/page.tsx (Server Component)
├─ <Head metadata>（RSC 静态）
├─ <HomeShell> ("use client")
│   ├─ <Header>（公告=SWR noticeApi、主题切换、登录入口）
│   ├─ <FilterTabs>（URL ?tab=live|all|dailyReport）
│   ├─ <SaidaoGrid>（SWR saidaoListApi，登录态门控）
│   └─ <ChatSidebar>（useChatSocket 单例挂载点）
└─ 弹窗层（Modal 容器，见 §4）
```

RSC 的价值保留在：`/sponsor`（纯静态，完全 RSC + 静态生成 `export const dynamic = "force-static"`）、metadata/manifest、流式 Suspense 骨架。

### 2.3 主页 SEO 兜底

- RSC 输出静态骨架（标题、描述、logo、tab 占位），直播列表区 `<Suspense fallback={<CardsSkeleton />}>`；
- 登录用户客户端水合后填充卡片；
- `metadata` 提供完整 OpenGraph（直播社区关键词），弥补列表内容不可被爬取的短板（直播流本身时效性强，不做 SSR 内容可接受）。

## 3. 页面组件树设计

### 3.1 主页 `/`

```
<HomeShell>（客户端，组合 + 数据门控）
├─ <Header>
│   ├─ Logo（next/link → /）
│   ├─ <NoticeBar>（SWR noticeApi；marquee 滚动；prefers-reduced-motion 时静止）
│   ├─ 右侧操作区：
│   │   ├─ <SponsorLink>（next/link → /sponsor，Heart 图标按钮）
│   │   ├─ <PwaInstallButton>（beforeinstallprompt 触发后显示）
│   │   ├─ <ThemeToggle>（Sun/Moon 图标按钮）
│   │   └─ 登录态 ? <UserMenu>（Avatar + Dropdown：个人资料/修改密码/退出）
│   │            : <LoginButton>
├─ <main>
│   ├─ <FilterTabs>（HeroUI Tabs/SegmentedControl：直播中 | 全部 | 抽象日报；
│   │                 tab 状态同步 URL ?tab=，支持深链）
│   ├─ <SaidaoGrid>（tab=live/all 时）
│   │   ├─ 排序 useMemo（hotScore 降序，直播优先）
│   │   ├─ 过滤：notShow 主播默认隐藏（提供「不想看 TA」恢复入口）
│   │   ├─ <SaidaoCard ×N>
│   │   └─ 空态：<EmptyState>（HeroUI：无直播时提示 + 查看全部按钮）
│   └─ <DailyReportList>（tab=dailyReport 时）
│       ├─ SWR dailyReportListApi（60s 轮询或 WS dailyReportUpdate mutate）
│       ├─ <DailyReportCard ×N>（红点 = 最新 id > DAILY_REPORT_LAST_SEEN_ID）
│       └─ 点击 → window.open(link)（微信外链，rel=noopener）
└─ <ChatSidebar>（桌面：右侧固定 250~600px 可拖拽；移动端：全屏覆盖 Drawer）
    ├─ <ChatHeader>（在线人数 Badge、热词开关、收起/展开、关闭）
    ├─ <HotWordsBar>（Chip 组，≤8，折叠状态 persist）
    ├─ <ChatMessageList>（virtua 虚拟化，上限 1000）
    │   └─ <ChatMessageItem>（头像/阵营徽章/昵称/时间戳/content 解析/引用块/
    │                          链接预览/语音气泡/删除态；头像点击 → UserDetailModal）
    ├─ <ChatOverlay>（互斥覆盖层：
    │   ├─ <ChatMoments>（时间线，SWR 60s；segments 卡片流）
    │   └─ <ChatPolls>（掰头：当前 poll 红蓝对战 UI + 倒计时 serverTime 校准 +
    │                    创建弹窗（question≤100/选项≤20/时长 5/10/30min）+
    │                    历史记录 recent）
    ├─ <QuotePreview>（回复引用预览条）
    └─ <ChatInput>
        ├─ <EmojiPanel>（Tabs: vip | animation；grid 点击发送；vip 组「+」上传 ≤2MB）
        ├─ 工具行：表情按钮 / 语音按钮 / 屏蔽设置入口 / 时间线入口 / 掰头入口
        ├─ <TextareaField>（maxlength 256；Enter 发送 / Ctrl+Enter 换行；高度自适应）
        └─ <SendButton>（发送中 Spinner；游客点击 → 登录框）
    └─ <VoiceRecorderPanel>（录音 1~60s 计时 + 32 桶波形 + 试听 + 发送/取消）
    └─ <SliderCaptcha>（风控弹窗，见 03 §3.5）
```

**数据获取汇总（主页）**：

| 数据                 | 方式                                                   | 节奏                |
| -------------------- | ------------------------------------------------------ | ------------------- |
| notice               | SWR `["notice"]`                                       | 30s                 |
| saidaoList           | SWR `["saidaoList"]`（登录）                           | 不轮询，WS 驱动增量 |
| dailyReportList      | SWR `["dailyReportList"]`                              | 60s + WS mutate     |
| chatFilterConfig     | SWR `["chatFilterConfig"]`（登录，ChatSidebar 挂载时） | 手动刷新            |
| emoji(vip/animation) | SWR `["emoji", group]`（面板展开时）                   | 上传后 mutate       |
| chatPolls            | SWR `["chatPolls"]`（登录）                            | 15s + WS mutate     |
| chatMoments          | SWR `["chatMoments"]`（登录，覆盖层打开时）            | 60s                 |
| WS                   | useChatSocket 单例                                     | 实时                |

### 3.2 播放页 `/player/[uid]`

```
<PlayerPage>（客户端）
├─ <PlayerStatusOverlay>（connecting 连接中… / waiting 等待开播 / error 连接中断）
├─ <VideoPlayer>（原生 <video> + 引擎层 src/lib/media/engine.ts：
│   ├─ xgplayer 3.x（xgplayer-hls/flv/mp4 插件）主引擎——与旧站线上行为一致（f25154c 起）
│   ├─ 回退链：xgplayer 初始化失败/异常 → hls.js（m3u8）/ mpegts.js（FLV/HEVC）/ 原生 HLS
│   ├─ 自动播放策略（对齐旧站 f25154c）：
│   │   ① 首次优先有声播放；play() 被 NotAllowedError 拦截且尚未解锁音频 → 静音重试
│   │   ② 不覆盖用户手动静音选择；tap-play 点击时 volume===0 → 恢复 0.6 + 强制 setMuted(false)
│   │   ③ HLS 404 → 判定"直播源暂不可用"（区别于"播放连接中断"）
│   │   ④ 切流时 xgplayer.destroy() 且 retainMediaAfterDestroy 保 <video> 节点，音量/静音状态跨流保留
│   └─ 10s 重试（phase=error 时倒计时重拉 playerInfoApi）
├─ <DanmakuLayer>（车道制 90px/s；ref 队列 500 条；200ms flush；
│                  弹幕开关；prefers-reduced-motion 时停止）
├─ <PlayerControls>（刷新 / 音量滑杆 + M 键静音 / P 键音量 / 弹幕开关 /
│                    PiP 小窗（xgplayer PiP 插件主路径，Document PiP API 降级）/
│                    全屏降级链：标准→webkit→iOS 原生→CSS 假全屏 /
│                    去源站（channel 对应平台 url））
├─ <StreamerBar>（头像/昵称/状态/cover；来自 playerInfoApi）
└─ <CommentPanel>（实时评论 200 条裁剪、粘底滚动、「回到最新」按钮；
                   与弹幕同源于 player WS comments）
```

**数据流**：

1. 挂载 → `playerInfoApi(uid)`（8s 超时）→ 判定 `status === "1"` ? live : waiting；`m3u8` 非 null → 建播放器；
2. live → 建 player WS（弹幕/评论）；
3. waiting → 10s 轮询 `playerInfoApi` 直到开播（WS 不建）；
4. error → 10s 倒计时重试（retryCount 展示）。

**移动端策略**（旧站行为保留）：非 youtube 渠道的移动端 → 直接跳源站 url（H5 播放器兼容性问题）；youtube → 内嵌播放。

### 3.3 赞助页 `/sponsor`

纯 RSC 静态页（`force-static`）：

```
<HeroUI Container>
├─ 微信/支付宝二维码（HeroUI Image，width/height 防 CLS；图片为旧站原样复制的 `public/images/wechat-pay.png` / `public/images/alipay.jpg`，alt 修正——旧站支付宝 alt 文案错误的 bug 修复；alipay 旧站视觉裁剪逻辑用等效 Tailwind 实现）
├─ 用途说明列表（服务器/开发/安全/新特性/体验）
├─ 「备注用户名」提示（HeroUI Alert，warning）
└─ <BackHomeButton>（next/link）
```

收款码图片暂用本地 `public/images/`（后端下发 URL 列为后续优化，见 06 §6）。

## 4. 弹窗（Modal）策略

旧站 8 个 `.modal` 全部保留为 **HeroUI Modal/Dialog 组件**（不路由化——它们是任务型浮层，不是页面，路由化会污染 URL；但**状态存 uiStore**，便于跨组件打开）：

| 弹窗     | 组件                                               | 打开入口                             | 关键实现                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录     | `LoginModal`                                       | 登录按钮 / 401 自动                  | HeroUI Modal + TextField（email/password，autocomplete=username/current-password）；提交调 authStore.login；风控时内嵌图形验证码                                                                                                                              |
| 账号分配 | `AllocationCaptchaModal` + `AllocationResultModal` | 登录框「分配账号」                   | 图形验证码（base64 图 + 输入）→ allocate → 结果展示账号+6位初始密码（Copy 按钮 + 「仅本次显示」提示）                                                                                                                                                         |
| 个人资料 | `ProfileModal`                                     | 用户菜单                             | Avatar 上传（≤2MB 预检 + uploadImageApi）/昵称/签名/阵营（ya/juan，30 天锁定 disable + Tooltip 说明）/webhook（类型 Select：钉钉/企微/飞书 + URL + 前缀白名单校验 + 测试按钮调 testWebhookApi）；保存 → profileUpdateApi → authStore.setUser（**不 reload**） |
| 修改密码 | `ChangePasswordModal`                              | 用户菜单                             | old/new 双字段；成功后 Toast + 保持登录（旧站改密不 reload，保留）                                                                                                                                                                                            |
| 用户详情 | `UserDetailModal`                                  | 聊天点头像                           | userDetailApi；registerDate ×1000 格式化（dayjs）                                                                                                                                                                                                             |
| 标签编辑 | `TagEditorModal`                                   | 卡片「编辑标签」（canEditSaidaoTag） | 保存 → updateSaidaoTagApi → WS 广播同步                                                                                                                                                                                                                       |
| 屏蔽设置 | `ChatFilterModal`                                  | 聊天脚部                             | blockedUserIds/Nicknames/keywordPatterns 三组管理 + 屏蔽游戏直播 Switch；整体覆盖提交 updateChatFilterConfigApi                                                                                                                                               |
| 掰头创建 | `CreatePollDialog`                                 | ChatPolls 区                         | question + 选项动态增删（≥2）+ 时长 Select + multiple/resultsVisible Switch                                                                                                                                                                                   |

**弹窗规范**：

- 全部 HeroUI Modal：`isDismissable`（ESC/点击遮罩）、焦点圈闭（HeroUI 内置）、`overscroll-behavior: contain`；
- 破坏性操作（退出登录、删消息）二次确认（`isDanger` 确认按钮或 AlertDialog）；
- 打开时 `document.body` 滚动锁定（HeroUI Modal 内置）；
- 表单错误：HeroUI TextField `isInvalid` + `errorMessage` 内联；提交失败 focus 第一个错误字段（web-interface-guidelines）。

## 5. 布局与响应式

### 5.1 断点（对齐旧站 768px）

- `mobile: < 768px`——聊天侧栏全屏覆盖（HeroUI Drawer 风格自实现或 Modal 全屏模式）；卡片单列；
- `tablet: 768~1280px`——卡片 2 列；聊天侧栏 320px 固定；
- `desktop: > 1280px`——卡片 3~4 列（grid auto-fill minmax(280px,1fr)）；聊天侧栏可拖拽 250~600px。

### 5.2 聊天侧栏拖拽（桌面）

- 拖拽手柄（`role="separator"` + 键盘 ←/→ 调整 10px + `aria-valuenow`）——web-interface-guidelines 要求手势有键盘替代；
- 宽度写 uiStore.chatWidth（persist，clamp 250~600）；
- 拖拽中 `document.body.style.userSelect = "none"`（旧站行为，收敛到 hook）。

### 5.3 水合安全清单

| 数据                              | 策略                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| theme（localStorage）             | ThemeProvider：首屏渲染不读 localStorage，`useEffect` 后应用 class + `<html suppressHydrationWarning>` |
| 时间（timestamp/HH:mm:ss）        | 服务端与客户端时间一致（消息自带 timestamp 字段），仅 `now` 相关（倒计时）用 effect 后渲染             |
| isMobile（innerWidth）            | 不用 useState 初值读，`useSyncExternalStore` + matchMedia（SSR 返回桌面默认值）                        |
| localStorage 偏好（chatWidth 等） | persist 中间件 hydration 后生效，首屏用默认值                                                          |

## 6. PWA manifest（`src/app/manifest.ts`，Next 约定式路由）

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saidao · 抽象赛道", // 修复旧站 description 占位问题
    short_name: "Saidao",
    description: "主播直播 + 实时聊天室社区", // 修复旧站「没有描述」
    start_url: "/",
    display: "standalone",
    background_color: "#0f0f13", // 与 dark 背景一致（修复旧站 #000 不一致）
    theme_color: "#0f0f13",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      // 旧站无 maskable 图标（资源迁移保留原版，见 01 §6）；
      // 如后续需要，从 icon-512x512.png 派生 maskable 版本并登记到 01 §6.1
    ],
  };
}
```

> manifest 由 Next 16 约定式路由直接产出（`src/app/manifest.ts` → `/manifest.webmanifest`），**不经过任何构建插件**，与 Turbopack 构建无耦合。
> Service Worker（`public/service-worker.js` + `src/lib/pwa/sw.ts`）的实现见 [01 §5](./01-project-init.md)。

## 7. 错误边界与加载态

| 位置       | 文件                                 | 内容                                                             |
| ---------- | ------------------------------------ | ---------------------------------------------------------------- |
| 路由级错误 | `src/app/error.tsx`                  | HeroUI Alert（danger）+ 错误信息 + 重试按钮（`reset()`）         |
| 全局错误   | `src/app/global-error.tsx`           | 同上用 `error.digest`                                            |
| 404        | `src/app/not-found.tsx`              | HeroUI：「页面不存在」+ 回主页                                   |
| 列表加载   | 各 `loading.tsx` / Suspense fallback | HeroUI Skeleton（卡片网格 8 格 / 播放页全屏 Spinner / 赞助页无） |
| 单卡片失败 | -                                    | 卡片内 try，失败渲染占位卡（不阻塞网格）                         |

## 8. M2/M4 验收清单

- [ ] `/` 游客访问：列表区显示空态/登录引导，聊天侧栏可浏览消息（游客 WS）
- [ ] 登录后不刷新整页，卡片/聊天/菜单即时更新
- [ ] `?tab=dailyReport` 深链直达日报 tab
- [ ] 聊天侧栏桌面拖拽 250~600px 持久化；移动端全屏覆盖
- [ ] 播放页三态（连接中/等待开播/中断）+ 10s 重试 + 弹幕 5s 延迟对齐
- [ ] 移动端非 youtube 渠道跳源站
- [ ] 8 个弹窗全部 HeroUI Modal，ESC/遮罩关闭、焦点圈闭、破坏操作二次确认
- [ ] manifest 字段完整（description/theme_color/maskable），`npx pwa-asset-generator` 校验通过
- [ ] 所有 `<img>` 有 width/height/alt；链接 `target="_blank"` 带 `rel="noopener noreferrer"`
- [ ] `pnpm run build` 无 hydration mismatch warning
