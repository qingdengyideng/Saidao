"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectMimeType, createAudioBlob } from "@/lib/chat/voice-utils";

/** MediaRecorder 错误分类：用于 UI 友好提示 */
export type MediaRecorderError =
  | { kind: "permission"; message: string }
  | { kind: "not-supported"; message: string }
  | { kind: "generic"; message: string };

export interface UseMediaRecorderResult {
  /** 是否正在录音（含暂停态） */
  isRecording: boolean;
  /** 是否处于暂停态 */
  isPaused: boolean;
  /** 是否已有可发送的录音（stop 后 audioBlob 非空） */
  isRecorded: boolean;
  /** 录音 Blob（stop 后可用） */
  audioBlob: Blob | null;
  /** 录音时长（秒，实时累计） */
  duration: number;
  /** 错误（权限拒绝 / 不支持 / 其他） */
  error: MediaRecorderError | null;
  /** 开始录音（先 getUserMedia，再 start MediaRecorder） */
  start: () => Promise<void>;
  /** 停止录音（生成 Blob，isRecorded=true） */
  stop: () => void;
  /** 暂停录音 */
  pause: () => void;
  /** 恢复录音 */
  resume: () => void;
  /** 重置状态（取消录音 / 切换新录音前调用） */
  reset: () => void;
}

/** 最大录音时长（秒），到点自动 stop */
const MAX_RECORDING_SECONDS = 60;

/**
 * MediaRecorder 录音 hook。
 *
 * 封装原生 API：
 * - `navigator.mediaDevices.getUserMedia({ audio: true })`
 * - `MediaRecorder` + `ondataavailable` 收集 chunks
 * - `onstop` 创建 Blob
 * - 卸载时 stop 所有 track（释放麦克风）
 *
 * 组件不直接碰原生 API，本 hook 是唯一入口。
 */
export function useMediaRecorder(): UseMediaRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<MediaRecorderError | null>(null);

  // 实例 ref（避免每次 render 创建新引用）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const pausedAccumRef = useRef(0); // 暂停期间累计的"不计时"时长（毫秒）
  const pausedAtRef = useRef(0);

  // 清理 timer
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 停止所有 track（释放麦克风）
  const stopTracks = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // 卸载时清理（避免麦克风不释放）
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      // 若正在录音，强制停止（不生成 Blob，避免污染）
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        try {
          rec.stop();
        } catch {
          // 忽略（可能已停止）
        }
      }
      mediaRecorderRef.current = null;
    };
  }, [clearTimer, stopTracks]);

  const start = useCallback(async () => {
    // 前置校验
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError({
        kind: "not-supported",
        message: "当前浏览器不支持录音，请使用 Chrome / Edge / Safari 14.1+",
      });
      return;
    }

    // 清理上次状态
    setAudioBlob(null);
    setDuration(0);
    setError(null);
    setIsPaused(false);
    pausedAccumRef.current = 0;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setError({
          kind: "permission",
          message: "麦克风权限被拒绝，请在浏览器设置中允许访问麦克风",
        });
      } else if (err?.name === "NotFoundError") {
        setError({
          kind: "generic",
          message: "未检测到麦克风设备",
        });
      } else {
        setError({
          kind: "generic",
          message: err?.message || "启动录音失败，请重试",
        });
      }
      return;
    }

    mediaStreamRef.current = stream;

    const mimeType = selectMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      // 用 chunks 创建最终 Blob
      const blob = createAudioBlob(chunksRef.current);
      setAudioBlob(blob);
      setIsRecording(false);
      setIsPaused(false);
      clearTimer();
    };

    recorder.onerror = () => {
      setError({
        kind: "generic",
        message: "录音过程出错，请重试",
      });
      stopTracks();
    };

    recorder.start(250); // 每 250ms 触发一次 dataavailable，平衡内存与实时性
    setIsRecording(true);

    // 计时器：每秒更新一次 duration
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startTimeRef.current - pausedAccumRef.current;
      const seconds = Math.floor(elapsedMs / 1000);
      setDuration(seconds);
      // 到上限自动停止
      if (seconds >= MAX_RECORDING_SECONDS) {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }
    }, 200);
  }, [clearTimer, stopTracks]);

  const stop = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
  }, []);

  const pause = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.pause();
      setIsPaused(true);
      // 记录暂停起点，用于扣除暂停时长
      pausedAtRef.current = Date.now();
    }
  }, []);

  const resume = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "paused") {
      // 把本次暂停时长累计到 pausedAccumRef
      if (pausedAtRef.current > 0) {
        pausedAccumRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = 0;
      }
      rec.resume();
      setIsPaused(false);
    }
  }, []);

  const reset = useCallback(() => {
    // 若正在录音，强制停止
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // 忽略
      }
    }
    clearTimer();
    stopTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    pausedAccumRef.current = 0;
    pausedAtRef.current = 0;
    setAudioBlob(null);
    setDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    setError(null);
  }, [clearTimer, stopTracks]);

  return {
    isRecording,
    isPaused,
    isRecorded: audioBlob !== null,
    audioBlob,
    duration,
    error,
    start,
    stop,
    pause,
    resume,
    reset,
  };
}
