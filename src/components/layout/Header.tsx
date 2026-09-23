"use client";

import Link from "next/link";
import { Download, Heart, RefreshCw } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { UiButton } from "@/components/ui/UiButton";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import { NoticeBar } from "./NoticeBar";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { PwaInstallPrompt, usePwaInstall } from "./PwaInstallPrompt";

export function Header({
  onRefreshSaidao,
  isRefreshingSaidao,
}: {
  onRefreshSaidao?: () => void;
  isRefreshingSaidao?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const openModal = useUiStore((s) => s.openModal);
  const { visible: pwaInstallVisible, triggerInstall } = usePwaInstall();

  return (
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
      {/* logo 区：仅图标，保持原始比例，点击回到首页 */}
      <Link href="/" aria-label="Saidao 首页" className="flex shrink-0 items-center rounded">
        <img
          src="/images/saidao_logo_0915-no-bg.png"
          alt="Saidao"
          className="h-10 w-auto sm:h-11"
          width={1536}
          height={1024}
        />
      </Link>

      {/* 公告栏：flex-1 撑满 logo 与操作区之间的剩余宽度 */}
      <NoticeBar />

      {/* 右侧操作区：ml-auto 保证公告栏为空（NoticeBar 返回 null）时也贴右 */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* 刷新直播列表按钮：force revalidate SWR 拉取 /saidao/，onSuccess 覆盖 store */}
        {onRefreshSaidao && (
          <Tooltip delay={0}>
            <UiIconButton
              icon={RefreshCw}
              aria-label="刷新直播列表"
              onPress={onRefreshSaidao}
              isPending={isRefreshingSaidao}
              showSpinnerWhenPending
            />
            <Tooltip.Content>
              <p>刷新直播列表</p>
            </Tooltip.Content>
          </Tooltip>
        )}
        <ThemeToggle />

        {/* PWA 安装按钮：仅在浏览器触发 beforeinstallprompt 后显示 */}
        {pwaInstallVisible && (
          <UiIconButton icon={Download} aria-label="安装应用" onPress={triggerInstall} />
        )}

        <Link href="/sponsor" aria-label="赞助">
          <UiIconButton icon={Heart} aria-label="赞助" />
        </Link>

        {user ? (
          <UserMenu />
        ) : (
          <UiButton variant="secondary" onPress={() => openModal("login")}>
            登录/注册
          </UiButton>
        )}
      </div>

      {/* PWA 安装逻辑：组件本身返回 null，仅监听 beforeinstallprompt 事件 */}
      <PwaInstallPrompt />
    </header>
  );
}
