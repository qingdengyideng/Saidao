/**
 * 全屏工具模块（降级链实现，与旧站 player.js 行为对齐）
 *
 * 降级链顺序：
 * 1. 标准 Fullscreen API（requestFullscreen / exitFullscreen）
 * 2. WebKit 前缀 API（webkitRequestFullscreen / webkitExitFullscreen）
 * 3. iOS 原生视频全屏（video.webkitEnterFullscreen / webkitExitFullscreen）
 * 4. CSS 兜底：给元素添加 `viewport-fullscreen` 类（fixed 铺满视口，样式由组件侧 CSS 提供）
 *
 * 纯工具模块，不依赖 React；组件负责 `viewport-fullscreen` 类的 CSS 定义。
 */

/** WebKit 前缀的元素级全屏 API（Safari 旧版） */
interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}

/** WebKit 前缀的文档级全屏 API（Safari 旧版） */
interface WebkitFullscreenDocument {
  webkitFullscreenElement?: HTMLElement | null;
  webkitExitFullscreen?: () => Promise<void>;
}

/** iOS 原生视频全屏 API（仅 video 元素可用，需 readyState >= 1） */
interface WebkitVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
}

/** CSS 兜底全屏类名：fixed 定位铺满视口（样式由组件侧提供） */
const VIEWPORT_FULLSCREEN_CLASS = "viewport-fullscreen";

/** 全屏状态变化需要监听的事件名（含 WebKit/iOS 前缀变体） */
const FULLSCREEN_CHANGE_EVENTS: Array<string> = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "webkitbeginfullscreen",
  "webkitendfullscreen",
];

/**
 * 判断是否为移动端（UA 嗅探，与旧站 mobile 判断一致）
 * CSS 兜底全屏仅对移动端生效；桌面端无全屏能力时返回 false（旧站行为）
 */
function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/**
 * 判断当前是否处于任意一种全屏状态
 * （标准全屏 / WebKit 全屏 / iOS 原生视频全屏 / CSS 视口全屏兜底）
 *
 * @param element CSS 兜底全屏的目标元素（用于检查 `viewport-fullscreen` 类）
 * @param video 视频元素（用于检查 iOS 原生全屏）
 */
export function isFullscreenActive(element?: HTMLElement, video?: HTMLVideoElement): boolean {
  if (document.fullscreenElement !== null) return true;
  if ((document as WebkitFullscreenDocument).webkitFullscreenElement !== null) return true;
  if (video && (video as WebkitVideoElement).webkitDisplayingFullscreen === true) return true;
  if (element && element.classList.contains(VIEWPORT_FULLSCREEN_CLASS)) return true;
  return false;
}

/**
 * 进入全屏（降级链）
 *
 * @param element 全屏目标元素（通常为播放器容器）
 * @param video 播放器内的 video 元素（iOS 原生全屏降级用，可选）
 * @returns 成功进入全屏（含 CSS 兜底）返回 true；已在全屏或全部降级失败返回 false
 */
export async function enterFullscreen(
  element: HTMLElement,
  video?: HTMLVideoElement,
): Promise<boolean> {
  // 已处于任一全屏态则不重复进入
  if (isFullscreenActive(element, video)) return false;

  // 1. 标准 Fullscreen API
  try {
    await element.requestFullscreen();
    return true;
  } catch {
    // 继续降级
  }

  // 2. WebKit 前缀 API（Safari 旧版）
  try {
    await (element as WebkitFullscreenElement).webkitRequestFullscreen?.();
    return true;
  } catch {
    // 继续降级
  }

  // 3. iOS 原生视频全屏（需要视频已开始加载，readyState >= 1）
  if (video) {
    const webkitVideo = video as WebkitVideoElement;
    if (typeof webkitVideo.webkitEnterFullscreen === "function" && video.readyState >= 1) {
      try {
        await webkitVideo.webkitEnterFullscreen();
        return true;
      } catch {
        // 继续降级
      }
    }
  }

  // 4. CSS 视口全屏兜底（仅移动端；样式由组件侧 CSS 提供）
  // 5. 移动端以外无任何全屏能力 → 返回 false（与旧站行为一致）
  if (!isMobile()) return false;
  element.classList.add(VIEWPORT_FULLSCREEN_CLASS);
  return true;
}

/**
 * 退出全屏
 *
 * @param element CSS 兜底全屏的目标元素（用于移除 `viewport-fullscreen` 类，可选）
 * @param video 视频元素（用于退出 iOS 原生全屏，可选）
 */
export async function exitFullscreen(
  element?: HTMLElement,
  video?: HTMLVideoElement,
): Promise<void> {
  // 1. 标准 Fullscreen API
  if (document.fullscreenElement !== null) {
    await document.exitFullscreen();
    return;
  }

  // 2. WebKit 前缀 API
  const webkitDocument = document as WebkitFullscreenDocument;
  if (webkitDocument.webkitFullscreenElement !== null) {
    await webkitDocument.webkitExitFullscreen?.();
    return;
  }

  // 3. iOS 原生视频全屏
  if (video) {
    const webkitVideo = video as WebkitVideoElement;
    if (webkitVideo.webkitDisplayingFullscreen === true) {
      webkitVideo.webkitExitFullscreen?.();
      return;
    }
  }

  // 4. CSS 视口全屏兜底
  if (element && element.classList.contains(VIEWPORT_FULLSCREEN_CLASS)) {
    element.classList.remove(VIEWPORT_FULLSCREEN_CLASS);
  }
}

/**
 * 订阅全屏状态变化事件（兼容标准与 WebKit/iOS 前缀事件）
 *
 * 注意：CSS 兜底全屏（`viewport-fullscreen` 类）不会产生 DOM 事件，
 * 使用 CSS 兜底的组件需自行监听类名变化或通过 onFullscreenChange 回调外的方式同步状态。
 *
 * @param callback 全屏状态变化回调
 * @returns 取消订阅函数
 */
export function onFullscreenChange(callback: () => void): () => void {
  for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
    document.addEventListener(eventName, callback);
  }
  return () => {
    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      document.removeEventListener(eventName, callback);
    }
  };
}
