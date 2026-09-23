"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "@heroui/react";
import { FilterTabs, type FilterTab } from "@/components/saidao/FilterTabs";
import { SaidaoGrid } from "@/components/saidao/SaidaoGrid";
import { DailyReportList } from "@/components/saidao/DailyReportList";
import { useSaidaoStore } from "@/stores/useSaidaoStore";
import { registerAuthCallbacks, useAuthStore } from "@/stores/useAuthStore";
import { saidaoListApi } from "@/api/saidao";
import { currentUserApi } from "@/api/user";
import { config } from "@/config";
import { GlobalImageViewer } from "@/components/ui/ImageViewer";
import { ChatSidebar } from "./ChatSidebar";
import { ChatFab } from "./ChatFab";
import { ModalsHost } from "./ModalsHost";
import { Header } from "./Header";

function ActivePanel({ tab }: { tab: FilterTab }) {
  return tab === "dailyReport" ? <DailyReportList /> : <SaidaoGrid tab={tab} />;
}

export function HomeShell() {
  const [tab, setTab] = useState<FilterTab>("live");

  // 注册 401 回调（仅执行一次）
  useEffect(() => {
    registerAuthCallbacks();
  }, []);

  // 登录态恢复：读 localStorage token → 调 currentUserApi 验证 → 设 authenticated
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem(config.tokenStorageKey);
    if (!token) {
      useAuthStore.getState().markInitialized();
      return;
    }
    currentUserApi()
      .then((user) => {
        if (cancelled) return;
        if (user) {
          useAuthStore.getState().setAuthenticated(user);
        }
      })
      .catch(() => {
        // 401 / 网络错误 → 保持 anonymous，由 http-client 的 onUnauthorized 回调处理 clearAuth
      })
      .finally(() => {
        if (!cancelled) {
          useAuthStore.getState().markInitialized();
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // SWR 获取直播列表（免登录，后端契约已支持游客访问）
  const [isLoadingSaidao, setIsLoadingSaidao] = useState(false);
  const { mutate: mutateSaidaoList } = useSWR("saidaoList", () => saidaoListApi(), {
    onSuccess: (list) => {
      useSaidaoStore.getState().setSaidaos(list);
    },
    revalidateOnFocus: false,
  });

  // 手动刷新：force revalidate 重新拉取 /saidao/，onSuccess 覆盖 store
  const refreshSaidaoList = useCallback(() => {
    setIsLoadingSaidao(true);
    mutateSaidaoList()
      .then(() => {
        toast.success("直播列表已刷新");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "刷新失败，请稍后重试";
        toast.danger(msg, {
          description: "请检查网络连接后重试",
          timeout: 6000,
        });
      })
      .finally(() => setIsLoadingSaidao(false));
  }, [mutateSaidaoList]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header onRefreshSaidao={refreshSaidaoList} isRefreshingSaidao={isLoadingSaidao} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FilterTabs onSelectionChange={setTab} />
          <ActivePanel tab={tab} />
        </main>
        {/* 聊天侧栏（风控滑块验证 + 过滤设置），桌面端与 main 水平并排 */}
        <ChatSidebar />
      </div>
      {/* 聊天浮动按钮（侧栏收起时显示，含新消息 badge） */}
      <ChatFab />
      {/* 全局 Modal 宿主（登录/资料/改密/分配/标签/过滤/投票） */}
      <ModalsHost />
      {/* 全局图片查看器（react-viewer 受控，viewer 来自 useUiStore） */}
      <GlobalImageViewer />
    </div>
  );
}
