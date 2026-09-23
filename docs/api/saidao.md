# 赛道模块（Saidao）

> 基地址：`https://api.saidao.cc`。赛道 = 直播间聚合列表。

## 1. 赛道列表 — `GET /saidao/`

- **鉴权**：🔓 无需（游客可访问，后端契约已变更）
- **前端入口**：`ApiEndpoints.saidao()`
- **入参**：无
- **成功响应**：`data` 为赛道对象**数组**（probe `17_saidao_list`）。

单个赛道对象：

```json
{
  "id": 3,
  "uid": "28646110",
  "name": "热心胖哥骑行",
  "channel": "bilibili📺",
  "startTime": "--:--",
  "status": 0,
  "avatar": "https://images.weserv.nl/?url=...",
  "cover": "https://rustfs.saidao.cc/images/cover/77dc4e28-....jpg",
  "url": "https://live.bilibili.com/7713984",
  "streamUrl": null,
  "notShow": false,
  "tag": "不再嘴臭丶mata卷",
  "hotScore": 0.0,
  "hotLevel": null,
  "contentAnalysis": {
    "is_game": true,
    "game_name": "三角洲行动",
    "live_type": "game",
    "is_outdoor": false,
    "is_virtual": false,
    "screen_orientation": "landscape",
    "streamer_status": "unknown",
    "overall_confidence": 0.0,
    "game_confidence": 0.0,
    "live_type_label": "游戏",
    "streamer_status_label": "未知",
    "screen_orientation_label": "横屏",
    "ai_label": "游戏：三角洲行动"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 赛道内部 ID（用于 click） |
| `uid` | string | 平台房间 UID（用于播放器） |
| `name` | string | 主播名 |
| `channel` | string | 平台标识（如 `bilibili📺`） |
| `startTime` | string | 开播时间，未开播为 `--:--` |
| `status` | number | 直播状态（0=未开播/停播，其余=开播） |
| `avatar` | string | 头像（经 weserv 代理） |
| `cover` | string | 封面图 |
| `url` | string | 直播间网页地址 |
| `streamUrl` | string\|null | 直连流地址（通常 null，由播放器接口解析） |
| `notShow` | boolean | 是否隐藏 |
| `tag` | string | 标签（可被授权用户编辑） |
| `hotScore` | number | 热度分 |
| `hotLevel` | string\|null | 热度等级 |
| `contentAnalysis` | object | AI 内容识别结果（见下） |

### contentAnalysis 子对象

| 字段 | 类型 | 说明 |
|---|---|---|
| `is_game` | boolean | 是否游戏直播 |
| `game_name` | string\|null | 游戏名 |
| `live_type` | string | `game`/`chat`/`unknown` 等 |
| `is_outdoor` | boolean | 是否户外 |
| `is_virtual` | boolean | 是否虚拟主播 |
| `screen_orientation` | string | `landscape`/`portrait` |
| `streamer_status` | string | 主播状态 |
| `overall_confidence` | number | 整体置信度 |
| `game_confidence` | number | 游戏识别置信度 |
| `live_type_label` | string | 直播类型中文标签 |
| `streamer_status_label` | string | 主播状态中文标签 |
| `screen_orientation_label` | string | 屏幕方向中文标签 |
| `ai_label` | string | AI 综合标签（展示用） |

## 2. 更新赛道选项 — `POST /saidao/options`

- **鉴权**：🔒 需要（管理权限）
- **前端入口**：`ApiEndpoints.updateOptions(data)`
- **入参**（JSON body，按需传字段）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 赛道 ID |
| `notShow` | boolean | 是否隐藏 |
| `hotLevel` | string | 热度等级 |
| `status` | number | 直播状态 |

- **成功响应**：`{ code:"0", message:"", data:null }`。

## 3. 更新赛道标签 — `POST /saidao/tag`

- **鉴权**：🔒 需要（需 `canEditSaidaoTag` 权限）
- **前端入口**：`ApiEndpoints.updateSaidaoTag(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | number | 是 | 赛道 ID |
| `tag` | string | 是 | 新标签文本 |

- **成功响应**：`{ code:"0", message:"", data:null }`。
- **联动**：更新成功后经 WebSocket `saidaoTagUpdated` 消息广播（见 [websocket.md](websocket.md)）。

## 4. 点击计数 — `POST /saidao/click?saidaoId=`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.clickSaidao(saidaoId)`
- **查询参数**：`saidaoId`（number，即赛道 `id`）
- **成功响应**（probe `14_saidao_click`）：`{ code:"0", message:"", data:null }`。
