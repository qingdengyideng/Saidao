# 视频点播模块（Video Request）

> 基地址：`https://api.saidao.cc`。视频点播室：用户提交 B 站 BV 号 → 投票 → 播放。

## 1. 提交点播 — `POST /videoRequest/submit`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.videoRequestSubmit(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bvid` | string | 是 | B 站视频 BV 号（前端校验需以 `BV` 开头且长度 ≥10） |

- **成功响应**：`{ code:"0", message:"", data:{ videoRequestId, ... } }`（提交后进入投票环节）。
- **错误**：
  - 后端 DB 异常会回显 SQL 堆栈（probe `38_videoRequest_submit`：`value too long for type character varying(128)`），重构时建议后端屏蔽异常细节。

## 2. 点播投票 — `POST /videoRequest/vote`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.videoRequestVote(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `videoRequestId` | number | 是 | 点播记录 ID |
| `voteType` | string | 是 | 投票类型（如 `approve` / `reject`） |

- **成功响应**：`{ code:"0", message:"", data:null }`。
- **前端处理**：本地记录投票状态（localStorage `video-room-votes`）。

## 3. 点播列表 — `GET /videoRequest/list`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.videoRequestList()`
- **入参**：无
- **成功响应**（probe `12_videoRequest_list` / `80_videoRequest_list_auth`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "playlist": [ /* VideoRequestItem[] 待播放列表 */ ],
    "voting":   [ /* VideoRequestItem[] 投票中列表 */ ],
    "current":  { /* 当前播放项，无则 null */ },
    "currentTime": null
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `playlist` | VideoRequestItem[] | 已通过、排队播放的视频 |
| `voting` | VideoRequestItem[] | 正在投票中的视频 |
| `current` | object\|null | 当前播放项（结构同 VideoRequestItem，含播放进度） |
| `currentTime` | number\|null | 当前播放进度（秒） |

### VideoRequestItem 对象（前端读取字段）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 点播记录 ID |
| `bvid` | string | BV 号 |
| `title` | string | 视频标题 |
| `coverUrl` | string | 封面图 |
| `uploaderName` | string | UP 主名 |
| `duration` | number | 时长（秒） |
| `voteApprove` | number | 赞成票数 |
| `voteReject` | number | 反对票数 |

## 4. 跳过当前点播 — `POST /videoRequest/skip`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.videoRequestSkip()`
- **入参**：无
- **成功响应**：`{ code:"0", message:"", data:null }`。
- **备注**：当前前端版本已封装但未见直接调用点，保留待用。

## 5. 删除点播 — `POST /videoRequest/delete?videoRequestId=`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.videoRequestDelete(videoRequestId)`
- **查询参数**：`videoRequestId`（number）
- **成功响应**：`{ code:"0", message:"", data:null }`。
- **备注**：当前前端版本已封装但未见直接调用点，保留待用。

## 数据对象：VideoRequest（后端表字段，参考）

> 来自 probe 中后端报错暴露的 SQL，列出 `video_request` 表字段，供后端重构参考。

| 字段 | 类型 | 说明 |
|---|---|---|
| `bvid` | varchar(128) | BV 号 |
| `title` | varchar | 标题 |
| `uploader_name` | varchar | UP 主 |
| `cover_url` | varchar | 封面 |
| `video_url` | varchar | 播放地址 |
| `duration` | int | 时长（秒） |
| `status` | varchar | 状态（投票中/已排队/播放中/完成） |
| `requester_uid` | bigint | 请求者 ID |
| `requester_name` | varchar | 请求者昵称 |
| `requester_ip` | varchar | 请求者 IP |
| `requester_fp` | varchar | 请求者指纹 |
| `vote_approve` | int | 赞成票 |
| `vote_reject` | int | 反对票 |
| `voting_start_at` | timestamp | 投票开始时间 |
| `retry_count` | int | 重试次数 |
| `created_at` / `updated_at` | timestamp | 创建/更新时间 |
