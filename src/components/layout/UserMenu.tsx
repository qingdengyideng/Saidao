"use client";

import { useState } from "react";
import { User, KeyRound, LogOut, Settings } from "lucide-react";
import { Dropdown } from "@heroui/react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import { UiAvatar } from "@/components/ui/UiAvatar";
import { UiConfirm } from "@/components/ui/UiConfirm";

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const openModal = useUiStore((s) => s.openModal);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!user) return null;

  return (
    <>
      <Dropdown>
        <Dropdown.Trigger>
          <UiAvatar name={user.name} src={user.avatar ?? undefined} className="cursor-pointer" />
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "profile") openModal("profile");
              if (key === "chatFilter") openModal("chatFilter");
              if (key === "password") openModal("changePassword");
              if (key === "logout") setConfirmLogout(true);
            }}
          >
            <Dropdown.Item id="profile" textValue="个人资料">
              <User size={16} aria-hidden="true" />
              <span>个人资料</span>
            </Dropdown.Item>
            <Dropdown.Item id="chatFilter" textValue="聊天过滤设置">
              <Settings size={16} aria-hidden="true" />
              <span>聊天过滤设置</span>
            </Dropdown.Item>
            <Dropdown.Item id="password" textValue="修改密码">
              <KeyRound size={16} aria-hidden="true" />
              <span>修改密码</span>
            </Dropdown.Item>
            <Dropdown.Item id="logout" textValue="退出登录" variant="danger">
              <LogOut size={16} aria-hidden="true" />
              <span>退出登录</span>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <UiConfirm
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="退出登录"
        description="确定要退出当前账号吗？"
        confirmText="退出"
        onConfirm={() => {
          clearAuth();
          setConfirmLogout(false);
        }}
      />
    </>
  );
}
