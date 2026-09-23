# Saidao 产品架构与功能规格

> 文档生成日期：2026-09-21
> 文档对象：`e:\02-项目\Saidao` 现有前端项目（纯静态 PWA，原生 HTML/CSS/JS）
> 目的：为前端重构（Saidao-next）提供**产品架构 + 全功能规格 + 交互线框图**
> 配套文档：`../ARCHITECTURE.md`（技术架构）、`../api/`（接口文档）、`../schema/openapi.yaml`（机器可读规范）

---

## 文档导航

本目录按「产品总览 → 页面级规格」组织，每篇规格文档内嵌**线框图**（ASCII）描述关键交互的布局与状态流转。

| 文档 | 内容 | 覆盖功能 |
|------|------|----------|
| [01-product-overview.md](./01-product-overview.md) | 产品定位、用户角色、功能地图、页面导航流、信息架构、非功能需求、技术约束 | 全局 |
| [02-home-page.md](./02-home-page.md) | 主页规格 | 头部控制、通知栏、筛选 tabs、主播直播卡片、抽象日报、深色模式、PWA 安装 |
| [03-chatroom.md](./03-chatroom.md) | 聊天室规格 | 侧栏布局、消息类型、上下文菜单、输入区、语音、表情、屏蔽设置、历史消息、时间线、掰头投票、WebSocket |
| [04-player-page.md](./04-player-page.md) | 独立播放页规格 | 播放器、状态机、弹幕、评论面板、小窗 PiP、全屏、音量、移动端适配 |
| [05-account.md](./05-account.md) | 账号体系规格 | 登录、账号分配（注册）、图形验证码、滑动验证码、个人信息、修改密码、用户详情 |
| [06-saidao-ops.md](./06-saidao-ops.md) | 赛道管理规格 | 标签编辑、不想看TA、热度分、AI 内容分析、实时事件 |
| [07-video-request.md](./07-video-request.md) | 视频点播室规格（**当前休眠**） | BV 提交、投票、播放队列、WS 驱动 |
| [08-sponsor-pwa.md](./08-sponsor-pwa.md) | 赞助页 + PWA 规格 | 赞助二维码、manifest、离线缓存、安装流程 |

---

## 阅读建议

1. **重构立项**：先读 [01-product-overview.md](./01-product-overview.md) 把握产品全貌与技术约束。
2. **按页面拆分开发**：每个页面对应一篇规格文档，文档内含该页面的线框图、交互状态机、数据流、边界情况。
3. **接口对照**：每篇规格文档末尾列出该功能涉及的 REST/WS 接口，字段细节见 [../api/](../api/) 与 [../schema/openapi.yaml](../schema/openapi.yaml)。

---

## 线框图约定

本文档集使用 **ASCII 线框图** 表达界面布局与关键交互状态。约定：

- `[ ]` 按钮 / `○` 单选 / `☐` 复选 / `——` 分隔线 / `←→` 拖拽
- `( … )` 可滚动区域 / `< … >` 折叠区
- 标注 `①②③` 表示交互步骤或状态流转
- `▲` 表示实时/动态区域（WS 驱动）
- 线框图聚焦**布局与交互**，不表达视觉样式（颜色/圆角/阴影见 CSS）

---

## 关键现状说明（重构前必读）

| 项 | 现状 | 影响 |
|----|------|------|
| 框架 | 纯原生 JS，无构建工具、无组件化 | 重构需选型（React/Vue/原生+构建） |
| 双份聊天逻辑 | `app.js` 内联实现 + `chat-room.js` 工厂（后者主要服务 player） | 重构时聊天室需统一为单一实现 |
| 视频点播室 | 代码完整保留但 DOM/tab 被注释，**当前不可用** | 重构时可决定启用或移除 |
| 状态管理 | `window.SaidaoState` 全局对象 + localStorage | 重构需引入状态管理（Redux/Pinia/原生 store） |
| 样式 | 6 个全局 CSS 文件 + CSS 变量 + `data-theme` 深色 | 重构需梳理设计 token |
| 鉴权 | token 存 localStorage，明文 `Authorization`（无 Bearer 前缀） | 重构可改用 Authorization: Bearer |
