"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import { Alert } from "@heroui/react";
import { userDetailApi } from "@/api/user";
import { useUiStore } from "@/stores/useUiStore";
import { UiModal } from "@/components/ui/UiModal";
import { UiAvatar } from "@/components/ui/UiAvatar";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { UiClickableImage } from "@/components/ui/UiClickableImage";
import type { UserDetail } from "@/types/api/user";
import { normalizeFaction, FACTION_BADGE_STYLES } from "@/types/api/enums";

export function UserDetailModal() {
  const isOpen = useUiStore((s) => s.activeModal === "userDetail");
  const userId = useUiStore((s) => s.userDetailUserId);
  const closeUserDetail = useUiStore((s) => s.closeUserDetail);

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    userDetailApi(userId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isOpen]);

  const handleClose = () => {
    setDetail(null);
    closeUserDetail();
  };

  const faction = normalizeFaction(detail?.faction);
  const factionConfig = faction ? FACTION_BADGE_STYLES[faction] : null;

  return (
    <UiModal isOpen={isOpen} onClose={handleClose} title="用户详情">
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-4" aria-hidden="true">
          <UiSkeleton className="size-16 rounded-full" />
          <UiSkeleton className="h-4 w-24" />
          <UiSkeleton className="h-3 w-32" />
          <UiSkeleton className="h-3 w-28" />
        </div>
      ) : error ? (
        <Alert status="danger" aria-live="polite">
          {error}
        </Alert>
      ) : detail ? (
        <div className="flex flex-col items-center gap-3 py-2">
          {detail.avatar ? (
            <UiClickableImage
              src={detail.avatar}
              emoji={false}
              label="查看头像"
              imgClassName="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <UiAvatar name={detail.name} size="lg" />
          )}
          <div className="text-center">
            <p className="text-base font-medium">{detail.name}</p>
            {detail.bio && <p className="mt-1 text-sm text-muted">{detail.bio}</p>}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted">用户ID: {detail.id}</span>
            <span className="text-xs text-muted">
              注册时间: {dayjs(detail.registerDate).format("YYYY-MM-DD")}
            </span>
          </div>
          {factionConfig && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${factionConfig.className}`}
            >
              {factionConfig.label}
            </span>
          )}
        </div>
      ) : null}
    </UiModal>
  );
}
