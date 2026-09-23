# 04 · 播放页规格（player.html）

> 独立直播播放页。入口：`player.html?uid={主播uid}`（默认 uid `1159606549`），亦可携带 `src` / `url` / `stream` / `name` 直连流。
> 职责：拉取主播信息 → 按流类型播放（HLS / FLV）→ 弹幕 + 实时评论 → 小窗 / 全屏 / 音量。无账号体系，游客即可观看。

---

## 0. 页面角色与边界

- **无鉴权**：播放页不读取 token，不登录，不依赖 SaidaoState。
- **单向只读**：只有"看"，没有"发"——弹幕与评论都来自主播源站 WS，本页不可发言。
- **移动端策略**：移动端 UA 且 `channel !== "youtube"` 时，直接 `location.href` 跳回主播源站，不在本页播放（仅 YouTube 渠道在站内播）。
- **默认 uid**：未传 `uid` 时用 `DEFAULT_UID = "1159606549"`。

---

## 1. 页面布局线框图

### 1.1 桌面端（两栏：播放区 + 评论栏）

```
┌──────────────────────────────────────────────────────────────────────┐
│  playerLayout (flex row)                                             │
│  ┌──────────────────────────────────────────────┐ ┌───────────────┐  │
│  │  playerArea                                  │ │ commentPanel  │  │
│  │  ┌──────────────────────────────────────────┐│ │  ┌───────────┐│  │
│  │  │  pipPlaceholder (小窗时占位, 默认隐藏)     ││ │  │ 直播评论   ││  │
│  │  │  [ 正在小窗中播放 ]  [ 返回页面播放 ]      ││ │  │  已连接    ││  │
│  │  ├──────────────────────────────────────────┤│ │  ├───────────┤│  │
│  │  │  playerShell                             ││ │  │ 全部评论   ││  │
│  │  │  ┌────────────────────────────────────┐  ││ │  ├───────────┤│  │
│  │  │  │ stage-header                       │  ││ │  │           ││  │
│  │  │  │  (头像) 主播名  [直播中▮▮] 房间 xxx  │  ││ │  │ commentList││  │
│  │  │  │                     [ 去源站 ↗ ]   │  ││ │  │ (滚动,     ││  │
│  │  │  ├────────────────────────────────────┤  ││ │  │  最多200条)││  │
│  │  │  │                                    │  ││ │  │           ││  │
│  │  │  │         <video>                    │  ││ │  │           ││  │
│  │  │  │   ┌────────────────────────────┐   │  ││ │  │           ││  │
│  │  │  │   │ danmakuLayer (弹幕, 右上叠放)│   │  ││ │  │  ┌───────┐│  │
│  │  │  │   └────────────────────────────┘   │  ││ │  │  │回到最新││  │
│  │  │  │                                    │  ││ │  │  └───────┘│  │
│  │  │  │  [ statusOverlay 加载/错误遮罩 ]   │  ││ │  ├───────────┤│  │
│  │  │  │  [ tapPlayBtn 点击播放 (居中) ]    │  ││ │  │ 此刻一起看 ││  │
│  │  │  │                                    │  ││ │  │ 直播      ││  │
│  │  │  ├────────────────────────────────────┤  ││ │  │ [P] 声音  ││  │
│  │  │  │ player-controls                    │  ││ │  └───────────┘│  │
│  │  │  │ [刷新][音量▾] ── [弹幕开][小屏][全屏]│  ││ │              │  │
│  │  │  └────────────────────────────────────┘  ││ │               │  │
│  │  └──────────────────────────────────────────┘│ └───────────────┘  │
│  └────────────────────────────────────────────────────────────────────┘
```

### 1.2 移动端（单栏，仅播放区）

```
┌──────────────────────┐
│ playerArea           │
│ ┌──────────────────┐ │
│ │ stage-header     │ │
│ │ (头像) 主播名     │ │
│ │ [去源站]         │ │
│ ├──────────────────┤ │
│ │ <video>          │ │
│ │   danmakuLayer   │ │
│ │ [tapPlayBtn]     │ │
│ ├──────────────────┤ │
│ │ [刷新][音量▾]    │ │
│ │ [弹幕开]         │ │
│ └──────────────────┘ │
│  (commentPanel hidden)│
│  (pipBtn hidden)      │
└──────────────────────┘
```

> 移动端 `commentPanel.hidden = true`、`pipBtn.hidden = true`，`document.documentElement` 加 `mobile-player` 类切换样式。

---

## 2. URL 参数与初始化流程

### 2.1 参数

| 参数 | 含义 | 说明 |
|---|---|---|
| `uid` | 主播 uid | 缺省 `DEFAULT_UID = "1159606549"` |
| `src` / `url` / `stream` | 直连流地址 | 任一非空即"直连模式"，跳过信息接口 |
| `name` | 直连模式主播名 | 仅直连模式用于显示 |

### 2.2 初始化流程 `init()`（21 步中的播放相关）

```
页面加载 → IIFE 执行
  │
  ├─ 解析 uid / directStreamUrl
  ├─ 移动端检测 → 加 .mobile-player 类，隐藏 pipBtn / commentPanel
  ├─ 同步初始状态：syncCommentListState / syncDanmakuState / syncAudioState
  └─ refreshStream()  ← 首次加载走"刷新"入口
        │
        ├─ 置 refreshInProgress / 禁用刷新钮 / streamEnded=true
        ├─ stopStream()：销毁 hls/flvPlayer，video.pause，streamGeneration+1
        ├─ closeWs(preventReconnect) / 清空 pendingComments / clearDanmaku
        ├─ video.removeAttribute('src') / video.load()
        └─ await init()
              │
              ├─ [直连模式 directStreamUrl]
              │     ├─ originUrl = directStreamUrl
              │     ├─ updateStreamer({uname:name, uid})
              │     ├─ attachStream(url) → tryAutoplay()
              │     └─ connectWs()
              │
              └─ [标准模式（按 uid）]
                    ├─ fetch GET https://api.saidao.cc/saidao/player/{uid}
                    │     (cache:no-store, AbortController 8s 超时)
                    ├─ updateStreamer(data)：uname/avatar/roomid/uid → 标题·头像·房间号
                    ├─ originUrl = data.orig
                    ├─ 移动端 且 channel!=='youtube'
                    │     ├─ 有 orig → location.href = orig（跳源站，本页结束）
                    │     └─ 无 orig → showStatus('移动端跳转失败')
                    ├─ data.status!=='1' 或 !data.m3u8
                    │     └─ handleStreamEnded('主播暂未开播')
                    ├─ attachStream(data.m3u8) → tryAutoplay()
                    └─ connectWs()
```

---

## 3. 流类型判定与播放引擎 `attachStream(url)`

### 3.1 类型判定 `getStreamType`

取 URL 去掉 `#`/`?` 后的路径小写：
- 以 `.flv` 结尾 → `flv`
- 以 `.m3u8` 结尾 → `hls`
- 否则 → `""`（按原生 / HLS 兜底）

### 3.2 引擎选择决策树

```
attachStream(url)
  ├─ flv 类型
  │     ├─ 优先 mpegts.js（支持 HEVC/H.265）
  │     ├─ 回退 flv.js（仅 H.264）
  │     │     └─ 均不支持 → showStatus('无法播放','当前浏览器不支持 FLV')
  │     └─ 创建 flvPlayer(isLive:true, enableWorker, autoCleanup)
  │           ├─ ERROR：编码不支持 → showStatus('编码不支持', 提示用 Edge/Safari/HEVC)
  │           │          其它 → handleStreamEnded('直播连接中断')
  │           ├─ MEDIA_ATTACHING → tryAutoplay()
  │           └─ LOADING_COMPLETE（关播）→ handleStreamEnded()
  │
  ├─ 浏览器原生支持 HLS (canPlayType application/vnd.apple.mpegurl)
  │     └─ video.src = url; video.load(); video.play()
  │
  ├─ 否则 有 hls.js
  │     └─ new Hls({lowLatencyMode:true, backBufferLength:90})
  │           ├─ MANIFEST_PARSED / MEDIA_ATTACHED → tryAutoplay()
  │           ├─ BUFFER_EOS（关播）→ handleStreamEnded()
  │           ├─ LEVEL_UPDATED live===false → 检查缓冲耗尽 → handleStreamEnded()
  │           ├─ ERROR
  │           │     ├─ 非致命 BUFFER_STALLED → hls.startLoad(-1) + play
  │           │     ├─ 致命 NETWORK → handleStreamEnded('直播连接中断')
  │           │     ├─ 致命 MEDIA → showStatus('播放解码异常') + recoverMediaError + play
  │           │     └─ 其它致命 → handleStreamEnded('直播连接中断')
  │
  └─ 都不支持 → showStatus('无法播放','当前浏览器不支持该流格式')
```

### 3.3 关播判定信号（多源兜底）

| 来源 | 触发 | 处理 |
|---|---|---|
| FLV | `LOADING_COMPLETE` | handleStreamEnded |
| HLS | `BUFFER_EOS` | handleStreamEnded |
| HLS | `LEVEL_UPDATED` live=false 且缓冲耗尽 | handleStreamEnded |
| video | `ended` | handleStreamEnded |
| video | `error`（无 hls/flv 接管时） | handleStreamEnded('直播连接中断') |
| 信息接口 | `status!=='1'` / 无 m3u8 | handleStreamEnded('主播暂未开播') |

`handleStreamEnded(title)`：置 `streamEnded=true` → `stopStream()` → 状态徽章 `等待开播` → `showStatus(title,'每 10 秒自动重试，开播后自动恢复')` → `startStreamRetry()`（每 10s `refreshStream`）。

---

## 4. 播放器状态机

```
                 ┌──────────────────────────────┐
   init 开始     │  LOADING  (连接中)            │
 ─────────────►  │  showStatus(..., loading)     │
                 └──────────────┬───────────────┘
        首帧渲染 / playing        │  失败 / 关播 / 暂未开播
        ┌────────────────────────┤────────────────────────┐
        ▼                        ▼                        ▼
 ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
 │  LIVE       │          │  ENDED      │          │  ERROR      │
 │ (直播中)    │          │ (等待开播)   │          │ (连接中断)   │
 │ 每 10s 轮询停止│        │ 每 10s 重试   │          │ 每 10s 重试   │
 └─────────────┘          └──────┬──────┘          └──────┬──────┘
        │                        │ refreshStream 重试成功  │
        └────────────────────────┴────────────────────────┘
                          重新走 attachStream → tryAutoplay
```

状态徽章 `liveBadge` / `liveState` / `streamSub` 三处同步：`loading=连接中` / `live=直播中` / `ended=等待开播` / `error=连接中断`。

---

## 5. 自动播放与声音策略

### 5.1 自动播放策略（muted autoplay）

- `<video>` 标签默认 `muted autoplay`。
- `tryAutoplay()`：
  - 未解锁声音时 `setMuted(true)`（静音播，绕过浏览器自动播放拦截）。
  - `video.play()` 成功 → 隐藏 tapPlay、`syncAudioState`。
  - `play()` 抛错 → `showStatus('需要手动播放','点击屏幕或按 P 开启声音')` + `showTapPlay()`。
- **解锁路径**（任一即 `audioUnlocked=true`）：
  1. 点击 `tapPlayBtn` → `tryAutoplay`
  2. 点击 `volumeBtn` / 拖动 `volumeSlider` → `toggleSound`
  3. 按键盘 `P` → `toggleSound`
  4. 点击播放器空白区（`handlePlayerClick`，且当前静音未解锁）→ 开声 + `tryAutoplay`

### 5.2 声音开关 `toggleSound`

- 切换 `muted`；若取消静音且 volume=0，先置 `volume=0.6`。
- 开声且未关播 → `tryAutoplay` 恢复播放。
- `syncAudioState`：图标（on/off）/ aria / title / slider 值同步。

### 5.3 音量控件交互

```
音量按钮 [🔊]
  │
  ├─ 点击 → toggleSound()（开/关）
  └─ 悬停/聚焦 → 弹出 volumePopover
        └─ 拖动 volumeSlider (0~1, step 0.01)
              ├─ video.volume = value
              ├─ value===0 → 静音
              └─ audioUnlocked = true
        移出 250ms → 收起 popover
```

---

## 6. 弹幕系统（车道制）

### 6.1 布局

- `danmakuLayer` 叠加在 `<video>` 上层（`aria-hidden`，纯装饰）。
- 车道参数：`DANMAKU_LANE_HEIGHT=36`、`DANMAKU_GAP=32`、`DANMAKU_SPEED=90`（px/s）。

### 6.2 入道与动画 `addDanmaku(item)`

```
addDanmaku(item)
  ├─ 弹幕关闭 或 danmakuLayer.children.length>=60 → 直接丢弃
  ├─ layer = danmakuLayer.getBoundingClientRect()
  ├─ laneCount = floor(layer.height / 36)
  ├─ 从 lane 0 向上找"尾部弹幕 + 32px 间隙 <= 右边界"的第一条空车道
  │     └─ 找不到（全挤满）→ 丢弃（右侧评论栏仍完整显示）
  ├─ 建 div.danmaku-item，innerHTML=item.text，visibility:hidden
  ├─ top = 4 + lane*36
  ├─ 测 nodeWidth，travel = layer.width + nodeWidth
  ├─ animationDuration = travel/90 s，--danmaku-distance = travel px
  ├─ visibility:visible，记录 danmakuLanes[lane]=node
  └─ animationend → node.remove()
```

- **同速不追撞**：所有车道用像素速度 `DANMAKU_SPEED`，长弹幕不会追上前一条。
- **拥挤降级**：弹幕层节点上限 60、车道全满时略过画面弹幕，但右侧评论栏不受影响（弹幕与评论同源但独立渲染）。
- **尺寸变化**：`ResizeObserver` 监听 `danmakuLayer`，尺寸变化 `clearDanmaku()` 重建。

### 6.3 弹幕开关 `danmakuToggleBtn`

```
[弹幕开] ⇄ [弹幕关]
  ├─ is-on 类 / aria-pressed / label 切换
  └─ 关闭时 clearDanmaku()
```

---

## 7. 实时评论面板

### 7.1 数据流（WS 同源 + 延迟入队）

```
wss://api.saidao.cc/player/ws?uid={uid}
  │  onmessage: payload = { comments: [ {user, text}, ... ] }
  ▼
enqueueComments(comments)
  ├─ 每条 dueAt = Date.now() + COMMENT_DELAY_MS(5000)
  ├─ 压入 pendingComments
  └─ 溢出 MAX_PENDING_COMMENTS(500) → 裁掉最旧
  │
  │  每 200ms flushPendingComments()
  ▼
  while pending[0].at <= now:
       appendComment(item)   ← 评论列表
       addDanmaku(item)      ← 弹幕层（同源同延迟）
```

> **设计意图**：源站评论比视频画面快 ~5s，统一延迟 5s 入队使弹幕/评论与画面同步；上限 500 防积压。

### 7.2 评论列表 `appendComment(item)`

```
建 div.comment-item
  ├─ span.comment-user  = item.user (innerHTML, 默认"匿名")
  ├─ 空格
  └─ span.comment-text  = item.text (innerHTML)
追加 → 隐藏 commentEmpty
列表 > 200 条 → 移除首条
├─ 之前在底部 → scrollCommentListToBottom('auto')（粘底）
└─ 否则 → syncCommentListState（显示"回到最新"）
```

- **粘底判定**：`scrollHeight - scrollTop - clientHeight <= max(12, clientHeight*0.08)`。
- **回到最新**：非底部时显示 `scrollBottomBtn`，点击 `scrollTo(bottom, smooth)`。

### 7.3 WS 重连

- `onclose` 非主动 → `commentSub='断开，重连中...'`，2s 后 `connectWs()`。
- 刷新 / 关播 → `closeWs(preventReconnect)` 防抖重连。

### 7.4 评论栏显隐（含 PiP 内）

- 桌面：`pipCommentsBtn` / `pipCommentsCloseBtn` 切换 `commentPanel.hidden`。
- 小窗内同样有评论栏（宽度 200px 预留，见 §8）。

---

## 8. 小窗播放（Document Picture-in-PiP）

> 注意：使用的是 **Document PiP**（`documentPictureInPicture.requestWindow`），把**整个播放 UI（含弹幕+评论）搬进独立小窗**，而非浏览器原生视频级 PiP。

### 8.1 开启 `openPip()`

```
点击 [小屏]
  ├─ 移动端 / 正在开 / 页面关闭中 → return
  ├─ 已开 → pipWindow.close()（关闭返回页面）
  ├─ 不支持 documentPictureInPicture → 提示"请用最新版 Chrome/Edge"
  ├─ 画面未就绪 (videoWidth/Height=0) → 提示"画面就绪后开启"
  └─ requestWindow(getPipSize(), preferInitialWindowPlacement)
        ├─ 克隆 playerStyles + icon-definitions 进小窗 document
        ├─ body 加 .pip-window
        ├─ playerShell + commentPanel 移入小窗 body
        ├─ 新建小窗自己的 ResizeObserver(clearDanmaku)
        ├─ 小窗监听 keydown(P/Escape) / click(解锁声音)
        ├─ setPipCommentsVisible(true)（小窗内保留 200px 评论栏）
        ├─ movePlaybackTimers(openedWindow) ← 弹幕/重试定时器迁到可见小窗
        ├─ syncPipButton() → [返回]
        ├─ wasPlaying → tryAutoplay()
        └─ 若全屏中 → exitFullscreen()
```

### 8.2 小窗尺寸 `getPipSize()`

- `ratio = videoWidth/videoHeight`
- 最大 `80% 屏宽/屏高`
- `videoWidth = min(ratio<1?360:640, 屏宽-200, 屏高*ratio)`
- 竖屏直播：加 200px 评论栏后保持竖向窗口，视频 `contain` 完整显示。

### 8.3 关闭 / 返回

- 小窗 `pagehide`（一次）→ `restorePlayer()`：
  - 移回 `playerShell`/`commentPanel` 到母页
  - `commentPanel.hidden=false`
  - 重建母页 ResizeObserver
  - `movePlaybackTimers(window)`
  - 恢复评论滚动位置
  - 若之前播放 → `tryAutoplay`
- 母页 `pipPlaceholder`（小窗时显示"正在小窗中播放 [返回页面播放]"）。

### 8.4 边界与风险

- **必须直接点击事件内 `requestWindow`**：不能先 `await exitFullscreen` 否则丢失用户手势。
- 不支持浏览器（Firefox/Safari 旧版）→ 提示用 Chrome/Edge。
- 定时器迁移：母页切后台时浏览器会限频 `setInterval`，故弹幕 flush / 关播重试定时器迁到**可见的小窗 window**驱动。

---

## 9. 全屏（降级链）

`fullscreenBtn` 点击按以下顺序尝试：

```
1. 已全屏 → 退出（document / webkit / video.webkitExitFullscreen）
2. 已是 viewport-fullscreen（CSS 假全屏）→ 移除类
3. playerLayout.requestFullscreen / webkitRequestFullscreen（标准）
4. video.webkitEnterFullscreen（iOS 原生视频全屏）
     └─ readyState<1 → 提示"画面加载后开启"
5. 移动端兜底 → playerLayout 加 .viewport-fullscreen（CSS 铺满视口）
6. 仍失败 → 提示"当前浏览器暂不支持全屏"
```

- 状态同步 `syncFullscreenState`：`fullscreenElement / webkitFullscreenElement / nativeVideoFullscreen / .viewport-fullscreen` 四者任一为真即"全屏中"，切换图标/文案/`fullscreen` 类。
- 监听 `fullscreenchange / webkitfullscreenchange / webkitbeginfullscreen / webkitendfullscreen`。
- 小窗内全屏由小窗 document 的 `handlePlayerKeydown/Click` 接管。

---

## 10. 控制条交互总表

| 控件 | 行为 |
|---|---|
| `refreshBtn` 刷新 | `refreshStream()`：停流→重 init；手动刷新与关播 10s 重试共用此入口，保留静音/音量/声音授权 |
| `volumeBtn` 音量 | `toggleSound()` 开/关；悬停弹 popover 拖音量条 |
| `danmakuToggleBtn` 弹幕 | 开/关弹幕层 |
| `pipBtn` 小屏 | `openPip()` 开/关 Document PiP（移动端隐藏） |
| `fullscreenBtn` 全屏 | §9 降级链 |
| `originBtn` 去源站 | `window.open(originUrl, '_blank', 'noopener')`；无 orig → 提示"源站不可用" |
| `tapPlayBtn` 点击播放 | 解锁声音 + `tryAutoplay` |
| `scrollBottomBtn` 回到最新 | 评论列表滚到底 |

---

## 11. 键盘 / 全局事件

| 事件 | 处理 |
|---|---|
| `P`（不重复、非输入框内） | `toggleSound()` |
| `Escape`（viewport-fullscreen 中） | 退出 CSS 假全屏 |
| 点击播放器空白（非按钮/链接/输入框） | 若静音未解锁 → 开声 + `tryAutoplay` |
| `pagehide` | `isPageClosing=true`：关 PiP、停流、断 WS、清弹幕、清定时器 |

---

## 12. 边界与重构注意点

1. **innerHTML 注入面**：`addDanmaku` 与 `appendComment` 均用 `node.innerHTML = item.text`，源站评论若含 HTML/脚本将被执行。重构**必须 HTML 转义**（`textContent` 或 sanitize）。
2. **硬编码域名**：`infoBase = https://api.saidao.cc/saidao/player/`、`wsBase = wss://api.saidao.cc/player/ws` 写死在 player.js，与 config.js 不一致。重构应统一到 config。
3. **移动端跳源站**：`channel !== 'youtube'` 即跳转，逻辑硬编码于 init，重构需抽成策略配置。
4. **首帧判定**：`requestVideoFrameCallback` 优先，无则 `readyState>=2 && videoWidth>0` 兜底；重构保留该双路径。
5. **关播多源兜底**：FLV `LOADING_COMPLETE` / HLS `BUFFER_EOS` / `LEVEL_UPDATED` / `video.ended` / `video.error` 五处都触发 `handleStreamEnded`，重构需保证幂等（`streamEnded` 防重入已做）。
6. **定时器窗口迁移**：`movePlaybackTimers` 在母页↔小窗间迁移 `setInterval` 上下文，重构若引入框架需保留"可见窗口驱动定时器"的意图。
7. **默认 uid 硬编码**：`DEFAULT_UID` 写死，重构应改为配置或路由必填。
8. **无错误边界**：`catch` 多为空注释，重构建议统一错误上报。

---

## 13. 涉及接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `https://api.saidao.cc/saidao/player/{uid}` | GET | 主播信息：`uname/avatar/roomid/uid/orig/m3u8/status/channel`（status==='1' 且 m3u8 存在才播） |
| `{m3u8}` / `{flv url}` | 流媒体 | hls.js / mpegts.js / flv.js / 原生 video 播放 |
| `wss://api.saidao.cc/player/ws?uid={uid}` | WS | 下行 `{ comments: [{user, text}] }`；2s 自动重连 |
| `https://cdn.jsdelivr.net/...` | CDN | hls.js 1.5.15 / mpegts.js 1.7.3 / flv.js 1.6.2 |
