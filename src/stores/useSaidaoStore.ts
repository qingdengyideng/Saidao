"use client";

import { create } from "zustand";
import type { Saidao, ContentAnalysis } from "@/types/api/saidao";

interface SaidaoState {
  /** 直播列表（WS 驱动增量更新，不轮询） */
  saidaos: Saidao[];
  /** notShow 的主播 id 集合（反向语义：true = 用户不想看） */
  hiddenIds: Set<number>;
  /** SWR 初始加载是否完成（用于区分"加载中"与"真·无数据"，一旦置 true 不再回退） */
  loaded: boolean;
  /** 设置列表（SWR 初始加载 + WS 全量/增量） */
  setSaidaos: (list: Saidao[]) => void;
  /** WS 增量：单条 upsert */
  upsertSaidao: (item: Saidao) => void;
  /** WS 增量：删除 */
  removeSaidao: (id: number) => void;
  /** 切换 notShow */
  toggleHidden: (id: number) => void;
  /** WS 广播：标签更新 */
  updateSaidaoTag: (id: number, tag: string) => void;
  /** WS 广播：热度分批量更新（level 后端以 number 下发，统一归一化为 string 与 REST hotLevel 对齐） */
  updateHotScores: (
    scores: { saidaoId: number; hotScore: number; level: string | number }[],
  ) => void;
  /** WS 广播：封面/直播流 URL 更新 */
  updateSaidaoCover: (content: { uid: string; cover: string; liveUrl: string }) => void;
  /** WS 广播：内容分析更新 */
  updateContentAnalysis: (uid: string, analysis: ContentAnalysis) => void;
}

export const useSaidaoStore = create<SaidaoState>()((set) => ({
  saidaos: [],
  hiddenIds: new Set(),
  loaded: false,
  setSaidaos: (list) => set({ saidaos: list, loaded: true }),
  upsertSaidao: (item) =>
    set((s) => {
      const idx = s.saidaos.findIndex((x) => x.id === item.id);
      const next = [...s.saidaos];
      if (idx >= 0) {
        next[idx] = item;
      } else {
        next.push(item);
      }
      return { saidaos: next };
    }),
  removeSaidao: (id) =>
    set((s) => ({
      saidaos: s.saidaos.filter((x) => x.id !== id),
    })),
  toggleHidden: (id) =>
    set((s) => {
      const next = new Set(s.hiddenIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { hiddenIds: next };
    }),
  updateSaidaoTag: (id, tag) =>
    set((s) => ({
      saidaos: s.saidaos.map((x) => (x.id === id ? { ...x, tag } : x)),
    })),
  updateHotScores: (scores) =>
    set((s) => {
      const scoreMap = new Map(scores.map((x) => [x.saidaoId, x]));
      return {
        saidaos: s.saidaos.map((x) => {
          const update = scoreMap.get(x.id);
          if (!update) return x;
          return { ...x, hotScore: update.hotScore, hotLevel: String(update.level) };
        }),
      };
    }),
  updateSaidaoCover: ({ uid, cover, liveUrl }) =>
    set((s) => ({
      saidaos: s.saidaos.map((x) =>
        x.uid === uid ? { ...x, cover: cover || x.cover, streamUrl: liveUrl || x.streamUrl } : x,
      ),
    })),
  updateContentAnalysis: (uid, analysis) =>
    set((s) => ({
      saidaos: s.saidaos.map((x) => (x.uid === uid ? { ...x, contentAnalysis: analysis } : x)),
    })),
}));
