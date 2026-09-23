# 说道（Saidao）项目架构与技术细节报告

> 报告生成日期：2026-09-20
> 报告对象：`e:\02-项目\Saidao` 前端项目（纯静态 PWA 站点）
> 配套后端：Spring Boot（`api.saidao.cc`）+ n8n 工作流（`n8n.saidao.cc`）

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [技术栈清单](#4-技术栈清单)
5. [前端模块划分](#5-前端模块划分)
6. [WebSocket 通信协议](#6-websocket-通信协议)
7. [API 端点清单](#7-api-端点清单)
8. [核心功能模块](#8-核心功能模块)
9. [认证与指纹机制](#9-认证与指纹机制)
10. [PWA 与离线缓存策略](#10-pwa-与离线缓存策略)
11. [数据流](#11-数据流)
12. [性能与降级策略](#12-性能与降级策略)

---

## 1. 项目概述

**说道（Saidao）** 是一个以「主播直播 + 实时聊天室」为核心的互动社区站点，同时集成抽象日报、红蓝掰头投票、视频点播室、聊天时间线等社区玩法。项目前端为**纯静态站点**（原生 HTML/CSS/JS，无 React/Vue 等构建框架），部署为 PWA，通过 REST API + WebSocket 与远端 Spring Boot 后端通信。

核心体验包括：
- 主播直播卡片列表（支持直播中 / 全部 / 抽象日报三种筛选），卡片内嵌 HLS/FLV 实时预览；
- 右侧（移动端为底部）可拖拽宽度的**实时聊天室**，支持文字、语音、图片、引用、@、链接预览、时间线、掰头投票；
- 独立**播放页**（`player.html`），支持弹幕、小窗 PiP、全屏、评论面板；
- **赞助页**（`sponsor.html`）。

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       浏览器（PWA）                          │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ index.html   │   │ player.html  │   │  sponsor.html   │  │
│  │ (主页+聊天室) │   │ (独立播放页) │   │ (赞助页)        │  │
│  └──────┬───────┘   └──────┬───────┘   └────────┬────────┘  │
│         │                   │                    │           │
│  ┌──────┴───────────────────┴────────────────────┴────────┐  │
│  │              原生 JS 模块层（无框架）                     │  │
│  │  config.js → api.js → app.js / chat-room.js / player.js │  │
│  │  + 各工具模块（语音/引用/链接/投票/时间线/点播/验证码）   │  │
│  └──────┬─────────────────────────────────────┬───────────┘  │
│         │                                     │              │
│  ┌──────┴──────────────┐          ┌───────────┴─────────┐   │
│  │ Service Worker      │          │ 流媒体库              │   │
│  │ service-workV3.js   │          │ hls.js / mpegts.js  │   │
│  │ (离线缓存静态资源)   │          │ flv.js              │   │
│  └─────────────────────┘          └─────────────────────┘   │
└──────────┬───────────────────────────┬───────────────────────┘
           │ REST (fetch)              │ WebSocket (wss)
           │ + fp 指纹 + Authorization │ + token + fp
           ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Spring Boot 后端  https://api.saidao.cc        │
│  （Java 21 / Spring Boot 3.3 / MyBatis-Plus / PostgreSQL）   │
│  提供 REST API、WebSocket 广播、流地址、内容分析、日报生成等   │
└──────────┬──────────────────────────────────────────────────┘
           │ webhook / 自动化
           ▼
┌─────────────────────────────────────────────────────────────┐
│         n8n 工作流  https://n8n.saidao.cc                    │
│  （webhook 通知、钉钉/企微/飞书推送等自动化）                  │
└─────────────────────────────────────────────────────────────┘
```

**架构要点**：
- 前端**无后端依赖本地构建**，所有业务逻辑由原生 JS 模块在浏览器内执行，资源通过 Service Worker 离线缓存。
- 与后端通信分两条通道：
  - **REST**（`fetch` 封装于 `api.js` 的 `request()`）：用于鉴权、数据 CRUD、上传；
  - **WebSocket**（`wss://api.saidao.cc/ws/chat`）：用于聊天室实时消息、在线人数、热词、状态变更、日报更新、投票更新等广播。
- **流媒体**（直播）通过后端返回的 HLS（`.m3u8`）/ FLV（`.flv`）地址，在前端用 hls.js / mpegts.js / flv.js 播放。

---

## 3. 目录结构

```
Saidao/
├── index.html                 # 主页入口（主播列表 + 聊天室 + 各类模态框）
├── player.html                # 独立播放页（视频 + 弹幕 + 评论）
├── sponsor.html               # 赞助页（微信/支付宝二维码）
├── manifest.json              # PWA manifest
├── service-workV3.js          # Service Worker（离线缓存）
├── L2Dwidget.min.js           # Live2D 看板娘
├── favicon.ico / icon-*.png   # 图标
├── ads.txt                    # 广告策略文件
├── animation/                 # 13 个 Lottie 动画 JSON
├── images/                    # 支付二维码等图片
├── assets/
│   ├── css/                   # 6 个 CSS 文件
│   │   ├── main.css           # 主样式
│   │   ├── chat-moments.css   # 聊天时间线样式
│   │   ├── chat-polls.css     # 掰头投票样式
│   │   ├── player.css         # 播放页样式
│   │   ├── sliding-captcha.css# 滑动验证码样式
│   │   └── video-room.css     # 视频点播样式
│   ├── images/                # logo 等
│   └── js/                    # 15 个 JS 模块
│       ├── config.js          # 全局配置 + 全局状态
│       ├── api.js             # REST 请求封装 + 指纹 + 端点
│       ├── sliding-captcha.js # 滑动拼图验证码
│       ├── chat-input-utils.js# 输入框工具
│       ├── chat-voice-utils.js# 语音工具
│       ├── chat-quote-utils.js# 引用工具
│       ├── chat-link-preview.js# 链接预览
│       ├── video-room.js      # 视频点播室管理器
│       ├── battle-ui.js       # 掰头阵营徽章
│       ├── app.js             # 主应用逻辑（超大文件，约 169KB）
│       ├── chat-moments.js    # 聊天时间线
│       ├── chat-polls.js      # 红蓝掰头投票
│       ├── chat-room.js       # 聊天室工厂（独立 socket 实例）
│       ├── player.js          # 独立播放页逻辑
│       └── ...
└── docs/
    └── superpowers/specs/     # 历史设计规格文档
```

---

## 4. 技术栈清单

### 4.1 前端

| 类别 | 技术 | 用途 |
|------|------|------|
| 语言 | 原生 HTML / CSS / JavaScript（ES2020+） | 全站，无构建框架 |
| 实时通信 | 原生 `WebSocket` | 聊天室、在线人数、状态广播 |
| 流媒体 | `hls.js` | HLS（`.m3u8`）直播播放 |
| 流媒体 | `mpegts.js` | FLV（`.flv`）直播播放（部分场景） |
| 流媒体 | `flv.js` | FLV 直播播放（降级/备用） |
| 设备指纹 | `FingerprintJS` | 生成设备 `fp`，降级为 `crypto.randomUUID()` |
| 离线缓存 | 原生 `Service Worker` + Cache API | 缓存表情包 / Lottie / 图片 |
| PWA | `manifest.json` + Service Worker | 可安装、离线可用 |
| 看板娘 | `L2Dwidget.min.js`（Live2D） | 主页互动看板娘 |
| 动画 | Lottie（`animation/*.json`） | 表情/动效 |
| 录音 | `MediaRecorder` + `AudioContext` | 语音消息录制与波形生成 |
| 验证码 | 自研滑动拼图（`sliding-captcha.js`） | 防滥用/防刷 |

### 4.2 后端（依据设计文档与 API 约定）

| 类别 | 技术 |
|------|------|
| 框架 | Spring Boot 3.3 |
| 语言 | Java 21 |
| ORM | MyBatis-Plus 3.5 |
| 数据库 | PostgreSQL |
| 实时 | WebSocket（`/ws/chat`、`/player/ws`） |
| 自动化 | n8n 工作流（webhook 通知、第三方 IM 推送） |

### 4.3 关键全局配置（`assets/js/config.js`）

```js
window.SaidaoConfig = Object.freeze({
    API_BASE_URL: 'https://api.saidao.cc',   // REST 基地址
    N8N_BASE_URL: 'https://n8n.saidao.cc',   // n8n 基地址
    WS_BASE_URL: 'wss://api.saidao.cc',      // WebSocket 基地址
    TOKEN_KEY: 'ACCESS_TOKEN'                 // localStorage 中 token 键名
});

window.SaidaoState = {
    isLoggedIn, currentUser, currentStatus: 'live',
    chatExpanded, emojiExpanded, currentEmojiGroup, chatWidth: 540,
    webhookType, isMobile, faction, canEditSaidaoTag
};
```

---

## 5. 前端模块划分

各模块均为原生 JS，按「配置 → 请求 → 业务 → 功能」分层加载（`index.html` 中的 `<script>` 顺序即依赖顺序）。

| 模块 | 职责 | 关键导出 / 入口 |
|------|------|----------------|
| `config.js` | 全局配置与全局状态 | `window.SaidaoConfig`、`window.SaidaoState` |
| `api.js` | REST 统一封装、指纹、端点 | `window.request`、`window.ApiEndpoints`、`window.getFingerprint` |
| `sliding-captcha.js` | 滑动拼图验证码 | challenge / verify 流程，返回 `bypass` 或 `ticket` |
| `chat-input-utils.js` | 输入框：发送键判定、自动增高、语音入口 | 输入框工具函数 |
| `chat-voice-utils.js` | 语音：时长格式化、气泡宽度、波形生成/钳制、MIME | 语音工具函数 |
| `chat-quote-utils.js` | 引用：解析、纯文本提取、安全 URL、图片引用 | 引用工具函数 |
| `chat-link-preview.js` | 链接预览（带「请谨慎访问」提示） | `ChatLinkPreview.create(container)` |
| `video-room.js` | 视频点播室：BV 提交、投票、播放列表 | `window.VideoRoomManager` |
| `battle-ui.js` | 掰头阵营徽章（红方/蓝方）+ tooltip | 徽章渲染 |
| `app.js` | **主应用**：初始化、设备检测、主播列表、聊天分发、登录、日报、热词、内容分析 | `initializeApp()` 等 |
| `chat-moments.js` | 聊天时间线（近 2 小时话题摘要，AI 生成，60s 轮询） | `window.ChatMoments` |
| `chat-polls.js` | 红蓝掰头：创建/投票/历史/倒计时（15s 轮询，每天限一次发起） | `window.ChatPolls` |
| `chat-room.js` | **聊天室工厂**：每实例独立 socket、消息渲染、表情、语音、引用、@、历史加载、视频弹窗 | `ChatRoom.create(options)` |
| `player.js` | 独立播放页：HLS/FLV、小窗 PiP、全屏、音量、弹幕、评论 | IIFE，绑定 `player.html` DOM |

### 5.1 加载顺序（`index.html`）

```
config.js → api.js → sliding-captcha.js → chat-input-utils.js
→ chat-voice-utils.js → video-room.js → chat-quote-utils.js
→ chat-link-preview.js → battle-ui.js → app.js
→ chat-moments.js → chat-polls.js
```

`app.js` 作为主逻辑在工具模块之后加载，负责装配聊天室（`ChatRoom.create`）、初始化 WebSocket、主播卡片、日报等。

### 5.2 聊天室工厂（`chat-room.js`）

采用**工厂模式**：`ChatRoom.create(options)` 返回一个独立实例，每个实例持有自己的 `socket`，可创建多个聊天室互不干扰。核心能力：
- 消息渲染：普通 / 系统 / 语音 / 图片；
- 引用回复、@ 提醒；
- 表情管理（common / animation / vip 分组 + 自定义上传）；
- 语音录制（`MediaRecorder`）、波形生成、播放；
- 上下文菜单（复制 / 引用 / @，长按触发）；
- 历史消息加载（滚动到顶部触发）；
- WebSocket 连接 / 重连；
- 视频弹窗（可拖拽 / 缩放 / 全屏）；
- 新消息提示、@ 我提示。

---

## 6. WebSocket 通信协议

### 6.1 连接

- **聊天室**：`wss://api.saidao.cc/ws/chat?token=<token>&fp=<fingerprint>`
- **播放页**：`wss://api.saidao.cc/player/ws`（带 `uid` 参数标识主播）

`app.js` 与 `chat-room.js` 均建立 `/ws/chat` 连接（主聊天 + 房间实例），通过 `token` 鉴权、`fp` 设备指纹关联。

### 6.2 消息分发（`app.js` 的 `setupWebSocket()`）

服务端下发 JSON 消息，按 `data.type` 分发：

| `type` | 处理 |
|--------|------|
| `captchaRequired` | 触发滑动验证码 `handleCaptchaRequired()` |
| `user` | 用户聊天消息 → `addMessageToChat(data)`（发送成功时清空 `pendingMessage`） |
| `link_preview` | 链接预览 → `linkPreviews.receive(data)` |
| `history` | 历史消息回放（重置并批量渲染，`replay` 期间忽略） |
| `error` | `Toast.show(data.content, 'error')` |
| `system` | 系统消息 → `addSystemMessageToChat(data)` |
| `pollUpdate` | 投票更新 → 系统消息 + `ChatPolls.refresh()` |
| `onlineCount` | 更新在线人数文案 `${count}人在线` |
| `hotWords` | 渲染热词 `renderHotWords(data.words)` |
| `status` | 主播状态变更 → 系统消息 + 重新 `fetchStreamers()` |
| `dailyReportUpdate` | 日报更新 → 系统消息 + `fetchDailyReports()` |
| `saidaoTagUpdated` | 应用主播标签更新 `applySaidaoTagUpdate(data)` |
| `saidaoCoverUpdated` | 应用主播封面更新 `applySaidaoCoverUpdate(data)` |
| `saidaoContentAnalysisUpdated` | 应用 AI 内容分析结果 `applySaidaoContentAnalysisUpdate(data)` |
| `hotScoreUpdate` | 应用热度分 `applyHotScoreUpdate(data.scores)` |
| `clear` | 清空聊天（链接预览、回放缓冲、消息列表） |
| `messageDeleted` | 标记消息已删除 `markChatMessageDeleted(data.messageId)` |

### 6.3 视频点播相关消息（转发至 `VideoRoomManager`）

`videoVoting` / `videoVoteUpdate` / `videoApproved` / `videoRejected` / `videoPlay` / `videoPlayEnd` / `videoFailed` / `videoSkipped` / `videoDeleted` —— 当 `window.VideoRoomManager` 存在时，由 `app.js` 统一转发。

### 6.4 重连与防抖

- 聊天室 socket 关闭后通过 `chatReconnectTimer` 定时重连；
- `closeChatSocket({ preventReconnect })` 可主动关闭并抑制重连；
- 通过 `socket !== currentSocket` 判定，丢弃过期连接的消息，避免竞态。

---

## 7. API 端点清单

全部经 `api.js` 的 `request()` 封装（自动附加 `fp` 指纹、`Authorization`、loading、401 处理）。`fromN8N: true` 时基地址切换为 `N8N_BASE_URL`。

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/saidao/` | GET | ✔ | 主播列表（saidao） |
| `/saidao/options` | POST | ✔ | 更新选项 |
| `/saidao/tag` | POST | ✔ | 更新主播标签 |
| `/saidao/click?saidaoId=` | POST | — | 点击计数 |
| `/user/` | GET | ✔ | 当前用户 |
| `/user/{userId}` | GET | — | 用户详情 |
| `/user/login` | POST | — | 登录 |
| `/user/allocate` | POST | — | 账号分配 |
| `/user/changePassword` | POST | ✔ | 修改密码 |
| `/user/sendVerificationCode` | POST | — | 发送验证码 |
| `/user/captcha` | GET | — | 图形验证码 |
| `/user/update` | POST | ✔ | 更新资料（阵营/webhook） |
| `/user/chatFilterConfig` | GET/POST | ✔ | 聊天筛选配置 |
| `/user/chatBan` | POST | ✔ | 聊天禁言 |
| `/notice` | GET | — | 公告 |
| `/message/delete` | POST | ✔ | 删除消息 |
| `/message/history?messageId=` | GET | ✔ | 消息历史 |
| `/message/history/window` | GET | ✔ | 历史消息窗口 |
| `/message/moments` | GET | ✔ | 聊天时间线 |
| `/chat/polls` | GET/POST | ✔ | 掰头列表 / 创建 |
| `/chat/polls/status` | GET | — | 掰头状态 |
| `/chat/polls/{id}/ballots` | POST | ✔ | 投票 |
| `/emoji/{group}` | GET | ✔ | 查询表情 |
| `/emoji/upload` | POST | ✔ | 上传自定义表情 |
| `/api/image/upload` | POST | ✔ | 上传图片 |
| `/api/voice/upload` | POST | ✔ | 上传语音 |
| `/webhook/testWebhook` | POST | ✔ (n8n) | 测试 webhook |
| `/dailyReport/list` | GET | — | 抽象日报列表 |
| `/videoRequest/submit` | POST | ✔ | 提交点播（BV 号） |
| `/videoRequest/vote` | POST | ✔ | 点播投票 |
| `/videoRequest/list` | GET | — | 点播列表 |
| `/videoRequest/skip` | POST | ✔ | 跳过点播 |
| `/videoRequest/delete?videoRequestId=` | POST | ✔ | 删除点播 |

**请求头约定**：
- `Accept: application/json`
- `fp: <fingerprint>`（每次请求必带）
- `Authorization: <token>`（`withAuth: true` 时）
- `Content-Type: application/json`（非 FormData 时）
- `credentials: 'include'`（携带 Cookie）

---

## 8. 核心功能模块

### 8.1 主播直播卡片（主页）
- 筛选 tabs：**直播中 / 全部 / 抽象日报**；
- 卡片内嵌 **HLS/FLV 实时预览**（`app.js` 检测低性能 / 省流 / 减少动画时降级不自动播放）；
- 点击计数（`/saidao/click`）、主播标签 / 封面 / 热度实时更新（WebSocket `saidaoTagUpdated` / `saidaoCoverUpdated` / `hotScoreUpdate`）；
- AI 内容分析（游戏直播识别、屏蔽提示）。

### 8.2 聊天室（`chat-room.js` + `app.js`）
- 可拖拽宽度（默认 540px），移动端为底部抽屉；
- 消息类型：普通 / 系统 / 语音 / 图片 / 链接预览 / 引用 / @；
- 表情分组（common / animation / vip）+ 自定义上传；
- 语音录制（`MediaRecorder`）+ `AudioContext` 波形；
- 上下文菜单（复制 / 引用 / @，长按触发）；
- 历史消息（滚动顶部加载）；
- 聊天筛选规则（屏蔽用户 ID / 昵称 / IP 属地 / 关键词正则）；
- 视频弹窗（可拖拽 / 缩放 / 全屏）；
- 热词定位高亮。

### 8.3 抽象日报（`app.js` + 设计文档）
- 后端 Spring Boot 生成（基于聊天内容），前端 `/dailyReport/list` 拉取 + WebSocket `dailyReportUpdate` 广播；
- `localStorage` 记录已看日报 ID；
- 详见 `docs/superpowers/specs/2026-07-09-abstract-daily-report-design.md`。

### 8.4 红蓝掰头（`chat-polls.js` + `battle-ui.js`）
- 创建（每天限一次发起，全局同时仅一场）、投票、历史、倒计时；
- 15 秒轮询 `ChatPolls.refresh()` + WebSocket `pollUpdate`；
- 阵营徽章（红方 / 蓝方）+ tooltip。

### 8.5 聊天时间线（`chat-moments.js`）
- 近 2 小时话题摘要（AI 生成），`/message/moments`；
- 60 秒轮询刷新，`window.ChatMoments` API，支持 `invalidate()`。

### 8.6 视频点播室（`video-room.js`）
- `window.VideoRoomManager`：BV 号提交、投票、播放列表；
- WebSocket 消息驱动（`videoVoting` / `videoPlay` 等 9 种）。

### 8.7 独立播放页（`player.html` + `player.js`）
- URL 参数：`uid`（主播）、`src`/`url`/`stream`（直接流地址）；
- 流类型判定：`.flv` → flv，`.m3u8` → hls；
- 弹幕层（车道制：高度 36px、间距 32px、速度 90px/s）、评论面板（`wss://api.saidao.cc/player/ws`）、小窗 PiP、全屏、音量、刷新（10s 重试）；
- 移动端隐藏 PiP / 评论面板，适配触控。

### 8.8 赞助页（`sponsor.html`）
- 微信 / 支付宝支付二维码。

---

## 9. 认证与指纹机制

### 9.1 登录与 Token
- 登录：`/user/login`（POST），成功后 token 存 `localStorage[ACCESS_TOKEN]`；
- 支持**图形验证码**（`/user/captcha`）与**滑动拼图验证码**（`sliding-captcha.js`）；
  - 滑动验证码流程：`/captcha/slider` 获取 challenge → `/captcha/slider/verify` 验证；
  - 返回 `bypass`（后端禁用验证码）或 `ticket`（放行票据）；`isBanned` 表示被 ban；
- 鉴权请求统一携带 `Authorization: <token>`；
- **401 处理**：`request()` 捕获 401 → `openLoginModal()` + `Toast.show('请先登录')`。

### 9.2 设备指纹（fp）
- `window.getFingerprint()`：优先 `FingerprintJS.load()` 取 `visitorId`，失败降级 `crypto.randomUUID()`；
- 结果缓存于 `localStorage['fingerprint']`，以 Promise 单例复用；
- 每个 REST 请求的 `fp` header、每条 WebSocket 连接的 `fp` query 参数均携带，用于设备标识与风控。

### 9.3 聊天风控
- 聊天筛选配置（`/user/chatFilterConfig`）：屏蔽用户 ID / 昵称 / IP 属地 / 关键词（正则）；
- 禁言（`/user/chatBan`）、删除消息（`/message/delete`）。

---

## 10. PWA 与离线缓存策略

`service-workV3.js`（`SW_VERSION = 'v1.1.0'`，`CACHE_NAME = pwa-cache-v1.1.0`，`MAX_CACHE_ENTRIES = 160`）：

- **缓存范围**（`CACHE_PREFIXES`）：
  - `https://ali2.a.yximgs.com/bs2/emotion`（表情）
  - `https://cdnl.iconscout.com/lottie/premium/thumb`（Lottie）
  - `https://rustfs.saidao.cc/images`（图片）
- **可缓存资源**：`jpg/jpeg/png/gif/webp/svg/json`，或 URL 含 `images` / `emotion` / `lottie`；
- **缓存键**：去除 query / hash 后的规范化 `Request`（`no-cors` + `omit`）；
- **install**：`skipWaiting()` + `addAll(STATIC_ASSETS)`（当前 `STATIC_ASSETS = []`）；
- **activate**：删除旧版本缓存 + `trimCache()`（超出 160 条按 FIFO 删除）+ `clients.claim()`；
- **fetch**：仅处理 GET 且命中前缀的请求 → **Cache First**（命中直接返回；未命中则 `fetch` 后 `cache.put` 并 `trimCache`）；
- **离线降级**：`fetch` 失败时返回 1×1 透明 PNG 占位图，避免界面破图。

`manifest.json` 提供 PWA 名称 / 图标 / 显示模式，使站点可安装、离线可用。

---

## 11. 数据流

### 11.1 初始化流程

```
页面加载
  → config.js 初始化 SaidaoConfig / SaidaoState
  → api.js 注册 request / ApiEndpoints / getFingerprint
  → 工具模块加载
  → app.js initializeApp()
      ├─ 设备检测（isMobile / 低性能 / saveData / reduced-motion）
      ├─ checkIsLogin()（读 localStorage token → /user/ 校验）
      ├─ fetchStreamers()（/saidao/ 拉主播列表 → 渲染卡片 → 启动 HLS/FLV 预览）
      ├─ fetchDailyReports()（/dailyReport/list）
      ├─ setupWebSocket()（建立 /ws/chat，注册消息分发）
      ├─ ChatRoom.create()（装配聊天室，独立 socket）
      └─ 启动 ChatMoments（60s 轮询）/ ChatPolls（15s 轮询）
```

### 11.2 聊天消息流

```
用户输入 → 语音录制(MediaRecorder)/图片上传(/api/*upload)
  → 发送（socket.send 或 REST）
  → 后端落库 + 广播
  → 各客户端 socket 收到 {type:'user', ...}
  → app.js 分发 → ChatRoom.addMessage() 渲染
  → 新消息提示 / @我提示 / 链接预览
```

### 11.3 实时事件流（WebSocket 广播驱动 UI）

```
status          → 主播上下播 → 刷新主播列表
onlineCount     → 更新在线人数
hotWords        → 渲染热词
dailyReportUpdate→ 刷新日报列表
pollUpdate      → 刷新掰头
saidaoTag/Cover/ContentAnalysis/hotScore → 更新主播卡片
clear / messageDeleted → 清理 / 标记消息
```

### 11.4 视频点播流

```
用户提交 BV(/videoRequest/submit) → 投票(/vote)
  → 后端审批 → WebSocket videoApproved/videoPlay
  → VideoRoomManager 更新播放列表 → 播放页/卡片播放
```

---

## 12. 性能与降级策略

- **流预览降级**：检测到 `prefers-reduced-motion`、`saveData`（省流）、低性能设备时，主播卡片不自动播放 HLS/FLV 预览，仅展示封面；
- **指纹降级**：`FingerprintJS` 加载失败 → `crypto.randomUUID()`；
- **离线降级**：Service Worker `fetch` 失败 → 1×1 透明 PNG 占位；
- **缓存上限**：Service Worker 缓存最多 160 条，FIFO 淘汰；
- **轮询频率控制**：时间线 60s、掰头 15s，避免高频请求；
- **WebSocket 防竞态**：`socket !== currentSocket` 丢弃过期连接消息；重连定时器可抑制；
- **Loading 态**：`request()` 支持 `showLoading` 开关，批量/轮询请求静默。

---

## 附：历史设计文档

- `docs/superpowers/specs/2026-07-09-abstract-daily-report-design.md` —— 抽象日报模块（前端 + Spring Boot + WebSocket 广播）设计；
- `docs/superpowers/specs/2026-07-13-compact-chatroom-design.md` —— 聊天室紧凑样式设计。

---

*报告结束。*
