/**
 * beforeinstallprompt 事件类型（非标准 DOM 事件，lib.dom.d.ts 未定义）。
 * 浏览器触发时携带 prompt() 和 userChoice，用于延迟安装。
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
