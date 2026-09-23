"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Label, ListBox, Radio, RadioGroup, Select, toast } from "@heroui/react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiTextarea } from "@/components/ui/UiTextarea";
import { UiAvatar } from "@/components/ui/UiAvatar";
import { UiConfirm } from "@/components/ui/UiConfirm";
import { UiClickableImage } from "@/components/ui/UiClickableImage";
import { profileUpdateApi } from "@/api/user";
import { uploadImageApi } from "@/api/upload";
import { testWebhookApi } from "@/api/webhook";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import type { ProfileUpdateRequest } from "@/types/api/user";
import {
  normalizeFaction,
  normalizeWebhookType,
  FACTION_LABELS,
  WEBHOOK_TYPE_LABELS,
  WEBHOOK_VALID_PREFIXES,
  WEBHOOK_PLACEHOLDERS,
} from "@/types/api/enums";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** 表单 faction 值（"" 表示未选择，非空时为枚举值） */
type FactionFormValue = "" | "ya" | "juan";

/** 表单 webhookType 值（"" 表示未选择，非空时为枚举值） */
type WebhookTypeFormValue = "" | "dingtalk" | "wecom" | "feishu";

export function ProfileModal() {
  const isOpen = useUiStore((s) => s.activeModal === "profile");
  const closeModal = useUiStore((s) => s.closeModal);
  const openModal = useUiStore((s) => s.openModal);
  const user = useAuthStore((s) => s.user);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // 表单状态
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [faction, setFaction] = useState<FactionFormValue>("");
  const [webhookType, setWebhookType] = useState<WebhookTypeFormValue>("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmLogout, setConfirmLogout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开时从 user 读取初始化表单
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name);
      setBio(user.bio ?? "");
      setAvatar(user.avatar);
      setFaction(normalizeFaction(user.faction) ?? "");
      setWebhookType(normalizeWebhookType(user.webhookType) ?? "");
      setWebhookUrl(user.webhookUrl ?? "");
      setErrors({});
    }
  }, [isOpen, user]);

  // 更换头像
  const handleAvatarSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAvatarFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      toast("图片不能超过 2MB", { variant: "danger" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const result = await uploadImageApi(file);
      setAvatar(result.url);
      toast("头像上传成功", { variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "上传失败，请重试";
      toast("头像上传失败", { description: msg, variant: "danger" });
    } finally {
      setUploadingAvatar(false);
    }
  }, []);

  // 测试 Webhook
  const handleTestWebhook = useCallback(async () => {
    const type = webhookType;
    if (type === "") {
      toast("请先选择 Webhook 类型", { variant: "danger" });
      return;
    }
    const url = webhookUrl.trim();
    if (!url) {
      setErrors((prev) => ({ ...prev, webhookUrl: "请输入 Webhook 地址" }));
      return;
    }
    if (!url.startsWith(WEBHOOK_VALID_PREFIXES[type])) {
      setErrors((prev) => ({
        ...prev,
        webhookUrl: `Webhook 地址必须以 ${WEBHOOK_VALID_PREFIXES[type]} 开头`,
      }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.webhookUrl;
      return next;
    });

    setTestingWebhook(true);
    try {
      await testWebhookApi({
        webhookType: type,
        webhookUrl: url,
        testMessage: "Saidao 开播通知测试",
      });
      toast("消息发送成功，请查收消息！", { variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "消息发送失败，请重试";
      toast("消息发送失败", { description: msg, variant: "danger" });
    } finally {
      setTestingWebhook(false);
    }
  }, [webhookType, webhookUrl]);

  // 保存
  const handleSave = useCallback(async () => {
    // 前端校验
    const newErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = "请输入昵称";
    }
    const url = webhookUrl.trim();
    const type = webhookType;
    if (type !== "" && url && !url.startsWith(WEBHOOK_VALID_PREFIXES[type])) {
      newErrors.webhookUrl = `Webhook 地址必须以 ${WEBHOOK_VALID_PREFIXES[type]} 开头`;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload: ProfileUpdateRequest = {
      name: trimmedName,
      avatar,
      bio: bio.trim() || null,
      faction: faction === "" ? null : faction,
      webhookType: type === "" ? null : type,
      webhookUrl: type === "" ? null : url || null,
    };

    setSaving(true);
    try {
      const updatedUser = await profileUpdateApi(payload);
      setAuthenticated(updatedUser);
      toast("个人资料更新成功", { variant: "success" });
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败，请重试";
      toast("保存失败", { description: msg, variant: "danger" });
    } finally {
      setSaving(false);
    }
  }, [name, avatar, bio, faction, webhookType, webhookUrl, setAuthenticated, closeModal]);

  // 退出登录
  const handleLogout = useCallback(() => {
    clearAuth();
    setConfirmLogout(false);
    closeModal();
  }, [clearAuth, closeModal]);

  const showWebhookUrl = webhookType !== "";
  const placeholder = webhookType !== "" ? WEBHOOK_PLACEHOLDERS[webhookType] : "";

  return (
    <>
      <UiModal isOpen={isOpen} onClose={closeModal} title="个人资料">
        <div className="flex flex-col gap-6" aria-live="polite">
          {/* 头像区域 */}
          <section className="flex flex-col gap-2">
            <Label>头像</Label>
            <div className="flex items-center gap-4">
              {avatar ? (
                <UiClickableImage
                  src={avatar}
                  emoji={false}
                  label="查看头像"
                  imgClassName="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <UiAvatar name={name || user?.name || ""} size="lg" />
              )}
              <div className="flex flex-col gap-1">
                <UiButton
                  variant="secondary"
                  isPending={uploadingAvatar}
                  onPress={handleAvatarSelect}
                >
                  <ImageIcon size={14} aria-hidden="true" />
                  更换头像
                </UiButton>
                <p className="text-xs text-muted">支持 JPG/PNG，不超过 2MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => void handleAvatarFileChange(e)}
              />
            </div>
          </section>

          {/* 昵称 */}
          <section className="flex flex-col gap-1">
            <Label htmlFor="profile-name">昵称</Label>
            <UiTextField
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="请输入昵称"
              errorMessage={errors.name}
            />
          </section>

          {/* 个性签名 */}
          <section className="flex flex-col gap-1">
            <Label htmlFor="profile-bio">个性签名</Label>
            <UiTextarea
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              placeholder="介绍一下自己"
              errorMessage={errors.bio}
            />
          </section>

          {/* 阵营 */}
          <section className="flex flex-col gap-2">
            <RadioGroup
              name="profile-faction"
              value={faction}
              onChange={(v) => setFaction(v as FactionFormValue)}
            >
              <Label>阵营</Label>
              <Radio value="ya">
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {FACTION_LABELS.ya}
                </Radio.Content>
              </Radio>
              <Radio value="juan">
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {FACTION_LABELS.juan}
                </Radio.Content>
              </Radio>
            </RadioGroup>
            <p className="text-xs text-muted">选择后 30 天内不能更换</p>
          </section>

          {/* Webhook 配置 */}
          <section className="flex flex-col gap-3">
            <Label>开播通知 Webhook</Label>
            <Select
              value={webhookType === "" ? null : webhookType}
              onChange={(v) => {
                const val = v === null ? "" : (String(v) as WebhookTypeFormValue);
                setWebhookType(val);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.webhookUrl;
                  return next;
                });
              }}
              placeholder="不使用"
            >
              <Label>类型</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item
                    id="dingtalk"
                    textValue={`${WEBHOOK_TYPE_LABELS.dingtalk}(dingtalk)`}
                  >
                    {WEBHOOK_TYPE_LABELS.dingtalk}(dingtalk)
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="wecom" textValue={`${WEBHOOK_TYPE_LABELS.wecom}(wecom)`}>
                    {WEBHOOK_TYPE_LABELS.wecom}(wecom)
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="feishu" textValue={`${WEBHOOK_TYPE_LABELS.feishu}(feishu)`}>
                    {WEBHOOK_TYPE_LABELS.feishu}(feishu)
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            {showWebhookUrl && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="profile-webhook-url">Webhook 地址</Label>
                <UiTextField
                  id="profile-webhook-url"
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value);
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.webhookUrl;
                      return next;
                    });
                  }}
                  placeholder={placeholder}
                  errorMessage={errors.webhookUrl}
                />
              </div>
            )}

            {showWebhookUrl && (
              <UiButton
                variant="secondary"
                isPending={testingWebhook}
                onPress={() => void handleTestWebhook()}
                aria-label="测试 Webhook"
              >
                测试
              </UiButton>
            )}
          </section>

          {/* 底部按钮 */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex justify-end gap-2">
              <UiButton variant="secondary" onPress={() => openModal("changePassword")}>
                修改密码
              </UiButton>
              <UiButton
                variant="ghost"
                className="text-danger"
                onPress={() => setConfirmLogout(true)}
              >
                退出登录
              </UiButton>
            </div>
            <div className="flex justify-end gap-2">
              <UiButton variant="tertiary" onPress={closeModal}>
                取消
              </UiButton>
              <UiButton variant="primary" isPending={saving} onPress={() => void handleSave()}>
                保存更改
              </UiButton>
            </div>
          </div>
        </div>
      </UiModal>

      <UiConfirm
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="退出登录"
        description="确定要退出当前账号吗？"
        confirmText="退出"
        onConfirm={handleLogout}
      />
    </>
  );
}
