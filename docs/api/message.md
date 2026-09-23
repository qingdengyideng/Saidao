# 消息模块（Message）

> 基地址：`https://api.saidao.cc`。聊天室实时消息走 WebSocket（见 [websocket.md](websocket.md)），本模块为 HTTP 拉取历史/时间线。

## 1. 删除消息 — `POST /message/delete`

- **鉴权**：🔒 需要（本人或管理权限）
- **前端入口**：`ApiEndpoints.messageDelete(messageId)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `messageId` | string | 是 | 目标消息 ID |

- **成功响应**：`{ code:"0", message:"", data:null }`。

## 2. 按消息 ID 查历史 — `GET /message/history?messageId=`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.messageHistory(messageId)`
- **查询参数**：`messageId`（string，锚点消息 ID）
- **成功响应**：`data` 为消息对象**数组**（锚点消息及其上下文，probe `22_message_history` / `77_message_history_latest`）。
- **消息对象**：见 [§5 数据对象：ChatMessage](#5-数据对象chatmessage)。

## 3. 窗口式历史（游标分页）— `GET /message/history/window`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.messageHistoryWindow(params)`，参数经 `URLSearchParams` 拼接。
- **查询参数**（按需）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `beforeCursor` | string | 否 | 向上翻页游标（取更早消息） |
| `afterCursor` | string | 否 | 向下翻页游标（取更新消息） |
| `limit` | number | 否 | 单页条数 |

- **成功响应**（probe `84_history_window`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "messages": [ /* ChatMessage 数组，含 createdAt */ ],
    "beforeCursor": "2101862403636596736",
    "afterCursor": "2101864506731925504",
    "hasMore": true
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `messages` | ChatMessage[] | 本窗口消息，**含 `createdAt`（ISO 8601 带时区）** |
| `beforeCursor` | string | 下一页（更早）游标 |
| `afterCursor` | string | 下一页（更新）游标 |
| `hasMore` | boolean | 是否还有更多 |

> 与 `/message/history` 的差异：window 接口每条消息额外带 `createdAt`（完整 ISO 时间），且返回游标分页元信息。

## 4. 聊天时间线 — `GET /message/moments`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.chatMoments()`
- **入参**：无
- **成功响应**（probe `21_message_moments`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "status": "ok",
    "start": "2026-09-21T00:00:00+08:00",
    "end": "2026-09-21T23:59:59+08:00",
    "formatVersion": 1,
    "segments": [
      {
        "start": "2026-09-21T08:00:00+08:00",
        "end": "2026-09-21T12:00:00+08:00",
        "title": "上午",
        "summary": "……",
        "anchorId": "2101862403636596736",
        "stats": {
          "messageCount": 1200,
          "quoteCount": 34,
          "mentionCount": 88,
          "imageCount": 12,
          "emojiCount": 45,
          "videoCount": 0
        }
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | 状态 |
| `start` / `end` | string | 时间线覆盖区间（ISO） |
| `formatVersion` | number | 格式版本 |
| `segments` | array | 按时间分段的摘要 |
| `segments[].anchorId` | string | 该段锚点消息 ID（可跳至 `/message/history?messageId=`） |
| `segments[].stats` | object | 该段统计（消息数/引用数/@数/图片数/表情数/视频数） |

## 5. 数据对象：ChatMessage

聊天消息的通用结构（`/message/history`、`/message/history/window`、WebSocket `user` 消息均复用）：

```json
{
  "uid": 17694,
  "type": "user",
  "ipGeo": "广州市",
  "uname": "(≧◡≦)♡0sg0fc",
  "avatar": "https://rustfs.saidao.cc/images/avatar/default9.png",
  "content": "这接那接的，等会儿开播，大白说不整了。",
  "deleted": false,
  "faction": "",
  "mentions": [],
  "messageId": "2101862403867283456",
  "timestamp": "10:33:42",
  "createdAt": "2026-09-21T10:33:42.478038+08:00",
  "replyTo": {
    "uid": 0,
    "uname": "汕头用户4708",
    "content": "七七真是个畜生。",
    "messageId": "2101862352302510080"
  },
  "linkPreview": { "url": "https://example.com", "title": "链接标题" }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `uid` | number | 是 | 发送者 ID；`0` 表示匿名/未登录访客 |
| `type` | string | 是 | 消息类型：`user`（用户消息）/ `status`（系统/状态消息） |
| `ipGeo` | string | 否 | 发送者 IP 属地（如「广州市」） |
| `uname` | string | 是 | 昵称 |
| `avatar` | string | 否 | 头像 URL |
| `content` | string | 是 | 正文；表情消息为 `<img class="chat-emoji vip" src="..." alt="..."/>` 形式的 HTML |
| `deleted` | boolean | 否 | 是否已删除（被删消息前端置灰/隐藏） |
| `faction` | string | 否 | 阵营（如 `juan`/`ya`） |
| `mentions` | string[] | 否 | 被 @ 的昵称列表 |
| `messageId` | string | 是 | 消息唯一 ID（雪花 ID 字符串） |
| `timestamp` | string | 是 | `HH:mm:ss` 展示用时间 |
| `createdAt` | string | 否 | 完整 ISO 8601 时间（window 接口与 WS 历史携带） |
| `replyTo` | object | 否 | 引用回复对象 `{ uid?, uname, content, messageId }`。注意：**WS `history` 快照实测不下发 `uid`**（该字段可选，前端不消费） |
| `linkPreview` | object | 否 | 链接预览 `{ url, title }`（WS `link_preview` 类型单独推送） |

### 语音消息（WS 发送侧）

语音消息在 WS 发送时结构为 `{ type:'voice', audioUrl, duration, waveform, reply? }`，落库后转为 `content` 携带音频 URL 的普通消息。
