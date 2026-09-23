"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { WsPlayerDanmakuItem } from "@/lib/ws/ws-message-types";
import { parseChatContent } from "@/lib/chat/content-parser";

/** 弹幕常量（与旧站一致） */
const DANMAKU_LANE_HEIGHT = 36; // px
const DANMAKU_GAP = 32; // px
const DANMAKU_SPEED = 90; // px/s
const MAX_DANMAKU_NODES = 60; // 最大并发节点数

/** 弹幕层 imperative API */
export interface DanmakuLayerHandle {
  /** 添加一批弹幕（已延迟 5s） */
  addComments: (comments: WsPlayerDanmakuItem[]) => void;
  /** 清空所有弹幕 */
  clear: () => void;
}

interface DanmakuLayerProps {
  /** 弹幕开关（false 时清空并隐藏层） */
  enabled: boolean;
  /** 额外 className（由父组件控制定位，默认 inset-0） */
  className?: string;
}

/**
 * 弹幕层（绝对定位覆盖在视频上，车道制滚动）
 *
 * HeroUI 无弹幕组件，此组件在白名单内（见 05-heroui-components.md §7）。
 *
 * 使用 imperative API（forwardRef + useImperativeHandle）避免高频 props 更新导致 rerender。
 * 弹幕文本通过 parseChatContent 安全解析，绝不使用 dangerouslySetInnerHTML。
 *
 * 车道制：每条弹幕分配一条车道，同车道内保持 gap 间距，
 * 所有车道全占时丢弃该弹幕（评论面板仍显示）。
 */
export const DanmakuLayer = forwardRef<DanmakuLayerHandle, DanmakuLayerProps>(function DanmakuLayer(
  { enabled, className },
  ref,
) {
  const layerRef = useRef<HTMLDivElement>(null);
  /** 每条车道的末尾节点（用于 gap 检测） */
  const lanesRef = useRef<(HTMLElement | null)[]>([]);
  /** 当前节点总数 */
  const nodeCountRef = useRef(0);
  /** 是否响应 prefers-reduced-motion */
  const prefersReducedMotionRef = useRef(false);
  /** 缓存容器宽度（ResizeObserver 更新，避免高频 getBoundingClientRect） */
  const layerWidthRef = useRef(0);

  // 监听 prefers-reduced-motion
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = mql.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  /** 清空所有弹幕节点 */
  const clear = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.innerHTML = "";
    lanesRef.current = [];
    nodeCountRef.current = 0;
  }, []);

  // 弹幕关闭时清空
  useEffect(() => {
    if (!enabled) {
      clear();
    }
  }, [enabled, clear]);

  /** 为弹幕分配车道（找到第一条尾部 + gap 仍在屏幕外的车道） */
  const findLane = useCallback((): number => {
    const layer = layerRef.current;
    if (!layer) return -1;
    const laneCount = Math.floor(layer.clientHeight / DANMAKU_LANE_HEIGHT);
    for (let lane = 0; lane < laneCount; lane++) {
      const tail = lanesRef.current[lane];
      if (!tail || tail.parentNode !== layer) return lane;
      const tailRight = tail.offsetLeft + tail.offsetWidth;
      if (tailRight + DANMAKU_GAP <= layerWidthRef.current) {
        return lane;
      }
    }
    return -1; // 所有车道都满
  }, []);

  /** 安全渲染弹幕文本到 DOM 节点（parseChatContent 白名单解析） */
  const fillNodeContent = useCallback((node: HTMLElement, text: string) => {
    const parsed = parseChatContent(text);
    if (parsed.kind === "text") {
      node.textContent = parsed.text;
    } else if (parsed.kind === "image") {
      const img = document.createElement("img");
      img.src = parsed.src;
      img.className = "chat-emoji";
      img.alt = "";
      img.width = 24;
      img.height = 24;
      node.appendChild(img);
    } else {
      // mixed: 文本 + 图片混合
      for (const part of parsed.parts) {
        if (part.kind === "text") {
          node.appendChild(document.createTextNode(part.text));
        } else {
          const img = document.createElement("img");
          img.src = part.src;
          img.className = "chat-emoji";
          img.alt = "";
          img.width = 24;
          img.height = 24;
          node.appendChild(img);
        }
      }
    }
  }, []);

  /** 添加一批弹幕 */
  const addComments = useCallback(
    (comments: WsPlayerDanmakuItem[]) => {
      const layer = layerRef.current;
      if (!layer || !enabled) return;
      if (prefersReducedMotionRef.current) return; // 减少动画：不渲染弹幕

      for (const item of comments) {
        if (nodeCountRef.current >= MAX_DANMAKU_NODES) return;

        const layerWidth = layerWidthRef.current;
        if (layerWidth <= 0) return;

        const lane = findLane();
        if (lane === -1) return; // 所有车道都满，丢弃

        // 创建弹幕节点
        const node = document.createElement("div");
        node.className = "danmaku-item";
        node.style.top = `${4 + lane * DANMAKU_LANE_HEIGHT}px`;
        node.style.visibility = "hidden";

        // 安全渲染弹幕文本
        fillNodeContent(node, item.text);

        layer.appendChild(node);

        // 测量宽度并设置动画
        const nodeWidth = Math.ceil(node.getBoundingClientRect().width);
        const travel = layerWidth + nodeWidth;
        node.style.width = `${nodeWidth}px`;
        node.style.setProperty("--danmaku-distance", `${travel}px`);
        node.style.animationDuration = `${travel / DANMAKU_SPEED}s`;
        node.style.visibility = "visible";

        // 记录车道尾部
        lanesRef.current[lane] = node;
        nodeCountRef.current += 1;

        // 动画结束 → 移除节点
        node.addEventListener("animationend", () => {
          node.remove();
          nodeCountRef.current -= 1;
          if (lanesRef.current[lane] === node) {
            lanesRef.current[lane] = null;
          }
        });
      }
    },
    [enabled, findLane, fillNodeContent],
  );

  // 容器 resize 时清空（重算车道）+ 更新缓存宽度
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        layerWidthRef.current = entry.contentRect.width;
      }
      clear();
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, [clear]);

  useImperativeHandle(ref, () => ({ addComments, clear }), [addComments, clear]);

  return (
    <div
      ref={layerRef}
      className={`pointer-events-none absolute z-[3] overflow-hidden ${className ?? "inset-0"}`}
      aria-hidden="true"
    />
  );
});
