"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Saidao } from "@/types/api/saidao";
import type { BeforeInstallPromptEvent } from "@/lib/pwa/before-install-prompt";

export type ModalId =
  | "login"
  | "allocation"
  | "profile"
  | "changePassword"
  | "userDetail"
  | "tagEditor"
  | "chatFilter"
  | "createPoll";

/** 图片查看器状态：srcs 为图片列表，index 为当前激活索引（任务型，不 persist） */
export interface ViewerState {
  srcs: string[];
  index: number;
}

interface UiState {
  theme: "light" | "dark";
  setTheme: (t: UiState["theme"]) => void;
  /** 聊天侧栏宽度（persist，clamp 250~600） */
  chatWidth: number;
  setChatWidth: (w: number) => void;
  /** 当前打开的弹窗标识（任务型，不 persist） */
  activeModal: ModalId | null;
  openModal: (id: ModalId) => void;
  closeModal: () => void;
  /** UserDetailModal 要展示的用户 id（不 persist） */
  userDetailUserId: number | null;
  openUserDetail: (id: number) => void;
  closeUserDetail: () => void;
  /** TagEditorModal 要编辑的主播对象（不 persist） */
  tagEditorTarget: Saidao | null;
  openTagEditor: (target: Saidao) => void;
  closeTagEditor: () => void;
  /** 聊天侧栏显隐状态，任务型不 persist */
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (v: boolean) => void;
  /** PWA 安装提示是否可见（beforeinstallprompt 触发后显示，不 persist） */
  pwaInstallVisible: boolean;
  setPwaInstallVisible: (v: boolean) => void;
  /** 被延迟的 beforeinstallprompt 事件（不 persist） */
  pwaDeferredPrompt: BeforeInstallPromptEvent | null;
  setPwaDeferredPrompt: (v: BeforeInstallPromptEvent | null) => void;
  /** 图片查看器（任务型，不 persist）；null 表示未打开 */
  viewer: ViewerState | null;
  openViewer: (srcs: string[], index: number) => void;
  closeViewer: () => void;
}

const CHAT_WIDTH_MIN = 250;
const CHAT_WIDTH_MAX = 600;
const CHAT_WIDTH_DEFAULT = 400;

/** 移动端断点：与 Tailwind md 及 ChatSidebar/ChatFab 一致 */
const MOBILE_QUERY = "(max-width: 767px)";

function clampChatWidth(w: number): number {
  if (Number.isNaN(w)) return CHAT_WIDTH_DEFAULT;
  return Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, w));
}

/**
 * 聊天侧栏初始显隐：移动端默认收起（刷新加载首页，点 FAB 打开），桌面端默认展开。
 * SSR/水合阶段 window 不可用，返回 true（与移动端 DOM 常驻初始 hidden 及桌面默认展开一致，安全）。
 */
function initialChatSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * UI 域 store（低频）：theme/chatWidth persist（用户偏好），
 * 弹窗状态为任务型，刷新后关闭，不 persist。
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      chatWidth: CHAT_WIDTH_DEFAULT,
      setChatWidth: (w) => set({ chatWidth: clampChatWidth(w) }),
      activeModal: null,
      openModal: (activeModal) => set({ activeModal }),
      closeModal: () => set({ activeModal: null }),
      userDetailUserId: null,
      openUserDetail: (userDetailUserId) => set({ userDetailUserId, activeModal: "userDetail" }),
      closeUserDetail: () => set({ userDetailUserId: null, activeModal: null }),
      tagEditorTarget: null,
      openTagEditor: (tagEditorTarget) => set({ tagEditorTarget, activeModal: "tagEditor" }),
      closeTagEditor: () => set({ tagEditorTarget: null, activeModal: null }),
      // 桌面端默认展开，移动端默认收起（按断点动态初始化）
      chatSidebarOpen: initialChatSidebarOpen(),
      setChatSidebarOpen: (chatSidebarOpen) => set({ chatSidebarOpen }),
      pwaInstallVisible: false,
      setPwaInstallVisible: (pwaInstallVisible) => set({ pwaInstallVisible }),
      pwaDeferredPrompt: null,
      setPwaDeferredPrompt: (pwaDeferredPrompt) => set({ pwaDeferredPrompt }),
      viewer: null,
      openViewer: (srcs, index) => set({ viewer: { srcs, index } }),
      closeViewer: () => set({ viewer: null }),
    }),
    {
      name: "saidao-ui",
      version: 4,
      // 仅持久化用户偏好（theme/chatWidth），弹窗状态是任务型，刷新后关闭
      partialize: (s) => ({ theme: s.theme, chatWidth: s.chatWidth }),
      migrate: (persisted: unknown, version) => {
        if (version !== 4) {
          return {
            theme: "light" as const,
            chatWidth: CHAT_WIDTH_DEFAULT,
            activeModal: null,
            userDetailUserId: null,
            tagEditorTarget: null,
            chatSidebarOpen: initialChatSidebarOpen(),
            pwaInstallVisible: false,
            pwaDeferredPrompt: null,
            viewer: null,
          };
        }
        const state = persisted as Partial<UiState>;
        return {
          theme: state.theme === "dark" ? ("dark" as const) : ("light" as const),
          chatWidth: clampChatWidth(state.chatWidth ?? CHAT_WIDTH_DEFAULT),
          activeModal: null,
          userDetailUserId: null,
          tagEditorTarget: null,
          chatSidebarOpen: initialChatSidebarOpen(),
          pwaInstallVisible: false,
          pwaDeferredPrompt: null,
          viewer: null,
        };
      },
    },
  ),
);
