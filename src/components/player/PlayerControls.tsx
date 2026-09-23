"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  MessageSquare,
  Minimize2,
  PictureInPicture2,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { UiIconButton } from "@/components/ui/UiIconButton";
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreenActive,
  onFullscreenChange,
} from "@/lib/media/fullscreen";

interface PlayerControlsProps {
  /** 刷新流（重新拉取 playerInfoApi） */
  onRefresh: () => void;
  /** 全屏目标元素引用（播放器容器） */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 视频元素引用（PiP / iOS 原生全屏用，可为空） */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

/**
 * 播放器控制条（绝对定位覆盖在视频底部，与旧站 player.html .player-controls 对齐）
 *
 * HeroUI 无播放器控制条组件，此组件在白名单内（见 05-heroui-components.md §7）。
 *
 * 结构（与旧站一致）：
 * - controls-start：刷新 / 音量（hover 弹出 popover）/ 分隔线 / 流状态文字
 * - controls-end：弹幕开关 / PiP / 全屏
 *
 * 音量 popover：hover/focus-within 时显示，与旧站 .volume-popover 行为一致
 */
export function PlayerControls({ onRefresh, containerRef, videoRef }: PlayerControlsProps) {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const danmakuEnabled = usePlayerStore((s) => s.danmakuEnabled);
  const phase = usePlayerStore((s) => s.phase);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const setDanmakuEnabled = usePlayerStore((s) => s.setDanmakuEnabled);
  const setAudioUnlocked = usePlayerStore((s) => s.setAudioUnlocked);

  const [isFs, setIsFs] = useState(false);

  /** 通过 ref 调用最新 toggleMute，避免闭包捕获 */
  const toggleMuteRef = useRef<() => void>(() => {});

  // 流状态文字（对齐旧站 .stream-status）
  const streamStatusText =
    phase === "live"
      ? "直播中"
      : phase === "connecting"
        ? "正在连接直播"
        : phase === "waiting"
          ? "等待开播"
          : "连接已中断";

  // 同步全屏状态（标准 / WebKit / iOS 全屏事件）
  useEffect(() => {
    const unsub = onFullscreenChange(() => {
      setIsFs(
        isFullscreenActive(containerRef.current ?? undefined, videoRef?.current ?? undefined),
      );
    });
    return unsub;
  }, [containerRef, videoRef]);

  // 键盘快捷键：M 静音，P 音量步进（输入框聚焦时忽略）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMuteRef.current();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const v = usePlayerStore.getState();
        const next = Math.min(1, v.volume + 0.1);
        v.setVolume(next);
        v.setMuted(next === 0);
        v.setAudioUnlocked(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleMute = useCallback(() => {
    const v = usePlayerStore.getState();
    const nextMuted = v.muted;
    if (!nextMuted) {
      // 取消静音：若音量为 0 则回到 0.6（tap-play 策略）
      if (v.volume === 0) v.setVolume(0.6);
    }
    v.setMuted(!nextMuted);
    v.setAudioUnlocked(true);
  }, []);
  toggleMuteRef.current = toggleMute;

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setVolume(val);
      setMuted(val === 0);
      setAudioUnlocked(true);
    },
    [setVolume, setMuted, setAudioUnlocked],
  );

  const handleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const video = videoRef?.current ?? undefined;
    if (isFullscreenActive(container, video)) {
      await exitFullscreen(container, video);
    } else {
      await enterFullscreen(container, video);
    }
  }, [containerRef, videoRef]);

  const handlePip = useCallback(async () => {
    const videoEl = videoRef?.current;
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("[player] PiP 不可用", err);
    }
  }, [videoRef]);

  return (
    <div
      className="player-controls-bar pointer-events-auto absolute bottom-0 left-0 right-0 z-[7]
        flex items-center justify-between gap-3 min-h-14 px-4 py-2 sm:gap-4 sm:px-5 sm:py-3"
      role="group"
      aria-label="播放控制"
    >
      {/* ── controls-start ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 items-center gap-3 sm:gap-4">
        {/* 刷新 */}
        <UiIconButton icon={RefreshCw} aria-label="刷新直播" title="刷新直播" onPress={onRefresh} />

        {/* 音量（hover 弹出 popover，与旧站 .volume-pop 一致） */}
        <div className="group relative">
          <UiIconButton
            icon={muted || volume === 0 ? VolumeX : Volume2}
            aria-label={muted ? "取消静音" : "静音"}
            title={muted ? "开启声音" : "静音"}
            onPress={toggleMute}
          />
          {/* 音量 popover：hover / focus-within 时显示 */}
          <div
            className="pointer-events-auto absolute bottom-full left-0 mb-2 flex items-center gap-3 rounded-md
              border border-white/10 bg-[#292932f5] px-3.5 py-3.5 opacity-0
              transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0
              group-focus-within:opacity-100 group-focus-within:translate-y-0
              translate-y-1 group-hover:pointer-events-auto"
            role="presentation"
          >
            <span className="whitespace-nowrap text-[11px] text-[#b7b7c3]">音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="h-1 w-29 cursor-pointer accent-[var(--accent)]"
              aria-label="音量"
            />
          </div>
        </div>

        {/* 分隔线（与旧站 .control-divider 一致） */}
        <div className="h-3.5 w-px shrink-0 bg-white/20" aria-hidden="true" />

        {/* 流状态文字（与旧站 .stream-status 一致） */}
        <span className="min-w-0 truncate text-xs text-[#b3b3be]">{streamStatusText}</span>
      </div>

      {/* ── controls-end ────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* 弹幕开关 */}
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-xs transition-colors
            ${danmakuEnabled ? "text-white" : "text-[#9999a8]"}`}
          aria-pressed={danmakuEnabled}
          title="切换弹幕"
          aria-label={danmakuEnabled ? "关闭弹幕" : "开启弹幕"}
          onClick={() => setDanmakuEnabled(!danmakuEnabled)}
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{danmakuEnabled ? "弹幕开" : "弹幕关"}</span>
        </button>

        {/* PiP */}
        <UiIconButton
          icon={PictureInPicture2}
          aria-label="画中画"
          title="小屏播放"
          onPress={() => void handlePip()}
        />

        {/* 全屏 */}
        <UiIconButton
          icon={isFs ? Minimize2 : Maximize2}
          aria-label={isFs ? "退出全屏" : "全屏"}
          title="切换全屏"
          onPress={() => void handleFullscreen()}
        />
      </div>
    </div>
  );
}
