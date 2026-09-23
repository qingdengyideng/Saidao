# 上传模块（Upload）

> 基地址：`https://api.saidao.cc`。均为 `multipart/form-data`，**前端不手动设置 Content-Type**（浏览器自动加 boundary）。

## 1. 上传图片 — `POST /api/image/upload`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.uploadImages(formData)`
- **请求体**：`multipart/form-data`
  - `file`：图片文件（JPG/PNG/GIF/WEBP）
- **成功响应**：

```json
{ "code": "0", "message": "", "data": { "url": "https://rustfs.saidao.cc/images/{uuid}.png" } }
```

- **前端处理**：取 `data.url` 作为头像/封面/图片消息 URL（见 `app.js` 资料编辑、聊天图片发送）。
- **错误**：
  - `400 { code:"1", message:"image oversize(image width is undersize)" }`（probe `35b_image_upload_small`，即图片尺寸不合规——过宽或过窄均会报）
  - `401 { code:"1", message:"请先登录" }`

## 2. 上传语音 — `POST /api/voice/upload`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.uploadVoice(formData)`
- **请求体**：`multipart/form-data`
  - `file`：音频 Blob，文件名形如 `voice-{timestamp}.webm`（前端本地录制的 WebM 音频）
- **成功响应**：

```json
{ "code": "0", "message": "", "data": { "url": "https://rustfs.saidao.cc/voice/{uuid}.webm" } }
```

- **前端处理**：取 `data.url` 作为语音消息 `audioUrl`，随后经 WebSocket 发送 `{ type:'voice', audioUrl, duration, waveform }`（见 [websocket.md](websocket.md)）。
- **错误**：`401 { code:"1", message:"请先登录" }`（probe `36_voice_upload`）。

## 备注

- 上传文件统一存入对象存储 `rustfs.saidao.cc`，返回可公开访问的 URL。
- 图片尺寸校验由后端执行，前端仅做大小/类型预检。
