import type { ReactNode } from "react";

/**
 * 播放页布局：仅透传 children。
 * 播放页是全屏独立页面，不继承根布局的 Header / ChatSidebar 等外壳；
 * 全局 Provider（ThemeProvider / Toast / SW 注册）由根布局提供。
 */
export default function PlayerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
