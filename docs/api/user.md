# 用户模块（User）

> 基地址：`https://api.saidao.cc`。除特别说明外，响应均为 `{code, message, data}` 包裹。

## 1. 登录 — `POST /user/login`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.login(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `email` | string | 是 | 账号（实际为用户名/数字串，如 `18022`） |
| `password` | string | 是 | 密码 |
| `captchaId` | string | 视风控 | 图形验证码 ID（见 [captcha.md](captcha.md)），触发验证时必填 |
| `captchaCode` | string | 视风控 | 图形验证码输入值 |

- **成功响应**（HTTP 200）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "user": {
      "id": 18022,
      "name": "(≧◡≦)♡2kh9ua",
      "email": "18022",
      "avatar": "https://rustfs.saidao.cc/images/avatar/default11.png",
      "bio": "",
      "faction": "",
      "canChatBan": false,
      "canEditSaidaoTag": false,
      "webhookType": "",
      "webhookUrl": ""
    }
  }
}
```

- **前端处理**：将 `data.token` 写入 `localStorage[ACCESS_TOKEN]`，`data.user` 用于界面初始化。
- **错误**：
  - `400 { code:"1", message:"用户不存在" }`
  - `400 { code:"1", message:"验证码输入不正确" }`（带 captcha 时）

> 说明：`token` 为 JWT，payload 含 `exp`、`userId`、`iat`。前端以原文放入 `Authorization` 头（无 `Bearer ` 前缀）。

## 2. 当前登录用户 — `GET /user/`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.currentUser()`
- **入参**：无
- **成功响应**：`data` 为与登录返回一致的 `user` 对象（含 `canChatBan` / `canEditSaidaoTag` 等权限位）。
- **未登录**：`data: null`（probe `18_user_me`）。

## 3. 注册 / 分配账号 — `POST /user/allocate`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.allocate(data)`
- **入参**（JSON body，含验证码）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `email` | string | 是 | 期望账号 |
| `password` | string | 是 | 密码 |
| `captchaId` | string | 是 | 图形验证码 ID |
| `captchaCode` | string | 是 | 图形验证码输入值 |

- **成功响应**：`data` 为 `user` 对象（结构同登录）。
- **错误**：`400 { code:"1", message:"验证码输入不正确" }`（probe `07_user_allocate`）。

## 4. 修改密码 — `POST /user/changePassword`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.changePassword(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `oldPassword` | string | 是 | 原密码 |
| `newPassword` | string | 是 | 新密码 |

- **成功响应**：`{ code:"0", message:"", data:null }`。

## 5. 更新资料 — `POST /user/update`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.profileUpdate(data)`
- **入参**（JSON body，按需传字段）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 昵称 |
| `avatar` | string | 头像 URL（通常先经 [upload.md](upload.md) 上传得到） |
| `bio` | string | 个性签名 |
| `faction` | string | 阵营/派系 |
| `webhookType` | string | Webhook 类型（用于个人通知） |
| `webhookUrl` | string | Webhook 地址 |

- **成功响应**：`data` 为更新后的 `user` 对象。
- **前端处理**：头像更新流程为先调 `uploadImages` 取 `data.url`，再连同其他字段提交本接口（见 `app.js` 资料编辑）。

## 6. 发送验证码 — `POST /user/sendVerificationCode`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.sendVerificationCode(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `email` | string | 是 | 接收邮箱 |

- **成功响应**：`{ code:"0", message:"", data:null }`。
- **错误**：`400 { code:"1", message:"JSON parse error: ... email is marked non-null but is null" }`（probe `08_sendVerificationCode`，即 `email` 必填）。
- **备注**：当前前端版本已封装但未见直接调用点，保留待用。

## 7. 获取图形验证码 — `GET /user/captcha`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.getCaptcha()`
- **入参**：无
- **成功响应**（probe `03_user_captcha`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "captchaId": "395ccdf2-e182-4c33-b96a-5dfb0beb9eb8",
    "base64Image": "data:image/png;base64,iVBORw0KGgo...",
    "expireTime": 300
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `captchaId` | string | 验证码会话 ID，提交时需回传 |
| `base64Image` | string | dataURL 格式的 PNG 图片 |
| `expireTime` | number | 有效期（秒） |

## 8. 查询用户详情 — `GET /user/{id}`

- **鉴权**：无
- **前端入口**：`ApiEndpoints.showUserDetail(userId)`
- **路径参数**：`id`（number，用户 ID）
- **成功响应**（probe `04_user_1` / `82_user_detail_self`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "id": 18022,
    "name": "(≧◡≦)♡2kh9ua",
    "avatar": "https://rustfs.saidao.cc/images/avatar/default11.png",
    "bio": "",
    "faction": "",
    "registerDate": "2026-07-23"
  }
}
```

> 注意：详情对象比登录返回的 user **少**了 `canChatBan`/`canEditSaidaoTag`/`webhookType`/`webhookUrl` 等权限与私密字段，**多**了 `registerDate`。

## 9. 获取聊天过滤配置 — `GET /user/chatFilterConfig`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.chatFilterConfig()`
- **入参**：无
- **成功响应**（probe `72_user_chatFilterConfig`）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "blockedUserIds": [],
    "blockedNicknames": [],
    "keywordPatterns": []
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `blockedUserIds` | number[] | 屏蔽的用户 ID 列表 |
| `blockedNicknames` | string[] | 屏蔽的昵称列表 |
| `keywordPatterns` | string[] | 屏蔽的关键词/正则列表 |

## 10. 更新聊天过滤配置 — `POST /user/chatFilterConfig`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.updateChatFilterConfig(data)`
- **入参**（JSON body）：结构同上，整体覆盖式提交 `{ blockedUserIds, blockedNicknames, keywordPatterns }`。
- **成功响应**：`{ code:"0", message:"", data:null }`。

## 11. 禁言用户 — `POST /user/chatBan`

- **鉴权**：🔒 需要（需 `canChatBan` 权限）
- **前端入口**：`ApiEndpoints.chatBan(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `userId` | number | 是 | 目标用户 ID |
| `banned` | boolean | 是 | true=禁言，false=解除 |
| `reason` | string | 否 | 原因 |

- **成功响应**：`{ code:"0", message:"", data:null }`。

## 数据对象：User

| 字段 | 类型 | 说明 | 出现场景 |
|---|---|---|---|
| `id` | number | 用户 ID | 全部 |
| `name` | string | 昵称 | 全部 |
| `email` | string | 账号 | 登录/当前用户 |
| `avatar` | string | 头像 URL | 全部 |
| `bio` | string | 签名 | 全部 |
| `faction` | string | 阵营 | 全部 |
| `canChatBan` | boolean | 是否可禁言他人 | 登录/当前用户 |
| `canEditSaidaoTag` | boolean | 是否可编辑赛道标签 | 登录/当前用户 |
| `webhookType` | string | 个人 Webhook 类型 | 登录/当前用户 |
| `webhookUrl` | string | 个人 Webhook 地址 | 登录/当前用户 |
| `registerDate` | string | 注册日期 | 用户详情 |
