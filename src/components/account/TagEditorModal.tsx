"use client";

import { useState, useEffect } from "react";
import { Chip, Label, toast } from "@heroui/react";
import { updateSaidaoTagApi } from "@/api/saidao";
import { useUiStore } from "@/stores/useUiStore";
import { UiModal } from "@/components/ui/UiModal";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiButton } from "@/components/ui/UiButton";

export function TagEditorModal() {
  const isOpen = useUiStore((s) => s.activeModal === "tagEditor");
  const target = useUiStore((s) => s.tagEditorTarget);
  const closeTagEditor = useUiStore((s) => s.closeTagEditor);

  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && target) {
      setTag(target.tag ?? "");
    }
  }, [isOpen, target]);

  const handleClose = () => {
    setTag("");
    closeTagEditor();
  };

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const tagValue = tag.trim();
      await updateSaidaoTagApi({ id: target.id, tag: tagValue });
      toast(tagValue ? "标签已更新" : "标签已清空", { variant: "success" });
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "请稍后重试";
      toast("操作失败", { description: msg, variant: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  return (
    <UiModal isOpen={isOpen} onClose={handleClose} title="编辑标签">
      <div className="flex flex-col gap-4 py-2">
        <div>
          <p className="text-xs text-muted">主播</p>
          <p className="text-base font-medium">{target.name}</p>
        </div>

        {/* 预览区域 */}
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">标签预览</span>
            {tag.trim() && (
              <Chip size="sm" variant="soft">
                {tag.trim()}
              </Chip>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            {tag.trim()
              ? "点击保存会更新为新的唯一标签。留空可清空标签。"
              : "当前主播还没有标签，输入后即可保存。"}
          </p>
        </div>

        {/* 输入框 */}
        <div className="flex flex-col gap-1">
          <Label>标签内容</Label>
          <UiTextField
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={20}
            placeholder="例如：人气担当 / 深夜档 / 常驻"
            disabled={saving}
          />
        </div>

        {/* 按钮组 */}
        <div className="flex justify-end gap-2">
          <UiButton variant="tertiary" onPress={handleClose} isDisabled={saving}>
            取消
          </UiButton>
          <UiButton variant="primary" onPress={handleSave} isPending={saving} aria-label="保存标签">
            保存
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
