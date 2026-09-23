/**
 * mpegts.js 最小类型声明（本地补充）。
 *
 * mpegts.js 1.x 自带的 .d.ts 使用 `declare namespace Mpegts` + `declare var Mpegts`，
 * 在 `moduleResolution: "bundler"` + `esModuleInterop` 下与 `import mpegts from "mpegts.js"`
 * 的互操作性存在兼容风险（CJS default 互操作）。
 * 此文件通过 `declare module "mpegts.js"` 提供与旧站 player.js 实际用法一致的最小类型，
 * 确保引擎层（src/lib/media/engine.ts）在 TypeScript strict 模式下可编译。
 *
 * 注意：若未来 mpegts.js 官方类型在 bundler 模式下完全可用，可删除此文件。
 */
declare module "mpegts.js" {
  /** mpegts.js 播放器实例（MSEPlayer / NativePlayer 的公共子集） */
  export interface MpegtsPlayer {
    attachMediaElement(el: HTMLMediaElement): void;
    load(): void;
    unload(): void;
    pause(): void;
    destroy(): void;
    /** 注册事件监听（event 为 mpegts.Events 中的常量，handler 参数为可变参数） */
    on(event: string, handler: (...args: unknown[]) => void): void;
    /** 移除事件监听 */
    off(event: string, handler: (...args: unknown[]) => void): void;
  }

  /** mpegts.js 播放器创建配置（仅声明本模块用到的字段） */
  export interface MpegtsConfig {
    enableWorker?: boolean;
    enableStashBuffer?: boolean;
    stashInitialSize?: number;
    lazyLoad?: boolean;
    autoCleanupSourceBuffer?: boolean;
    autoCleanupMaxBackwardDuration?: number;
    autoCleanupMinBackwardDuration?: number;
  }

  /** mpegts.js 媒体数据源（仅声明本模块用到的字段） */
  export interface MpegtsDataSource {
    type: string;
    url: string;
    isLive?: boolean;
  }

  /** mpegts.js 事件常量 */
  export interface MpegtsEvents {
    ERROR: string;
    MEDIA_ATTACHING: string;
    MEDIA_ATTACHED: string;
    LOADING_COMPLETE: string;
  }

  /** mpegts.js 模块默认导出对象类型（对齐旧站 `window.mpegts` 用法） */
  export interface MpegtsModule {
    isSupported(): boolean;
    createPlayer(source: MpegtsDataSource, config?: MpegtsConfig): MpegtsPlayer;
    readonly Events: MpegtsEvents;
  }

  const mpegts: MpegtsModule;
  export default mpegts;
}
