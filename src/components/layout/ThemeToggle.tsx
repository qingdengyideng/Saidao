"use client";

import { Sun, Moon } from "lucide-react";
import { useUiStore } from "@/stores/useUiStore";
import { UiIconButton } from "@/components/ui/UiIconButton";

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const toggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <UiIconButton
      icon={theme === "dark" ? Sun : Moon}
      aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      onPress={toggle}
    />
  );
}
