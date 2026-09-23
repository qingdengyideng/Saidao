# 02 · 主页规格（Home Page）

> 页面：`index.html` ｜ 主逻辑：`app.js` ｜ 配置：`config.js`

主页是 Saidao 的核心入口，承载「主播直播卡片列表 + 实时聊天室」。布局为：左侧/主体是卡片网格，右侧（桌面）是聊天室侧栏；移动端卡片为主、聊天室全屏覆盖。

---

## 1. 页面布局线框图

### 1.1 桌面端（> 768px）

```
┌──────────────────────────────────────────────────────────────────┐
│  [logo]  📢 通知栏（滚动文字）                    [♥][⬇][🌙][头像/登录] │  ← header
├──────────────────────────────────────────────────────────────────┤
│  [直播中] [全部] [抽象日报●]                [↻ 刷新]                  │  ← filter tabs
├──────────────────────────────────────────────────┬───────────────┤
│                                                  │  💬 聊天室    │
│  ┌────────────────┐  ┌────────────────┐          │  [在线N人][🔥] │
│  │  主播卡片 A     │  │  主播卡片 B     │          │ ┌───────────┐ │
│  │  (封面+预览)    │  │  (封面+预览)    │          │ │ Hot 热词  │ │
│  │  LIVE 🔥128    │  │  未开播         │          │ └───────────┘ │
│  │  头像 名字      │  │  头像 名字      │          │ ( 消息流     │ │
│  │  📡 渠道       │  │  📡 渠道       │          │   ... )      │ │
│  │  AI标签  [⋯]   │  │  AI标签  [⋯]   │          │   ...        │ │
│  └────────────────┘  └────────────────┘          │ ┌───────────┐ │
│  ┌────────────────┐  ┌────────────────┐          │ │[屏蔽][时间线]│ │
│  │  主播卡片 C     │  │  主播卡片 D     │          │ │[掰头]      │ │
│  └────────────────┘  └────────────────┘          │ └───────────┘ │
│       ( 卡片网格，可滚动 )                          │ [😀][🎤][输入框][➤]│
│                                                  └───────────────┘
└──────────────────────────────────────────────────┴───────────────┘
                          ▲ 聊天室可拖拽宽度（250~600px）
```

### 1.2 移动端（≤ 768px）

```
┌──────────────────────────────────┐
│ [logo] 📢通知           [♥][🌙][登录] │
├──────────────────────────────────┤
│ [直播中][全部][日报●]    [↻]         │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ 主播卡片（纵向/单列网格）      │ │
│ │ ...                          │ │
│ └──────────────────────────────┘ │
│ ( 点聊天入口 → 聊天室全屏覆盖 )     │
└──────────────────────────────────┘
  聊天室展开时：铺满全屏（顶部到底），可关闭返回
```

---

## 2. 头部 Header

### 2.1 布局

```
┌──────────────────────────────────────────────────────────┐
│ ┌─────────┐  📢 [ 滚动通知文字（仅溢出时滚动） ]   [♥][⬇][🌙][👤] │
│ │  logo   │  （无通知时整栏隐藏）                         │
│ └─────────┘                                              │
└──────────────────────────────────────────────────────────┘
```

### 2.2 交互项

| 元素 | ID | 交互 | 数据/边界 |
|------|----|----|-----------|
| **通知栏** | `noticeBar`/`noticeText` | 初始化拉取 `GET /notice`（纯字符串 data），写入文本；文本溢出可视宽度才加 `is-scrolling` 滚动；窗口 resize 重判 | 无通知时 `noticeBar`+`noticeIcon` 隐藏；仅初始化拉取一次，无轮询/WS |
| **赞助按钮** | `sponsorBtn` | 点击 → `location.href = 'sponsor.html'`（整页跳转） | 见 [08-sponsor-pwa.md](./08-sponsor-pwa.md) |
| **PWA 安装** | `installButton` | 默认隐藏；浏览器 `beforeinstallprompt` 触发后显示；点击弹系统安装框 | accepted→Toast 成功；dismissed→10s 后重显；`appinstalled` 隐藏 |
| **深色模式** | `darkModeToggleBtn` | 切换 `data-theme=dark`，localStorage 持久化，图标 🌙↔☀️ | 初始化 `applyDarkMode()` 恢复 |
| **登录/头像** | `loginBtn`/`userAvatar` | 未登录显示「登录/注册」→ 弹登录框；已登录显示头像 → 弹资料框 | `updateUIState()` 切换；见 [05-account.md](./05-account.md) |

### 2.3 全局加载态

`#global-loading`（header 内 spinner）。`api.js` 的 `request({showLoading:true})` 默认显示，高频/后台请求传 `showLoading:false` 静默（notice/轮询/点击计数/列表等）。

---

## 3. 筛选 Tabs

### 3.1 布局

```
┌────────────────────────────────────────────────────────┐
│  [直播中]   [全部]   [抽象日报 ●]              [↻ 刷新]   │
│   active                                    红点(更新啦)  │
└────────────────────────────────────────────────────────┘
```

### 3.2 交互逻辑

| Tab | data-status | 行为 |
|-----|-------------|------|
| 直播中 | `live` | 仅显示 `status==='live'` 且未开「不想看TA」的主播 |
| 全部 | `all` | 显示全部主播 |
| 抽象日报 | `dailyReport` | 切换到日报卡片列表；进入时 `markDailyReportsSeen()` 清红点 |
| 刷新 | — | 仅 `fetchStreamers()` 重新拉主播列表（**不刷新日报**，无图标动效） |

**关键机制**：
- `currentStatus` 只影响**前端过滤与渲染分支**，列表请求始终拉全量 `/saidao/` 与 `/dailyReport/list`（请求不携带 status）。
- 同一 `renderStreamerCards()` 入口：`dailyReport` 时转 `renderDailyReportCards()`，否则渲染主播卡。
- 游戏直播屏蔽：`blockGameLive` 开启时，过滤掉 `status==='live' && contentAnalysis.isGame` 的主播（**仅作用于卡片，不作用于聊天**）。

### 3.3 抽象日报「更新啦」红点

```
fetchDailyReports() / WS dailyReportUpdate
        │
        ▼
maxId = dailyReportsData 中最大 id
lastSeenId = localStorage[DAILY_REPORT_LAST_SEEN_ID]
        │
   maxId > lastSeenId ?
     ├─ 是 → reportTabDot 显示「更新啦」
     └─ 否 → 隐藏
        │
  切到日报 tab → markDailyReportsSeen() → lastSeenId = maxId → 红点消失
```

### 3.4 日报卡片

```
┌────────────────────────┐
│  [ 封面背景图 ]          │
│  标题（report-card-title）│
│  🕐 2026-09-21 12:30    │
└────────────────────────┘
   点击 → window.open(link, '_blank', 'noopener')
```
字段：`id` / `title` / `link` / `cover` / `updateTime`（unix 秒 → `YYYY-MM-DD HH:mm`）。空列表显示「暂无日报」。

---

## 4. 主播直播卡片

### 4.1 卡片布局线框图

```
┌────────────────────────────────────────┐
│ ┌────────────────────────────────────┐ │
│ │  封面层 (streamer-cover-layer)       │ │
│ │  ┌─────────┐                       │ │
│ │  │LIVE  09: │  封面图（直播中且有效） │ │
│ │  │  32:15  │  未开播/无封面→头像底   │ │
│ │  └─────────┘  [主播标签·可编辑]      │ │
│ │  (hover/点击 → 内嵌 HLS/FLV 预览)   │ │
│ └────────────────────────────────────┘ │
│  [头像]  主播名字  🔥128                │
│         📡 渠道名                       │
│         [AI标签 ℹ️]                      │
│                              [⋯ 设置]   │
│        (设置下拉: ☐ 不想看TA)            │
└────────────────────────────────────────┘
```

### 4.2 卡片元素

| 元素 | 条件 | 说明 |
|------|------|------|
| 封面 | 直播中且 `cover` 有效 | `onerror` 降级为头像底图 |
| 未开播/无封面 | `status!=='live'` 或无 cover | 头像底 + 灰化 |
| LIVE 徽标 | `status==='live'` | + 开播时间 `startTime` |
| 未开播徽标 | 否则 | 「未开播」 |
| 热度分 | `live && hotScore>0` | `🔥 Math.ceil(hotScore)`，WS `hotScoreUpdate` 实时更新并**按热度重排序** |
| 主播标签 | `tag` 非空 | 可编辑（`canEditSaidaoTag`）显示为按钮，否则 span |
| AI 标签 | `contentAnalysis.aiLabel` | 游戏直播附帮助图标；点击 Toast 提示「AI标签由模型识别…可能误判」 |
| 设置按钮 | 始终 | `⋯` 竖排三点，展开下拉「不想看TA」开关 |

### 4.3 卡片交互（事件委托，按优先级）

```
卡片点击
  ├─ 日报卡片？ → 新标签打开 link
  ├─ 可编辑标签？ → (canEditSaidaoTag) 开标签编辑弹窗
  ├─ AI 帮助图标？ → Toast 提示
  ├─ 设置按钮？ → 展开/收起「不想看TA」下拉
  ├─ 触屏点卡片内容？ → 切换预览（触屏点按=预览，不跳转）
  └─ 点封面区？ →
       ├─ 直播中 → POST /saidao/click（点击计数，静默失败）
       └─ 有 url → window.open(url, '_blank') 进播放页
```

### 4.4 内嵌实时预览

```
触发：
  桌面(hover) → pointerenter 启动 / pointerleave 停止
  触屏(点击) → 点卡片内容切换
  停止：点卡片外 / pagehide / 重渲染

启动前置：status==='live' && 流类型非空(.m3u8→hls / .flv→flv)
引擎：
  FLV → mpegts.js（不可用则降级不预览）
  HLS → 原生(Safari) 或 hls.js（lowLatencyMode, backBufferLength 30）
事件：playing→去 loading；error/HLS fatal→停止预览
注意：无低性能/省流检测，仅靠库可用性与播放事件降级
```

### 4.5 「不想看TA」

```
切换开关 → POST /saidao/options {saidaoId, notShow}
  成功且开启 → Toast「已置底并屏蔽开播消息」
  无论结果 → fetchStreamers() 重拉重渲
边界：live tab 下开启后该卡片消失（过滤条件 !notificationEnabled），全部 tab 仍在
```

---

## 5. 实时事件（WS → 卡片）

| WS type | 处理 |
|---------|------|
| `status` | 系统消息 + `fetchStreamers()`（上下播刷新列表） |
| `dailyReportUpdate` | 系统消息 + `fetchDailyReports()`（日报+红点） |
| `saidaoTagUpdated` | 更新 `streamersData` 标签（不强制重渲） |
| `saidaoCoverUpdated` | 更新封面；liveUrl 变更则重连预览 |
| `saidaoContentAnalysisUpdated` | 更新 AI 标签；isGame 翻转且屏蔽开启→全量重渲 |
| `hotScoreUpdate` | 更新热度分 + 按热度降序重排卡片 |

> 卡片实时更新的详细字段与边界见 [06-saidao-ops.md](./06-saidao-ops.md)。

---

## 6. 初始化流程（initializeApp）

```
DOMContentLoaded
  1. applyDarkMode()            恢复主题
  2. detectDeviceType()         isMobile = innerWidth<=768
  3. setViewportHeightVar()     设置 --vh
  4. applyStoredChatImageFilter() 恢复图片屏蔽
  5. syncGameFilterUi()         同步游戏直播开关
  6. setHotWordsCollapsed()     恢复热词折叠
  7. loadChatFilterRules()      加载屏蔽规则
  8. initEventListeners()       绑定所有事件
  9. initializeFactionSelection()
  10. initializeEmojiPreviewDelegation()
  11. fetchStreamers()          拉主播列表
  12. fetchDailyReports()       拉日报
  13. fetchNotice()             拉通知
  14. checkIsLogin()            校验登录
  15. showPendingAllocationCredentials()  恢复分配凭据
  16. setupWebSocket()          建立 WS
  17. updateUIState()           切登录/头像
  18. 设聊天室宽度 / 桌面展开聊天 / 绑定 resize/pagehide
```

---

## 7. 边界与重构注意点

1. `refreshCurrentTab`/`getCurrentStatus`/`loadData` 是**死代码**，刷新按钮实际只 `fetchStreamers()`。
2. 点击计数 `clickSaidao` 仅直播中触发，失败静默。
3. 预览无低性能/省流/减少动画检测（与 ARCHITECTURE.md 描述不符），重构可补充。
4. 红点状态、深色模式、图片/游戏屏蔽、热词折叠均 localStorage 持久化，跨会话保持。
5. 401 统一弹登录框 + Toast「请先登录」。

---

## 8. 涉及接口

| 接口 | 方法 | 用途 |
|------|------|------|
| `/notice` | GET | 通知（纯字符串） |
| `/saidao/` | GET | 主播列表 |
| `/saidao/click?saidaoId=` | POST | 点击计数 |
| `/saidao/options` | POST | 不想看TA |
| `/saidao/tag` | POST | 标签编辑（见 06） |
| `/dailyReport/list` | GET | 日报列表 |
| `/user/` | GET | 当前用户 |
| WS `/ws/chat` | — | 实时事件（见上表） |

详细字段见 [../api/saidao.md](../api/saidao.md)、[../api/daily-report.md](../api/daily-report.md)、[../api/websocket.md](../api/websocket.md)。
