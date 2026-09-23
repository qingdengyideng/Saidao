/**
 * 视频播放引擎封装（xgplayer 主引擎 + hls.js / mpegts.js / 原生 HLS 回退链）
 *
 * 与旧站 player.js（E:\02-项目\Saidao\assets\js\player.js）行为对齐：
 * 1. 主引擎 xgplayer 3.0.26（hls/flv/mp4 插件按流类型选择）；
 * 2. xgplayer 初始化失败时回退：HLS → hls.js → 原生 HLS（Safari），FLV → mpegts.js，其余 → 原生 <video>；
 * 3. 自动播放策略：首次优先有声，NotAllowedError 后静音重试，对齐旧站 tryAutoplay。
 *
 * 纯浏览器 API 模块，不依赖 React；组件通过返回的 VideoEngineHandle 管理生命周期。
 */

import type { IPlayerOptions } from "xgplayer";
import type { MpegtsPlayer } from "mpegts.js";

/** 引擎事件回调 */
export interface VideoEngineCallbacks {
  /** 自动播放策略回调（首次优先有声，NotAllowedError 后静音重试） */
  onAutoplayAttempt: () => void;
  /** 流错误/结束回调（直播源 404 / 连接中断 / 编码不支持等） */
  onStreamError: (reason: string) => void;
  /** 首帧渲染完成 */
  onFirstFrame: () => void;
  /** 流结束（直播关闭 / 服务端关闭） */
  onStreamEnded: () => void;
}

/** 引擎创建选项 */
export interface VideoEngineOptions {
  /** 视频元素（xgplayer / hls.js / mpegts.js 均挂载到此元素） */
  videoEl: HTMLVideoElement;
  /** 容器元素（xgplayer 挂载点，也是 video 元素的父级） */
  containerEl: HTMLElement;
  /** 流地址 */
  url: string;
  /** 流类型（hls / flv / mp4 / 未知） */
  streamType: "hls" | "flv" | "mp4" | "";
  /** 是否自动播放（默认 true） */
  autoplay?: boolean;
  /** 初始音量 0~1（缺省使用 videoEl.volume） */
  volume?: number;
  /** 是否静音（缺省使用 videoEl.muted） */
  muted?: boolean;
  /** 事件回调 */
  callbacks: VideoEngineCallbacks;
}

/** 引擎句柄（组件持有，用于销毁与交互） */
export interface VideoEngineHandle {
  /** 销毁引擎（xgplayer.destroy / hls.destroy / mpegts.destroy） */
  destroy: () => void;
  /** 尝试自动播放（对齐旧站 tryAutoplay 策略） */
  tryAutoplay: () => Promise<void>;
  /** 通知引擎音频已解锁（用户手动取消静音后由组件调用） */
  setAudioUnlocked: (v: boolean) => void;
  /** 当前引擎名称（"xgplayer" | "hls.js" | "mpegts.js" | "native" | "none"） */
  readonly engineName: string;
}

// ─── 内部类型 ────────────────────────────────────────────────────────────────

/** mpegts.js ERROR 事件第三个参数（错误数据对象） */
interface MpegtsErrorInfo {
  info?: string;
  msg?: string;
  [key: string]: unknown;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 判断 mpegts.js ERROR 回调的第三个参数是否为 MpegtsErrorInfo */
function isMpegtsErrorData(v: unknown): v is MpegtsErrorInfo {
  return typeof v === "object" && v !== null;
}

// ─── 主入口 ─────────────────────────────────────────────────────────────────

export async function createVideoEngine(options: VideoEngineOptions): Promise<VideoEngineHandle> {
  // 动态 import 重型依赖，避免首屏 bundle 包含 xgplayer/hls.js/mpegts.js
  const [playerMod, hlsPluginMod, flvPluginMod, mp4PluginMod, hlsMod, mpegtsMod] =
    await Promise.all([
      import("xgplayer"),
      import("xgplayer-hls"),
      import("xgplayer-flv"),
      import("xgplayer-mp4"),
      import("hls.js"),
      import("mpegts.js"),
    ]);
  const Player = playerMod.default;
  const HlsPlugin = hlsPluginMod.default;
  const FlvPlugin = flvPluginMod.default;
  const Mp4Plugin = mp4PluginMod.default;
  const Hls = hlsMod.default;
  const mpegts = mpegtsMod.default;

  const { videoEl, containerEl, url, streamType, autoplay = true, callbacks } = options;

  // 初始状态快照（xgplayer 初始化失败回退时复用）
  const initialVolume = options.volume ?? videoEl.volume;
  const initialMuted = options.muted ?? videoEl.muted;

  // 代数计数器：destroy 时递增，使旧的异步回调（xgplayer ready、hls.js error 等）失效
  let generation = 0;
  let destroyed = false;

  // 音频解锁标志（由组件通过 setAudioUnlocked 设置，对齐旧站 audioUnlocked）
  let audioUnlocked = false;

  // 引擎实例引用（互斥，同一时刻仅一个非 null）
  let xgPlayerInstance: InstanceType<typeof Player> | null = null;
  let hlsInstance: InstanceType<typeof Hls> | null = null;
  let flvPlayerInstance: MpegtsPlayer | null = null;

  // 引擎名称
  let engineName: "xgplayer" | "hls.js" | "mpegts.js" | "native" | "none" = "none";

  // video 元素事件监听器引用（destroy 时移除）
  let videoEventListener: EventListener | null = null;

  // ── 首帧检测 ──────────────────────────────────────────────────────────────

  function watchFirstFrame(): void {
    if (destroyed) return;
    const gen = generation;
    const check = () => {
      if (gen !== generation || destroyed) return;
      callbacks.onFirstFrame();
    };
    // 优先使用 requestVideoFrameCallback（Chromium 系）
    if (typeof videoEl.requestVideoFrameCallback === "function") {
      videoEl.requestVideoFrameCallback(check);
    } else {
      // 回退：canplay + readyState >= 2 && videoWidth > 0
      const onCanPlay = () => {
        if (gen !== generation || destroyed) return;
        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
          check();
        }
      };
      videoEl.addEventListener("canplay", onCanPlay, { once: true });
    }
  }

  // ── 自动播放（对齐旧站 tryAutoplay 策略）──────────────────────────────────

  async function tryAutoplay(): Promise<void> {
    if (destroyed) return;
    const gen = generation;
    try {
      try {
        await videoEl.play();
      } catch (error) {
        if (gen !== generation || destroyed) return;
        // 首次优先有声播放；浏览器拦截后静音重试（不覆盖用户的手动选择）
        const err = error as DOMException;
        if (err.name !== "NotAllowedError" || audioUnlocked || videoEl.muted) {
          throw error;
        }
        videoEl.muted = true;
        await videoEl.play();
      }
      if (gen !== generation || destroyed) return;
      // 成功：通知首帧检测
      callbacks.onFirstFrame();
    } catch (err) {
      if (gen !== generation || destroyed) return;
      if ((err as DOMException).name === "AbortError") return;
      // 自动播放失败，需要手动播放
      callbacks.onStreamError("需要手动播放");
    }
  }

  // ── xgplayer 初始化 ───────────────────────────────────────────────────────

  function tryXgplayer(): boolean {
    // 仅 hls/flv/mp4 流类型或 URL 含 .mp4 时使用 xgplayer
    const useXg = streamType === "hls" || streamType === "flv" || streamType === "mp4";
    if (!useXg) return false;

    // 按流类型选择插件（IPlayerOptions.plugins 为 any[]，此处用 object 收窄）
    let plugin: object;
    if (streamType === "hls") {
      plugin = HlsPlugin;
    } else if (streamType === "flv") {
      plugin = FlvPlugin;
    } else {
      plugin = Mp4Plugin;
    }

    try {
      xgPlayerInstance = new Player({
        el: containerEl,
        // 使用函数避免小窗刷新时跨文档 instanceof HTMLMediaElement 检查失败
        mediaEl: () => videoEl,
        url,
        width: "100%",
        height: "100%",
        volume: initialVolume,
        autoplayMuted: initialMuted,
        isLive: streamType === "hls" || streamType === "flv",
        autoplay,
        videoInit: false,
        remainMediaAfterDestroy: true,
        controls: false,
        presets: [],
        closeVideoClick: true,
        closeVideoDblclick: true,
        keyShortcut: false,
        playsinline: true,
        plugins: [plugin],
        hls: {
          fetchOptions: {
            retryCheckFunc: (error: { response?: { status?: number } }): boolean => {
              // 404 = 直播源已消失，不再重试，通知上层
              if (error?.response?.status === 404) {
                if (!destroyed && generation === gen) {
                  callbacks.onStreamError("直播源暂不可用");
                }
                return false;
              }
              return true;
            },
          },
        },
        videoAttributes: { playsinline: true, "webkit-playsinline": true },
      } as IPlayerOptions);

      // 注册 xgplayer 实例引用
      const currentPlayer = xgPlayerInstance;

      // xgplayer 错误事件（防止切流后旧实例的 error 回调）
      currentPlayer.on?.("error", () => {
        if (xgPlayerInstance === currentPlayer && !destroyed) {
          callbacks.onStreamError("播放错误");
        }
      });

      // xgplayer ready 事件 → 触发自动播放 + 首帧检测
      currentPlayer.on?.("ready", () => {
        if (xgPlayerInstance !== currentPlayer || destroyed) return;
        void tryAutoplay();
        watchFirstFrame();
      });

      engineName = "xgplayer";
      return true;
    } catch (error) {
      // xgplayer 初始化失败，回退到下一引擎
      console.warn("xgplayer 初始化失败，回退原生播放内核", error);
      if (xgPlayerInstance) {
        try {
          xgPlayerInstance.destroy();
        } catch {
          // 已销毁，忽略
        }
        xgPlayerInstance = null;
      }
      // 重置 video 状态，供回退引擎使用
      if (videoEl.parentNode !== containerEl) {
        containerEl.appendChild(videoEl);
      }
      videoEl.muted = initialMuted;
      videoEl.volume = initialVolume;
      return false;
    }
  }

  // ── hls.js 初始化（HLS 回退）──────────────────────────────────────────────

  function tryHlsJs(): boolean {
    if (streamType !== "hls") return false;

    // 优先 hls.js（MSE 支持）
    if (Hls.isSupported()) {
      hlsInstance = new Hls({ lowLatencyMode: true, backBufferLength: 90 });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        callbacks.onAutoplayAttempt();
        void tryAutoplay();
      });

      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (destroyed) return;
        callbacks.onAutoplayAttempt();
        void tryAutoplay();
      });

      // 直播流末尾 #EXT-X-ENDLIST（关播）
      hlsInstance.on(Hls.Events.BUFFER_EOS, () => {
        if (destroyed) return;
        callbacks.onStreamEnded();
      });

      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) return;
        if (!data.fatal) {
          // 非致命错误：BUFFER_STALLED 时尝试恢复
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            hlsInstance?.startLoad(-1);
            videoEl.play().catch(() => {});
          }
          return;
        }
        // 致命错误
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          callbacks.onStreamError("直播连接中断");
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsInstance?.recoverMediaError();
          videoEl.play().catch(() => {});
        } else {
          callbacks.onStreamError("直播连接中断");
        }
      });

      // video 元素 stalled/waiting 回退（对齐旧站）
      const onStalled: EventListener = () => {
        if (!videoEl.paused && hlsInstance && !destroyed) {
          hlsInstance.startLoad(-1);
        }
      };
      videoEl.addEventListener("stalled", onStalled);
      videoEl.addEventListener("waiting", onStalled);
      videoEventListener = onStalled;

      engineName = "hls.js";
      return true;
    }

    // 原生 HLS（Safari）
    if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = url;
      videoEl.load();
      engineName = "native";
      watchFirstFrame();
      return true;
    }

    return false;
  }

  // ── mpegts.js 初始化（FLV 回退）──────────────────────────────────────────

  function tryMpegts(): boolean {
    if (streamType !== "flv") return false;
    if (!mpegts.isSupported()) return false;

    flvPlayerInstance = mpegts.createPlayer(
      { type: "flv", url, isLive: true },
      {
        enableWorker: true,
        enableStashBuffer: false,
        stashInitialSize: 128,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 60,
        autoCleanupMinBackwardDuration: 30,
      },
    );
    flvPlayerInstance.attachMediaElement(videoEl);
    flvPlayerInstance.load();

    flvPlayerInstance.on(mpegts.Events.ERROR, (...args: unknown[]) => {
      if (destroyed) return;
      const data = args[2];
      const info = isMpegtsErrorData(data) ? data.info || data.msg : undefined;
      const errDetail = typeof args[1] === "string" ? args[1] : "";
      // codec 不支持（H.265/HEVC）vs 连接中断
      if (/Unsupported codec/i.test(info ?? "") || /codec/i.test(errDetail)) {
        callbacks.onStreamError("编码不支持");
      } else {
        callbacks.onStreamError("直播连接中断");
      }
    });

    flvPlayerInstance.on(mpegts.Events.MEDIA_ATTACHING, () => {
      if (destroyed) return;
      callbacks.onAutoplayAttempt();
      void tryAutoplay();
    });

    // 直播流被服务端关闭（关播）
    flvPlayerInstance.on(mpegts.Events.LOADING_COMPLETE, () => {
      if (destroyed) return;
      callbacks.onStreamEnded();
    });

    engineName = "mpegts.js";
    return true;
  }

  // ── 原生 <video> 回退（mp4 / 未知）───────────────────────────────────────

  function tryNative(): boolean {
    if (streamType !== "mp4" && streamType !== "") return false;
    videoEl.src = url;
    videoEl.load();
    engineName = "native";
    watchFirstFrame();
    return true;
  }

  // ── 引擎选择（按优先级依次尝试）───────────────────────────────────────────

  // 捕获当前 generation，供 xgplayer retryCheckFunc 闭包使用
  const gen = generation;

  if (tryXgplayer()) {
    // xgplayer 成功，等待 ready 事件触发播放
  } else if (tryHlsJs()) {
    // hls.js 或原生 HLS
  } else if (tryMpegts()) {
    // mpegts.js
  } else if (tryNative()) {
    // 原生 <video>
  } else {
    // 无可用引擎
    engineName = "none";
  }

  // ── 销毁 ──────────────────────────────────────────────────────────────────

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    generation += 1;

    // 保留 volume/muted 状态（跨 destroy 复用）
    const savedMuted = videoEl.muted;
    const savedVolume = videoEl.volume;

    // xgplayer 销毁
    if (xgPlayerInstance) {
      try {
        xgPlayerInstance.destroy();
      } catch {
        // 已销毁，忽略
      }
      xgPlayerInstance = null;
      // xgplayer 可能已重排 video 节点，确保回到 containerEl
      if (videoEl.parentNode !== containerEl) {
        containerEl.appendChild(videoEl);
      }
    }

    // hls.js 销毁
    if (hlsInstance) {
      try {
        hlsInstance.destroy();
      } catch {
        // 已销毁，忽略
      }
      hlsInstance = null;
    }

    // mpegts.js 销毁
    if (flvPlayerInstance) {
      try {
        flvPlayerInstance.pause();
        flvPlayerInstance.unload();
        flvPlayerInstance.destroy();
      } catch {
        // 已销毁，忽略
      }
      flvPlayerInstance = null;
    }

    // 移除 video 事件监听
    if (videoEventListener) {
      videoEl.removeEventListener("stalled", videoEventListener);
      videoEl.removeEventListener("waiting", videoEventListener);
      videoEl.removeEventListener("canplay", videoEventListener);
      videoEventListener = null;
    }

    // 暂停视频
    try {
      videoEl.pause();
    } catch {
      // 忽略
    }

    // 恢复 volume/muted 状态
    videoEl.muted = savedMuted;
    videoEl.volume = savedVolume;
  }

  // ── 返回句柄 ──────────────────────────────────────────────────────────────

  return {
    destroy,
    tryAutoplay,
    setAudioUnlocked: (v: boolean) => {
      audioUnlocked = v;
    },
    get engineName() {
      return engineName;
    },
  };
}
