# 表情模块（Emoji）

> 基地址：`https://api.saidao.cc`。

## 1. 查询表情 — `GET /emoji/{group}`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.queryEmojis(group)`
- **路径参数**：`group`
  - `vip`：VIP 自定义表情（图片，支持上传）
  - `animation`：动态表情（GIF/WebM 动画）
- **成功响应**：`data` 为表情对象**数组**（probe `19_emoji_vip` / `20_emoji_animation`）。

单个表情对象：

```json
{
  "name": "qcm8yp",
  "url": "https://rustfs.saidao.cc/images/89f14cad-74d8-47ad-8949-b937c2af34de.png",
  "clickSend": true
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 表情标识（alt 文本） |
| `url` | string | 资源 URL（vip 为图片，animation 为动画） |
| `clickSend` | boolean | 是否点击即发送（true=单击直接发，false=插入输入框） |

- **前端处理**：
  - `vip` 组渲染为 `<img>`，并额外渲染一个上传按钮（`+`）。
  - `animation` 组渲染为 `<video muted autoplay loop>`。
  - 发送表情时，`content` 为 `<img class="chat-emoji vip" src="..." alt="..."/>` HTML。

## 2. 上传表情 — `POST /emoji/upload`

- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.uploadEmojis(formData)`
- **请求体**：`multipart/form-data`
  - `file`：图片文件（JPG/PNG/GIF/WEBP，**≤ 2MB**）
- **成功响应**：`{ code:"0", message:"", data:{ url, name } }`（上传后前端清除本地缓存并重新拉取列表）。
- **错误**：
  - `401 { code:"1", message:"请先登录" }`（probe `37_emoji_upload`）
  - 超出 2MB 时前端拦截，不发请求。

> 上传成功后 `data.url` 形如 `https://rustfs.saidao.cc/images/{uuid}.png`，存入对象存储。
