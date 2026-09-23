# 验证码模块（Captcha）

> 基地址：`https://api.saidao.cc`。滑动验证码独立于图形验证码，返回的 `ticket` 用于 WebSocket 聊天防刷。

## 1. 获取滑动验证码 — `GET /captcha/slider`

- **鉴权**：无
- **前端入口**：`assets/js/sliding-captcha.js` 直接 `fetch`
- **入参**：无
- **成功响应**（probe `09_captcha_slider`，实测可能返回空对象，字段以代码读取为准）：

```json
{
  "code": "0",
  "message": "",
  "data": {
    "challengeId": "uuid",
    "background": "data:image/png;base64,...",
    "piece": "data:image/png;base64,...",
    "pieceY": 120,
    "width": 320,
    "height": 160
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `challengeId` | string | 挑战 ID，校验时回传 |
| `background` | string | 背景图 dataURL |
| `piece` | string | 滑块拼图块 dataURL |
| `pieceY` | number | 拼图块的 Y 坐标 |
| `width` | number | 画布宽度 |
| `height` | number | 画布高度 |

> 说明：probe 环境返回了 `{}`（疑似 bypass 模式）。真实环境应返回上述字段，前端据此渲染滑块。

## 2. 校验滑动验证码 — `POST /captcha/slider/verify`

- **鉴权**：无
- **前端入口**：`assets/js/sliding-captcha.js` 直接 `fetch`
- **入参**（JSON body）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `challengeId` | string | 是 | 来自 `/captcha/slider` 的 `challengeId` |
| `x` | number | 是 | 用户拖动滑块的水平位移（px） |

- **成功响应**（probe `10_captcha_slider_verify`）：`data` 为 **ticket 字符串**：

```json
{ "code": "0", "message": "", "data": "bypass" }
```

- **前端处理**：`SlidingCaptcha.getTicket(fp)` 返回该 ticket；聊天室在收到 `captchaRequired` 后，将 ticket 作为 `captchaTicket` 字段附加到待发送的聊天消息上重发（见 `chat-room.js:742`）。

## 与聊天室的协作流程

```
用户发消息
   → 后端要求验证（WS 下发 { type:'captchaRequired' }）
   → 前端调 GET /captcha/slider 取图
   → 用户拖动滑块
   → POST /captcha/slider/verify 取 ticket
   → 将原消息 + { captchaTicket: ticket } 经 WS 重发
```

## 图形验证码

图形验证码（登录/注册用）见 [user.md](user.md#7-获取图形验证码--get-usercaptcha) 的 `GET /user/captcha`。
