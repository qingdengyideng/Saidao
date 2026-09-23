import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toast } from "@heroui/react";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { FingerprintInitializer } from "@/components/layout/FingerprintInitializer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saidao · 抽象赛道", template: "%s · Saidao" },
  description: "主播直播 + 实时聊天室社区",
  manifest: "/manifest.webmanifest",
  // 图标为旧站原样复制的 public/ 资源（见 01 §6.1）；favicon.ico 走 Next 约定式无需声明
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Saidao" },
};

export const viewport: Viewport = {
  themeColor: "var(--background)", // 与页面背景一致（web-interface-guidelines）
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // PWA 体验（禁止缩放是 PWA standalone 常见取舍，见 06 §6 风险表）
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden antialiased">
        <a href="#main" className="skip-link">
          跳到主要内容
        </a>
        <ThemeProvider>
          {children}
          {/* HeroUI v3 全局 Toast 容器 */}
          <Toast.Provider />
          <ServiceWorkerRegistrar />
          <FingerprintInitializer />
        </ThemeProvider>
      </body>
    </html>
  );
}
