# 赛道（Saidao）前端接口总览

> 本文档基于对前端项目 `e:\02-项目\Saidao` 的全部接口调用点分析，并结合 `.tmp_probe` 目录中真实调用记录整理而成。用于前端全面重构时的接口调研与对接。

## 1. 服务基地址

前端通过 `assets/js/config.js` 定义全局配置：

| 变量 | 值 | 用途 |
|---|---|---|
| `API_BASE_URL` | `https://api.saidao.cc` | 主 REST API 域名 |
| `N8N_BASE_URL` | `https://n8n.saidao.cc` | N8N Webhook 服务域名 |
| `WS_BASE_URL` | `wss://api.saidao.cc` | WebSocket 域名 |
| `TOKEN_KEY` | `ACCESS_TOKEN` | localStorage 中 JWT token 的键名 |

## 2. 统一请求封装

所有 REST 请求通过 `assets/js/api.js` 中的 `window.request(url, options)` 发起，再由 `window.ApiEndpoints` 暴露为 30+ 个具名 endpoint。

```js
window.request(url, {
  method = 'GET',        // 默认 GET
  body,                  // JSON 对象 或 FormData
  withAuth = false,      // true 时附带 Authorization 头
  fromN8N = false,       // true 时走 N8N_BASE_URL
  headers = {},
  showLoading = true     // 是否显示 loading
})
```

### 2.1 请求头约定

| 头 | 值 | 说明 |
|---|---|---|
| `Accept` | `application/json` | 固定 |
| `fp` | 设备指纹 | FingerprintJS visitorId，降级 `crypto.randomUUID()`，缓存于 localStorage `fingerprint` |
| `Content-Type` | `application/json` | 仅当 body 为 JSON 时手动设置；**FormData 时不设置**（浏览器自动加 boundary） |
| `Authorization` | `<JWT token>` | 仅 `withAuth: true` 且本地有 token 时附带 |

### 2.2 鉴权模型

- 采用 **JWT Bearer Token**，存于 `localStorage[TOKEN_KEY]`，以 `Authorization: <token>` 明文传递（非 `Bearer` 前缀）。
- 登录成功后 `data.token` 写入 localStorage。
- 任意请求返回 **HTTP 401** 时，前端弹登录框（`openLoginModal`）并 toast「请先登录」。

### 2.3 统一响应结构

绝大多数接口返回如下 JSON 包裹：

```json
{
  "code": "0",
  "message": "",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | string | `"0"` = 成功；`"1"` = 业务失败 |
| `message` | string | 失败时为错误描述；成功时通常为空串 |
| `data` | any | 业务数据，可为对象 / 数组 / 字符串 / null |

> ⚠️ 例外：`GET /saidao/player/{uid}` **不使用**上述包裹，直接返回播放器对象（见 [player.md](player.md)）。

### 2.4 错误响应模式

| 场景 | HTTP | code | message 示例 |
|---|---|---|---|
| 未登录访问鉴权接口 | 401 | `1` | `请先登录` |
| 业务校验失败 | 400 | `1` | `用户不存在` / `验证码输入不正确` / `已登录并注册时间 > 3天才能发起掰头` |
| 参数解析失败 | 400 | `1` | `JSON parse error: ...` / `Text '100' could not be parsed at index 0` |
| 后端异常（DB 等） | 500 | `1` | `### Error updating database...`（含 SQL 堆栈，属后端泄露，重构时应屏蔽） |

## 3. 接口模块索引

| 模块 | 文档 | 说明 |
|---|---|---|
| 用户 | [user.md](user.md) | 登录、注册分配、改密、资料、详情、聊天过滤配置、禁言 |
| 验证码 | [captcha.md](captcha.md) | 图形验证码、滑动验证码 |
| 赛道 | [saidao.md](saidao.md) | 赛道列表、选项、标签、点击计数 |
| 消息 | [message.md](message.md) | 历史消息、时间线、删除 |
| 表情 | [emoji.md](emoji.md) | 表情查询、上传 |
| 投票 | [chat-polls.md](chat-polls.md) | 掰头投票列表、状态、创建、投票 |
| 日报 | [daily-report.md](daily-report.md) | 日报列表、公告 |
| 视频点播 | [video-request.md](video-request.md) | 点播提交、投票、列表、跳过、删除 |
| 上传 | [upload.md](upload.md) | 图片、语音上传 |
| 播放器 | [player.md](player.md) | 播放信息、弹幕 WebSocket |
| WebSocket | [websocket.md](websocket.md) | 聊天室频道、播放器弹幕频道 |
| Webhook | [webhook.md](webhook.md) | N8N 测试 Webhook |

### 机器可读规范

- [schema/openapi.yaml](../schema/openapi.yaml)：OpenAPI 3.0 规范（覆盖全部 REST 接口 + WebSocket 消息格式）

## 4. 接口速查表

> 标记：🔒 = 需要鉴权（withAuth:true）；📤 = FormData 上传；🔗 = WebSocket

| 模块 | 方法 | 路径 | 鉴权 | 摘要 |
|---|---|---|---|---|
| 用户 | GET | `/user/` | 🔒 | 当前登录用户 |
| 用户 | POST | `/user/login` | | 登录 |
| 用户 | POST | `/user/allocate` | | 注册/分配账号 |
| 用户 | POST | `/user/changePassword` | 🔒 | 修改密码 |
| 用户 | POST | `/user/update` | 🔒 | 更新资料 |
| 用户 | POST | `/user/sendVerificationCode` | | 发送验证码 |
| 用户 | GET | `/user/captcha` | | 获取图形验证码 |
| 用户 | GET | `/user/{id}` | | 查询用户详情 |
| 用户 | GET | `/user/chatFilterConfig` | 🔒 | 获取聊天过滤配置 |
| 用户 | POST | `/user/chatFilterConfig` | 🔒 | 更新聊天过滤配置 |
| 用户 | POST | `/user/chatBan` | 🔒 | 禁言用户 |
| 验证码 | GET | `/captcha/slider` | | 获取滑动验证码 |
| 验证码 | POST | `/captcha/slider/verify` | | 校验滑动验证码 |
| 赛道 | GET | `/saidao/` | 🔒 | 赛道列表 |
| 赛道 | POST | `/saidao/options` | 🔒 | 更新赛道选项 |
| 赛道 | POST | `/saidao/tag` | 🔒 | 更新赛道标签 |
| 赛道 | POST | `/saidao/click?saidaoId=` | | 点击计数 |
| 播放器 | GET | `/saidao/player/{uid}` | | 播放器信息 |
| 消息 | POST | `/message/delete` | 🔒 | 删除消息 |
| 消息 | GET | `/message/history?messageId=` | 🔒 | 按消息 ID 查历史 |
| 消息 | GET | `/message/history/window` | 🔒 | 窗口式历史（游标分页） |
| 消息 | GET | `/message/moments` | 🔒 | 聊天时间线 |
| 表情 | GET | `/emoji/{group}` | 🔒 | 查询表情（vip/animation） |
| 表情 | POST | `/emoji/upload` | 🔒 📤 | 上传表情 |
| 投票 | GET | `/chat/polls` | 🔒 | 投票列表 |
| 投票 | GET | `/chat/polls/status` | | 投票状态 |
| 投票 | POST | `/chat/polls` | 🔒 | 创建投票 |
| 投票 | POST | `/chat/polls/{id}/ballots` | 🔒 | 投票 |
| 日报 | GET | `/dailyReport/list` | | 日报列表 |
| 日报 | GET | `/notice` | | 公告 |
| 视频点播 | POST | `/videoRequest/submit` | 🔒 | 提交点播 |
| 视频点播 | POST | `/videoRequest/vote` | 🔒 | 点播投票 |
| 视频点播 | GET | `/videoRequest/list` | | 点播列表 |
| 视频点播 | POST | `/videoRequest/skip` | 🔒 | 跳过当前点播 |
| 视频点播 | POST | `/videoRequest/delete?videoRequestId=` | 🔒 | 删除点播 |
| 上传 | POST | `/api/image/upload` | 🔒 📤 | 上传图片 |
| 上传 | POST | `/api/voice/upload` | 🔒 📤 | 上传语音 |
| Webhook | POST | `/webhook/testWebhook`（N8N 域） | 🔒 | 测试 Webhook |
| WebSocket | — | `wss://api.saidao.cc/ws/chat?token=&fp=` | 🔒 🔗 | 聊天室频道 |
| WebSocket | — | `wss://api.saidao.cc/player/ws?uid=` | 🔗 | 播放器弹幕频道 |

## 5. 第三方依赖

| 服务 | 域名 | 用途 |
|---|---|---|
| 对象存储 | `rustfs.saidao.cc` | 头像、封面、上传文件 |
| 图片代理 | `images.weserv.nl` | 第三方图片裁剪/代理（bilibili 头像、微信封面等） |
| 边缘代理 | `cloudflare` | 全站 CDN/反代 |
| 设备指纹 | FingerprintJS | 生成 `fp` 请求头 |

## 6. 备注

1. 后端为 Java/Spring + PostgreSQL（从报错堆栈可见 `com.saidao.live.*`、`VideoRequestMapper.java`、`PSQLException`）。
2. 部分接口（`sendVerificationCode`、`chatPollStatus`、`videoRequestSkip`、`videoRequestDelete`）在前端已封装但当前版本未找到直接调用点，保留于规范中以备后续启用。
3. `.tmp_probe` 中带鉴权（70-85 系列）的调用使用真实 token，可作为数据结构的参考样本。
