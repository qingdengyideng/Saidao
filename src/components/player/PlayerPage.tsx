"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playerInfoApi } from "@/api/player";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { usePlayerSocket } from "@/hooks/usePlayerSocket";
import type { WsPlayerDanmakuItem } from "@/lib/ws/ws-message-types";
import { VideoPlayer, type VideoPlayerHandle } from "./VideoPlayer";
import { PlayerStatus } from "./PlayerStatus";
import { DanmakuLayer, type DanmakuLayerHandle } from "./DanmakuLayer";
import { CommentPanel, type PlayerComment } from "./CommentPanel";
import { PlayerControls } from "./PlayerControls";
import { StreamerBar } from "./StreamerBar";

/** 重试间隔（与旧站节奏一致） */
const RETRY_INTERVAL_MS = 10000;
/** 评论列表裁剪上限 */
const MAX_COMMENTS = 200;

interface PlayerPageProps {
  /** 平台房间 UID */
  uid: string;
}

/**
 * 播放页主组件（客户端，全屏独立布局）
 *
 * 数据流：
 * 1. 挂载 → playerInfoApi(uid)（8s 超时）→ status === "1" ? live : waiting
 * 2. waiting/error → 10s 轮询 playerInfoApi 直到开播
 * 3. live → player WS 建立（弹幕/评论，5s 延迟 + 200ms 批量 flush）
 * 4. 移动端非 youtube 渠道 → 跳源站 url
 *
 * 布局（与旧站 player.html .layout 对齐，Flex 模型）：
 * - 桌面端：视频区 flex-1 + 评论面板 360px
 * - 移动端：视频区 60dvh + 评论面板 40dvh（垂直堆叠）
 */
export function PlayerPage({ uid }: PlayerPageProps) {
  const danmakuRef = useRef<DanmakuLayerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  /** 同步 videoEl 引用（通过 VideoPlayerHandle 获取） */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const commentIdRef = useRef(0);

  const phase = usePlayerStore((s) => s.phase);
  const danmakuEnabled = usePlayerStore((s) => s.danmakuEnabled);

  // 评论列表（200 条裁剪）
  const [comments, setComments] = useState<PlayerComment[]>([]);

  /** 通过 ref 调用最新 fetchPlayerInfo，避免闭包捕获 */
  const fetchPlayerInfoRef = useRef<() => Promise<void>>(async () => {});

  // 同步 videoEl 到 videoRef（phase 变化时 VideoPlayer 可能重新挂载）
  useEffect(() => {
    videoRef.current = videoPlayerRef.current?.videoEl ?? null;
  }, [phase]);

  /** 10s 重试定时器 */
  const startRetryTimer = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setInterval(() => {
      const { retryCount, setRetryCount } = usePlayerStore.getState();
      setRetryCount(retryCount + 1);
      void fetchPlayerInfoRef.current();
    }, RETRY_INTERVAL_MS);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /** 拉取播放器信息并更新状态 */
  const fetchPlayerInfo = useCallback(async () => {
    try {
      const data = await playerInfoApi(uid);
      const { setInfo, setPhase, setRetryCount } = usePlayerStore.getState();
      setInfo(data);

      // 移动端非 youtube 渠道 → 跳源站
      if (
        typeof navigator !== "undefined" &&
        /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) &&
        data.channel !== "youtube" &&
        data.orig
      ) {
        window.location.href = data.orig;
        return;
      }

      if (data.status === "1" && data.m3u8) {
        setPhase("live");
        setRetryCount(0);
        clearRetryTimer();
      } else if (data.status !== "1") {
        setPhase("waiting");
        startRetryTimer();
      } else {
        setPhase("error");
        startRetryTimer();
      }
    } catch {
      const { setPhase, setRetryCount } = usePlayerStore.getState();
      setPhase("error");
      setRetryCount(usePlayerStore.getState().retryCount + 1);
      startRetryTimer();
    }
  }, [uid, clearRetryTimer, startRetryTimer]);

  // 每次 render 更新 ref，确保 startRetryTimer 调用到最新的 fetchPlayerInfo
  fetchPlayerInfoRef.current = fetchPlayerInfo;

  // 弹幕/评论到达回调
  const handleComments = useCallback((items: WsPlayerDanmakuItem[]) => {
    setComments((prev) => {
      const newItems: PlayerComment[] = items.map((c) => ({
        id: ++commentIdRef.current,
        user: c.user || "匿名",
        text: c.text,
      }));
      const next = [...prev, ...newItems];
      return next.length > MAX_COMMENTS ? next.slice(-MAX_COMMENTS) : next;
    });
    danmakuRef.current?.addComments(items);
  }, []);

  const { wsStatus } = usePlayerSocket({
    uid,
    onComments: handleComments,
  });

  // 初始加载：重置 store → 拉取 → 清理
  useEffect(() => {
    usePlayerStore.getState().reset();
    setComments([]);
    commentIdRef.current = 0;
    fetchPlayerInfo();

    return () => {
      clearRetryTimer();
      usePlayerStore.getState().reset();
    };
  }, [uid, fetchPlayerInfo, clearRetryTimer]);

  // 播放恢复时清除重试定时器
  useEffect(() => {
    if (phase === "live") {
      clearRetryTimer();
    }
  }, [phase, clearRetryTimer]);

  // 刷新
  const handleRefresh = useCallback(() => {
    clearRetryTimer();
    usePlayerStore.getState().setRetryCount(0);
    fetchPlayerInfo();
  }, [clearRetryTimer, fetchPlayerInfo]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ── 视频区域（与旧站 .player-shell 对齐）───────────────────────── */}
        <div
          ref={containerRef}
          className="player-shell relative min-w-0 flex-1 overflow-hidden
            h-[60dvh] md:h-full"
        >
          {/* 视频播放器（渐变背景 + 遮罩） */}
          <VideoPlayer ref={videoPlayerRef} />

          {/* 状态覆盖层（connecting / waiting / error / tap-play） */}
          <PlayerStatus />

          {/* 弹幕层（与旧站 .danmaku-layer 定位对齐：top 75px / bottom 64px） */}
          <DanmakuLayer
            ref={danmakuRef}
            enabled={danmakuEnabled}
            className="top-20 bottom-[64px] md:top-24 md:bottom-[76px]"
          />

          {/* 主播信息栏（绝对定位 z-7） */}
          <StreamerBar />

          {/* 播放控制条（绝对定位 z-7 底部） */}
          <PlayerControls
            onRefresh={handleRefresh}
            containerRef={containerRef}
            videoRef={videoRef}
          />
        </div>

        {/* ── 评论面板（与旧站 .comment-panel 对齐）───────────────────────── */}
        <aside
          className="flex w-full shrink-0 flex-col border-t bg-background/50
            min-h-0 md:w-90 md:border-l md:border-t-0 lg:w-95"
          aria-label="直播评论"
        >
          <CommentPanel comments={comments} wsStatus={wsStatus} />
        </aside>
      </div>
    </div>
  );
}
