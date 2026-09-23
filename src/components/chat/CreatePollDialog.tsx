"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Radio, RadioGroup, Switch, toast } from "@heroui/react";
import { UiModal } from "@/components/ui/UiModal";
import { UiButton } from "@/components/ui/UiButton";
import { UiTextField } from "@/components/ui/UiTextField";
import { UiIconButton } from "@/components/ui/UiIconButton";
import { createChatPollApi } from "@/api/polls";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUiStore } from "@/stores/useUiStore";
import type { CreateChatPollRequest } from "@/types/api/polls";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const DEFAULT_DURATION = 300;

const DURATION_OPTIONS = [
  { value: "300", label: "5 分钟" },
  { value: "600", label: "10 分钟" },
  { value: "1800", label: "30 分钟" },
] as const;

type DurationSeconds = CreateChatPollRequest["durationSeconds"];

const initialOptions = () => ["", ""];

/**
 * 创建掰头投票弹窗：问题 + 选项（2~8，可增删）+ 时长 + 多选/结果可见开关。
 * 打开状态由 useUiStore.activeModal === "createPoll" 控制，未登录不渲染。
 */
export function CreatePollDialog() {
  const status = useAuthStore((s) => s.status);
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(initialOptions);
  const [duration, setDuration] = useState<DurationSeconds>(DEFAULT_DURATION);
  const [multiple, setMultiple] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(true);
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);
  const [optionsError, setOptionsError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const isOpen = activeModal === "createPoll";
  if (status === "anonymous") return null;

  const setOptionValue = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const addOption = () => {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  };

  const removeOption = (index: number) => {
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((_, i) => i !== index) : prev));
  };

  const resetForm = () => {
    setQuestion("");
    setOptions(initialOptions());
    setDuration(DEFAULT_DURATION);
    setMultiple(false);
    setResultsVisible(true);
    setQuestionError(undefined);
    setOptionsError(undefined);
  };

  const handleClose = () => {
    resetForm();
    closeModal();
  };

  const handleSubmit = async () => {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim());
    if (!trimmedQuestion) {
      setQuestionError("请输入问题");
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS || trimmedOptions.some((o) => !o)) {
      setOptionsError(`至少需要 ${MIN_OPTIONS} 个选项，且每个选项不能为空`);
      return;
    }

    setQuestionError(undefined);
    setOptionsError(undefined);
    setSubmitting(true);
    try {
      await createChatPollApi({
        question: trimmedQuestion,
        options: trimmedOptions,
        durationSeconds: duration,
        multiple,
        resultsVisible,
      });
      toast("投票已创建", { variant: "success" });
      handleClose();
    } catch {
      toast("创建失败，请稍后重试", { variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UiModal isOpen={isOpen} onClose={handleClose} title="创建投票">
      <div className="flex flex-col gap-5" aria-live="polite">
        <section className="flex flex-col gap-1">
          <label htmlFor="poll-question" className="text-sm font-medium">
            问题
          </label>
          <UiTextField
            id="poll-question"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setQuestionError(undefined);
            }}
            placeholder="例如：今天谁赢了？"
            maxLength={100}
            errorMessage={questionError}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">选项</h3>
          <ul className="flex flex-col gap-2">
            {options.map((value, index) => (
              <li key={index} className="flex items-center gap-2">
                <UiTextField
                  aria-label={`选项 ${index + 1}`}
                  value={value}
                  onChange={(e) => {
                    setOptionValue(index, e.target.value);
                    setOptionsError(undefined);
                  }}
                  placeholder={`选项 ${index + 1}`}
                  maxLength={20}
                  className="flex-1"
                />
                <UiIconButton
                  icon={X}
                  aria-label={`删除选项 ${index + 1}`}
                  onPress={() => removeOption(index)}
                  isDisabled={options.length <= MIN_OPTIONS}
                />
              </li>
            ))}
          </ul>
          {optionsError && (
            <p className="text-xs text-danger" aria-live="polite">
              {optionsError}
            </p>
          )}
          {options.length < MAX_OPTIONS && (
            <UiButton variant="secondary" onPress={addOption} aria-label="添加选项">
              <Plus size={14} aria-hidden="true" />
              添加选项
            </UiButton>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">时长</h3>
          <RadioGroup
            value={String(duration)}
            onChange={(v) => setDuration(Number(v) as DurationSeconds)}
          >
            {DURATION_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <Radio value={opt.value} />
                <Radio.Content>{opt.label}</Radio.Content>
              </label>
            ))}
          </RadioGroup>
        </section>

        <section className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch isSelected={multiple} onChange={setMultiple} />
            <span>允许多选</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch isSelected={resultsVisible} onChange={setResultsVisible} />
            <span>结束后显示结果</span>
          </label>
        </section>

        <div className="flex justify-end gap-2 border-t pt-4">
          <UiButton variant="tertiary" onPress={handleClose}>
            取消
          </UiButton>
          <UiButton variant="primary" isPending={submitting} onPress={() => void handleSubmit()}>
            创建
          </UiButton>
        </div>
      </div>
    </UiModal>
  );
}
