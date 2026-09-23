# 播放器模块（Player）

> 播放器页（`player.html`）独立于主聊天页，通过 `assets/js/player.js` 直接 `fetch` / WebSocket 获取数据。

## 1. 播放器信息 — `GET /saidao/player/{uid}`

- **鉴权**：无
- **调用方式**：`player.js:803` 直接 `fetch(`${infoBase}${uid}`)`，`infoBase = "https://api.saidao.cc/saidao/player/"`，**不经** `ApiEndpoints` 与统一 `request` 封装。
- **路径参数**：`uid`（string，平台房间 UID，来自赛道列表的 `uid`）
- **响应**：⚠️ **非标准 `{code,message,data}` 包裹**，直接返回播放器对象（probe `13_saidao_player_uid`）：

```json
{
  "m3u8": "null",
  "channel": "momo",
  "userId": "184411700",
  "value": "{\"uid\": \"1159606549\", \"status\": 0, \"channel\": \"momo\"}",
  "uid": "1159606549",
  "live_url": "https://saidao.cc/player.html?uid=1159606549",
  "orig": "https://api.saidao.cc/momo?roomid=",
  "token": "c9e1761a09074ece05a56b05d357c478",
  "avatar": "https://images.weserv.nl/?url=...",
  "mid": "",
  "status": "0",
  "roomid": "",
  "uname": "地上徒步",
  "cover": ""
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `m3u8` | string | HLS 播放地址；未开播时可能为字符串 `"null"`（注意是字符串而非 JSON null） |
| `channel` | string | 平台/通道（如 `momo`、`bilibili`） |
| `userId` | string | 平台用户 ID |
| `value` | string | 原始 JSON 串（含 `uid`/`status`/`channel`） |
| `uid` | string | 房间 UID |
| `live_url` | string | 播放器页 URL |
| `orig` | string | 原始流拼接前缀（如 `https://api.saidao.cc/momo?roomid=`） |
| `token` | string | 流鉴权 token |
| `avatar` | string | 主播头像 |
| `mid` | string | 平台 mid（bilibili 中） |
| `status` | string | 直播状态（`"0"`=未开播） |
| `roomid` | string | 房间号 |
| `uname` | string | 主播名 |
| `cover` | string | 封面 |

- **前端处理**：
  - 用 `uname`/`avatar`/`roomid`/`uid` 更新主播信息区（`updateStreamer`）。
  - 用 `m3u8` / `orig`+`roomid` 拼接流地址，按 `getStreamType` 选择 Hls.js（m3u8）或 mpegts/flv.js（flv）播放。
  - 每 10 秒轮询重试，开播后自动恢复。

## 2. 播放器弹幕 WebSocket

- **连接**：`wss://api.saidao.cc/player/ws?uid={uid}`（`player.js:591`）
- **消息**：见 [websocket.md §2](websocket.md#2-播放器弹幕频道--wssapisaidaoccplayerwsuid)（`{ comments: [...] }` 格式）。
