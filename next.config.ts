import type { NextConfig } from "next";

/**
 * Next 16 注意事项：
 * - 构建器为 Turbopack（默认），不要写 `webpack` 配置（会导致构建失败）；
 * - 需要调整打包行为时用顶层 `turbopack` 配置键（如 resolveAlias），不是 webpack 字段；
 * - 本项目 PWA 采用原生方案（public/service-worker.js + src/app/manifest.ts），
 *   不经过 next.config，因此此处无 PWA 字段。
 */
const nextConfig: NextConfig = {
  images: {
    // 自建图床 + 表情 CDN（HeroUI Image / next/image 需要远程域名白名单）
    remotePatterns: [
      { protocol: "https", hostname: "rustfs.saidao.cc" },
      { protocol: "https", hostname: "ali2.a.yximgs.com" },
      { protocol: "https", hostname: "cdnl.iconscout.com" },
    ],
  },
  // WS 代理：将 /ws-proxy/:path* 转发到 api.saidao.cc，绕过浏览器 CORS 限制
  // 客户端用同源 ws://localhost:4000/ws-proxy/... 连接，Next.js 代理层透传 WS 升级请求
  // 生产环境由 nginx 同路径转发，无需改代码
  async rewrites() {
    return [
      {
        source: "/ws-proxy/:path*",
        destination: "https://api.saidao.cc/:path*",
      },
    ];
  },
  // 安全头 + 预连接（CSP 依据 docs/plans/refactor/06-quality.md §7）
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-eval' 仅 dev 模式需要（React 19 dev 模式用 eval 重建调用栈），生产不加
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              // HeroUI v3 使用内联样式 + CSS 变量，需允许内联
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://rustfs.saidao.cc https://ali2.a.yximgs.com https://cdnl.iconscout.com",
              "media-src 'self' blob: https://rustfs.saidao.cc",
              "connect-src 'self' https://api.saidao.cc https://n8n.saidao.cc wss://api.saidao.cc",
              // next/font 使用 data: URI
              "font-src 'self' data:",
              // service worker
              "worker-src 'self' blob:",
              "manifest-src 'self'",
            ].join("; "),
          },
          {
            key: "Link",
            value:
              '<https://api.saidao.cc>; rel=preconnect; crossorigin, <https://rustfs.saidao.cc>; rel=preconnect; crossorigin',
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
