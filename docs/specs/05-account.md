# 05 · 账号体系规格

> 覆盖登录 / 分配账号（图形验证码）/ 个人资料编辑（头像·昵称·签名·阵营·开播通知 Webhook）/ 修改密码 / 用户详情 / 赛道标签编辑 / 退出登录。
> 全部为**模态框（modal）交互**，挂载在主页 `index.html`，逻辑在 `app.js`。播放页无账号体系。

---

## 0. 鉴权模型

- **令牌**：`localStorage[SaidaoConfig.TOKEN_KEY]`（即 `ACCESS_TOKEN`），登录/分配成功后写入。
- **请求头**：明文 `Authorization: {token}`（**无 Bearer 前缀**），由 `api.js` 统一注入。
- **401 处理**：任意接口返回 401 → `openLoginModal()`。
- **登录态判定**：`checkIsLogin()` 调 `ApiEndpoints.currentUser()`，`data.user !== null` 即登录，填充 `state.currentUser`。
- **设备指纹**：FingerprintJS `visitorId`（降级 `crypto.randomUUID()`），随请求 `fp` 头发送，供反作弊/封禁。

### state.currentUser 字段

| 字段 | 来源 | 说明 |
|---|---|---|
| id / name / email / avatar / bio | `data.user` | 基础资料 |
| webhookType / webhookUrl | `data.user` | 开播通知渠道 + 地址 |
| faction | `data.user` | 阵营 `ya` / `juan` |
| canChatBan | `data.user.canChatBan===true` | 是否可封禁用户（管理） |
| canEditSaidaoTag | `data.user.canEditSaidaoTag===true` | 是否可编辑赛道标签（管理） |

> **状态重建方式**：登录 / 资料保存 / 改密 / 退出 后均 `window.location.reload()` 整页刷新重建 `SaidaoState`（无增量更新，重构需评估是否保留）。

---

## 1. 登录（loginModal）

### 1.1 线框

```
┌──────────── 登录 ──────────── ─ [×] ─┐
│  账号或邮箱                            │
│  ┌────────────────────────────────┐  │
│  │ 请输入账号或邮箱                  │  │  #loginAccount (text)
│  └────────────────────────────────┘  │
│  密码                                 │
│  ┌────────────────────────────────┐  │
│  │ ••••••••                        │  │  #loginPassword (password)
│  └────────────────────────────────┘  │
│  [        登录        ]              │  #loginForm submit
│                                      │
│  还没有账号？系统将自动分配账号          │
│  与6位初始密码。                       │
│  [      分配账号      ]              │  #allocateAccount
└──────────────────────────────────────┘
```

### 1.2 交互流程

```
点击 [登录]
  ├─ account / password 任一为空 → Toast('请输入账号或邮箱和密码','warning')
  ├─ ApiEndpoints.login({email: account, password})
  │     └─ 成功 → { token, user }
  ├─ localStorage[TOKEN_KEY] = token
  ├─ Toast('登录成功','success')
  └─ window.location.reload()   ← 整页刷新，重新 checkIsLogin
```

> 账号字段名 `email`，但前端允许"账号或邮箱"。失败（401/密码错）由全局 401 → 重新弹登录框；接口报错走 Toast。

---

## 2. 分配账号（captchaModal + allocationResultModal）

### 2.1 流程总览

```
登录框 [分配账号]
  │ openAllocationCaptcha()
  ▼
GET /user/captcha  → { captchaId, base64Image }
  │ allocationCaptchaId = captchaId
  ▼
┌──────── 安全验证 ──── [×] ─┐
│   [ 图形验证码 base64 ]     │  #captchaImage (点击可换图)
│  验证码                      │
│  ┌────────────────────┐    │
│  │ 输入验证码           │    │  #captchaCode
│  └────────────────────┘    │
│  [   确认并分配账号   ]      │  #confirmCaptchaBtn
└────────────────────────────┘
  │ confirmAllocationCaptcha()
  ▼
POST /user/allocate { captchaId, captchaValue }
  │ 成功 → { account, password, token }
  ├─ localStorage[TOKEN_KEY] = token
  ├─ sessionStorage['allocationCredentials'] = {account, password}
  └─ window.location.reload()
        │
        │ 重新加载后 initializeApp → showPendingAllocationCredentials()
        ▼  从 sessionStorage 取一次性凭据（取完即删）
┌──────── 账号已分配 ─── [×] ─┐
│  账号体系已改为自动分配。请保存 │
│  以下凭据，登录后可修改密码。    │
│  账号    ┌────────────────┐ │
│          │ {account}      │ │  #allocatedAccount
│  初始密码 ┌────────────────┐ │
│          │ {password}     │ │  #allocatedPassword
│  [   复制账号密码    ]      │  #copyAllocationCredentials
│  [    进入主页       ]      │  #finishAllocation
└────────────────────────────┘
```

### 2.2 关键细节

| 点 | 说明 |
|---|---|
| 图形验证码 | base64 内联图，点击换图（重新 `getCaptcha`）；`captchaId` 与图绑定 |
| 一次性消费 | 凭据存 `sessionStorage`，`showPendingAllocationCredentials` 读取后立即 `removeItem`，避免二次弹窗泄露 |
| 复制 | `navigator.clipboard.writeText("账号：x\n密码：y")`，失败 Toast 提示手动保存 |
| 初始密码 | 6 位，分配后可在"修改密码"中改 |
| 失败 | `allocate` code!=='0' → 留在验证码框（保留 captchaId 可重试） |

---

## 3. 滑动验证码（聊天上行防滥用）

> 见 03-chatroom §9。此处仅列账号相关边界：登录用户发送消息/表情等上行，若后端要求滑动验证，弹出 `sliding-captcha`：
> - `bypass`（通过）→ 带 `ticket` 重放上行业务；
> - 验证失败 → 递归重试；
> - `isBanned`（封禁）→ **不重试**，提示被限制。

---

## 4. 个人资料编辑（profileModal）

### 4.1 线框

```
┌──────────── 编辑个人信息 ──── [×] ─┐
│            ( 头像 )                │  #profileAvatar (点击放大预览)
│         [ 更换头像 ]               │  #changeAvatarBtn → file input
│                                    │
│  昵称                               │
│  ┌────────────────────────────┐    │
│  │ 请输入昵称 (≤16)             │    │  #profileName maxlength=16
│  └────────────────────────────┘    │
│  个性签名                           │
│  ┌────────────────────────────┐    │
│  │ 请输入个性签名 (≤100)         │    │  #profileBio textarea rows=3
│  └────────────────────────────┘    │
│                                    │
│  选择阵营   ⚠ 选择后30天内不能更换     │
│  ┌──────────┐   ┌──────────┐      │
│  │  [YA图]   │   │  [卷图]   │      │  .faction-option-row
│  │    牙     ○  │    卷     ○  │      │  radio name=faction
│  └──────────┘   └──────────┘      │  选中 → .selected + radio checked
│                                    │
│  开播通知                            │
│  选择一种接收开播通知的方式            │
│  ┌────────────────────────────┐    │
│  │ 🔔钉钉   💬企微   🪶飞书     │    │  .webhook-option data-type
│  └────────────────────────────┘    │  选中 → 显示 webhookUrl 输入行
│  创建钉钉机器人? 创建企微? 创建飞书?   │  外链教程
│  ┌────────────────────────────┐    │
│  │ Webhook地址        [测试]   │    │  #webhookUrl + #testWebhookBtn
│  └────────────────────────────┘    │  (选中渠道后才显示)
│                                    │
│  [        保存更改        ]        │  #profileForm submit
│  [        修改密码        ]        │  #openChangePassword
│  [       退出登录        ]        │  #logoutBtn (红色)
└────────────────────────────────────┘
```

### 4.2 头像上传 `handleChangeAvatar`

```
点击 [更换头像] → #avatarFileInput.click() (accept="image/*")
  │ change
  ▼
  ├─ 非图片 (type 不以 image/ 开头) → alert('只能上传图片文件')
  ├─ 大小 > 2MB (2*1024*1024) → alert('图片大小不能超过 2MB')
  ├─ FormData.append('file', file)
  ├─ ApiEndpoints.uploadImages(formData) → { url }
  ├─ 无 url → alert('未获取到头像地址')
  └─ state.currentUser.avatar = url; #profileAvatar.src = url
     (不立即保存，随"保存更改"一起提交)
```

> 注意：头像先传到对象存储拿 url，再在"保存更改"里以 `avatar` 字段提交给 `profileUpdate`。

### 4.3 阵营选择

- 两个阵营：`ya`（牙）、`juan`（卷），radio `name=faction`。
- 点击 `.faction-option-row` → 加 `.selected`、radio checked、`#selectedFaction.value = faction`。
- **限制**：选择后 30 天内不可更换（后端校验；前端仅提示）。

### 4.4 开播通知 Webhook

| 渠道 | data-type | 合法前缀白名单 |
|---|---|---|
| 钉钉 | `dingtalk` | `https://oapi.dingtalk.com/robot/send` |
| 企微 | `wechat` | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send` |
| 飞书 | `feishu` | `https://open.feishu.cn/open-apis/bot` |

```
选中 webhook-option
  ├─ #selectedWebhook.value = type
  ├─ 显示 #webhookUrlContainer（含 #webhookUrl + #testWebhookBtn）
  └─ 回填已存 webhookUrl
点击 [测试] handleTestWebhook
  ├─ 无 type/url → Toast('请填写完整的 Webhook 地址','warning')
  ├─ url 不匹配任一前缀白名单 → Toast('请填写正确的 Webhook 地址...','error')
  └─ ApiEndpoints.testWebhook({type, url})
        ├─ code!=='0' → Toast('消息发送失败：'+message,'error')
        └─ code==='0' → Toast('消息发送成功，请查收消息！','success')
```

> 白名单前缀**同时**用于"保存更改"校验（`handleProfileUpdate` 内同一段 `validPrefixes`）。

### 4.5 保存 `handleProfileUpdate`

```
提交 profileForm
  ├─ 取 name / bio / webhookType / webhookUrl / avatar(src) / faction
  ├─ url 非空且不匹配前缀白名单 → Toast('请填写正确的 Webhook 地址...','error')，中止
  ├─ ApiEndpoints.profileUpdate({ name, bio, webhookType, webhookUrl, avatar, faction })
  └─ code==='0' → window.location.reload()   ← 整页刷新重建资料
```

---

## 5. 修改密码（changePasswordModal）

### 5.1 线框

```
┌──────── 修改密码 ───────── [×] ─┐
│  旧密码                          │
│  ┌────────────────────────────┐ │
│  │ ••••••••                    │ │  #oldPassword (password)
│  └────────────────────────────┘ │
│  新密码                          │
│  ┌────────────────────────────┐ │
│  │ ••••••••  (至少6位)          │ │  #changedPassword minlength=6
│  └────────────────────────────┘ │
│  确认新密码                       │
│  ┌────────────────────────────┐ │
│  │ ••••••••                    │ │  #changedConfirmPassword minlength=6
│  └────────────────────────────┘ │
│  [        保存密码        ]     │  #changePasswordForm submit
└────────────────────────────────┘
```

### 5.2 流程

```
提交
  ├─ newPassword.length < 6 → Toast('新密码至少6位','warning')
  ├─ newPassword !== confirmPassword → Toast('两次输入的密码不一致','error')
  └─ ApiEndpoints.changePassword({ oldPassword, newPassword, confirmPassword })
        └─ code==='0' → 关闭弹窗 + Toast('密码已修改','success')
```

> 改密成功后**不 reload**（保留当前会话），与登录/资料保存不同。

---

## 6. 用户详情（userDetailModal）

### 6.1 触发

- **仅**在聊天室点击某条消息的头像时触发（`showUserDetail(userId)`，取 `avatar.dataset.userId`）。
- 无鉴权限制（`showUserDetail` 接口不校验登录）。

### 6.2 线框

```
┌──────── 用户详情 ───────── [×] ─┐
│            ( 头像 )              │  #detailAvatar (点击放大预览)
│            用户名                │  #detailName
│   个性签名 bio                   │  #detailBio
│   用户ID: {id}                   │  #detailUserId
│   注册时间: {YYYY-MM-DD}         │  #detailRegistrationTime
└────────────────────────────────┘
```

### 6.3 流程与风险

```
showUserDetail(userId)
  ├─ ApiEndpoints.showUserDetail(userId) → userDetail
  ├─ 填 name / avatar / bio / `用户ID:{id}`
  ├─ #detailRegistrationTime = new Date(registerDate).toLocaleDateString()
  └─ setModalOpen('userDetailModal', true)
```

> ⚠ **风险**：`registerDate` 为**秒级**时间戳，代码直接 `new Date(registerDate)` 未 `×1000`，会显示 1970 年。重构需修正或确认接口单位。

---

## 7. 赛道标签编辑（tagEditorModal）

> 主播卡片上的"赛道唯一标签"编辑，仅 `canEditSaidaoTag === true` 的管理账号可触发。

### 7.1 线框

```
┌──── 编辑标签：{主播名} ──── [×] ─┐
│  当前标签预览                      │
│  🏷 {tag || 添加一个标签}          │  #tagEditorPreview (实时随输入更新)
│  提示文案                           │  #tagEditorHint
│  ┌────────────────────────────┐    │
│  │ 输入新标签                   │    │  #tagEditorInput (打开时 focus)
│  └────────────────────────────┘    │
│  [        保存标签        ]        │  #tagEditorSaveBtn
└────────────────────────────────────┘
```

### 7.2 流程

```
openTagEditor(streamer)
  ├─ streamer 为空 或 canEditSaidaoTag!==true → return（不弹）
  ├─ 填 #tagEditorTitle=#主播名 / #tagEditorInput=#streamer.tag
  ├─ hint：有标签→"点击保存会更新为新的唯一标签。留空可清空标签。"
  │        无标签→"当前主播还没有标签，输入后即可保存。"
  └─ 预览内联 escapeHtml(streamer.tag)

输入 #tagEditorInput → syncTagPreview() 实时刷新预览（escapeHtml）

提交 handleTagEditorSubmit
  ├─ ApiEndpoints.updateSaidaoTag({ saidaoId: target.id, tag: input.trim() })
  ├─ code==='0' → Toast(tag?'标签已更新':'标签已清空','success') + 关闭
  └─ 否则 → Toast(result.message||'标签更新失败','error')
```

> 实时协同：WS 下发 `saidaoTagUpdate` → `applySaidaoTagUpdate` 同步更新本地 `streamersData` 与打开中的编辑器（避免多人编辑冲突）。

---

## 8. 退出登录

```
点击 [退出登录] handleLogout
  ├─ localStorage.removeItem(TOKEN_KEY)
  └─ window.location.reload()   ← 刷新后 checkIsLogin 判未登录，回到游客态
```

---

## 9. 模态框通用行为

- `openModal(id)`：`closeAllModals()`（清 `.active` + 清 `tagEditorTarget`）→ `setModalOpen(id, true)`。**一次只能开一个 modal**。
- 关闭按钮 / 遮罩点击 → `closeModal(id)`。
- `closeAllModals` 在打开新 modal 时自动调用，避免多弹层叠加。

---

## 10. 边界与重构注意点

1. **reload 重建状态**：登录/资料/退出 均整页刷新。重构若引入 SPA 路由 + 状态管理，需改为增量更新（重新拉 currentUser + 局部刷新 UI）。
2. **401 全局弹登录**：依赖 `api.js` 拦截。重构需保留"任意 401 → 登录态失效提示"。
3. **Authorization 无 Bearer**：明文 token 头。重构若上 axios/框架，注意请求头格式与后端兼容。
4. **registerDate ×1000**：用户详情注册时间单位 bug，需修正。
5. **Webhook 白名单硬编码**：`validPrefixes` 在 `handleProfileUpdate` 与 `handleTestWebhook` 各写一份，应抽为常量。
6. **头像上传先存后提**：上传拿 url 再随表单提交，存在"上传了但未保存"的孤儿文件；重构可考虑保存时一并提交或草稿态。
7. **阵营 30 天限制**：仅后端强校验，前端无冷却提示，重构应展示"X 天后可更换"。
8. **sessionStorage 一次性凭据**：分配账号凭据取完即删，重构需保留"只展示一次"语义，避免凭据残留。
9. **管理权限双开关**：`canChatBan`（封禁，见 03-chatroom 上下文菜单）与 `canEditSaidaoTag`（赛道标签）均后端下发布尔，前端仅做显隐控制，无本地越权校验。

---

## 11. 涉及接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/user/login` | POST | `{email, password}` → `{token, user}` |
| `/user/current` | GET | 当前登录态判定（401 即未登录） |
| `/user/captcha` | GET | `{captchaId, base64Image}` |
| `/user/allocate` | POST | `{captchaId, captchaValue}` → `{account, password, token}` |
| `/user/profile` | GET/PUT | 资料读取 / `profileUpdate({name,bio,webhookType,webhookUrl,avatar,faction})` |
| `/user/changePassword` | POST | `{oldPassword, newPassword, confirmPassword}` |
| `/user/detail/{id}` | GET | 用户详情（无鉴权） |
| `/upload/image` | POST | multipart `file` → `{url}`（头像/表情共用） |
| `/user/testWebhook` | POST | `{type, url}` 试发通知 |
| `/saidao/updateTag` | POST | `{saidaoId, tag}` 更新赛道唯一标签（需 canEditSaidaoTag） |

> 接口路径以 `api.js` 实际定义为准（上表为语义命名）。
