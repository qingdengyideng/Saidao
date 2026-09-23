"use client";

import { Alert, Button } from "@heroui/react";

export default function PlayerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>加载失败</Alert.Title>
            <Alert.Description>
              {error.message || "发生未知错误，请稍后重试"}
              {error.digest ? `（${error.digest}）` : ""}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <Button size="sm" variant="danger" onPress={reset} className="mt-4 w-full">
          重试
        </Button>
      </div>
    </div>
  );
}
