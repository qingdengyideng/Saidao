# 07 · 视频点播室规格（video-room.js）

> **当前状态：休眠（不可用）。** 代码完整（`assets/js/video-room.js`，`VideoRoomManager`），但 `index.html` 中 `#videoRoomContainer`（131–159 行）及"点播室"tab 整体被注释，`init()` 因 DOM 缺失直接 `return`，故线上不可达。
> 本篇按"**若重构启用**"的口径完整记录其设计，作为重构决策（保留 / 重做 / 删除）的依据。

---

## 0. 现状与启用前提

| 项 | 现状 |
|---|---|
| 代码 | `video-room.js` 完整，挂 `window.VideoRoomManager` |
| DOM | `#videoRoomContainer` 及子元素（player/playlist/voting/input）**全部被注释** |
| tab | 筛选 tabs 中"点播室"项被注释（见 02-home-page §3） |
| 入口逻辑 | `app.js` 保留：tab 切到 `videoRoom` → 显示容器 + `VideoRoomManager.init()`；WS 收到视频类消息 → `handleWsMessage` |
| `init()` 行为 | 取不到 `videoRoomPlayer`/`videoPlaylist`/`videoVoting` → `console.warn` 后 `return`，不绑定任何事件 |

> 重构启用需：恢复 DOM + tab、确认 `/video/request/*` 接口与 WS 消息可用、决定是否接入登录鉴权（投票/提交当前无前端登录门槛校验）。

---

## 1. 页面布局线框（设计稿）

```
┌──────────────────────────────────────────────────────────────┐
│  video-room                                                  │
│  ┌──────────────────────────────────┐ ┌────────────────────┐ │
│  │  player-section                   │ │ sidebar            │ │
│  │  ┌────────────────────────────┐  │ │                    │ │
│  │  │ <video videoRoomPlayer>     │  │ │ 播放列表 (N)       │ │
│  │  │  controls referrerpolicy=   │  │ │ ┌────────────────┐│ │
│  │  │  no-referrer                │  │ │ │ 1 [封面] 标题   ││ │
│  │  │                             │  │ │ │   UP主 时长     ││ │
│  │  │  [videoRoomEmpty 空态]      │  │ │ │   点播:xxx      ││ │
│  │  │   暂无正在播放的视频         │  │ │ ├────────────────┤│ │
│  │  │   快来点播一个吧！           │  │ │ │ 2 ...          ││ │
│  │  └────────────────────────────┘  │ │ └────────────────┘│ │
│  │                                  │ │                    │ │
│  │                                  │ │ 投票中 (N/10)      │ │
│  │                                  │ │ ┌────────────────┐│ │
│  │                                  │ │ │ [封面] 标题     ││ │
│  │                                  │ │ │ 👍12 👎3 剩58s ││ │
│  │                                  │ │ │ [赞成] [反对]   ││ │
│  │                                  │ │ └────────────────┘│ │
│  │                                  │ │                    │ │
│  │                                  │ │ ┌────────────────┐│ │
│  │                                  │ │ │ 输入BV号[提交点播]││ │
│  │                                  │ │ └────────────────┘│ │
│  └──────────────────────────────────┘ └────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- 左：播放器区（`videoRoomPlayer` + `videoRoomEmpty` 空态互斥）。
- 右：侧栏三段——播放列表 / 投票中（上限 10）/ BV 号输入。

---

## 2. 点播提交流程

```
输入 BV 号 → [提交点播] / 回车
  ├─ 空 → Toast('请输入BV号','warning')
  ├─ 格式校验：startsWith('BV') 且 length>=10，否则 Toast('BV号格式不正确','error')
  ├─ 提交中：按钮 disabled + textContent='提交中...'
  ├─ ApiEndpoints.videoRequestSubmit({ bvid })
  ├─ 成功 → Toast('视频已提交，进入投票环节','success') + 清空输入
  │        + setTimeout(fetchList, 500)
  └─ 失败 → Toast(e.message||'提交失败','error')
     恢复按钮
```

> BV 号 = B 站视频号（如 `BV1czKY67EDQ`）。点播来源为 B 站，后端据此取流。

---

## 3. 投票机制

### 3.1 投票中列表渲染 `renderVotingList`

```
投票中 (N/10)
  每项 .video-voting-item
    ├─ [封面] 标题 / UP主 时长 / 点播:xxx
    ├─ 投票统计：👍{voteApprove} 👎{voteReject}  {剩余时间}
    └─ 操作：
          未投 → [赞成][反对]  (onclick=VideoRoomManager.vote(id, 'approve'/'reject'))
          已投 → "已投赞成/反对" badge（不可再投）
```

### 3.2 投票 `vote(videoRequestId, voteType)`

```
ApiEndpoints.videoRequestVote({ videoRequestId, voteType: 'approve'|'reject' })
  ├─ 成功 → userVotes.set(id, type) + persistUserVote（localStorage['video-room-votes']）
  │        + Toast('投票成功') + renderVotingList()
  └─ 失败 → Toast(e.message||'投票失败','error')
```

> **本地防重复**：`userVotes`（Map）+ `localStorage['video-room-votes']` 记录已投，已投项不再显示按钮。

### 3.3 倒计时与超时刷新 `startVotingCountdown`

```
setInterval(1s)
  ├─ 仅更新 .vote-time 文本（formatTimeLeft），不重建列表（避免封面重复加载）
  ├─ 某项剩余<=0 且 距上次刷新>=5s → fetchList()（超时后由服务端裁决通过/拒绝）
  └─ 投票列表空 → 清定时器
投票时长 = votingStartAt + 2min（getVotingSecondsLeft）
剩余时间文案：>0 → "剩余 m:ss"；<=0 → "即将结束"；无效 → "计算中"
```

---

## 4. 播放列表

`renderPlaylist`：
- 当前播放项置顶 + `is-playing` + "▶ 播放中" badge，其余按队列序。
- 每项：序号 / 封面 / 标题 / UP主 / 时长 / "点播:xxx"。
- 空 → "播放队列为空"。
- 计数 `#playlistCount`。

---

## 5. 播放控制

### 5.1 `playVideo(id, url, duration, currentTime)`

```
url 为空 → Toast('视频地址无效')
隐藏空态 / 显示播放器
先清理旧媒体态：pause → removeAttribute('src') → load
player.src = url → load
loadedmetadata → seekTo:
  ├─ 服务端 currentTime 有效且 < duration → player.currentTime = currentTime（恢复进度）
  └─ 自动播放降级：有声 play() → 失败改 muted play() → 再失败等手动点击
```

### 5.2 `stopVideo`

清空 current*，`pause + src='' + hidden`，显示空态，`renderPlaylist`。

### 5.3 播放器错误映射

| code | 文案 |
|---|---|
| 1 | 加载被中断 |
| 2 | 网络错误 |
| 3 | 解码失败 |
| 4 | 视频源不支持或无法访问 |

`src` 为空时的 error（切换/停止触发）忽略。

---

## 6. WebSocket 消息处理 `handleWsMessage`

| WS type | 处理 |
|---|---|
| `videoVoting` | 新视频进投票：`votingList.unshift`（上限 10，超出 pop）+ Toast"新视频《x》进入投票" |
| `videoVoteUpdate` | 更新 `{voteApprove, voteReject}` + 重渲染 |
| `videoApproved` | 投票通过：`fetchList()`×2（500ms 间隔）+ Toast"投票通过" |
| `videoRejected` | 被拒：`fetchList()` |
| `videoPlay` | 开始播放：有 url → `playVideo`（恢复 currentTime）；无 url → 清 currentVideoId 交给列表接口；Toast + `fetchList` |
| `videoSync` | 进度同步（**已移除**，空实现） |
| `videoPlayEnd` | 队列空：`stopVideo()` |
| `videoFailed` | 播放失败 Toast |
| `videoSkipped` | 管理员跳过：Toast + `fetchList` |
| `videoDeleted` | 管理员删除：Toast + `fetchList` |

> `app.js` 中 WS 收到上述视频类 type → 转交 `VideoRoomManager.handleWsMessage`。

---

## 7. 列表拉取 `fetchList`

```
GET ApiEndpoints.videoRequestList() → { playlist, voting, current, currentTime }
  ├─ 渲染 playlist / voting + startVotingCountdown
  └─ 若 current 且 ≠ 本地 currentVideoId
        → playVideo(current.id, current.videoUrl, current.duration, currentTime||0)
          （进度由服务端 currentTime 决定）
```

---

## 8. 点击跳 B 站 `openBilibiliVideo`

- 点击 playlist/voting 项（非 button）→ `window.open('https://www.bilibili.com/video/{bvid}/', '_blank', 'noopener,noreferrer')`。

---

## 9. 边界与重构注意点

1. **休眠状态**：DOM 全注释，`init` 早退。重构**首要决策**：保留启用 / 删除。若删除，需同步清理 `app.js` 的 tab 切换 + WS 转交分支 + `video-room.js`。
2. **onclick 内联**：`renderVotingList` 用 `onclick="VideoRoomManager.vote(...)"` 内联事件，依赖全局变量；重构建议改事件委托（与 `openBilibiliVideo` 已有委托并存，风格不一致）。
3. **投票无鉴权校验**：前端不检查登录态即可调用 `videoRequestVote`/`videoRequestSubmit`（依赖后端校验）。重构需明确是否要求登录。
4. **fetchList 双拉**：`videoApproved` 触发 `fetchList()` 两次（500ms 间隔），存在冗余请求；重构可合并。
5. **进度同步已废弃**：`videoSync` / `syncProgress` 为空实现，`playVideo` 仅首次按服务端 `currentTime` 定位，**播放中不持续对齐**（多端进度会漂移）。若重构需"同步播放"需重新设计。
6. **BV 格式校验弱**：仅 `startsWith('BV') && len>=10`，未校验字符集；重构可加正则 `^BV[0-9A-Za-z]{10}$`。
7. **localStorage 投票残留**：`video-room-votes` 无清理策略，长期累积；重构可加过期清理。
8. **转义已做**：`escapeHtml` / `escapeAttr` 已用于渲染，但 `onclick` 拼接 `item.id` 为数字（安全）。重构保留转义。
9. **封面重复加载**：倒计时只更新文本不重建列表，是已做的性能优化；重构保留。

---

## 10. 涉及接口（设计口径）

| 接口 | 方法 | 说明 |
|---|---|---|
| `videoRequestSubmit` | POST | `{bvid}` 提交点播 |
| `videoRequestVote` | POST | `{videoRequestId, voteType}` 投票 |
| `videoRequestList` | GET | `{playlist[], voting[], current, currentTime}` |
| WS `videoVoting` / `videoVoteUpdate` / `videoApproved` / `videoRejected` / `videoPlay` / `videoPlayEnd` / `videoFailed` / `videoSkipped` / `videoDeleted` | 下行 | 投票/播放/管理事件 |

> 接口路径以 `api.js` 实际定义为准（上表为语义命名）。管理员"跳过/删除"操作无前端入口（仅 WS 通知），推测走后台。
