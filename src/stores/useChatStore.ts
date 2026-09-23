"use client";

import { create } from "zustand";
import { toast } from "@heroui/react";
import { messageHistoryApi } from "@/api/message";
import type { ChatMessage, LinkPreview } from "@/types/api/message";
import type { Poll } from "@/types/api/polls";
import type { SliderCaptcha } from "@/types/api/captcha";
import type { ChatFilterConfig } from "@/types/api/user";
import type { HotWord } from "@/lib/ws/ws-message-types";
import { useAuthStore } from "./useAuthStore";

/** 消息列表上限，超出裁剪最旧的 */
const MAX_MESSAGES = 1000;
/** 重连期间消息缓冲区上限 */
const MAX_BUFFER = 500;

type WsStatus = "connecting" | "open" | "closed" | "reconnecting";

interface ChatState {
  /** 消息列表（上限 1000 条，超出裁剪最旧的） */
  messages: ChatMessage[];
  /** 消息缓冲区（用于 WS 重连期间的消息暂存，上限 500 条） */
  messageBuffer: ChatMessage[];
  /** 在线人数 */
  onlineCount: number;
  /** 热词列表 */
  hotWords: HotWord[];
  /** 屏蔽配置（从后端拉取） */
  blockedUserIds: number[];
  blockedNicknames: string[];
  keywordPatterns: string[];
  /** WS 连接状态 */
  wsStatus: WsStatus;
  /** 风控：待验证的滑块验证码（非 null 时弹窗） */
  pendingCaptcha: SliderCaptcha | null;
  /** 风控：被拦截的消息（captchaRequired 后缓存，验证通过后重发） */
  pendingMessage: { content: string; replyTo?: { messageId: string } } | null;
  /** 链接预览缓存（WS link_preview 推送，按 messageId 键控，对齐旧站 chat-link-preview.js） */
  linkPreviews: Map<string, LinkPreview>;
  /** 当前轮播投票 */
  currentPoll: Poll | null;
  /** 是否还有更早的历史消息 */
  historyHasMore: boolean;
  /** 历史消息加载中（防重入） */
  isLoadingHistory: boolean;

  /** 追加单条消息（处理删除标记、屏蔽过滤、列表裁剪） */
  appendMessage: (msg: ChatMessage) => void;
  /** 预载历史消息（向上滚动加载），按 messageId 去重 */
  applyHistory: (messages: ChatMessage[], hasMore: boolean) => void;
  /** 标记某条消息为已删除 */
  markDeleted: (messageId: string) => void;
  setOnlineCount: (count: number) => void;
  setHotWords: (words: HotWord[]) => void;
  /** 应用屏蔽配置并重新过滤已有消息 */
  applyFilterConfig: (config: ChatFilterConfig) => void;
  setWsStatus: (status: WsStatus) => void;
  setPendingCaptcha: (captcha: SliderCaptcha | null) => void;
  setPendingMessage: (msg: { content: string; replyTo?: { messageId: string } } | null) => void;
  setCurrentPoll: (poll: Poll | null) => void;
  /** 清空消息列表与缓冲区 */
  clearMessages: () => void;
  /** 新增/更新链接预览（WS link_preview 推送，按 messageId 键控） */
  upsertLinkPreview: (messageId: string, preview: LinkPreview) => void;
  /** 缓存消息（WS 重连期间使用） */
  bufferMessage: (msg: ChatMessage) => void;
  /** 将缓冲区合并回消息列表（WS 重连成功后调用） */
  flushBuffer: () => void;
  /** 设置是否还有更早的历史消息 */
  addHistoryHasMore: (hasMore: boolean) => void;
  /**
   * 向上滚动加载更早历史消息（游标 = 当前列表首条 messageId）。
   * 未登录 / 加载中 / 无更多 / 无消息时直接返回（防重入）。
   * messageHistoryApi 仅返回数组：空数组 → 到底；非空 → 保持原 historyHasMore。
   */
  loadOlderMessages: () => Promise<void>;
}

/** 编译正则缓存：key 为原始 pattern 字符串，避免每次 appendMessage 重复编译 */
const regexCache = new Map<string, RegExp>();

function getCompiledRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    try {
      re = new RegExp(pattern, "i");
    } catch {
      // 非法正则降级为字面量匹配，避免单条坏配置导致整条消息流中断
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    regexCache.set(pattern, re);
  }
  return re;
}

/**
 * 判断单条消息是否命中屏蔽规则（用户 id / 昵称 / 关键词）。
 * 大数组场景下用 Set 做 O(1) 查找，小数组直接线性扫描（构建 Set 的开销更大）。
 */
function isBlockedMessage(msg: ChatMessage, s: ChatState): boolean {
  if (s.blockedUserIds.length > 0) {
    const idSet = s.blockedUserIds.length > 16 ? new Set(s.blockedUserIds) : null;
    if (idSet ? idSet.has(msg.uid) : s.blockedUserIds.includes(msg.uid)) {
      return true;
    }
  }
  if (s.blockedNicknames.length > 0) {
    const nameSet = s.blockedNicknames.length > 16 ? new Set(s.blockedNicknames) : null;
    if (nameSet ? nameSet.has(msg.uname) : s.blockedNicknames.includes(msg.uname)) {
      return true;
    }
  }
  if (s.keywordPatterns.length > 0) {
    for (const pattern of s.keywordPatterns) {
      if (getCompiledRegex(pattern).test(msg.content)) {
        return true;
      }
    }
  }
  return false;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  messageBuffer: [],
  onlineCount: 0,
  hotWords: [],
  blockedUserIds: [],
  blockedNicknames: [],
  keywordPatterns: [],
  wsStatus: "connecting",
  pendingCaptcha: null,
  pendingMessage: null,
  linkPreviews: new Map(),
  currentPoll: null,
  historyHasMore: true,
  isLoadingHistory: false,

  appendMessage: (msg) => {
    // 删除通知：仅标记已有消息为 deleted，不新增条目
    if (msg.deleted) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.messageId === msg.messageId ? { ...m, deleted: true } : m,
        ),
      }));
      return;
    }
    const state = get();
    if (isBlockedMessage(msg, state)) {
      return;
    }
    set((s) => {
      let next = [...s.messages, msg];
      if (next.length > MAX_MESSAGES) {
        next = next.slice(next.length - MAX_MESSAGES);
      }
      return { messages: next };
    });
  },

  applyHistory: (incoming, hasMore) => {
    set((s) => {
      // 已有消息优先：用 Set 记录已存在的 messageId
      const existingIds = new Set(s.messages.map((m) => m.messageId));
      const deduped = incoming.filter((m) => !existingIds.has(m.messageId));
      return {
        // 历史消息在前，当前列表在后
        messages: [...deduped, ...s.messages],
        historyHasMore: hasMore,
      };
    });
  },

  markDeleted: (messageId) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.messageId === messageId ? { ...m, deleted: true } : m)),
    }));
  },

  setOnlineCount: (count) => set({ onlineCount: count }),

  setHotWords: (words) => set({ hotWords: words }),

  applyFilterConfig: (config) => {
    set((s) => {
      const next: ChatState = {
        ...s,
        blockedUserIds: config.blockedUserIds,
        blockedNicknames: config.blockedNicknames,
        keywordPatterns: config.keywordPatterns,
      };
      // 用新配置重新过滤已有消息
      return {
        ...next,
        messages: next.messages.filter((m) => !isBlockedMessage(m, next)),
      };
    });
  },

  setWsStatus: (status) => set({ wsStatus: status }),

  setPendingCaptcha: (captcha) => set({ pendingCaptcha: captcha }),

  setPendingMessage: (msg) => set({ pendingMessage: msg }),

  setCurrentPoll: (poll) => set({ currentPoll: poll }),

  clearMessages: () =>
    set({
      messages: [],
      messageBuffer: [],
      linkPreviews: new Map(),
      // 清空列表后重置历史加载状态：列表重建后应可重新向上加载
      isLoadingHistory: false,
      historyHasMore: true,
    }),

  upsertLinkPreview: (messageId, preview) => {
    set((s) => {
      const next = new Map(s.linkPreviews);
      next.set(messageId, preview);
      // 上限 1000 条，超出时删除最早的（对齐旧站 chat-link-preview.js:54）
      if (next.size > 1000) {
        const firstKey = next.keys().next().value;
        if (firstKey !== undefined) {
          next.delete(firstKey);
        }
      }
      return { linkPreviews: next };
    });
  },

  bufferMessage: (msg) => {
    set((s) => {
      let next = [...s.messageBuffer, msg];
      if (next.length > MAX_BUFFER) {
        next = next.slice(next.length - MAX_BUFFER);
      }
      return { messageBuffer: next };
    });
  },

  flushBuffer: () => {
    set((s) => {
      if (s.messageBuffer.length === 0) return {};
      const existingIds = new Set(s.messages.map((m) => m.messageId));
      const newFromBuffer = s.messageBuffer.filter((m) => !existingIds.has(m.messageId));
      const merged = [...s.messages, ...newFromBuffer];
      // 按时间戳排序（ISO 字符串可直接字典序比较）
      merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const trimmed =
        merged.length > MAX_MESSAGES ? merged.slice(merged.length - MAX_MESSAGES) : merged;
      return { messages: trimmed, messageBuffer: [] };
    });
  },

  addHistoryHasMore: (hasMore) => set({ historyHasMore: hasMore }),

  loadOlderMessages: async () => {
    // 未登录不允许拉取历史（游客不持有 chat 权限）
    if (useAuthStore.getState().status !== "authenticated") return;
    const s = get();
    // 防重入：加载中 / 无更多 / 无游标消息 均直接返回
    if (s.isLoadingHistory || !s.historyHasMore || s.messages.length === 0) return;

    const cursor = s.messages[0]!.messageId;
    set({ isLoadingHistory: true });
    try {
      // 游标 = 当前列表首条 messageId，拉取更早一段
      const history = await messageHistoryApi(cursor);
      // API 仅返回数组：空数组 → 已到底；非空 → 保持原 historyHasMore
      get().applyHistory(history, history.length > 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "历史消息加载失败，请稍后重试";
      toast("历史消息加载失败", { description: msg, variant: "danger" });
    } finally {
      set({ isLoadingHistory: false });
    }
  },
}));
