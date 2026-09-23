"use client";

import { create } from "zustand";
import type { NormalizedPlayerInfo } from "@/types/api/player";

/** 播放阶段：连接中 / 直播中 / 等待开播 / 连接中断 */
export type PlayerPhase = "connecting" | "live" | "waiting" | "error";

/** 流类型：hls / flv / mp4 / 未知 */
export type StreamType = "hls" | "flv" | "mp4" | "";

interface PlayerState {
  /** 播放器信息（来自 playerInfoApi，m3u8 已归一化：未开播为 null） */
  info: NormalizedPlayerInfo | null;
  /** 播放阶段（连接中/直播中/等待开播/连接中断） */
  phase: PlayerPhase;
  /** 重试次数（10s 轮询） */
  retryCount: number;
  /** 弹幕开关 */
  danmakuEnabled: boolean;
  /** 音量（0~1） */
  volume: number;
  /** 静音 */
  muted: boolean;
  /** 是否已解锁音频（首次自动播放成功后设为 true，不覆盖用户手动静音选择） */
  audioUnlocked: boolean;
  /** 流地址（m3u8 归一化后） */
  streamUrl: string | null;
  /** 流类型（hls/flv/mp4/空） */
  streamType: StreamType;
  /** 自动播放被浏览器阻止（tap-play 按钮显示条件） */
  autoplayBlocked: boolean;

  setInfo: (info: NormalizedPlayerInfo) => void;
  setPhase: (phase: PlayerPhase) => void;
  setRetryCount: (n: number) => void;
  setDanmakuEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
  setAudioUnlocked: (v: boolean) => void;
  setAutoplayBlocked: (v: boolean) => void;
  reset: () => void;
}

/** 默认状态：播放页导航离开时 reset 回到此初值 */
const DEFAULT_STATE: Pick<
  PlayerState,
  | "info"
  | "phase"
  | "retryCount"
  | "danmakuEnabled"
  | "volume"
  | "muted"
  | "audioUnlocked"
  | "streamUrl"
  | "streamType"
  | "autoplayBlocked"
> = {
  info: null,
  phase: "connecting",
  retryCount: 0,
  danmakuEnabled: true,
  volume: 1,
  muted: false,
  audioUnlocked: false,
  streamUrl: null,
  streamType: "",
  autoplayBlocked: false,
};

/** 根据流地址推断流类型（playerInfoApi 已把 m3u8 "null" 归一化为 null） */
function detectStreamType(url: string | null): StreamType {
  if (!url) return "";
  if (url.endsWith(".flv")) return "flv";
  if (url.endsWith(".m3u8")) return "hls";
  if (/\.mp4(\?|$)/i.test(url)) return "mp4";
  return "";
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  ...DEFAULT_STATE,

  setInfo: (info) =>
    set({
      info,
      // 流地址与类型从 info.m3u8 派生（已归一化，无需再判 "null"）
      streamUrl: info.m3u8,
      streamType: detectStreamType(info.m3u8),
    }),

  setPhase: (phase) => set({ phase }),

  setRetryCount: (n) => set({ retryCount: n }),

  setDanmakuEnabled: (v) => set({ danmakuEnabled: v }),

  setVolume: (v) => set({ volume: v }),

  setMuted: (v) => set({ muted: v }),

  setAudioUnlocked: (v) => set({ audioUnlocked: v }),

  setAutoplayBlocked: (v) => set({ autoplayBlocked: v }),

  /** 重置全部状态为默认值（页面导航离开播放页时调用） */
  reset: () => set({ ...DEFAULT_STATE }),
}));
