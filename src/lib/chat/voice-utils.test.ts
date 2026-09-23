import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calculateWaveformFromAudio,
  createAudioBlob,
  formatDuration,
  selectMimeType,
} from "./voice-utils";

/** 构造假 AudioBuffer：只实现被测函数用到的 getChannelData */
function fakeAudioBuffer(channelData: number[]): AudioBuffer {
  return {
    getChannelData: (i: number) => (i === 0 ? new Float32Array(channelData) : new Float32Array()),
  } as unknown as AudioBuffer;
}

describe("formatDuration", () => {
  it("0 → 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("3 → 0:03", () => {
    expect(formatDuration(3)).toBe("0:03");
  });

  it("65 → 1:05", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("60 → 1:00", () => {
    expect(formatDuration(60)).toBe("1:00");
  });

  it("负数 → 0:00（钳制到 0）", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("非整数 → 向下取整", () => {
    expect(formatDuration(99.9)).toBe("1:39");
  });
});

describe("calculateWaveformFromAudio", () => {
  it("正常振幅 → 返回长度 = points，最大值 = 1", () => {
    // 前一半幅值 0.5，后一半幅值 1.0
    const channel = new Array<number>(64).fill(0.5).concat(new Array<number>(64).fill(1.0));
    const waveform = calculateWaveformFromAudio(fakeAudioBuffer(channel));
    expect(waveform).toHaveLength(32);
    expect(Math.max(...waveform, 0)).toBeCloseTo(1, 3);
  });

  it("全 0（静默）→ 全 0 数组", () => {
    const waveform = calculateWaveformFromAudio(fakeAudioBuffer(new Array<number>(64).fill(0)));
    expect(waveform).toHaveLength(32);
    expect(waveform.every((v) => v === 0)).toBe(true);
  });

  it("channel 长度 < points → 全 0 数组", () => {
    const waveform = calculateWaveformFromAudio(fakeAudioBuffer([0.5, 1, 0.3]));
    expect(waveform).toHaveLength(32);
    expect(waveform.every((v) => v === 0)).toBe(true);
  });

  it("自定义 points → 返回数组长度 = points", () => {
    const channel = new Array<number>(16).fill(0.8);
    const waveform = calculateWaveformFromAudio(fakeAudioBuffer(channel), 8);
    expect(waveform).toHaveLength(8);
    expect(Math.max(...waveform, 0)).toBeCloseTo(1, 3);
  });
});

describe("selectMimeType", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("MediaRecorder 不存在 → 兜底 audio/webm", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(selectMimeType()).toBe("audio/webm");
  });

  it("isTypeSupported 全部支持 → 返回第一个候选（opus 优先）", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    expect(selectMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("isTypeSupported 全部不支持 → 兜底 audio/webm", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(selectMimeType()).toBe("audio/webm");
  });
});

describe("createAudioBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("空 chunks → Blob，size = 0", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    const blob = createAudioBlob([]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
    expect(blob.type).toBe("audio/webm;codecs=opus");
  });

  it("有 chunks → Blob，type 为所选 MIME", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    const chunk = new Blob(["test-audio"]);
    const blob = createAudioBlob([chunk]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(blob.size).toBeGreaterThan(0);
  });
});
