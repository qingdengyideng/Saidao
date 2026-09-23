import Link from "next/link";

/**
 * 赞助页（/sponsor）
 * 纯静态展示页：展示微信/支付宝收款码 + 用途说明，无业务逻辑、无鉴权。
 * 设计规格见 docs/specs/08-sponsor-pwa.md §1.2
 */
export default function SponsorPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sponsor-fade-in">
        {/* 标题区 */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold">❤ 支持抽象赛道网</h1>
          <p className="mt-2 text-muted-foreground">
            感谢您对抽象赛道网的支持！您的赞助将帮助我们持续维护服务器、优化用户体验，并为您带来更优质的服务。
          </p>
        </header>

        {/* 双卡片布局：桌面端双列，移动端单列 */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {/* 微信赞助卡片 */}
          <div className="rounded-lg border bg-card p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-3 text-2xl" aria-hidden="true">
              💬
            </div>
            <h2 className="mb-4 text-lg font-semibold">微信赞助</h2>
            <img
              src="/images/wechat-pay.png"
              alt="微信收款码"
              width={320}
              height={320}
              className="mx-auto mb-4 max-h-64 w-auto rounded"
            />
            <p className="text-sm text-muted-foreground">
              请使用微信扫描上方二维码或长按识别进行赞助
            </p>
          </div>

          {/* 支付宝赞助卡片 */}
          <div className="rounded-lg border bg-card p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-3 text-2xl" aria-hidden="true">
              🔵
            </div>
            <h2 className="mb-4 text-lg font-semibold">支付宝赞助</h2>
            <img
              src="/images/alipay.jpg"
              alt="支付宝收款码"
              width={320}
              height={320}
              className="mx-auto mb-4 max-h-64 w-auto rounded"
            />
            <p className="text-sm text-muted-foreground">
              请使用支付宝扫描上方二维码或长按识别赞助
            </p>
          </div>
        </div>

        {/* 用途列表 */}
        <div className="mt-6 rounded-lg border bg-card p-6">
          <h3 className="mb-3 font-semibold">您的支持将用于</h3>
          <ul className="space-y-2 text-sm">
            <li>🖥 服务器租用和维护费用</li>
            <li>⚡ 网站功能开发和优化</li>
            <li>🛡 网络安全保障</li>
            <li>🚀 新功能研发和技术创新</li>
            <li>👥 更好的用户体验和服务</li>
          </ul>
        </div>

        {/* 返回首页按钮 */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            ← 返回首页
          </Link>
        </div>

        {/* 页脚提示 */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          ⓘ 注意：赞助时请备注您的用户名，以便进行记录和感谢！
        </p>
      </div>
    </div>
  );
}
