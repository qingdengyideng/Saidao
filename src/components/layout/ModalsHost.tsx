"use client";

import { LoginModal } from "@/components/account/LoginModal";
import { UserDetailModal } from "@/components/account/UserDetailModal";
import { ProfileModal } from "@/components/account/ProfileModal";
import { ChangePasswordModal } from "@/components/account/ChangePasswordModal";
import { AllocationCaptchaModal } from "@/components/account/AllocationCaptchaModal";
import { TagEditorModal } from "@/components/account/TagEditorModal";
import { CreatePollDialog } from "@/components/chat/CreatePollDialog";
import { ChatFilterModal } from "@/components/chat/ChatFilterModal";
import { useUiStore } from "@/stores/useUiStore";

/**
 * 统一挂载所有全局弹窗。
 *
 * 大多数 Modal 组件内部自行读取 useUiStore.activeModal 判断显隐，
 * 此处只需渲染所有组件即可。
 *
 * ChatFilterModal 例外：它通过 props（isOpen / onOpenChange）控制显隐，
 * 由本组件从 useUiStore.activeModal 派生并传入。
 *
 * 注意：AllocationResultModal 是 Modal 内容体（非完整 Modal），
 * 需要 user prop，已内嵌在 AllocationCaptchaModal 中，不在此单独挂载。
 */
export function ModalsHost() {
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  return (
    <>
      <LoginModal />
      <UserDetailModal />
      <ProfileModal />
      <ChangePasswordModal />
      <AllocationCaptchaModal />
      <TagEditorModal />
      <CreatePollDialog />
      <ChatFilterModal
        isOpen={activeModal === "chatFilter"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      />
    </>
  );
}
