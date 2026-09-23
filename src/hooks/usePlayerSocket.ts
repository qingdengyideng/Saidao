"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WsPlayerDanmakuItem } from "@/lib/ws/ws-message-types";
import type { SocketState } from "@/lib/ws/base-socket";
import { subscribePlayerSocket } from "@/lib/ws/player-socket";

/** 弹幕延迟 5s（源站评论比画面快 ~5s） */
const COMMENT_DELAY_MS = 5000;
/** 弹幕待显示队列上限（溢出丢弃最旧） */
const MAX_PENDING_COMMENTS = 500;
/** 批量 flush 间隔 */
const FLUSH_INTERVAL_MS = 200;

interface UsePlayerSocketOptions {
  /** 平台房间 UID */
  uid: string;
  /** 弹幕/评论到达回调（5s 延迟后、200ms 批量 flush 时触发） */
  onComments: (comments: WsPlayerDanmakuItem[]) => void;
}

/**
 * 播放器弹幕 WebSocket 生命周期 hook。
 *
 * - 挂载时引用计数订阅单例连接，uid 变更自动切换连接，卸载时取消订阅
 * - 弹幕入队延迟 5s 再显示（源站评论比画面快 ~5s），队列上限 500 条（溢出丢弃最旧）
 * - 每 200ms 批量 flush 到期弹幕，通过 onComments 回调交给渲染层
 * - 队列用 ref 管理（高频写入，不进 store / 不触发 rerender）
 */
export function usePlayerSocket(options: UsePlayerSocketOptions): {
  /** WS 连接状态 */
  wsStatus: SocketState;
  /** 是否已连接 */
  isOnline: boolean;
} {
  /** 弹幕待显示队列（每项含到期时间戳） */
  const pendingCommentsRef = useRef<Array<{ at: number; item: WsPlayerDanmakuItem }>>([]);
  /** 200ms flush 定时器 */
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** WS 连接状态（useState 因为需要触发 rerender） */
  const [wsStatus, setWsStatus] = useState<SocketState>("closed");
  /** options 最新引用：避免 onComments 变化导致 flush effect 重建 */
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { uid } = options;

  // WS 订阅生命周期：uid 为空不订阅；uid 变更自动切换连接
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribePlayerSocket(uid, {
      onComments: (comments) => {
        // 入队：每条 comment 的到期时间 = now + 5000ms
        const dueAt = Date.now() + COMMENT_DELAY_MS;
        for (const item of comments) {
          pendingCommentsRef.current.push({ at: dueAt, item });
        }
        // 队列溢出：丢弃最旧的
        const overflow = pendingCommentsRef.current.length - MAX_PENDING_COMMENTS;
        if (overflow > 0) {
          pendingCommentsRef.current.splice(0, overflow);
        }
      },
      onStateChange: (state) => {
        setWsStatus(state);
      },
    });

    return unsubscribe;
  }, [uid]);

  // 批量 flush 定时器：连接 open 期间每 200ms 检查一次到期弹幕
  useEffect(() => {
    if (wsStatus !== "open") return;

    flushTimerRef.current = setInterval(() => {
      const now = Date.now();
      const ready: WsPlayerDanmakuItem[] = [];
      const remaining: Array<{ at: number; item: WsPlayerDanmakuItem }> = [];

      for (const entry of pendingCommentsRef.current) {
        if (entry.at <= now) {
          ready.push(entry.item);
        } else {
          remaining.push(entry);
        }
      }

      pendingCommentsRef.current = remaining;

      if (ready.length > 0) {
        // 调用 onComments 回调（批量）
        optionsRef.current.onComments(ready);
      }
    }, FLUSH_INTERVAL_MS);

    return () => {
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [wsStatus]);

  // uid 变更或卸载时清空待显示队列，避免跨房间弹幕串扰
  useEffect(() => {
    return () => {
      pendingCommentsRef.current = [];
    };
  }, [uid]);

  return useMemo(
    () => ({
      wsStatus,
      isOnline: wsStatus === "open",
    }),
    [wsStatus],
  );
}
