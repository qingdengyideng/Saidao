"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Send, Square, X } from "lucide-react";
import { toast } from "@heroui/react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import { uploadVoiceApi } from "@/api/upload";
import { formatDuration } from "@/lib/chat/voice-utils";
import { generateWaveform } from "@/lib/chat/waveform";
import { UiButton } from "@/components/ui/UiButton";
import { UiIconButton } from "@/components/ui/UiIconButton";

interface VoiceRecorderProps {
  onSend: (audioUrl: string, duration: number, waveform: number[]) => void;
  onCancel: () => void;
}

/** 实时波形条数 */
const WAVEFORM_BAR_COUNT = 32;
/** 最大录音秒数（与 useMediaRecorder 一致） */
const MAX_SECONDS = 60;

/**
 * 语音录制面板。
 *
 * 状态机：idle → recording → recorded
 * - recording：计时器 + 实时波形（32 条）+ 停止/暂停按钮
 * - recorded：播放预览 + 时长 + 发送/取消按钮
 * - 发送时先上传 blob 到后端，拿到 url 后调 onSend(url, duration, waveform)
 *
 * 波形来源：
 * - 发送时：用 generateWaveform(url) 生成确定性伪随机波形（列表展示用）
 * - 录音时：AnalyserNode 实时采样（仅本面板内视觉反馈，不入消息）
 */
export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const {
    isRecording,
    isPaused,
    isRecorded,
    audioBlob,
    duration,
    error,
    start,
    stop,
    pause,
    resume,
    reset,
  } = useMediaRecorder();

  // 实时波形数据（AnalyserNode 采样，仅面板内用）
  const [liveBars, setLiveBars] = useState<number[]>(() =>
    new Array<number>(WAVEFORM_BAR_COUNT).fill(0),
  );
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysisStreamRef = useRef<MediaStream | null>(null);

  // 预览音频 URL（recorded 态）
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // 上传状态
  const [uploading, setUploading] = useState(false);

  const phase: "idle" | "recording" | "recorded" = isRecording
    ? "recording"
    : isRecorded
      ? "recorded"
      : "idle";

  // 录音开始后：拉一个分析 stream + 创建 AudioContext + AnalyserNode + RAF 循环
  // 注：useMediaRecorder 内部的 stream 不对外暴露，这里另拉一个仅用于波形分析。
  // 两个 getUserMedia 调用浏览器会复用同一物理麦克风，开销可接受。
  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;
    let analysisStream: MediaStream | null = null;

    const initAudio = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        analysisStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled || !analysisStream) return;
        analysisStreamRef.current = analysisStream;

        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;

        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(analysisStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          if (cancelled) return;
          const a = analyserRef.current;
          if (!a) return;
          a.getByteFrequencyData(data);
          // 取 32 个采样点（按频率低→高均分）
          const step = Math.floor(data.length / WAVEFORM_BAR_COUNT) || 1;
          const bars: number[] = [];
          for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
            const v = (data[i * step] ?? 0) / 255;
            bars.push(Math.round(v * 100) / 100);
          }
          setLiveBars(bars);
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        // 分析失败不阻塞录音主流程
      }
    };
    void initAudio();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      if (analysisStream) {
        analysisStream.getTracks().forEach((t) => t.stop());
        analysisStream = null;
      }
      analysisStreamRef.current = null;
    };
  }, [isRecording]);

  // 录音停止后：清理实时波形，生成预览 URL
  useEffect(() => {
    if (!isRecorded || !audioBlob) return;
    setLiveBars(new Array<number>(WAVEFORM_BAR_COUNT).fill(0));
    const url = URL.createObjectURL(audioBlob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isRecorded, audioBlob]);

  // 组件卸载时清理预览
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleStart = useCallback(async () => {
    reset();
    await start();
  }, [reset, start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      resume();
    } else {
      pause();
    }
  }, [isPaused, pause, resume]);

  const handleTogglePreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPreviewPlaying) {
      audio.pause();
      setIsPreviewPlaying(false);
    } else {
      void audio.play();
      setIsPreviewPlaying(true);
    }
  }, [isPreviewPlaying]);

  const handleSend = useCallback(async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      // 后端契约：voice 上传走 /api/voice/upload，返回 { url }
      const fileName = `voice-${Date.now()}.webm`;
      const { url } = await uploadVoiceApi(audioBlob, fileName);
      // 用 url 生成确定性伪随机波形（32 点）—— 列表展示用，避免解码 blob
      const waveform = generateWaveform(url, WAVEFORM_BAR_COUNT);
      onSend(url, duration, waveform);
      reset();
      setPreviewUrl(null);
      setIsPreviewPlaying(false);
      previewAudioRef.current = null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "上传失败，请重试";
      toast("语音发送失败", { description: msg, variant: "danger" });
    } finally {
      setUploading(false);
    }
  }, [audioBlob, duration, onSend, reset]);

  const handleCancel = useCallback(() => {
    reset();
    setPreviewUrl(null);
    setIsPreviewPlaying(false);
    previewAudioRef.current = null;
    onCancel();
  }, [reset, onCancel]);

  const remaining = Math.max(0, MAX_SECONDS - duration);

  // 实时波形条样式
  const liveBarsStyle = useMemo(
    () =>
      liveBars.map((v) => {
        const clamped = Math.min(1, Math.max(0.05, v));
        return { height: `${Math.round(clamped * 100)}%` };
      }),
    [liveBars],
  );

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3" aria-live="polite">
      {/* 错误提示 */}
      {error && (
        <div role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {/* idle 态：开始录音按钮 */}
      {phase === "idle" && !error && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted-foreground)]">点击开始语音录制</span>
          <UiButton variant="secondary" onPress={() => void handleStart()}>
            <Mic size={14} aria-hidden="true" />
            开始录音
          </UiButton>
        </div>
      )}

      {/* recording 态：计时器 + 实时波形 + 控制按钮 */}
      {phase === "recording" && (
        <>
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-medium tabular-nums"
              aria-label={`已录 ${formatDuration(duration)} 秒`}
            >
              {formatDuration(duration)}
              <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                / {formatDuration(MAX_SECONDS)}
              </span>
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">剩余 {remaining}s</span>
          </div>

          {/* 实时波形：32 条竖条 */}
          <div className="flex h-12 items-center gap-px" role="img" aria-label="实时波形">
            {liveBarsStyle.map((style, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm bg-accent"
                style={style}
                aria-hidden="true"
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            <UiIconButton
              icon={isPaused ? Play : Pause}
              aria-label={isPaused ? "继续录音" : "暂停录音"}
              onPress={handlePauseResume}
              variant="secondary"
            />
            <UiButton variant="danger" onPress={handleStop}>
              <Square size={14} aria-hidden="true" />
              停止录音
            </UiButton>
          </div>
        </>
      )}

      {/* recorded 态：预览 + 发送/取消 */}
      {phase === "recorded" && previewUrl && (
        <>
          <div className="flex items-center gap-2">
            <audio
              ref={previewAudioRef}
              src={previewUrl}
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onEnded={() => setIsPreviewPlaying(false)}
              className="hidden"
              aria-hidden="true"
            />
            <UiIconButton
              icon={isPreviewPlaying ? Pause : Play}
              aria-label={isPreviewPlaying ? "暂停预览" : "播放预览"}
              onPress={handleTogglePreview}
              variant="secondary"
            />
            <span className="text-sm tabular-nums" aria-label={`时长 ${formatDuration(duration)}`}>
              {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <UiButton variant="tertiary" onPress={handleCancel} isDisabled={uploading}>
              <X size={14} aria-hidden="true" />
              取消
            </UiButton>
            <UiButton
              variant="primary"
              onPress={() => void handleSend()}
              isPending={uploading}
              isDisabled={uploading}
            >
              {uploading ? (
                <Loader2 size={14} aria-hidden="true" className="animate-spin" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
              发送语音
            </UiButton>
          </div>
        </>
      )}
    </div>
  );
}
