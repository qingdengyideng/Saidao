"use client";

import { useState } from "react";
import { Label, toast } from "@heroui/react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { changePasswordApi } from "@/api/user";
import { useUiStore } from "@/stores/useUiStore";

export function ChangePasswordModal() {
  const isOpen = useUiStore((s) => s.activeModal === "changePassword");
  const closeModal = useUiStore((s) => s.closeModal);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    // 前端校验
    const newErrors: Record<string, string> = {};
    if (newPassword.length < 6) {
      newErrors.newPassword = "新密码至少 6 位";
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "两次输入的密码不一致";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      await changePasswordApi({ oldPassword, newPassword });
      toast("密码已修改", { variant: "success" });
      // 重置状态并关闭
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "修改失败，请重试";
      toast("修改密码失败", { description: msg, variant: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    closeModal();
  };

  return (
    <UiModal isOpen={isOpen} onClose={handleClose} title="修改密码">
      <div className="flex flex-col gap-4" aria-live="polite">
        <section className="flex flex-col gap-1">
          <Label htmlFor="pwd-old">旧密码</Label>
          <UiTextField
            id="pwd-old"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="请输入旧密码"
          />
        </section>

        <section className="flex flex-col gap-1">
          <Label htmlFor="pwd-new">新密码</Label>
          <UiTextField
            id="pwd-new"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 6 位"
            errorMessage={errors.newPassword}
          />
        </section>

        <section className="flex flex-col gap-1">
          <Label htmlFor="pwd-confirm">确认新密码</Label>
          <UiTextField
            id="pwd-confirm"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            errorMessage={errors.confirmPassword}
          />
        </section>

        <div className="flex justify-end gap-2 border-t pt-4">
          <UiButton variant="tertiary" onPress={handleClose}>
            取消
          </UiButton>
          <UiButton variant="primary" isPending={saving} onPress={() => void handleSubmit()}>
            保存密码
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
