# 03 · 聊天室规格（Chat Room）

> 主逻辑：`app.js`（首页实际运行的内联实现）+ `chat-room.js`（工厂，主要服务播放页场景）
> 工具：`chat-input-utils.js` / `chat-voice-utils.js` / `chat-quote-utils.js` / `chat-link-preview.js` / `chat-moments.js` / `chat-polls.js` / `battle-ui.js`

> ⚠️ **双份实现说明**：`index.html` 首页主聊天室运行的是 `app.js` 内联实现（功能更全：上下文菜单含封禁/删除、屏蔽、回放）；`chat-room.js` 是 `ChatRoom.create()` 工厂封装，功能子集，主要服务 `player.html`。重构时**必须统一为单一实现**。下文以 `app.js` 首页实现为准。

---

## 1. 侧栏布局线框图

### 1.1 桌面端

```
┌─────────────────────────────────────┐
│ ←拖拽边 │ 💬 聊天室  [N人在线] [🔥]   │  ← header
│  handle │              [×] [💬收起]  │
├─────────────────────────────────────┤
│ [🔥热词] [热词chip] [热词chip] ...   │  ← Hot 热词栏（可折叠，最多8个）
├─────────────────────────────────────┤
│ ( 消息流，可滚动 )                    │
│  [头像] 用户A  12:30                │
│  │ 消息内容                          │
│  │ IP属地：北京                       │
│  [头像] 用户B  12:31                │
│  │ ▶ ━━━━ 5"   (语音)               │
│  ── 系统消息 ──                      │
│  [有新消息 (N)]  ← 上滚时的浮动按钮   │
├─────────────────────────────────────┤
│  [引用预览条（引用时显示）]           │
│  ☐隐藏图片 [屏蔽设置] [时间线] [掰头] │  ← filter row
├─────────────────────────────────────┤
│ [😀] [🎤] [ 输入框（自动增高） ] [➤] │  ← 输入区
│  (表情面板 / 语音草稿 / 录音面板 浮动) │
└─────────────────────────────────────┘
```

### 1.2 移动端（≤768px，展开时全屏）

```
┌──────────────────────────────┐
│ 💬 聊天室 [N人在线]    [×][💬] │
├──────────────────────────────┤
│ ( 消息流，铺满全屏 )           │
│  ...                          │
├──────────────────────────────┤
│ ☐隐藏图片 [屏蔽][时间线][掰头] │
├──────────────────────────────┤
│ [😀][🎤][ 输入框 ] [➤]         │
└──────────────────────────────┘
```

---

## 2. 侧栏控制

| 功能 | 元素 | 交互 | 边界 |
|------|------|------|------|
| **拖拽宽度** | `chatResizeHandle` | 鼠标按住左右拖，`newWidth = innerWidth - clientX`，写入 `state.chatWidth` 并同步 `.container` 预留空间 | 仅 `250~600px` 生效；桌面端才绑定 |
| **收起/展开** | `collapseChat`/`closeChat` | 切换 `collapsed` 类（`translateX(100%)` 平移出屏），同步空间预留 | 桌面初始展开，移动端初始收起 |
| **Hot 热词栏** | `chatHotWords`/`chatHotWordsToggle` | WS `hotWords` 推送 → 渲染 chip（最多 8 个）；火焰按钮折叠/展开（localStorage 持久化） | 点击 chip → `focusHotWordMessage` 高亮定位（游标向前循环，无匹配 Toast） |
| **在线人数** | `onlineCount` | WS `onlineCount` → 「N人在线」 | 实时 |
| **时间线** | `momentsOpen` | 打开时间线覆盖层 | 见 §7 |
| **掰头** | `pollsOpen`/`pollsBadge` | 打开掰头 dialog；badge 显示最近一场倒计时 `m:ss` | 见 §8 |

---

## 3. 消息类型与渲染

### 3.1 消息种类

```
┌─ 普通消息 ──────────────────────────────┐
│ [头像] 用户A [牙]  12:30                │  ← 阵营标签 + 时间
│ │ [红方badge] 消息内容 @某人            │  ← 掰头徽章 + @高亮
│ │ IP属地：北京                           │  ← uid≠0 且有 ipGeo
│ ┌引用块─────────────────────┐           │
│ │ 引用 用户B: 被引用内容…    │           │
│ └──────────────────────────┘           │
│ [🔗 链接预览: · 标题 ｜ 请谨慎访问]      │
└────────────────────────────────────────┘

┌─ 语音消息 ──────────────────────────────┐
│ [头像] 用户B  12:31                     │
│ │ [▶] ▂▃▅ 5"                           │  ← 播放按钮+波形+时长
└────────────────────────────────────────┘

┌─ 系统消息 ──────────────────────────────┐
│        ── 主播 xxx 开始直播 ──          │
└────────────────────────────────────────┘

┌─ 图片消息 ──────────────────────────────┐
│ [头像] 用户C  12:32                     │
│ │ ┌──────┐                             │
│ │ │ 图片  │  (image-only，屏蔽时隐藏)    │
│ │ └──────┘                             │
└────────────────────────────────────────┘
```

### 3.2 渲染细节

| 类型 | 关键 | 边界 |
|------|------|------|
| **普通** | 头像 `data-user-id`、阵营标签（ya→牙/juan→卷/AI）、@高亮（`@xxx` 着色）、IP属地 | 已删除（`deleted:true`）不渲染占位 |
| **语音** | `messageKind==='voice'`，气泡宽 92~276px 随时长（1~60s），单例 Audio 播放，同时仅一个播放中 | 波形来自 `waveform`（32 桶） |
| **系统** | `type` 为 status/system/dailyReportUpdate/pollUpdate 走系统通道 | 开播通知含 `<a>` 点击上报 clickSaidao |
| **图片** | `isPureImageMessage`（content 仅一个 `<img>`）→ `image-only` 渐显 | 图片屏蔽开启时 `hideChatImageMessage` |
| **链接预览** | WS `link_preview` → 注入 `.message-link-preview`（警示图标+标题+「请谨慎访问」） | 仅 http(s)，title≤512、url≤4096，Map 1000 LRU；支持预览先于消息到达 |
| **引用** | `replyTo` → `.message-quote`（作者+内容截50字） | 图片引用仅 https 且无 userinfo/hash；屏蔽/非法显示「图片消息已隐藏」；点击引用块定位原消息 |
| **掰头徽章** | `BattleUi.createBadge(data.battle)` → 红方/蓝方按钮，悬停 tooltip 显示议题+选项 | 单选站队后消息带阵营 |

### 3.3 上下文菜单（右键 / 长按 500ms）

```
┌──────────────────────────┐
│ 复制                       │
│ 引用                       │
│ @用户A                     │
│ ───────────────────────── │
│ 屏蔽此用户                  │   ← uid=0 显示「屏蔽 {昵称}」
│ 屏蔽 IP 属地：北京          │   ← 仅 ipGeo 存在且未屏蔽
│ ───────────────────────── │
│ 封禁1小时    (红色)        │   ← canChatBan 且非本人
│ 封禁7天      (红色)        │
│ 删除          (红色)       │
└──────────────────────────┘
```

| 菜单项 | 行为 | 权限 |
|--------|------|------|
| 复制 | `navigator.clipboard`（降级 execCommand）→ Toast「已复制」 | 全员 |
| 引用 | `setQuoteMessage` → 输入区显示引用预览 + `@用户 ` | 全员 |
| @用户 | `mentionUser` 插入 `@uname` | 全员 |
| 屏蔽此用户 | uid=0→push 昵称；否则 push uid → 保存 | 全员 |
| 屏蔽 IP 属地 | push `ipGeo` → 保存 | 全员 |
| 封禁 1小时/7天 | `chatBan({userId,uname,banSeconds})` 3600/604800 | `canChatBan` 且非本人 |
| 删除 | `messageDelete(messageId)`，后端软删广播 `messageDeleted` | `canChatBan` |

### 3.4 @我提示 / 新消息提示

- **@我**：`mentionedMe===true` → 顶部浮动「有人@我」按钮，点击定位消息居中高亮 2s。
- **新消息**：用户上滚离开底部时，新消息到达 → 「有新消息 (N)」浮动按钮，点击回底 + 跟随。

---

## 4. 输入区

### 4.1 布局

```
┌─────────────────────────────────────────────────────────┐
│ [引用预览条：引用 用户A: 内容…  [×]]  (引用时显示)         │
├─────────────────────────────────────────────────────────┤
│ [😀]  [🎤]  [ 来嘟两句呗...        ]  [➤]                │
│        │  输入框 textarea maxlength=256，自动增高          │
│        │  录音时 → 录音面板 [●正在录音 0:00 点击结束]      │
│        │  语音草稿 → [▶试听 5"  发送  ×]                   │
└─────────────────────────────────────────────────────────┘
  表情面板（😀 展开）：
┌─────────────────────────────────────────────────────────┐
│ [常用] [动画] [test/vip]                                  │
│ [😀][😂][🤔]...  [GIF动图]...  [+]上传(仅vip组,≤2MB)      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 文本输入

| 项 | 行为 |
|----|------|
| 自动增高 | `ChatInputUtils.getAutoGrowMetrics`，超 maxHeight 转滚动 |
| 发送 | **Enter 发送** / **Ctrl+Enter 换行**（`shouldSendOnChatKeydown` / `shouldInsertLineBreakOnChatKeydown`） |
| 发送按钮 | `emojiToggle`（纸飞机），`disabled` 当无文本且无语音草稿或上传中 |
| 打字清除语音 | 输入文本即 `clearVoiceDraft()` |

**发送流程**：
```
sendMessage()
  有 voiceDraft? → sendVoiceDraft()
  否则文本：socket 未 OPEN → Toast「聊天室连接中」
  构造 {type:'chat', content, reply?}
  pendingMessage 锁（防重复发）→ socket.send → 清空输入框/引用/表情
  收到 WS type==='user' → pendingMessage=null
  服务端若回 captchaRequired → 触发滑动验证码（见 §9）
```

### 4.3 语音消息

```
[🎤] 点击（输入框空且无草稿时显示）
  → 前置：已登录 + getUserMedia + MediaRecorder + socket OPEN
  → startVoiceRecording：选 mime(opus/webm/mp4) → 录 → 计时 250ms 更新
  → 达 60s 自动停 / 点击停
  → 时长 <1s → Toast「录音时间太短」
  → 否则 Blob → AudioContext 解码取真实 duration + waveform(32桶) → 草稿
草稿条：[▶试听] 5"  [发送] [×]
  发送 → FormData 上传 /api/voice/upload → 取 url
  → WS {type:'voice', audioUrl, duration, waveform, reply?}
边界：mime 不支持不传 mimeType；解码失败 fallback 时长+默认波形
```

### 4.4 表情

| 分组 | data-group | 渲染 | 上传 |
|------|-----------|------|------|
| 常用 | `common` | `<img>` | — |
| 动画 | `animation` | `<video>` hover 播放 | — |
| test/VIP | `vip` | `<img>` | 「+」按钮，≤2MB，`/emoji/upload` |

- `clickSend` 表情：直接 WS 发 `[{name}]` 并关面板；否则插入输入框。
- 数据 `GET /emoji/{group}`，缓存 `emojiCache[group]`。

---

## 5. 屏蔽设置（chatFilterModal）

### 5.1 弹窗线框图

```
┌──────────────────────────────────────────┐
│ 弹幕屏蔽                              [×] │
├──────────────────────────────────────────┤
│ 通过消息右键或长按添加用户或 IP 属地屏蔽。  │
│                                          │
│ 直播间屏蔽                                 │
│  [○开关] 屏蔽游戏直播  (ℹ️)  (已屏蔽 N)    │
│                                          │
│ 已屏蔽对象                                 │
│  [昵称A  ×] [昵称B  ×] [IP属地:北京 ×]    │
│                                          │
│ 屏蔽关键词（正则）                          │
│ ┌──────────────────────────────────┐     │
│ │ 例如：广告|推广                   │     │
│ │ https?://\S+                      │     │
│ └──────────────────────────────────┘     │
│                                          │
│                    [清空]  [保存]          │
└──────────────────────────────────────────┘
```

### 5.2 数据结构与过滤

```
rules = {
  blockedUserIds: []     // uid≠0 按 ID
  blockedNicknames: []   // uid=0 按昵称
  blockedIpGeos: []      // 按 IP 属地
  keywordPatterns: []    // 正则，不区分大小写
}
```

**过滤逻辑** `shouldFilterChatMessage`：非 user 不滤 → uid≠0 且命中 blockedUserIds 滤 → uid=0 且命中 blockedNicknames 滤 → 命中 blockedIpGeos 滤 → 任一 keyword 正则命中滤。

**关键设计**：被屏蔽消息**仍入缓冲**（`chatMessageBuffer`，上限 500），`applyChatFilterRules` → `rerenderChatFromBuffer` 重渲 → **取消屏蔽可恢复历史被屏蔽消息**。

**屏蔽游戏直播**：仅作用于**主播卡片列表**（非聊天消息），`localStorage[blockGameLive]`。

**接口**：`GET/POST /user/chatFilterConfig`（withAuth），同时写 localStorage `chatFilterRulesV1`。

---

## 6. 历史消息

### 6.1 实时模式（滚动顶部加载）

```
消息流滚动到顶部（scrollTop <= 80）
  → loadOlderMessages()
  → GET /message/history?messageId={首条id}
  → 批量 prepend（保持滚动位置：scrollTop = 新scrollHeight - 旧高度 + 旧top）
  → 返回空 → hasMoreHistory=false
  → 加载中显示 spinner「正在加载历史消息」
```

### 6.2 回放窗口（时间线驱动）

```
┌─ 回放条 chatReplay ──────────────────────┐
│ [12:00-12:30 时段]  [↑更早] [↓更晚] [回到最新(N)] │
└──────────────────────────────────────────┘
```

- 由时间线点击话题触发 `chatMomentReplay.open(segment, snapshot)`。
- 翻页：`GET /message/history/window?{start,end,direction[,cursor|target]}`，字段 `beforeCursor`/`afterCursor`/`hasMore`。
- 回放期间新消息暂存 `replayIncoming`（上限 500），「回到最新」合并去重渲染末尾 500 条。
- 竞态保护：`replayVersion` 递增比对；失败回灌实时流。

---

## 7. 时间线（chat-moments.js）

### 7.1 覆盖层线框图

```
┌────────────────────────────────────────────┐
│ timeline    10:00-12:00 · 近 2 小时     [×] │
├────────────────────────────────────────────┤
│ [状态：时间线加载中 / AI 摘要暂不可用 / ...]    │
│ ┌────────────────────────────────────────┐ │
│ │ 10:05-10:40  话题标题                    │ │
│ │ 摘要文字...        (消息 128)            │ │
│ ├────────────────────────────────────────┤ │
│ │ 10:45-11:20  话题标题                    │ │
│ │ 摘要文字...        (消息 64)             │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
  点击话题 → 关闭覆盖层 → 进入回放窗口（§6.2）
```

| 项 | 说明 |
|----|------|
| 数据 | `GET /message/moments`，`data.segments[]`（start/end/title/summary/messageCount） |
| 轮询 | 60s，仅面板打开且可见时刷新 |
| 状态文案 | loading「时间线尚未生成」/unavailable「AI 摘要暂不可用」/error「时间线暂不可用」/stale「更新延迟」 |
| 关闭 | × / 点遮罩 / Escape / 侧栏折叠自动关闭 |
| `invalidate()` | 消息删除/clear 时调用，++generation 强制刷新 |

---

## 8. 红蓝掰头投票（chat-polls.js）

### 8.1 Dialog 线框图

```
┌──────────────────────────────────────────────┐
│ 红蓝掰头  [+发起掰头]                  [×]     │
├──────────────────────────────────────────────┤
│ 进行中 · 单选    ⏱ 剩余 04:32                  │
│ 发起人：用户A                                  │
│                                              │
│   问题标题（question，≤100字）                 │
│                                              │
│ ┌──────────────────┐  VS  ┌────────────────┐ │
│ │ 🔴 红方           │      │ 🔵 蓝方          │ │
│ │ ○ 红方观点(≤20字)  │      │ ○ 蓝方观点(≤20字) │ │
│ │        58%       │      │        42%      │ │
│ │ ▓▓▓▓▓▓▓▓░░      │      │      ░░▓▓▓░░    │ │
│ └──────────────────┘      └────────────────┘ │
│                                              │
│              [确认站队]                        │
│ ──────────────────────────────────────────── │
│ 128 人参与                                     │
│ <details> 掰头列表（最近10场）</details>       │
└──────────────────────────────────────────────┘
```

### 8.2 创建掰头

| 限制 | 说明 |
|------|------|
| **每天限一次** | `remainingCreates`（北京 00:00 刷新），UI 显示「今日剩余发起次数：N/1」 |
| **全局单场** | active 掰头数 ≥1 时不能创建（Toast「当前掰头正在进行」） |
| **登录且未封禁** | `canCreate===false` → 「请登录未被封禁的账号后发起」 |
| 注册>3天 | **后端校验**，前端仅体现 canCreate |

**表单**：question(≤100) + redOption(≤20) + blueOption(≤20) + durationMinutes(5/10/30)，`POST /chat/polls`。

### 8.3 投票与渲染

- 投票：`POST /chat/polls/{id}/ballots` body `{optionIds:[index]}`，**单选，每人一次**。
- 已投票/已结束 → 禁用选项，显示百分比（`resultsVisible!==false` 时）。
- 红方条宽度 = 红方占比（无数据时 50%）。

### 8.4 实时与倒计时

- **WS `pollUpdate`**：状态变更（active/endsAt/serverTime）→ 校准时钟 + 刷新 dialog + 更新 badge。
- **本地 1s 倒计时** `tick()`：badge 显示最近一场 `m:ss`，到 0 → 「掰头已结束」禁用。
- **15s 轮询** `refresh()` 兜底（仅 dialog open 且可见时请求，flight 防并发）。

---

## 9. WebSocket 通信

### 9.1 连接

```
wss://api.saidao.cc/ws/chat?token={token}&fp={fingerprint}
  token: localStorage[ACCESS_TOKEN]
  fp:    FingerprintJS visitorId（降级 UUID）
竞态：socket !== currentSocket → 回调丢弃
重连：close 后 3s 重试（可 preventReconnect 抑制）
```

### 9.2 下行 type 分发（12+ 种）

| type | 处理 |
|------|------|
| `captchaRequired` | 触发滑动验证码 |
| `user` | 普通消息渲染（pendingMessage 清空） |
| `link_preview` | 链接预览 |
| `history` | 全量快照（重连恢复，回放中忽略） |
| `error` | Toast |
| `system` | 系统消息 |
| `pollUpdate` | 系统消息 + ChatPolls 刷新 |
| `onlineCount` | 在线人数 |
| `hotWords` | 热词栏 |
| `status` | 系统消息 + 刷新主播列表 |
| `dailyReportUpdate` | 系统消息 + 刷新日报 |
| `saidaoTag/Cover/ContentAnalysis/hotScore` | 卡片实时更新 |
| `clear` | 清空聊天 |
| `messageDeleted` | 标记删除 |
| `video*`（9 种） | 转发 VideoRoomManager（见 07） |

### 9.3 上行 type

| type | 内容 |
|------|------|
| `chat` | `{type:'chat', content, reply?}` |
| `voice` | `{type:'voice', audioUrl, duration, waveform, reply?}` |
| `captchaTicket` | 验证码通过后 `{...pendingMessage, captchaTicket: ticket}` 重发 |

### 9.4 滑动验证码（captchaRequired）

```
WS 回 captchaRequired
  → handleCaptchaRequired()
  → getFingerprint() → SlidingCaptcha.getTicket(fp)
     （拉起滑动拼图，返回 ticket 或 'bypass'）
  → pendingMessage 已空？→ 重连
  → 否则 {...pendingMessage, captchaTicket} 重发
  → 失败 → Toast「验证码验证失败」+ pendingMessage=null
```
> 滑动验证码完整流程见 [05-account.md](./05-account.md) §4。

---

## 10. 边界与重构注意点

1. **双份实现**必须统一（app.js 内联 vs chat-room.js 工厂）。
2. 消息 DOM 上限 1000（`trimChatMessages`）、缓冲 500、回放 incoming 500、replayDeletedIds 1000。
3. 语音 1~60s，mime 降级，解码失败 fallback。
4. 链接预览/引用图 URL 校验（https、长度、无控制字符）。
5. 拖拽宽度 250~600px；热词最多 8 个。
6. 屏蔽消息入缓冲可恢复；游戏直播屏蔽仅卡片。
7. 掰头每日 1 次/全局单场/单选；时钟用 serverTime 校准。
8. 回放 replayVersion 竞态保护；socket currentSocket 竞态保护。
9. 重构须用框架自动转义替代 `innerHTML`（防注入）。

---

## 11. 涉及接口

| 接口 | 方法 | 用途 |
|------|------|------|
| `/message/delete` | POST | 删除消息 |
| `/message/history?messageId=` | GET | 历史消息 |
| `/message/history/window` | GET | 回放窗口 |
| `/message/moments` | GET | 时间线 |
| `/chat/polls` | GET/POST | 掰头列表/创建 |
| `/chat/polls/status` | GET | 掰头状态 |
| `/chat/polls/{id}/ballots` | POST | 投票 |
| `/user/chatFilterConfig` | GET/POST | 屏蔽配置 |
| `/user/chatBan` | POST | 封禁 |
| `/emoji/{group}` | GET | 表情 |
| `/emoji/upload` | POST | 自定义表情 |
| `/api/image/upload` | POST | 图片上传 |
| `/api/voice/upload` | POST | 语音上传 |
| `/captcha/slider` + `/verify` | GET/POST | 滑动验证码 |
| WS `/ws/chat` | — | 实时消息 |

详细字段见 [../api/message.md](../api/message.md)、[../api/chat-polls.md](../api/chat-polls.md)、[../api/emoji.md](../api/emoji.md)、[../api/websocket.md](../api/websocket.md)。
