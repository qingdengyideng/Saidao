# 06 · 赛道运营规格（主播卡片的实时运营机制）

> "赛道（Saidao）" = 一个主播直播间。本篇聚焦**主页主播卡片上的运营/管理交互与实时驱动机制**：赛道唯一标签、热度重排、AI 内容标签、游戏直播屏蔽、"不想看 TA"、封面实时更新、点击计数。
> 这些机制横跨"普通用户可见"与"管理员（canEditSaidaoTag）可编辑"两类，且由 WebSocket 实时下发驱动。

---

## 0. 角色与数据

- **数据来源**：`GET /saidao` → `fetchStreamers()` 全量拉取，映射为 `streamersData`：

| 字段 | 来源 | 说明 |
|---|---|---|
| id / uid / name / channel | item | 主播基础 |
| startTime | item | 开播时间（LIVE 角标旁显示） |
| status | `Number(item.status)===1` | `'live'` / `'ended'` |
| avatar / url / streamUrl / cover | item | 头像 / 源站跳转 / 流地址 / 封面 |
| notificationEnabled | `item.notShow` | "不想看 TA" 开关（**字段名 notShow 反向语义**） |
| tag | `item.tag \|\| ''` | 赛道唯一标签 |
| hotScore | `item.hotScore \|\| 0` | 热度值 |
| contentAnalysis | `normalizeContentAnalysis(item.contentAnalysis)` | AI 内容分析 `{aiLabel, isGame, ...}` |

- **权限**：`state.currentUser.canEditSaidaoTag === true` 才能编辑标签（见 05-account §7）。

---

## 1. 赛道卡片布局线框（运营视角）

```
┌──────────────────────────────┐
│  ┌──────────────────────────┐│
│  │  streamer-cover-area     ││
│  │  ┌─cover-layer─────────┐ ││
│  │  │ [封面图/头像fallback] │ ││  未开播/无封面 → 头像灰化
│  │  │  LIVE  ⏰ 开播时间    │ ││  左上 LIVE 角标 + 开播时间
│  │  │  ┌────────────────┐  │ ││
│  │  │  │ {tag} 或 添加标签+ │ │ ││  封面左上角标签
│  │  │  └────────────────┘  │ ││  (管理员=button 可点编辑)
│  │  └──────────────────────┘ ││
│  │  ┌────────────────────────┐│
│  │  │ (头像)  主播名  🔥热度值 ││
│  │  │         📡 渠道         ││
│  │  │  [AI标签 ⚠]            ││  streamer-ai-row
│  │  │                  [⋮]   ││  card-settings
│  │  └────────────────────────┘│
│  │   [⋮ 下拉]                 │
│  │   ┌──────────────────┐    │
│  │   │ 不想看TA   [开关]  │    │  settings-dropdown
│  │   └──────────────────┘    │
└──────────────────────────────┘
```

---

## 2. 赛道唯一标签（tag）

### 2.1 渲染 `renderStreamerTag`

| 场景 | 展示 | 可交互 |
|---|---|---|
| 有标签 + 管理员 | `button.streamer-tag-filled.is-editable`（封面左上） | 点击 → `openTagEditor` |
| 无标签 + 管理员 | `button.streamer-tag-empty.is-editable` 显示"添加标签+" | 点击 → `openTagEditor` |
| 有/无标签 + 普通用户 | `span.streamer-tag-filled`（纯展示，无"添加+"） | 不可点 |

> 标签同时出现在**封面左上角**与卡片标题行（`streamer-tag`）。普通用户仅看到已设置的标签。

### 2.2 编辑闭环

```
点击标签(管理员) → openTagEditor(streamer) → tagEditorModal
  │  (线框与流程见 05-account §7)
  ▼
updateSaidaoTag({saidaoId, tag})
  ├─ 成功 → Toast('标签已更新/已清空') + 关闭
  └─ 实时协同：WS saidaoTagUpdate → applySaidaoTagUpdate
        ├─ 更新 streamersData[tag]
        ├─ 若编辑器正打开该主播 → 同步 input/hint/preview（防多人冲突）
        └─ 刷新卡片标签展示
```

---

## 3. 热度重排（hotScore）

### 3.1 实时驱动

```
WS hotScoreUpdate → applyHotScoreUpdate(scores[])
  │  scores: [{ saidaoId, hotScore, level }]
  ├─ 逐个更新 streamersData.hotScore
  ├─ 卡片 .hot-indicator：
  │     hotScore>0 → 显示 🔥 + Math.ceil(hotScore)（无则新建 span）
  │     hotScore<=0 → 移除 indicator
  └─ reorderCardsByHotScore()
```

### 3.2 重排算法 `reorderCardsByHotScore`

```
cards = container.querySelectorAll('.streamer-card')
cards.sort((a,b) => (streamersData[b].hotScore||0) - (streamersData[a].hotScore||0))
  │  热度降序；无热度=0 沉底
cards.forEach(card => container.appendChild(card))   ← DOM 重排（非重新渲染）
```

> 初始渲染 `renderStreamerCards` 时，`live && hotScore>0` 即在标题行内联 `🔥Math.ceil(hotScore)`。

---

## 4. AI 内容标签（contentAnalysis）

### 4.1 判定与展示

- `isGameLiveStreamer(s)`：`s.status==='live' && s.contentAnalysis.isGame===true`。
- `renderAiLabel(analysis)`：
  - 无 `aiLabel` → 空。
  - 有 → `<span class="streamer-ai-label" title="提示">{aiLabel}[⚠?]`。
  - `isGame===true` → 加帮助图标，hint="如需屏蔽游戏直播，可在聊天室的「屏蔽设置」中开启「屏蔽游戏直播」开关。"
  - 非游戏 → hint=通用 `AI_LABEL_HINT`。

### 4.2 实时驱动

```
WS saidaoContentAnalysisUpdate → applySaidaoContentAnalysisUpdate(payload)
  │  payload: { uid, contentAnalysis }
  ├─ streamer.contentAnalysis = normalizeContentAnalysis(analysis)
  ├─ 若"游戏屏蔽"开启 且 游戏直播状态翻转（wasGameLive !== isGameLive）
  │     → renderStreamerCards() 全量重渲染（卡片需增删）
  └─ 否则 → 仅更新该卡 .streamer-ai-row.innerHTML + has-ai-label 类
```

> **仅对直播中卡片生效**：未开播卡片不受 AI 判定影响（`isGameLiveStreamer` 要求 `status==='live'`）。

---

## 5. 游戏直播屏蔽（blockGameLive）

### 5.1 开关

- 控件：聊天室「屏蔽设置」内 `#blockGameLive` checkbox（见 03-chatroom 屏蔽设置）。
- 持久化：`localStorage['blockGameLive']`。
- 提示：`#blockGameLiveHelp` 点击 → `showGameFilterHint`（Toast 6s）。

### 5.2 过滤逻辑

```
renderStreamerCards:
  filtered = (live tab ? streamers.filter(status==='live' && !notShow) : streamers)
             .filter(s => !(blockGameLive && isGameLiveStreamer(s)))
```

- 开启后，**直播中且被判游戏** 的卡片被移除。
- `syncGameFilterUi`：实时计算 `countGameLiveStreamers()`，开关开启且有游戏直播时显示 `已屏蔽 {count}`。

### 5.3 交互流程

```
切换 #blockGameLive
  ├─ localStorage['blockGameLive'] = checked
  ├─ renderStreamerCards()（按最新过滤重排）
  └─ syncGameFilterUi 同步计数文案
```

---

## 6. "不想看 TA"（notShow）

### 6.1 控件

- 卡片右下 `⋮`（`.settings-btn`）→ 展开 `.settings-dropdown` → `不想看TA [toggle-switch]`。
- 下拉互斥：点一个 `⋮` 关闭其它已展开下拉；点空白关闭所有。

### 6.2 交互流程

```
点击 ⋮
  ├─ stopPropagation
  ├─ 关闭其它 .settings-dropdown.active
  └─ 切换本卡 dropdown.active

切换 toggle (change 事件，cardsGrid 委托)
  ├─ streamer.notificationEnabled = checked
  ├─ ApiEndpoints.updateOptions({ saidaoId, notShow: notificationEnabled })
  │     └─ 注意：前端 notificationEnabled 直接映射后端 notShow
  ├─ 成功 且 开启 → Toast('已置底并屏蔽开播消息','success')
  └─ await fetchStreamers()   ← 重新拉取全量，刷新卡片（live tab 会过滤掉 notShow 的卡）
```

### 6.3 语义

- `notShow=true`（"不想看 TA" 开启）：
  - **直播 tab** 下该卡被过滤（`!s.notificationEnabled`）；
  - "全部" tab 仍显示；
  - 后端侧：置底 + 屏蔽该主播开播消息推送。
- 字段名易混淆：前端 `notificationEnabled` ≡ 后端 `notShow`（true=不想看）。

---

## 7. 封面实时更新

```
WS saidaoCoverUpdate → applySaidaoCoverUpdate(payload)
  │  payload.content: { uid, cover, liveUrl }
  ├─ streamer.cover = cover
  ├─ 若 liveUrl 非空且 ≠ streamer.streamUrl
  │     ├─ streamer.streamUrl = liveUrl
  │     └─ 若该卡正在预览 → stop + start 重新预览（流地址变了）
  └─ updateStreamerCardCover(streamer)
        ├─ 移除旧 .streamer-cover
        ├─ 未开播或无 cover → 加 is-fallback/is-avatar-muted（回退头像）
        └─ 否则插入新 <img.streamer-cover>，onerror → 回退头像
```

---

## 8. 点击计数（clickSaidao）

```
点击封面区（.streamer-cover-area）
  ├─ 直播中 → ApiEndpoints.clickSaidao(streamerId).catch(()=>{})   ← 计数上报（静默）
  └─ 有 url → window.open(url, '_blank')   ← 跳源站
```

> 点击计数是"热度"的上游行为之一（后端据点击/在线等计算 hotScore，再经 WS 下发重排）。

---

## 9. 实时事件 → 卡片映射总表

| WS type | 处理函数 | 卡片影响 |
|---|---|---|
| `hotScoreUpdate` | `applyHotScoreUpdate` | 🔥 热度值 + DOM 重排 |
| `saidaoTagUpdate` | `applySaidaoTagUpdate` | 标签文案/可编辑态 + 编辑器同步 |
| `saidaoCoverUpdate` | `applySaidaoCoverUpdate` | 封面图 + 流地址 + 预览重启 |
| `saidaoContentAnalysisUpdate` | `applySaidaoContentAnalysisUpdate` | AI 标签 + 游戏屏蔽翻转时全量重渲染 |

> 完整 WS 协议见 03-chatroom §9。

---

## 10. 边界与重构注意点

1. **notShow 反向语义**：前端 `notificationEnabled` 直映后端 `notShow`，命名陷阱。重构应统一为 `muted`/`hidden` 语义并加注释。
2. **重排 vs 重渲染**：热度用 DOM 重排（保预览/滚动态），游戏屏蔽翻转用全量重渲染。重构需保留"局部更新优先"策略，避免预览中断。
3. **多源刷新**：`updateOptions` 后 `fetchStreamers()` 全量重拉，与 WS 增量更新混用，存在竞态（全量拉取可能覆盖刚到的 WS 更新）。重构建议统一为"服务端为源 + 增量补丁"。
4. **热度 ceil 显示**：`Math.ceil(hotScore)` 展示，排序用原值。重构需明确展示/排序口径一致。
5. **AI 标签仅直播**：未开播卡片不计游戏直播、不显示 AI 标签。重构保留该约束。
6. **clickSaidao 静默失败**：`.catch(()=>{})` 吞错，重构需保留"计数失败不影响跳转"。
7. **标签唯一性**：后端保证"唯一标签"，前端无重复校验（依赖后端报错）。重构可加前端预校验。

---

## 11. 涉及接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/saidao` | GET | 主播列表全量（含 tag/hotScore/contentAnalysis/notShow/cover） |
| `/saidao/updateTag` | POST | `{saidaoId, tag}` 更新唯一标签（需 canEditSaidaoTag） |
| `/saidao/options` | POST | `{saidaoId, notShow}` "不想看 TA" 置底+屏蔽开播消息 |
| `/saidao/click` | POST | `{saidaoId}` 点击计数（静默） |
| WS `hotScoreUpdate` / `saidaoTagUpdate` / `saidaoCoverUpdate` / `saidaoContentAnalysisUpdate` | 下行 | 实时驱动卡片运营状态 |

> 接口路径以 `api.js` 实际定义为准（上表为语义命名）。
