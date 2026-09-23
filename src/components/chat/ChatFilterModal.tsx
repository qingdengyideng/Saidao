"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "@heroui/react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { updateChatFilterConfigApi } from "@/api/user";
import { useChatStore } from "@/stores/useChatStore";
import type { ChatFilterConfig } from "@/types/api/user";

interface ChatFilterModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 聊天过滤设置弹窗：管理屏蔽昵称、关键词正则、屏蔽用户 ID。
 */
export function ChatFilterModal({ isOpen, onOpenChange }: ChatFilterModalProps) {
  const { blockedUserIds, blockedNicknames, keywordPatterns, applyFilterConfig } = useChatStore();

  const [localNicknames, setLocalNicknames] = useState<string[]>([]);
  const [localKeywords, setLocalKeywords] = useState<string[]>([]);
  const [localUserIds, setLocalUserIds] = useState<number[]>([]);
  const [newNickname, setNewNickname] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordError, setKeywordError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // 弹窗打开时从 store 同步初始值
  useEffect(() => {
    if (isOpen) {
      setLocalNicknames(blockedNicknames);
      setLocalKeywords(keywordPatterns);
      setLocalUserIds(blockedUserIds);
      setNewNickname("");
      setNewKeyword("");
      setKeywordError(undefined);
    }
  }, [isOpen, blockedNicknames, keywordPatterns, blockedUserIds]);

  const addNickname = useCallback(() => {
    const trimmed = newNickname.trim();
    if (!trimmed) return;
    if (localNicknames.includes(trimmed)) {
      setNewNickname("");
      return;
    }
    setLocalNicknames((prev) => [...prev, trimmed]);
    setNewNickname("");
  }, [newNickname, localNicknames]);

  const removeNickname = useCallback((name: string) => {
    setLocalNicknames((prev) => prev.filter((n) => n !== name));
  }, []);

  const addKeyword = useCallback(() => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    try {
      new RegExp(trimmed);
    } catch {
      setKeywordError("无效的正则表达式");
      return;
    }
    if (localKeywords.includes(trimmed)) {
      setNewKeyword("");
      setKeywordError(undefined);
      return;
    }
    setLocalKeywords((prev) => [...prev, trimmed]);
    setNewKeyword("");
    setKeywordError(undefined);
  }, [newKeyword, localKeywords]);

  const removeKeyword = useCallback((pattern: string) => {
    setLocalKeywords((prev) => prev.filter((p) => p !== pattern));
  }, []);

  const removeUserId = useCallback((id: number) => {
    setLocalUserIds((prev) => prev.filter((u) => u !== id));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const config: ChatFilterConfig = {
      blockedNicknames: localNicknames,
      keywordPatterns: localKeywords,
      blockedUserIds: localUserIds,
    };
    try {
      await updateChatFilterConfigApi(config);
      applyFilterConfig(config);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存失败，请重试";
      toast("保存失败", { description: msg, variant: "danger" });
    } finally {
      setSaving(false);
    }
  }, [localNicknames, localKeywords, localUserIds, applyFilterConfig, onOpenChange]);

  return (
    <UiModal isOpen={isOpen} onClose={() => onOpenChange(false)} title="聊天过滤设置">
      <div className="flex flex-col gap-6" aria-live="polite">
        {/* 屏蔽昵称 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">屏蔽昵称</h3>
          {localNicknames.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {localNicknames.map((name) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{name}</span>
                  <UiIconButton
                    icon={X}
                    aria-label={`移除 ${name}`}
                    size="sm"
                    onPress={() => removeNickname(name)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">暂无屏蔽昵称</p>
          )}
          <div className="flex gap-2">
            <UiTextField
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              placeholder="输入要屏蔽的昵称"
              className="flex-1"
            />
            <UiButton variant="secondary" onPress={addNickname} aria-label="添加屏蔽昵称">
              <Plus size={14} aria-hidden="true" />
              添加
            </UiButton>
          </div>
        </section>

        {/* 关键词过滤 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">关键词过滤</h3>
          {localKeywords.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {localKeywords.map((pattern) => (
                <li key={pattern} className="flex items-center justify-between gap-2">
                  <code className="truncate text-xs">{pattern}</code>
                  <UiIconButton
                    icon={X}
                    aria-label={`移除关键词 ${pattern}`}
                    size="sm"
                    onPress={() => removeKeyword(pattern)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">暂无关键词规则</p>
          )}
          <div className="flex gap-2">
            <UiTextField
              value={newKeyword}
              onChange={(e) => {
                setNewKeyword(e.target.value);
                setKeywordError(undefined);
              }}
              errorMessage={keywordError}
              placeholder="输入正则表达式，如 ^广告$"
              className="flex-1"
            />
            <UiButton variant="secondary" onPress={addKeyword} aria-label="添加关键词">
              <Plus size={14} aria-hidden="true" />
              添加
            </UiButton>
          </div>
        </section>

        {/* 屏蔽用户 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">屏蔽用户</h3>
          {localUserIds.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {localUserIds.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">UID: {id}</span>
                  <UiIconButton
                    icon={X}
                    aria-label={`移除用户 ${id}`}
                    size="sm"
                    onPress={() => removeUserId(id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">暂无屏蔽用户（从消息右键菜单添加）</p>
          )}
        </section>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 border-t pt-4">
          <UiButton variant="tertiary" onPress={() => onOpenChange(false)}>
            取消
          </UiButton>
          <UiButton variant="primary" isPending={saving} onPress={() => void handleSave()}>
            保存
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
