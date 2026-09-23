"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "@/lib/chat/voice-utils";
import { generateWaveform } from "@/lib/chat/waveform";

interface VoiceBubbleProps {
  /** 音频 URL（.webm/.mp4/.ogg） */
  url: string;
  /** 语音时长（秒），缺省 3 */
  duration?: number;
}

const BAR_COUNT = 32;

/**
 * 语音消息气泡：播放/暂停按钮 + 波形条 + 时长。
 * HeroUI 无语音气泡组件，故按规则 9 用原生元素 + Tailwind 原子类实现。
 */
export function VoiceBubble({ url, duration = 3 }: VoiceBubbleProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // 基于 url hash 生成稳定波形，避免每次 render 重算
  const bars = useMemo(() => {
    const values = generateWaveform(url, BAR_COUNT);
    return values.map((v) => Math.round(8 + v * 16));
  }, [url]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  }, [playing]);

  // 卸载时释放音频资源
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5">
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={playing ? "暂停语音消息" : "播放语音消息"}
        onClick={toggle}
      >
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      <div className="flex h-5 items-center gap-[2px]" aria-hidden="true">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-sm bg-accent/60"
            style={{ height: `${h}px`, transition: "height 200ms" }}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted">{formatDuration(duration)}</span>
    </div>
  );
}
