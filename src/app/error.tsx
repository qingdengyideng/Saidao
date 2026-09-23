"use client";

import { Alert, Button } from "@heroui/react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Alert status="danger" className="max-w-md">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>页面出错了</Alert.Title>
          <Alert.Description>
            {error.message || "未知错误"}
            {error.digest ? `（${error.digest}）` : ""}
          </Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="danger" onPress={reset} className="mt-4">
          重试
        </Button>
      </Alert>
    </main>
  );
}
