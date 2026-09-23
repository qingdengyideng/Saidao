"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Swords } from "lucide-react";
import { Alert, Button, Tooltip, toast } from "@heroui/react";
import useSWR from "swr";
import { chatPollsApi, voteChatPollApi } from "@/api/polls";
import { UiButton } from "@/components/ui/UiButton";
import { UiSkeleton } from "@/components/ui/UiSkeleton";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import type { ChatPolls as ChatPollsData, Poll } from "@/types/api/polls";

/**
 * 聊天掰头（投票）覆盖层：当前 poll 红蓝对战条 + 倒计时（serverTime 校准）
 * + 创建入口（每日 1 次/注册>3 天，disabled + Tooltip 说明原因）+ 历史折叠。
 *
 * HeroUI 无"对战条"组件，此处用原生元素 + Tailwind 原子类实现（规则 9），
 * 颜色走 --danger（红方）/ --accent（蓝方）HeroUI 语义色 token。
 */
export function ChatPolls() {
  const status = useAuthStore((s) => s.status);
  const openModal = useUiStore((s) => s.openModal);
  const isLoggedIn = status === "authenticated";

  // 游客态禁用请求（key 传 null）
  const { data, error, isLoading, mutate } = useSWR<ChatPollsData>(
    isLoggedIn ? "chat-polls" : null,
    () => chatPollsApi(),
    { refreshInterval: 30000 },
  );

  const [votePending, setVotePending] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);

  const poll = data?.current ?? null;
  const recent = data?.recent ?? [];

  // serverTime 校准本地时钟差：服务器时间 - 本地时间
  const serverTimeMs = data ? new Date(data.serverTime).getTime() : 0;
  const timeOffset = useMemo(() => (data ? serverTimeMs - Date.now() : 0), [serverTimeMs, data]);

  const handleVote = useCallback(
    async (optionIndex: number) => {
      if (!poll || votePending) return;
      setVotePending(true);
      try {
        await voteChatPollApi(poll.id, [optionIndex]);
        void mutate();
      } catch {
        toast("投票失败，请稍后重试", { variant: "danger" });
      } finally {
        setVotePending(false);
      }
    },
    [poll, votePending, mutate],
  );

  // loading 骨架
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 border-t border-border p-3">
        <UiSkeleton heightClass="h-4 w-2/3" />
        <UiSkeleton heightClass="h-12 w-full" />
        <UiSkeleton heightClass="h-4 w-1/2" />
      </div>
    );
  }

  // 错误态
  if (error) {
    return (
      <div className="border-t border-border p-3">
        <Alert status="danger" aria-live="polite">
          掰头加载失败，网络异常，请检查网络后重试
        </Alert>
        <UiButton variant="tertiary" className="mt-2" onPress={() => void mutate()}>
          重试
        </UiButton>
      </div>
    );
  }

  // 数据就绪
  return (
    <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto border-t border-border p-3 overscroll-contain">
      {/* 当前投票区 */}
      {poll && (
        <CurrentPoll
          poll={poll}
          timeOffset={timeOffset}
          votePending={votePending}
          onVote={handleVote}
        />
      )}

      {/* 无当前投票时：空态 */}
      {!poll && (
        <div className="flex items-center gap-2 py-2 text-sm text-muted">
          <Swords size={16} aria-hidden="true" />
          当前没有进行中的掰头
        </div>
      )}

      {/* 创建按钮区 */}
      <CreatePollButton
        canCreate={data?.canCreate ?? false}
        onPress={() => openModal("createPoll")}
      />

      {/* 历史投票区 */}
      {recent.length > 0 && (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setRecentOpen((v) => !v)}
            aria-expanded={recentOpen}
            aria-controls="chat-polls-recent"
            className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform ${recentOpen ? "rotate-180" : ""}`}
            />
            历史投票 ({recent.length})
          </button>
          {recentOpen && (
            <ul id="chat-polls-recent" className="mt-2 flex flex-col gap-1" role="list">
              {recent.map((p) => (
                <RecentPollItem key={p.id} poll={p} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 当前投票：question + 红蓝对战条 + 倒计时 + 投票/已投票 */
function CurrentPoll({
  poll,
  timeOffset,
  votePending,
  onVote,
}: {
  poll: Poll;
  timeOffset: number;
  votePending: boolean;
  onVote: (optionIndex: number) => void;
}) {
  // 1s tick 隔离在此子组件，避免重渲染整个 ChatPolls
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const c0 = poll.counts[0] ?? 0;
  const c1 = poll.counts[1] ?? 0;
  const total = c0 + c1;
  const pct0 = total > 0 ? (c0 / total) * 100 : 50;
  const pct1 = total > 0 ? (c1 / total) * 100 : 50;

  const endsAtMs = new Date(poll.endsAt).getTime();
  const remainingMs = endsAtMs - (now + timeOffset);
  const ended = remainingMs <= 0;
  const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const countdownLabel = ended ? "已结束" : `${mm}:${ss}`;

  const hasVoted = poll.myOptions.length > 0;
  const showButtons = poll.active && !hasVoted;

  return (
    <div className="flex flex-col gap-2">
      {/* question */}
      <p className="text-base font-medium">{poll.question}</p>

      {/* 对战条：左红右蓝，中间 VS */}
      <div
        className="flex items-stretch gap-1"
        role="img"
        aria-label={`选项0 ${c0} 票，选项1 ${c1} 票`}
      >
        <div
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 text-white transition-shadow ${
            poll.myOptions.includes(0) ? "ring-2 ring-white/80" : ""
          }`}
          style={{
            background:
              "linear-gradient(135deg, var(--danger) 0%, color-mix(in oklab, var(--danger) 70%, black) 100%)",
          }}
        >
          <span className="w-full truncate text-center text-sm font-medium">{poll.options[0]}</span>
          <span className="tabular-nums text-xs opacity-90">{c0} 票</span>
        </div>
        <div className="flex items-center justify-center" aria-hidden="true">
          <span className="text-xs font-bold text-muted">VS</span>
        </div>
        <div
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 text-white transition-shadow ${
            poll.myOptions.includes(1) ? "ring-2 ring-white/80" : ""
          }`}
          style={{
            background:
              "linear-gradient(135deg, var(--accent) 0%, color-mix(in oklab, var(--accent) 70%, black) 100%)",
          }}
        >
          <span className="w-full truncate text-center text-sm font-medium">{poll.options[1]}</span>
          <span className="tabular-nums text-xs opacity-90">{c1} 票</span>
        </div>
      </div>

      {/* 比例条：红蓝两段，宽度按 counts 比例 */}
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`红 ${c0} 票 占 ${Math.round(pct0)}%，蓝 ${c1} 票 占 ${Math.round(pct1)}%`}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct0}%`, background: "var(--danger)" }}
        />
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct1}%`, background: "var(--accent)" }}
        />
      </div>

      {/* 倒计时 + 总投票数 */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="tabular-nums font-medium" aria-label={`剩余时间 ${countdownLabel}`}>
          {countdownLabel}
        </span>
        <span>{poll.totalVoters} 人参与</span>
      </div>

      {/* 投票按钮 / 已投票标记 */}
      {showButtons && (
        <div className="flex gap-2">
          <UiButton
            variant="danger"
            className="flex-1"
            isPending={votePending}
            isDisabled={votePending}
            onPress={() => void onVote(0)}
          >
            {poll.options[0]}
          </UiButton>
          <UiButton
            variant="secondary"
            className="flex-1"
            isPending={votePending}
            isDisabled={votePending}
            onPress={() => void onVote(1)}
          >
            {poll.options[1]}
          </UiButton>
        </div>
      )}
      {hasVoted && (
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <CheckCircle2 size={16} aria-hidden="true" className="text-accent" />
          已投票
        </div>
      )}
    </div>
  );
}

/** 创建掰头按钮：canCreate → 可点；否则 disabled + Tooltip 说明原因 */
function CreatePollButton({ canCreate, onPress }: { canCreate: boolean; onPress: () => void }) {
  if (canCreate) {
    return (
      <UiButton variant="secondary" fullWidth onPress={onPress}>
        <Swords size={14} aria-hidden="true" className="me-1" />
        创建掰头
      </UiButton>
    );
  }
  // disabled 按钮不触发 hover/focus 事件，用 div 包裹以承载 Tooltip 触发
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <div className="w-full">
          <Button variant="secondary" fullWidth isDisabled>
            <Swords size={14} aria-hidden="true" className="me-1" />
            创建掰头
          </Button>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>创建受限：每日仅可创建 1 次，且需注册满 3 天</Tooltip.Content>
    </Tooltip>
  );
}

/** 历史投票单行：question 截断 + 总票数 + 已结束标记 */
function RecentPollItem({ poll }: { poll: Poll }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{poll.question}</span>
      <span className="tabular-nums shrink-0 text-xs text-muted">{poll.totalVoters} 票</span>
      <span className="shrink-0 text-xs text-muted" aria-label="已结束">
        已结束
      </span>
    </li>
  );
}
