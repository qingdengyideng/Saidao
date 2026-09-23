# 07 — 重构任务清单与实施路线图

> 目标：把 01–06 的设计拆成可执行、可验收的里程碑与任务。每任务含：产出文件、依赖、验收标准。
> 原则：自底向上（工程 → API → 状态/WS → 页面 → 组件打磨 → 质量收口），每个里程碑可独立运行、可回归。

---

## 0. 里程碑总览

| 里程碑                        | 主题                                              | 依赖                     | 完成标志（DoD）                                         |
| ----------------------------- | ------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| **M0** 工程初始化             | 脚手架/配置/布局骨架                              | -                        | dev/build/lint/typecheck 全通，HeroUI 冒烟通过          |
| **M1** API + 类型 + 认证      | http-client/zod 全量/auth store/fingerprint       | M0                       | 37 接口类型化；登录/登出/401 闭环                       |
| **M2** 主页（数据+卡片+日报） | RSC 边界/FilterTabs/SaidaoGrid/DailyReport/Header | M1                       | 主页浏览闭环（游客+登录），WS 卡片增量更新              |
| **M3** 聊天室                 | chat-socket/ChatStore/消息/表情/语音/风控/屏蔽    | M2                       | 实时聊天闭环（收/发/表情/语音/回复/删除/屏蔽/滑块验证） |
| **M4** 播放页                 | player socket/引擎/弹幕/评论/状态机               | M2（并行 M3 后半可启动） | 播放页全功能 + 降级链验证                               |
| **M5** 账号 + 管理 + 互动     | 8 弹窗/权限位/投票/时间线/用户详情                | M3                       | 账号体系与管理功能全通                                  |
| **M6** PWA + 性能 + 质量收口  | SW/bundle/测试/回归/Lighthouse                    | M5                       | 06 §8 全过                                              |

> 并行度：M3 与 M4 在 M2 完成后可双人并行（不同目录：`components/chat`+`lib/ws/chat-socket` vs `components/player`+`lib/media`）。

---

## 1. M0 — 工程初始化

| #    | 任务                                                                                                                                         | 产出                                                     | 验收                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| 0.1  | create-next-app 初始化（01 §1.1）                                                                                                            | 项目骨架                                                 | `pnpm run dev` 可访问                            |
| 0.2  | 安装依赖（01 §1.2：直接编辑 package.json + `pnpm install` 一次性）+ 版本锁定                                                                 | package.json + pnpm-lock.yaml                            | 无 peer 冲突；HeroUI v3 包确认；lockfile 提交    |
| 0.3  | tsconfig 加固（01 §2.1）                                                                                                                     | tsconfig.json                                            | 故意 `any` 报错；`noUncheckedIndexedAccess` 生效 |
| 0.4  | eslint flat config + prettier（01 §2.4/2.5）                                                                                                 | eslint.config.mjs / .prettierrc                          | `no-explicit-any` error；barrel import 拦截      |
| 0.5  | postcss + globals.css（token 最小集）（01 §2.2/2.3）                                                                                         | postcss.config.mjs / app/globals.css                     | 深浅色变量切换                                   |
| 0.6  | next.config.ts（images 白名单；无 PWA 字段，见 01 §2.6）                                                                                     | next.config.ts                                           | Turbopack 构建成功，无 webpack 告警              |
| 0.7  | env 文件链 + `src/config.ts`（01 §2.7：`.env.example`/`.env.development`/`.env.production` 提交、`.env.local` 覆盖、zod EnvSchema 启动校验） | src/config.ts + .env.\*                                  | 缺变量启动 fail-fast；config.apiBaseUrl 读取正确 |
| 0.8  | 根布局（ThemeProvider/Toaster/PwaInstallPrompt 占位 + SW 注册）（01 §3）                                                                     | src/app/layout.tsx + components/layout 占位                  | 无 HeroUIProvider；Toast 冒烟                    |
| 0.9  | 目录骨架（01 §4）                                                                                                                            | src/\* 空目录                                            | 结构符合 AGENTS.md §3                            |
| 0.10 | 原始资源迁移：6 个文件从旧站原样复制（01 §6：PWA 图标 3 + logo/二维码 3；PowerShell 脚本见 01 §6.3；Lottie 经核实旧站未使用不迁移）          | public/favicon.ico + public/icon-_.png + public/images/_ | 01 §6.1 清单 6 项逐一核对到位                    |
| 0.11 | PWA 原生方案：`public/service-worker.js`（workbox 运行时策略）+ `src/lib/pwa/sw.ts` 注册（01 §5）                                            | public/service-worker.js + src/lib/pwa/sw.ts             | 生产构建后 DevTools 可见 SW 注册；dev 不注册     |
| 0.12 | manifest.ts（04 §6）                                                                                                                         | src/app/manifest.ts                                          | pwa-asset-generator 校验                         |
| 0.13 | error/not-found/global-error（04 §7）                                                                                                        | src/app/*                                                  | 路由错误可展示                                   |

**DoD**：01 §7 验收清单全过。

## 2. M1 — API 层 + 类型 + 认证

| #   | 任务                                                                                        | 产出                                  | 验收                                                                 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| 1.1 | zod schema 全集（02 §3，11 个文件）                                                         | src/types/api/\*                      | tsc 推导类型正确；`z.infer` 无手写重复 interface                     |
| 1.2 | http-client（02 §2，axios 拦截器）                                                          | src/api/http-client.ts                | fp/token 注入/解包/401 回调/超时/FormData 单测（mock axios adapter） |
| 1.3 | 11 个 API 模块 37 函数（02 §4）                                                             | src/api/\*.ts + index.ts              | 路径字符串仅存在于 src/api（grep 验证）                              |
| 1.4 | fingerprint 封装（03 §4）                                                                   | src/lib/fingerprint.ts                | 缓存/并发单飞单测                                                    |
| 1.5 | playerInfoApi 特例（m3u8 "null" 归一化）（02 §4.3）                                         | src/api/player.ts                     | 单测覆盖 "null"/null/正常三态                                        |
| 1.6 | useAuthStore（03 §2.1）：token persist / login / logout / refreshCurrentUser / 401 回调注入 | src/stores/useAuthStore.ts            | 登录 → 不 reload → user 更新；改 token → 401 → 登录框                |
| 1.7 | content-parser + 注入单测（02 §5）                                                          | src/lib/chat/content-parser.ts + 测试 | 注入用例 ≥5 条全过                                                   |
| 1.8 | SWR 集成约定 + `useAuthedQuery` 辅助（02 §6）                                               | src/hooks/                            | 游客 key=null 不发请求                                               |

**DoD**：02 §8 验收清单全过；DevTools 验证 Authorization 裸 token（无 Bearer）。

## 3. M2 — 主页

| #    | 任务                                                                                                      | 产出                                  | 验收                                 |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| 2.1  | useSaidaoStore（03 §2.3，含 WS 增量 action 骨架）                                                         | src/stores/useSaidaoStore.ts          | -                                    |
| 2.2  | useUiStore（03 §2.5，persist 白名单）                                                                     | src/stores/useUiStore.ts              | 主题/宽度持久化                      |
| 2.3  | ui 薄封装层（05 §2，UiButton/UiCard/UiEmpty/UiSkeleton/UiModal/UiConfirm）                                | src/components/ui/\*                  | HeroUI 冒烟                          |
| 2.4  | Header + NoticeBar + ThemeToggle + UserMenu 占位（04 §3.1）                                               | components/layout/\*                  | 公告滚动 + reduced-motion 静止       |
| 2.5  | FilterTabs（URL ?tab= 同步）                                                                              | components/saidao/FilterTabs.tsx      | 深链直达                             |
| 2.6  | SaidaoGrid + SaidaoCard（含 PreviewPlayer 懒加载、不想看 TA、click 上报）（04/05）                        | components/saidao/\*                  | 卡片三态；hover 预览；触屏不自动预览 |
| 2.7  | DailyReportList + 红点逻辑                                                                                | components/saidao/DailyReportCard.tsx | 红点 = 最新 id > lastSeen            |
| 2.8  | 主页数据编排（Promise.all 并行 + Suspense + Skeleton）（04 §2/§3.1）                                      | src/app/page.tsx + HomeShell              | 无瀑布（DevTools 网络面板验证并行）  |
| 2.9  | WS 卡片增量接入（saidaoStore.apply\* + useChatSocket 占位挂载——完整 socket 在 M3，此处先接 5 种卡片事件） | lib/ws 骨架                           | 改标签/封面/AI/热度实时生效          |
| 2.10 | 空态/错误态/加载态（UiEmpty/Alert/Skeleton）                                                              | -                                     | 无直播/未登录/断网三场景             |

**DoD**：04 §8 主页部分全过；登录不 reload；卡片热度重排正确。

## 4. M3 — 聊天室

| #    | 任务                                                                                   | 产出                                               | 验收                                      |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| 3.1  | ws 类型联合 + parse 兜底（03 §3.2）                                                    | src/lib/ws/ws-message-types.ts                     | 未知 type → null + warn 单测              |
| 3.2  | base-socket（reconnecting-websocket 封装）（03 §3.1）                                  | src/lib/ws/base-socket.ts                          | 重连/竞态/防复活单测（mock WS）           |
| 3.3  | chat-socket 单例 + 消息路由（03 §3.3）                                                 | src/lib/ws/chat-socket.ts + hooks/useChatSocket.ts | 双标签页互通                              |
| 3.4  | useChatStore 完整实现（03 §2.2：屏蔽判定/buffer/裁剪/去重）                            | src/stores/useChatStore.ts                         | 屏蔽进 buffer、取消恢复；1000/500 上限    |
| 3.5  | ChatSidebar + ChatHeader + HotWordsBar（拖拽手柄键盘可达）                             | components/chat/\* + layout/ChatSidebar            | 250~600 拖拽持久化；移动端全屏            |
| 3.6  | ChatMessageList（virtua）+ ChatMessageItem（content 解析/引用/链接预览/删除/已删占位） | components/chat/\*                                 | 1000 条流畅（50ms 内追加）；粘底逻辑      |
| 3.7  | ChatInput + QuotePreview（Enter/Ctrl+Enter/maxlength/自适应高度）                      | components/chat/ChatInput.tsx                      | 游客点发送 → 登录框                       |
| 3.8  | EmojiPanel（双 tab/上传 ≤2MB/animation video 预览）                                    | components/chat/EmojiPanel.tsx                     | 上传后即时显示                            |
| 3.9  | VoiceRecorder + VoiceBubble（1~60s/32 桶波形/试听/MIME 选择）+ voice-utils             | components/chat/\* + lib/chat/voice-utils.ts       | 录音→上传→WS→渲染闭环                     |
| 3.10 | SliderCaptcha + captchaRequired 风控闭环（03 §3.5）                                    | components/chat/SliderCaptcha.tsx                  | 触发→验证→带 ticket 重发→回显替换 pending |
| 3.11 | 消息操作：回复/删除（canChatBan/本人）/屏蔽 TA/封禁（05 §3.3）                         | ChatMessageItem 操作区                             | 删除 WS 广播 messageDeleted 同步          |
| 3.12 | ChatFilterModal（整体覆盖提交）+ 屏蔽游戏直播                                          | components/chat/ChatFilterModal.tsx                | 保存后实时生效                            |

**DoD**：03 §7 验收清单全过（重连/去重/风控/游客/屏蔽/刷新干净关闭）。

## 5. M4 — 播放页（可与 M3 后半并行）

| #   | 任务                                                                   | 产出                                                           | 验收                    |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| 4.1 | usePlayerStore（03 §2.4）                                              | src/stores/usePlayerStore.ts                                   | 状态机转换单测          |
| 4.2 | media 引擎封装（xgplayer 主引擎 / hls+mpegts 回退 / 支持判定 / destroy 保 <video> 节点与音量状态 / 自动播放策略） | src/lib/media/engine.ts | 引擎不可用降级提示 |
| 4.3 | player-socket（弹幕队列 5s 延迟/500 上限/200ms flush）（03 §3.4）      | src/lib/ws/player-socket.ts                                    | 脚本灌 1000 条验证上限  |
| 4.4 | VideoPlayer + PlayerStatus（connecting/live/waiting/error + 10s 重试） | components/player/\*                                           | 未开播轮询→开播自动接管 |
| 4.5 | DanmakuLayer（车道制 90px/s/节点 60/reduced-motion）                   | components/player/DanmakuLayer.tsx                             | 车道全占丢弃            |
| 4.6 | PlayerControls（音量 M/P 键/PiP/全屏降级链/去源站）                    | components/player/PlayerControls.tsx + lib/media/fullscreen.ts | 四档全屏降级            |
| 4.7 | CommentPanel（200 裁剪/粘底/回到最新）+ StreamerBar                    | components/player/\*                                           | 同源弹幕/评论           |
| 4.8 | 路由 `/player/[uid]` + 移动端跳源站策略 + 404 uid 处理                 | src/app/player/[uid]/page.tsx                                      | 非 youtube 移动端跳源站 |

**DoD**：04 §8 播放页部分全过；xgplayer 主引擎 + 回退链 bundle 验证（flv.js 不存在）。

## 6. M5 — 账号体系 + 管理 + 互动

| #   | 任务                                                                               | 产出                                | 验收                                              |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| 5.1 | LoginModal（含图形验证码风控）                                                     | components/account/LoginModal.tsx   | 登录/风控验证码闭环                               |
| 5.2 | AllocationCaptchaModal + AllocationResultModal（凭据展示/Copy）                    | components/account/\*               | 6 位初始密码仅本次显示                            |
| 5.3 | ProfileModal（头像上传/昵称/签名/阵营 30 天锁/webhook 白名单+测试）                | components/account/ProfileModal.tsx | 保存不 reload；webhook 前缀校验                   |
| 5.4 | ChangePasswordModal / UserDetailModal / TagEditorModal                             | components/account/\*               | registerDate ×1000 显示正确                       |
| 5.5 | ChatMoments 时间线（SWR 60s + segments 卡片）                                      | components/chat/ChatMoments.tsx     | 覆盖层互斥展示                                    |
| 5.6 | ChatPolls 完整（对战条/倒计时 serverTime 校准/创建/投票/recent）+ CreatePollDialog | components/chat/ChatPolls.tsx       | 每日 1 次/注册>3 天 disabled 提示；倒计时跨页校准 |
| 5.7 | 权限位 UI 门控（canChatBan/canEditSaidaoTag）+ 封禁/删消息入口                     | 各组件                              | 游客/普通/管理三角色矩阵验证                      |
| 5.8 | UserMenu 完整（资料/改密/退出二次确认）                                            | components/layout/UserMenu.tsx      | 退出后 WS 断开（token 清空重建）                  |

**DoD**：04 §8 弹窗部分全过；三角色（游客/用户/管理）功能矩阵回归。

## 7. M6 — PWA + 性能 + 质量收口

| #    | 任务                                                                                                                                                                | 产出                                   | 验收                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------ |
| 6.1  | PWA 完善（`public/service-worker.js` 缓存策略对齐旧站 160 条/3 前缀；预缓存 manifest 注入评估（01 §5.1）；安装按钮 accepted/dismissed 逻辑；离线降级 1×1 透明 PNG） | public/service-worker.js + src/lib/pwa | DevTools 验证缓存        |
| 6.2  | CSP headers + preconnect（06 §7）                                                                                                                                   | next.config.ts headers                 | 控制台无 CSP 违规        |
| 6.3  | bundle 分析与预算（next/bundle-analyzer；xgplayer/hls/mpegts/virtua/fingerprint 懒加载核查）（06 §1.2）                                                                      | 分析脚本                               | 预算达标（06 §1.2 表）   |
| 6.4  | 测试补齐（content-parser/voice-utils/ws-parse/倒计时/persist migrate）+ 组件测试（Login/ChatPolls/SaidaoCard）                                                      | tests                                  | vitest 全绿              |
| 6.5  | 无障碍全量审查（05 §6 清单；axe 扫描）                                                                                                                              | -                                      | Lighthouse a11y ≥95      |
| 6.6  | reduced-motion 全局核查 + 暗色模式全页面核查                                                                                                                        | -                                      | 06 §8                    |
| 6.7  | 性能优化 pass（rerender 审查：React Profiler 抓主页+聊天高频场景；useMemo/memo 修正）                                                                               | -                                      | Profiler 无异常重渲染    |
| 6.8  | 全量回归（§4 清单）+ Lighthouse 四指标                                                                                                                              | 报告                                   | 06 §8 DoD                |
| 6.9  | **决策项 D-VID**：video-request 启用/保留骨架/删除（默认保留骨架，UI 不渲染）                                                                                       | 决策记录                               | 按决策执行并清理无用代码 |
| 6.10 | 文档收口（AGENTS.md 与实现一致性核对；specs 已知问题清单更新）                                                                                                      | docs                                   | 文档与代码一致           |

**DoD**：06 §8 全过。

---

## 8. 全量回归清单（每里程碑执行，M6 完整跑）

### 8.1 观看闭环

- [ ] 浏览卡片 → hover 预览（桌面）/触屏不自动 → 点封面进播放页（click 上报）
- [ ] 播放页：直播中播放 / 未开播等待+10s 轮询 / 断流重试 / 弹幕对齐画面（~5s 延迟）
- [ ] 弹幕开关 / 音量 M、P 键 / PiP / 全屏降级 / 去源站
- [ ] 移动端非 youtube 渠道跳源站

### 8.2 互动闭环

- [ ] 游客收消息；游客发消息 → 登录框（或风控滑块）
- [ ] 登录发文本（Enter）/换行（Ctrl+Enter）/引用回复/表情点击发送/表情上传
- [ ] 语音：录音 1s 最短 / 60s 截断 / 试听 / 发送 / 波形渲染 / 点击播放
- [ ] 滑动风控：触发 → 拖拽 → 带 ticket 重发 → 成功；isBanned 不重试
- [ ] 屏蔽：用户/昵称/关键词/游戏直播；消息进 buffer；取消恢复
- [ ] 删除消息（本人/管理）→ WS 同步；封禁（管理）
- [ ] 掰头：创建（限制条件提示）/投票/倒计时（serverTime 校准）/结果展示
- [ ] 时间线：segments 渲染 + 60s 刷新
- [ ] 在线人数/热词（≤8）实时更新

### 8.3 账号闭环

- [ ] 登录（含图形验证码风控）/登出（二次确认）/401 自动弹登录框
- [ ] 分配账号 → 凭据展示（Copy）
- [ ] 资料编辑（头像 ≤2MB 预检/阵营 30 天锁/webhook 测试）→ 保存不 reload
- [ ] 改密成功保持登录
- [ ] 用户详情（点头像，注册时间正确）

### 8.4 卡片/管理闭环

- [ ] 筛选 tab（live/all/dailyReport）+ URL 深链
- [ ] 不想看 TA（隐藏 + 恢复）；热度重排；标签/封面/AI 实时更新（WS）
- [ ] 日报红点 + 外链打开
- [ ] 标签编辑（canEditSaidaoTag）

### 8.5 体验/PWA

- [ ] 深浅色切换（无闪烁）；`prefers-reduced-motion` 生效
- [ ] PWA 安装（按钮/accepted/dismissed）；图标正确
- [ ] 断网重连（聊天 + 播放）；刷新后无残留 WS
- [ ] 长列表性能（1000 条消息滚动 60fps）

## 9. 风险与决策项跟踪

| 项                                    | 状态                 | 决策点                                                                         |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| D-VID 视频点播室                      | 待定（默认保留骨架） | M6.9：启用需恢复 tab + 确认接口/WS 可用 + 登录门槛；删除需清理 WS video\* 分支 |
| D-BEARER Authorization 加 Bearer 前缀 | 不做（契约冻结）     | 后端确认后再升级（06 §6 R2）                                                   |
| D-OFFLINE 真离线 PWA                  | 不做                 | 需要应用外壳缓存评估，独立立项                                                 |
| R1/R3/R4 后端数据陷阱                 | 前端已特判           | 同步后端排期（06 §6）                                                          |
| 赞助收款码后端下发                    | 后置                 | M6 后优化项                                                                    |

## 10. 工作量与顺序建议

- 单人串行：M0(1d) → M1(2d) → M2(2d) → M3(3d) → M4(2d) → M5(2d) → M6(2d)。
- 双人并行：A 线 M0→M1→M2→M3→M5；B 线 M2 完成后接 M4；M6 共同收口。
- 每任务粒度 ≈ 0.5–1 人日；超过的任务应再拆。
