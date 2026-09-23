import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Saidao · 抽象赛道",
    short_name: "Saidao",
    description: "主播直播 + 实时聊天室社区",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "oklch(12% 0.005 285.823)", // 与 HeroUI 默认 dark 背景一致
    theme_color: "oklch(12% 0.005 285.823)",
    lang: "zh-CN",
    categories: ["entertainment", "social"],
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
