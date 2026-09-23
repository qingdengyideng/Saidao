# 08 · 赞助页 + PWA 规格

> 两个相对独立的轻量模块：**赞助页**（`sponsor.html`，纯视觉展示）与 **PWA**（`manifest.json` + `service-workV3.js` + 安装按钮）。
> 赞助页无业务逻辑，PWA 仅缓存第三方图片资源（表情/Lottie/图片），不做页面离线。

---

## 一、赞助页（sponsor.html）

### 1.1 页面定位

- 独立静态页，入口：主页头部"赞助"按钮（`sponsorBtn`，见 02-home-page §2）跳转 `sponsor.html`。
- 无 JS 业务逻辑、无鉴权、无接口调用，纯展示 + 轻动效。
- 收款码为**本地静态图片**（`images/wechat-pay.png` / `images/alipay.jpg`），非后端动态生成。

### 1.2 布局线框

```
┌────────────────────────────────────────────────────────┐
│              ❤ 支持抽象赛道网                            │
│   感谢您对抽象赛道网的支持！您的赞助将帮助我们持续          │
│   维护服务器、优化用户体验，并为您带来更优质的服务。        │
│                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐   │
│  │  💬 微信赞助           │  │  🔵 支付宝赞助         │   │
│  │  ┌──────────────────┐ │  │  ┌──────────────────┐ │   │
│  │  │  [微信收款码 png]  │ │  │  │  [支付宝码 jpg]   │ │   │
│  │  └──────────────────┘ │  │  └──────────────────┘ │   │
│  │  请使用微信扫描上方二维码│  │  请使用支付宝扫描上方   │   │
│  │  或长按识别进行赞助     │  │  二维码或长按识别赞助   │   │
│  └──────────────────────┘  └──────────────────────┘   │
│                                                        │
│  ┌─ 您的支持将用于 ──────────────────────────────────┐  │
│  │  🖥 服务器租用和维护费用                          │  │
│  │  ⚡ 网站功能开发和优化                            │  │
│  │  🛡 网络安全保障                                 │  │
│  │  🚀 新功能研发和技术创新                          │  │
│  │  👥 更好的用户体验和服务                          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│            [ ← 返回首页 ]                               │  href="/"
│   ⓘ 注意：赞助时请备注您的用户名，以便进行记录和感谢！      │
└────────────────────────────────────────────────────────┘
```

### 1.3 交互与动效

| 交互 | 行为 |
|---|---|
| 支付卡片 hover | 卡片 `translateY(-5px)` + 阴影加深；图标 `scale(1.1) rotate(5deg)` |
| 点击二维码 | `scale(1.05)` → 300ms 后回弹 `scale(1)`（轻反馈） |
| 页面加载 | 容器 `fadeIn 0.5s`（opacity + translateY） |
| 返回首页 | `<a href="/">` 跳主页 |

> 响应式：`max-width:768px` 时双列变单列、二维码缩至 200px、标题缩至 2em。

### 1.4 现状问题与重构注意点

1. **静态收款码**：微信/支付宝码写死本地图片，更换收款方需改文件；重构建议改由后端/配置下发码图 URL。
2. **alt 文案错误**：支付宝 `<img alt="微信收款码">` 复制粘贴遗留，应改"支付宝收款码"。
3. **支付宝码样式 hack**：`height:150%` + `padding` + 蓝色背景硬撑，重构建议用 `object-fit` 规范处理。
4. **无赞助记录/感谢墙**：页脚提示"备注用户名以便记录和感谢"，但无任何后端联动；重构若要做感谢墙需新增接口。
5. **无埋点**：赞助入口点击/页面无统计；重构可加埋点。

---

## 二、PWA

### 2.1 manifest.json

| 字段 | 值 | 说明 |
|---|---|---|
| name / short_name | `Saidao` | 应用名 |
| description | `没有描述` | **占位文案，需补** |
| start_url | `/` | 主页 |
| display | `standalone` | 独立窗口（无边栏） |
| background_color | `#ffffff` | |
| theme_color | `#000000` | 与 player 页 `#202027` 不一致 |
| icons | `icon-192x192.png` / `icon-512x512.png` | 仅 png，无 maskable |

### 2.2 注册（app.js）

```
if ('serviceWorker' in navigator)
  window.load → navigator.serviceWorker.register('/service-workV3.js')
    .then(log) .catch(log)
```

### 2.3 Service Worker（service-workV3.js）

```
SW_VERSION = 'v1.1.0'
CACHE_NAME = `pwa-cache-v1.1.0`
MAX_CACHE_ENTRIES = 160
STATIC_ASSETS = []          ← 空，install 阶段不预缓存
CACHE_PREFIXES = [
  'https://ali2.a.yximgs.com/bs2/emotion',   // 抖音系表情
  'https://cdnl.iconscout.com/lottie/premium/thumb',  // Lottie 动画
  'https://rustfs.saidao.cc/images'          // 自建图床
]
CACHEABLE_RESOURCE_PATTERN = /\.(jpg|jpeg|png|gif|webp|svg|json)$/i
```

**策略：Cache First（仅针对 3 个前缀的 GET 资源）**

```
install  → skipWaiting + cache.addAll(STATIC_ASSETS=[])（实际不缓存）
activate → 删除旧版本缓存 + trimCache(>160 删最旧) + clients.claim
fetch    → 仅 method==='GET' 且 shouldHandleRequest(url)
            ├─ 命中缓存 → 返回缓存
            ├─ 未命中 → fetch(no-cors, credentials:omit)
            │            → clone 写入缓存 + trimCache → 返回
            └─ fetch 失败 → 返回 1×1 透明 PNG 占位（离线降级）
```

- **缓存键**：`createCacheKey` 去掉 `search`/`hash`，`no-cors` + `credentials:omit`。
- **离线降级**：仅对"表情/Lottie/图片"三类资源降级为 1×1 透明 PNG；**不缓存 HTML/JS/CSS/API**，页面本身不可离线。

### 2.4 安装按钮（beforeinstallprompt）

```
window 'beforeinstallprompt'
  ├─ e.preventDefault()
  ├─ deferredPrompt = e
  └─ #installButton.style.display = 'flex'   ← 默认隐藏，事件触发才显示

点击 #installButton
  ├─ 无 deferredPrompt → alert('安装功能暂时不可用')
  ├─ deferredPrompt.prompt()
  └─ await userChoice
        ├─ accepted → 隐藏按钮 + Toast('应用已成功安装到桌面！','success')
        └─ dismissed → Toast('已取消安装','info') + 10s 后重新显示按钮

window 'appinstalled'（其它方式安装）
  └─ 隐藏按钮 + deferredPrompt = null
```

### 2.5 边界与重构注意点

1. **缓存范围过窄**：只缓存 3 个前缀的图/表情/Lottie，**不缓存应用自身**，离线时页面打不开。重构若要做真离线，需加入应用外壳（HTML/JS/CSS）缓存或 Workbox 预缓存。
2. **STATIC_ASSETS 为空**：install 不预缓存任何资源，首访后靠运行时缓存，离线体验依赖"曾访问过"。
3. **1×1 透明 PNG 降级**：图片离线时显示空白（透明），用户无感知；重构可换品牌占位图并提示离线。
4. **theme_color 不一致**：manifest `#000000` vs 播放页 `#202027` vs 主页主题，重构需统一品牌色。
5. **无 maskable icon**：仅 192/512 普通图标，部分平台（Android 自适应图标）需 maskable。
6. **description 占位**：`没有描述` 需补正式文案。
7. **版本号手工管理**：`SW_VERSION` 硬编码，发布需手动 bump 以触发旧缓存清理；重构建议构建期注入。
8. **no-cors 缓存**：跨域资源用 `no-cors` 存入 opaque 响应，无法校验状态码；重构评估是否改用 CORS 缓存。

---

## 三、涉及接口 / 文件

| 项 | 说明 |
|---|---|
| `sponsor.html` | 静态页，无接口 |
| `images/wechat-pay.png` / `images/alipay.jpg` | 静态收款码 |
| `manifest.json` | PWA 清单 |
| `/service-workV3.js` | Service Worker（v1.1.0，Cache First，3 前缀图片缓存） |
| `icon-192x192.png` / `icon-512x512.png` | PWA 图标 |
| `#installButton` + `beforeinstallprompt` | 安装引导（app.js 4043–4093） |
