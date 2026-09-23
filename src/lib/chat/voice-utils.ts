/**
 * 语音录制工具：MIME 类型选择、Blob 创建、波形计算、时长格式化。
 *
 * 浏览器 MediaRecorder 支持矩阵：
 * - Chrome / Edge / Firefox 现代版本：audio/webm;codecs=opus（首选）
 * - Chrome 旧版本 / 部分 Linux：audio/webm（无 codec 声明）
 * - Safari / iOS：audio/mp4（Safari 14.1+ 支持 MediaRecorder）
 * - 兜底：audio/webm（即使 isTypeSupported 报错也返回，让浏览器自己决定）
 */

/** 候选 MIME 类型按优先级排列（首选 opus 编码，体积小音质好） */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/**
 * 选择当前浏览器支持的最优 MIME 类型。
 * 全部不支持时返回 "audio/webm" 兜底（部分老浏览器 isTypeSupported 不可用，
 * 但 MediaRecorder 仍能用默认类型）。
 */
export function selectMimeType(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "audio/webm";
  }
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // 忽略单个候选的异常（极罕见），继续尝试下一个
    }
  }
  return "audio/webm";
}

/**
 * 从 MediaRecorder 的 ondataavailable chunks 创建带正确 type 的 Blob。
 */
export function createAudioBlob(chunks: Blob[]): Blob {
  const type = selectMimeType();
  return new Blob(chunks, { type });
}

/**
 * 从 AudioBuffer 提取 32 点波形（RMS）。
 * 把整个 buffer 均分为 `points` 段，每段计算均方根并归一化到 0~1。
 * 全静默（RMS 全 0）时返回全 0 数组，由调用方决定如何降级。
 */
export function calculateWaveformFromAudio(audioBuffer: AudioBuffer, points = 32): number[] {
  const channel = audioBuffer.getChannelData(0);
  const samplesPerSegment = Math.floor(channel.length / points);
  if (samplesPerSegment <= 0) {
    return new Array<number>(points).fill(0);
  }

  const raw: number[] = [];
  for (let i = 0; i < points; i++) {
    const start = i * samplesPerSegment;
    let sumSquares = 0;
    for (let j = start; j < start + samplesPerSegment; j++) {
      const sample = channel[j] ?? 0;
      sumSquares += sample * sample;
    }
    raw.push(Math.sqrt(sumSquares / samplesPerSegment));
  }

  const max = Math.max(...raw, 0);
  if (max <= 0) {
    return new Array<number>(points).fill(0);
  }
  // 归一化到 0~1，保留 3 位小数避免波形过于抖动
  return raw.map((v) => Math.round((v / max) * 1000) / 1000);
}

/**
 * 秒数 → "M:SS" 格式（如 3 → "0:03"，65 → "1:05"）。
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
