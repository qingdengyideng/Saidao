"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { subscribeChatSocket, getChatSocket } from "@/lib/ws/chat-socket";

/** 发送文本/表情消息的可选参数 */
export interface SendMessageOptions {
  /** 滑块验证 ticket（风控重试时携带） */
  captchaTicket?: string;
  /** 引用回复目标 */
  reply?: { messageId: string; uname: string };
}

/** 发送语音消息的可选参数 */
export interface SendVoiceOptions {
  /** 滑块验证 ticket（风控重试时携带） */
  captchaTicket?: string;
  /** 引用回复目标 */
  reply?: { messageId: string; uname: string };
}

/**
 * 聊天 WebSocket 生命周期 hook。
 *
 * - 挂载时通过引用计数订阅单例连接，卸载时取消订阅
 * - 监听认证状态切换：登录时重建连接以取新 token，登出时关闭连接
 * - 首次 subscribe 时若已 authenticated（刷新后 persist 同步恢复），
 *   getChatSocket 内部的 buildChatUrl 会读取 localStorage 最新 token 建连
 * - 暴露 send / sendVoice 发送方法（连接非 open 时 warn 并丢弃）
 */
export function useChatSocket() {
  const wsStatus = useChatStore((s) => s.wsStatus);
  const authStatus = useAuthStore((s) => s.status);
  const prevAuthStatus = useRef(authStatus);

  // 认证状态变化：登录 → 重建连接取新 token；登出 → 关闭连接
  useEffect(() => {
    const prev = prevAuthStatus.current;
    if (prev === authStatus) return;
    prevAuthStatus.current = authStatus;

    if (authStatus === "authenticated" && prev === "anonymous") {
      console.info("[chat-ws] authStatus: anonymous → authenticated，重建连接");
      const s = getChatSocket();
      if (!s.isClosed()) {
        s.close();
      }
      getChatSocket();
    } else if (authStatus === "anonymous" && prev === "authenticated") {
      // 登出后重建匿名连接（token 空、fp 保留），保持游客可看可发
      console.info("[chat-ws] authStatus: authenticated → anonymous，重建匿名连接");
      const s = getChatSocket();
      if (!s.isClosed()) {
        s.close();
      }
      getChatSocket();
    }
  }, [authStatus]);

  // 引用计数订阅生命周期
  useEffect(() => {
    const auth = useAuthStore.getState();
    console.info(
      "[chat-ws] 首次订阅（authStatus=%s，initialized=%s）",
      auth.status,
      auth.initialized,
    );
    return subscribeChatSocket();
  }, []);

  const sendMessage = useCallback((content: string, options?: SendMessageOptions) => {
    const s = getChatSocket();
    if (s.isClosed()) {
      console.warn("[chat] send 被丢弃：连接已关闭");
      return;
    }
    s.send({
      type: "chat",
      content,
      captchaTicket: options?.captchaTicket,
      reply: options?.reply,
    });
  }, []);

  const sendVoice = useCallback(
    (audioUrl: string, duration: number, waveform: number[], options?: SendVoiceOptions) => {
      const s = getChatSocket();
      if (s.isClosed()) {
        console.warn("[chat] send 被丢弃：连接已关闭");
        return;
      }
      s.send({
        type: "voice",
        audioUrl,
        duration,
        waveform,
        captchaTicket: options?.captchaTicket,
        reply: options?.reply,
      });
    },
    [],
  );

  return useMemo(
    () => ({
      wsStatus,
      isOnline: wsStatus === "open",
      sendMessage,
      sendVoice,
    }),
    [wsStatus, sendMessage, sendVoice],
  );
}
