"use client";

import { Suspense, lazy } from "react";
import { useUiStore } from "@/stores/useUiStore";

/**
 * 全局图片查看器（基于 react-viewer 3.x 的受控封装）。
 *
 * 为何不用 HeroUI：HeroUI 无图片查看器组件，react-viewer 是第三方图片查看器库，
 * 属于铁律 9"HeroUI 没有覆盖的场景"，故直接用第三方库 + Tailwind/CSS 覆盖深色 token。
 *
 * 受控模式：viewer 来自 useUiStore（任务型，不 persist），visible = viewer !== null，
 * 关闭时调 closeViewer()。键盘（Esc 关闭 / 方向键切换）由 react-viewer 自带，无需手写。
 *
 * 版本说明：react-viewer 2.x 内部直接调用 ReactDOM.unmountComponentAtNode /
 * unstable_renderSubtreeIntoContainer 等 legacy root API，与 React 18+ 不兼容
 * （React 19 已移除，运行时报 "is not a function"）。3.x 改用 createPortal +
 * 独立容器渲染，与 React 19 兼容，且新增 minScale/maxScale prop，
 * 故升级 3.x 并据此对齐旧站 lightbox 缩放范围（0.25~4）。
 *
 * CSS 说明：react-viewer 3.x 的样式已内联进 bundle（style-loader 注入），
 * 无需再单独 import "react-viewer/dist/index.css"（该文件在 3.x 中不存在）。
 *
 * 懒加载说明：react-viewer 3.x 的打包产物在模块顶层就引用 document
 * （style-loader 注入 <style>、字体 data-uri 注入），SSR/prerender 阶段
 * （无 document）import 该模块会抛 "ReferenceError: document is not defined"。
 * 故用 React.lazy 懒加载，仅在用户实际打开查看器（客户端）时才加载该模块，
 * 彻底绕开 SSR 阶段对该库的求值。
 */
const LazyViewer = lazy(() => import("react-viewer").then((m) => ({ default: m.default })));

export function GlobalImageViewer() {
  const viewer = useUiStore((s) => s.viewer);
  const closeViewer = useUiStore((s) => s.closeViewer);

  if (!viewer) return null;

  return (
    <Suspense fallback={null}>
      <LazyViewer
        visible
        images={viewer.srcs.map((src) => ({ src }))}
        activeIndex={viewer.index}
        onClose={closeViewer}
        zoomSpeed={0.25}
        minScale={0.25}
        maxScale={4}
      />
    </Suspense>
  );
}
