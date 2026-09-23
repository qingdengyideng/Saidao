# 投票模块（Chat Polls / 掰头）

> 基地址：`https://api.saidao.cc`。聊天室内的「掰头」投票功能。

## 1. 投票列表 — `GET /chat/polls`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.chatPolls()`
- **入参**：无
- **成功响应**（probe `78_chat_polls_auth`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "canCreate": false,
    "serverTime": "2026-09-21T03:48:35.643943Z",
    "current": null,
    "recent": [
      {
        "id": 137,
        "question": "🔒大白的爷爷头和🔒大白脚趾母，哪个更享受？",
        "options": ["rua爷爷头", "抱起🔒脚母指"],
        "createdAt": "2026-09-21T02:55:09.911214Z",
        "endsAt": "2026-09-21T03:25:09.911214Z",
        "active": false,
        "totalVoters": 11,
        "counts": [10, 1],
        "myOptions": [],
        "multiple": false,
        "creatorId": 11500,
        "creatorName": "特朗普",
        "resultsVisible": true
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `canCreate` | boolean | 当前用户是否可创建投票 |
| `serverTime` | string | 服务端时间（ISO） |
| `current` | object\|null | 当前进行中的投票（结构同 recent 项） |
| `recent` | array | 近期投票列表 |

### Poll 对象

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 投票 ID |
| `question` | string | 问题 |
| `options` | string[] | 选项文本列表 |
| `createdAt` | string | 创建时间（ISO） |
| `endsAt` | string | 结束时间（ISO） |
| `active` | boolean | 是否进行中 |
| `totalVoters` | number | 总投票人数 |
| `counts` | number[] | 各选项票数（与 options 对齐） |
| `myOptions` | number[] | 我投的选项下标 |
| `multiple` | boolean | 是否多选 |
| `creatorId` | number | 创建者 ID |
| `creatorName` | string | 创建者昵称 |
| `resultsVisible` | boolean | 结果是否可见 |

## 2. 投票状态 — `GET /chat/polls/status`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.chatPollStatus()`
- **入参**：无
- **成功响应**（probe `79_polls_status_auth` / `11_polls_status`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "serverTime": "2026-09-21T03:48:36.053711Z",
    "endsAt": null,
    "activeEndsAt": []
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `serverTime` | string | 服务端时间 |
| `endsAt` | string\|null | 当前投票结束时间；**无进行中投票时为 `null`** |
| `activeEndsAt` | string[] | 进行中投票的结束时间**数组**；无则为空数组 `[]` |

## 3. 创建投票 — `POST /chat/polls`

- **鉴权**：🔒 需要（需满足创建条件，且注册时间 > 3 天）
- **前端入口**：`ApiEndpoints.createChatPoll(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `question` | string | 是 | 问题 |
| `options` | string[] | 是 | 选项文本列表（≥2） |
| `durationSeconds` | number | 否 | 投票时长（秒），默认 300 |
| `multiple` | boolean | 否 | 是否多选，默认 false |
| `resultsVisible` | boolean | 否 | 结束后是否公开结果，默认 true |

- **成功响应**：返回新建的 Poll 对象（结构同上）。
- **错误**：
  - `400 { code:"1", message:"已登录并注册时间 > 3天才能发起掰头" }`（probe `33_chat_polls_create`）

## 4. 投票 — `POST /chat/polls/{id}/ballots`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.voteChatPoll(id, optionIds)`
- **路径参数**：`id`（number，投票 ID）
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `optionIds` | number[] | 是 | 所选选项下标数组（多选时多个） |

- **成功响应**：`{ code:"0", message:"", data:null }`。
- **前端处理**：所有投票接口前端均用 `unwrap` 校验 `code === '0'`，否则抛错。
