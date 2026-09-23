"use client";

import { memo, useState } from "react";
import { EyeOff, Flame, MoreVertical, Tag } from "lucide-react";
import { Chip, Dropdown, Label, toast } from "@heroui/react";
import { clickSaidaoApi, updateOptionsApi } from "@/api/saidao";
import { useSaidaoStore } from "@/stores/useSaidaoStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import { useIsAuthenticated } from "@/hooks/use-auth-gate";
import { UiCard } from "@/components/ui/UiCard";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { UiAvatar } from "@/components/ui/UiAvatar";
import type { Saidao } from "@/types/api/saidao";

interface SaidaoCardProps {
  saidao: Saidao;
}

function SaidaoCardInner({ saidao }: SaidaoCardProps) {
  const toggleHidden = useSaidaoStore((s) => s.toggleHidden);
  const isLoggedIn = useIsAuthenticated();
  const canEditTag = useAuthStore((s) => s.user?.canEditSaidaoTag ?? false);
  const openTagEditor = useUiStore((s) => s.openTagEditor);
  // 直播中封面加载失败时降级为头像展示
  const [coverError, setCoverError] = useState(false);

  const handleCoverClick = () => {
    // fire-and-forget 点击统计
    clickSaidaoApi(saidao.id).catch(() => {});
  };

  /** 头像点击：打开查看器 */
  const handleAvatarOpenViewer = () => {
    useUiStore.getState().openViewer([avatarSrc], 0);
  };

  const handleHide = async () => {
    try {
      await updateOptionsApi({ id: saidao.id, notShow: true });
      toggleHidden(saidao.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "请稍后重试";
      toast("操作失败", { description: msg, variant: "danger" });
    }
  };

  const isLive = saidao.status === 1;
  // startTime 由后端直接返回相对开播时间文案（如"3分钟前"），直接展示，无需前端计算
  const hotScoreFormatted = new Intl.NumberFormat("zh-CN", {
    notation: saidao.hotScore >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(saidao.hotScore);

  // 封面展示：直播中且有 cover（且未加载失败）→ 可点击封面（跳转播放页）；
  // 未开播或无封面/加载失败 → 纯展示（cover 或模糊头像兜底）
  const cover = saidao.cover;
  const showCoverImage = isLive && cover !== null && cover !== "" && !coverError;
  const avatarSrc = saidao.avatar ?? "/icon-192x192.png";

  return (
    <UiCard
      bare
      className="group overflow-hidden transition duration-300 hover:shadow-lg md:hover:-translate-y-0.5"
    >
      {/* 封面区 16:9 */}
      <div className="relative aspect-video overflow-hidden bg-surface-secondary">
        {showCoverImage && cover ? (
          <a
            href={`/player/${saidao.uid}`}
            onClick={handleCoverClick}
            aria-label={`查看 ${saidao.name} 的直播`}
            className="block h-full w-full focus-visible:outline focus-visible:outline-accent"
          >
            <img
              src={cover}
              alt={saidao.name}
              width={640}
              height={360}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              onError={() => setCoverError(true)}
            />
          </a>
        ) : cover !== null && cover !== "" ? (
          // 未开播且有 cover：纯展示封面（不可点击跳转）
          <img
            src={cover}
            alt={saidao.name}
            width={640}
            height={360}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setCoverError(true)}
          />
        ) : (
          // 无 cover：模糊头像兜底（移动端头像略小）
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={avatarSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl saturate-50"
            />
            <img
              src={avatarSrc}
              alt={saidao.name}
              width={88}
              height={88}
              className="relative h-[4.25rem] w-[4.25rem] rounded-full object-cover shadow-lg ring-2 ring-white/20 md:h-24 md:w-24"
            />
          </div>
        )}
        {/* 状态角标：直播中为 danger 实色 + 脉冲白点，未开播为中性 soft 玻璃态 */}
        {isLive ? (
          <Chip size="sm" variant="primary" color="danger" className="absolute left-2 top-2">
            <span className="relative flex size-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span
                className="relative inline-flex size-2 rounded-full bg-white"
                aria-hidden="true"
              />
            </span>
            <Chip.Label>直播中</Chip.Label>
          </Chip>
        ) : (
          <Chip
            size="sm"
            variant="primary"
            className="absolute left-2 top-2 border-0 bg-black/45 text-white backdrop-blur-sm"
          >
            <Chip.Label>未开播</Chip.Label>
          </Chip>
        )}
        {/* 热度角标：媒体层信息（非按钮语义），玻璃拟态 */}
        <Chip
          size="sm"
          variant="primary"
          className="absolute right-2 top-2 border-0 bg-black/45 text-white backdrop-blur-sm"
        >
          <Flame size={12} aria-hidden="true" />
          <Chip.Label>{hotScoreFormatted}</Chip.Label>
        </Chip>
        {/* tag 角标：左下角，与"未开播"同款玻璃拟态；登录态下悬停时让位于操作菜单 */}
        {saidao.tag && (
          <Chip
            size="sm"
            variant="primary"
            className="absolute bottom-2 left-2 max-w-[calc(100%-40px)] border-0 bg-black/45 text-white backdrop-blur-sm md:transition-opacity md:duration-200 md:group-hover:opacity-0"
          >
            <Chip.Label className="truncate">{saidao.tag}</Chip.Label>
          </Chip>
        )}
        {isLoggedIn && (
          <div className="absolute right-2 bottom-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <Dropdown>
              <UiIconButton
                icon={MoreVertical}
                aria-label="操作菜单"
                variant="secondary"
                className="bg-black/50"
              />
              <Dropdown.Popover>
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === "hide") handleHide();
                    if (key === "editTag" && canEditTag) openTagEditor(saidao);
                  }}
                >
                  <Dropdown.Item id="hide" textValue="不想看 TA" variant="danger">
                    <div className="flex w-full items-center gap-2">
                      <EyeOff size={16} aria-hidden="true" />
                      <Label>不想看 TA</Label>
                    </div>
                  </Dropdown.Item>
                  {canEditTag && (
                    <Dropdown.Item id="editTag" textValue="编辑标签">
                      <div className="flex w-full items-center gap-2">
                        <Tag size={16} aria-hidden="true" />
                        <Label>编辑标签</Label>
                      </div>
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        )}
      </div>
      {/* 信息区：移动端紧凑 / PC 稍宽 */}
      <div className="flex items-center gap-2 p-2 pt-0 md:gap-2.5 md:p-2 md:pt-1">
        {saidao.avatar ? (
          <button
            type="button"
            aria-label={`查看 ${saidao.name} 的头像`}
            onClick={handleAvatarOpenViewer}
            className={`inline-flex shrink-0 rounded-full p-0.5 focus-visible:outline focus-visible:outline-accent ${
              isLive
                ? "bg-[conic-gradient(from_180deg,var(--danger),var(--accent),var(--danger))]"
                : "ring-1 ring-border"
            }`}
          >
            <img
              src={saidao.avatar}
              alt={saidao.name}
              width={44}
              height={44}
              className="h-10 w-10 rounded-full border-2 border-surface object-cover md:h-11 md:w-11"
            />
          </button>
        ) : (
          <UiAvatar name={saidao.name} size="lg" className="shrink-0 ring-1 ring-border" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-base font-semibold">{saidao.name}</h3>
            {isLive && saidao.startTime && (
              <span className="shrink-0 text-xs text-muted tabular-nums">{saidao.startTime}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {/* 平台渠道：后端取值已自带平台 emoji，故不再叠加前缀图标，避免同义图标重复 */}
            <Chip size="sm" variant="soft" className="max-w-32">
              <Chip.Label className="truncate">{saidao.channel || "未知渠道"}</Chip.Label>
            </Chip>
            {saidao.contentAnalysis?.ai_label && (
              <Chip size="sm" variant="soft" color="warning" className="max-w-24">
                <Chip.Label className="truncate">{saidao.contentAnalysis.ai_label}</Chip.Label>
              </Chip>
            )}
          </div>
        </div>
      </div>
    </UiCard>
  );
}

export const SaidaoCard = memo(SaidaoCardInner);
