"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { VideoEngineHandle } from "@/lib/media/engine";
import { usePlayerStore } from "@/stores/usePlayerStore";

export interface VideoPlayerHandle {
  readonly videoEl: HTMLVideoElement | null;
}

/**
 * 视频播放器组件（原生 <video> + 引擎封装）
 *
 * HeroUI 无播放器组件，此组件在白名单内（见 05-heroui-components.md §7）。
 *
 * 职责：
 * - 管理引擎生命周期（create/destroy 与 streamUrl 变化绑定）
 * - 自动播放策略（首次有声 → NotAllowedError 静音重试）
 * - 音量/静音同步到 store
 * - 首帧检测 → 更新 phase
 * - 流错误 → 更新 phase 为 error
 * - forwardRef 暴露 videoEl 供 PiP / 全屏等操作
 *
 * 自定义控制条由 PlayerControls 组件负责，本组件 controls: false
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle>(function VideoPlayer(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<VideoEngineHandle | null>(null);

  // 暴露 videoEl 给外部（PiP / 全屏 / 音量调节）
  useImperativeHandle(
    ref,
    () => ({
      get videoEl() {
        return videoRef.current;
      },
    }),
    [],
  );

  const streamUrl = usePlayerStore((s) => s.streamUrl);
  const streamType = usePlayerStore((s) => s.streamType);
  const setPhase = usePlayerStore((s) => s.setPhase);
  const setAudioUnlocked = usePlayerStore((s) => s.setAudioUnlocked);
  const setAutoplayBlocked = usePlayerStore((s) => s.setAutoplayBlocked);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const audioUnlocked = usePlayerStore((s) => s.audioUnlocked);

  // 引擎生命周期：streamUrl 变化时创建/销毁
  useEffect(() => {
    const videoEl = videoRef.current;
    const containerEl = containerRef.current;
    if (!videoEl || !containerEl) return;

    if (!streamUrl) {
      // 无流：销毁引擎
      engineRef.current?.destroy();
      engineRef.current = null;
      return;
    }

    // 同步音量/静音
    const { volume: vol, muted: mut } = usePlayerStore.getState();
    videoEl.volume = vol;
    videoEl.muted = mut;

    let destroyed = false;

    (async () => {
      // 动态 import 引擎模块（createVideoEngine 内部再动态 import xgplayer 等重型依赖）
      const { createVideoEngine } = await import("@/lib/media/engine");
      if (destroyed) return;

      const engine = await createVideoEngine({
        videoEl,
        containerEl,
        url: streamUrl,
        streamType,
        autoplay: true,
        volume: vol,
        muted: mut,
        callbacks: {
          onAutoplayAttempt: () => {
            if (!destroyed) {
              engineRef.current?.tryAutoplay();
            }
          },
          onStreamError: (reason) => {
            if (destroyed) return;
            // 自动播放被阻止：标记 tap-play 按钮显示，但不切 error 状态
            if (reason === "需要手动播放") {
              setAutoplayBlocked(true);
            } else {
              setPhase("error");
            }
          },
          onFirstFrame: () => {
            if (!destroyed) {
              setPhase("live");
              setAudioUnlocked(true);
              setAutoplayBlocked(false);
            }
          },
          onStreamEnded: () => {
            if (!destroyed) {
              setPhase("error");
            }
          },
        },
      });

      if (destroyed) {
        engine.destroy();
        return;
      }

      engineRef.current = engine;
      void engine.tryAutoplay();
    })().catch((err) => {
      console.warn("视频引擎加载失败", err);
      if (!destroyed) {
        setPhase("error");
      }
    });

    return () => {
      destroyed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [streamUrl, streamType, setPhase, setAudioUnlocked, setAutoplayBlocked]);

  // 同步 store 的音量/静音到 video 元素
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.volume = volume;
    videoEl.muted = muted;
    // 通知引擎音频解锁状态变化
    engineRef.current?.setAudioUnlocked(audioUnlocked);
  }, [volume, muted, audioUnlocked]);

  // 监听 volumechange 事件同步到 store（捕获用户直接操作 video 元素的情况）
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const onVolumeChange = () => {
      setVolume(videoEl.volume);
      setMuted(videoEl.muted);
    };
    videoEl.addEventListener("volumechange", onVolumeChange);
    return () => videoEl.removeEventListener("volumechange", onVolumeChange);
  }, [setVolume, setMuted]);

  // 点击视频区域 → 解锁音频（如果静音中）或触发播放（如果自动播放被阻止）
  const handleVideoClick = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // 自动播放被阻止时，点击触发播放
    const { autoplayBlocked } = usePlayerStore.getState();
    if (autoplayBlocked) {
      void videoEl
        .play()
        .then(() => {
          setAutoplayBlocked(false);
        })
        .catch(() => {});
      return;
    }

    // 静音中：解锁音频
    if (videoEl.muted || videoEl.volume === 0) {
      videoEl.volume = videoEl.volume === 0 ? 0.6 : videoEl.volume;
      videoEl.muted = false;
      setAudioUnlocked(true);
      setMuted(false);
      void engineRef.current?.tryAutoplay();
    }
  }, [setAudioUnlocked, setMuted, setAutoplayBlocked]);

  return (
    <div
      ref={containerRef}
      className="player-shell relative w-full h-full overflow-hidden bg-[radial-gradient(ellipse_at_22%_35%,#363a41_0%,#25262e_36%,#18191f_76%)]"
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        className="relative z-10 w-full h-full object-contain"
        playsInline
        muted
        autoPlay
      />
      <div
        className="player-gradient-overlay pointer-events-none absolute inset-0 z-20
          bg-gradient-to-b from-black/50 via-transparent via-20% to-black/80 to-76%"
        aria-hidden="true"
      />
    </div>
  );
});
