"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Key } from "react";
import { Key as KeyIcon, Loader2, Plus, Smile, Upload } from "lucide-react";
import { Chip, Tabs, toast } from "@heroui/react";
import useSWR from "swr";
import { queryEmojisApi, uploadEmojiApi } from "@/api/emoji";
import { useIsAuthenticated } from "@/hooks/use-auth-gate";
import { UiEmpty } from "@/components/ui/UiEmpty";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import type { Emoji, EmojiGroup } from "@/types/api/emoji";

interface EmojiPanelProps {
  onSelect: (emoji: Emoji) => void;
  onClose: () => void;
}

/** 上传大小上限：2MB */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * 表情面板：VIP 表情 + 动图两个 Tab。
 *
 * - SWR 拉取 emoji 列表（60s 去重窗口）
 * - VIP Tab 末尾有上传按钮（仅登录可见）
 * - 动图 Tab 用 <video muted loop autoplay> 渲染
 * - prefers-reduced-motion 时动图用静态 <img>（首帧海报）
 */
export function EmojiPanel({ onSelect, onClose }: EmojiPanelProps) {
  const isLoggedIn = useIsAuthenticated();
  const [group, setGroup] = useState<EmojiGroup>("vip");
  const [uploading, setUploading] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 监听系统 prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // SWR 拉取当前 group 的表情列表
  const {
    data: emojis,
    isLoading,
    error,
    mutate,
  } = useSWR<Emoji[]>(["emoji", group], () => queryEmojisApi(group), { dedupingInterval: 60000 });

  const handleSelect = useCallback(
    (emoji: Emoji) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 重置 input 让同一文件可再次选择
      e.target.value = "";
      if (!file) return;

      if (file.size > MAX_UPLOAD_BYTES) {
        toast("上传失败", { description: "图片超过 2MB 限制，请压缩后重试", variant: "danger" });
        return;
      }

      setUploading(true);
      try {
        await uploadEmojiApi(file);
        toast("上传成功", { variant: "success" });
        // 刷新列表
        void mutate();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "上传失败，请重试";
        toast("上传失败", { description: msg, variant: "danger" });
      } finally {
        setUploading(false);
      }
    },
    [mutate],
  );

  const handleGroupChange = useCallback((key: Key) => {
    // HeroUI onSelectionChange 的 key 是 React Key (string | number)，
    // 我们只用了 string id，所以安全地窄化为 EmojiGroup
    if (key === "vip" || key === "animation") {
      setGroup(key);
    }
  }, []);

  return (
    <div className="flex max-h-[320px] flex-col gap-2 overflow-hidden border-t border-border p-2">
      <Tabs selectedKey={group} onSelectionChange={handleGroupChange} aria-label="表情分类">
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="vip">
              <KeyIcon size={14} aria-hidden="true" />
              VIP表情
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="animation">
              动图
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="vip">
          {isLoading && (
            <div className="grid grid-cols-4 gap-1 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <UiSkeleton key={i} heightClass="h-12 w-full" />
              ))}
            </div>
          )}
          {!isLoading && error && (
            <UiEmpty icon={Smile} title="加载失败" description="网络异常，请检查网络后重试" />
          )}
          {!isLoading && !error && emojis && emojis.length > 0 && (
            <div className="grid max-h-[220px] grid-cols-4 gap-1 overflow-y-auto p-2">
              {emojis.map((emoji) => (
                <button
                  key={emoji.name}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  aria-label={emoji.name}
                  className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  <img
                    src={emoji.url}
                    alt={emoji.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 object-contain"
                  />
                </button>
              ))}
              {isLoggedIn && (
                <div className="flex items-center justify-center">
                  <UiIconButton
                    icon={uploading ? Loader2 : Plus}
                    aria-label="上传表情"
                    onPress={handleUploadClick}
                    variant="ghost"
                    isDisabled={uploading}
                    className={uploading ? "animate-spin" : ""}
                  />
                </div>
              )}
            </div>
          )}
          {!isLoading && !error && emojis && emojis.length === 0 && (
            <UiEmpty icon={Smile} title="暂无 VIP 表情" description="上传你的第一个表情吧" />
          )}
        </Tabs.Panel>

        <Tabs.Panel id="animation">
          {isLoading && (
            <div className="grid grid-cols-4 gap-1 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <UiSkeleton key={i} heightClass="h-12 w-full" />
              ))}
            </div>
          )}
          {!isLoading && error && (
            <UiEmpty icon={Smile} title="加载失败" description="网络异常，请检查网络后重试" />
          )}
          {!isLoading && !error && emojis && emojis.length > 0 && (
            <div className="grid max-h-[220px] grid-cols-4 gap-1 overflow-y-auto p-2">
              {emojis.map((emoji) => (
                <button
                  key={emoji.name}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  aria-label={emoji.name}
                  className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {prefersReducedMotion ? (
                    <img
                      src={emoji.url}
                      alt={emoji.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 object-contain"
                    />
                  ) : (
                    <video
                      src={emoji.url}
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                      className="h-12 w-12 object-contain"
                      aria-label={emoji.name}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
          {!isLoading && !error && emojis && emojis.length === 0 && (
            <UiEmpty icon={Smile} title="暂无动图" />
          )}
        </Tabs.Panel>
      </Tabs>

      {/* 隐藏的 file input：仅 VIP 上传使用 */}
      {isLoggedIn && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
        />
      )}

      {/* 上传中提示 */}
      {uploading && (
        <Chip size="sm" variant="soft" className="self-start">
          <Upload size={12} aria-hidden="true" />
          上传中…
        </Chip>
      )}
    </div>
  );
}
