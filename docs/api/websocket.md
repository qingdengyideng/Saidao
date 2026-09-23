# WebSocket 文档

> WebSocket 域名：`wss://api.saidao.cc`。共两条频道：聊天室频道、播放器弹幕频道。所有 WS 消息均为 JSON 文本帧，前端 `JSON.parse` 后按 `type` 字段分发。

## 1. 聊天室频道 — `wss://api.saidao.cc/ws/chat?token=&fp=`

- **前端入口**：`chat-room.js:1587` `setupWebSocket()`
- **查询参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| `token` | 否 | JWT token（登录态）；匿名可空 |
| `fp` | 是 | 设备指纹（与 REST 请求头 `fp` 一致） |

- **重连**：断线 3 秒后自动重连（`setupWebSocket` 递归）。

### 1.1 客户端 → 服务端（上行消息）

客户端发送 JSON 字符串，结构按 `type` 区分：

**聊天文本**
```json
{ "type": "chat", "content": "消息正文", "reply": { "messageId": "...", "uname": "..." } }
```

**语音消息**
```json
{
  "type": "voice",
  "audioUrl": "https://rustfs.saidao.cc/voice/xxx.webm",
  "duration": 3.2,
  "waveform": [0.1, 0.2, ...],
  "reply": { "messageId": "..." }
}
```

**触发滑动验证后重发**（在 `captchaRequired` 后，将 ticket 附加到原消息）
```json
{ "type": "chat", "content": "...", "captchaTicket": "<ticket>" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | string | `chat` / `voice` |
| `content` | string | 文本内容（表情为 `<img .../>` HTML） |
| `reply` | object | 引用回复，含 `messageId` 等 |
| `audioUrl` | string | 语音 URL（voice 专用，先经 [upload.md](upload.md) 上传得到） |
| `duration` | number | 语音时长（秒） |
| `waveform` | number[] | 语音波形（约 32 个采样，用于播放条） |
| `captchaTicket` | string | 滑动验证码 ticket（防刷，见 [captcha.md](captcha.md)） |

**心跳**

```json
{ "type": "ping" }
```

客户端每 30s 发送一次（`src/lib/ws/base-socket.ts` 心跳实现）。**服务端回包**：

```json
{ "type": "pong", "timestamp": 1790060528907 }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | number | 服务端毫秒时间戳（客户端不消费，仅作保活确认） |

### 1.2 服务端 → 客户端（下行消息）

按 `data.type` 分发（`chat-room.js:1596-1647`）：

| type | 说明 | 关键字段 |
|---|---|---|
| `user` | 用户聊天消息 | 见 [message.md §5 ChatMessage](message.md#5-数据对象chatmessage)。注意：**WS 广播帧实测不下发 `deleted`**（该字段可选，缺省视为未删除）；`avatar` 实测可能缺失或为 null（展示层兜底默认图） |
| `system` | 系统消息（入房/退房等） | `content` |
| `status` | 状态消息（直播状态变更等） | `content`，前端额外回调 `onStatusUpdate` |
| `history` | 历史消息批量推送 | `messages: (user \| system \| status)[]`（实测快照会混入 status 消息，无 `uid` 字段；前端按 type 分类处理，对齐旧站 chat-room.js:1616-1624） |
| `link_preview` | 链接预览 | 实测契约：`{ messageId: string, linkPreview: { url: string, title: string } }`（按 messageId 键控，preview 嵌套在 `linkPreview` 字段内；旧站 chat-link-preview.js:18-19 消费） |
| `onlineCount` | 在线人数 | `count` |
| `hotWords` | 热词 | `words: { text: string, count: number }[]` |
| `saidaoTagUpdated` | 赛道标签更新广播 | 关联赛道 ID/新标签，回调 `onSaidaoTagUpdated` |
| `hotScoreUpdate` | 热度分更新 | `scores: { saidaoId: number, hotScore: number, level: number }[]`（`level` 实测为 **number**，回调 `onHotScoreUpdate`） |
| `clear` | 清空消息（前端 reset + 清除 linkPreview） | — |
| `error` | 错误 | 错误描述，回调 `onError` |
| `pong` | 心跳回包（响应客户端 `ping`） | `timestamp`（number） |
| `captchaRequired` | 要求滑动验证 | 实测**只下发 `type`**，不内联题目；前端自行调 [captcha.md](captcha.md) `GET /captcha/slider` 取题、验证后携带 `captchaTicket` 重发原消息 |
| `saidaoCoverUpdated` | 赛道封面/直播流 URL 更新 | 实测 `content` 双形态：对象 `{ uid: string, cover: string, liveUrl: string }` 或 JSON 字符串（旧站 app.js:1913-1922 兼容双形态）；`cover`/`liveUrl` 值可能被反引号包裹（前端展示层 trim 兜底） |

> 消息对象 `ChatMessage` 的完整字段定义见 [message.md §5](message.md#5-数据对象chatmessage)。`user` 类消息复用该结构；`status` / `system` 类仅含 `type` + `content`（无 `uid` 等字段）。

## 2. 播放器弹幕频道 — `wss://api.saidao.cc/player/ws?uid=`

- **前端入口**：`player.js:591` `connectWs()`
- **查询参数**：`uid`（string，平台房间 UID）
- **鉴权**：无
- **重连**：断线 2 秒后自动重连。

### 服务端 → 客户端（仅下行，客户端不发送）

```json
{ "comments": [ { "user": "昵称", "text": "弹幕内容" }, { "user": "匿名", "text": "..." } ] }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `comments` | array | 弹幕批（一次推送多条） |
| `comments[].user` | string | 发送者昵称（无则前端显示「匿名」） |
| `comments[].text` | string | 弹幕文本 |

- **前端处理**：`player.js:608` 取 `payload.comments` 数组，`enqueueComments` 入队后按延迟渲染为弹幕层（`item.text`）与评论列表（`item.user` + `item.text`）。

## 3. 鉴权与防刷小结

| 频道 | token | fp | 防刷机制 |
|---|---|---|---|
| `/ws/chat` | 可选 | 必填 | `captchaRequired` + 滑动验证码 ticket |
| `/player/ws` | 无 | 无 | 无（只读弹幕流） |
