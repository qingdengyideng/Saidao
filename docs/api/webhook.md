# Webhook 模块（N8N）

> **注意**：本模块接口走 **N8N 域** `https://n8n.saidao.cc`（`fromN8N: true`），而非主 API 域。

## 1. 测试 Webhook — `POST /webhook/testWebhook`

- **基地址**：`https://n8n.saidao.cc`
- **鉴权**：🔒 需要
- **前端入口**：`ApiEndpoints.testWebhook(data)`
- **入参**（JSON body）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `webhookType` | string | Webhook 类型（如 `telegram` / `discord` / `slack` 等，对应个人 Webhook 配置） |
| `webhookUrl` | string | Webhook 目标地址 |
| `testMessage` | string | 测试消息内容 |

- **成功响应**：`{ code:"0", message:"", data:null }`（N8N 工作流接收并转发）。
- **错误**：
  - `522`：N8N 服务不可达（probe `42_n8n_testWebhook` 实测超时，服务当时不可用）。
  - 配置错误时由 N8N 工作流返回具体失败信息。

## 个人 Webhook 配置

用户可在资料中配置个人 Webhook（见 [user.md §5 更新资料](user.md#5-更新资料--post-userupdate) 的 `webhookType` / `webhookUrl` 字段）。本接口用于保存配置前测试连通性。

> 备注：当前前端版本已封装 `testWebhook` 但主流程未见直接调用点，N8N 工作流具体触发场景待后端确认。
