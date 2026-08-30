import {
  ArrowRight,
  Bot,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { useId } from "react";

import { getPlatformRulePack } from "../domain/platforms/registry";
import type { PlatformId } from "../domain/platforms/types";
import { Button, IconButton, OperationStatus, StatusMessage, Toast } from "./ui";

export interface GenerationTarget {
  platformId: PlatformId;
  slotKey: string;
}

export function compactGenerationError(message: string): string {
  if (/API 设置不可用|未配置图片 API|无法连接图片 API/.test(message)) {
    return "图片 API 不可用，请检查设置。";
  }
  const withoutVersionNote = message.replace(/已有版本未受影响。?$/, "").trim();
  if (withoutVersionNote.length <= 32) return withoutVersionNote;
  return `${withoutVersionNote.slice(0, 31)}…`;
}

export function GenerationTaskStatus({
  target,
  canceling = false,
  onCancel,
}: {
  target: GenerationTarget;
  canceling?: boolean;
  onCancel: () => void;
}) {
  const owner = `${getPlatformRulePack(target.platformId).label} · ${target.slotKey}`;

  return (
    <Toast
      live="polite"
      loading
      className="operation-status"
      data-testid="generation-operation-status"
      actions={(
        <Button variant="secondary" size="compact" disabled={canceling} onClick={onCancel}>
          {canceling ? <LoaderCircle className="spin" size={15} /> : <Square size={15} />}
          {canceling ? "正在取消..." : "取消生成"}
        </Button>
      )}
    >
      <span className="operation-status__copy">
        <span className="operation-status__icon">
          <LoaderCircle className="spin" size={16} />
        </span>
        <span className="operation-status__text">
          <strong className="operation-status__title">
            {owner} {canceling ? "正在取消生成" : "正在生成"}
          </strong>
          <span className="operation-status__description">
            {canceling
              ? "正在回滚未完成写入并清理临时素材，请稍候。"
              : "已有版本保持可用；其他槽位请先等待或取消。"}
          </span>
        </span>
      </span>
    </Toast>
  );
}

export function CopilotTaskStatus({
  target,
  onCancel,
}: {
  target: GenerationTarget;
  onCancel: () => void;
}) {
  const owner = `${getPlatformRulePack(target.platformId).label} · ${target.slotKey}`;

  return (
    <OperationStatus
      live="polite"
      data-testid="copilot-operation-status"
      icon={<Bot size={16} />}
      title={`${owner} Copilot 请求处理中`}
      description="请求仅作用于目标槽位；其他任务请先等待或取消。"
      actions={(
        <Button variant="secondary" size="compact" onClick={onCancel}>
          <Square size={15} />
          取消 Copilot
        </Button>
      )}
    />
  );
}

export function GenerationFailureStatus({
  target,
  message,
  onOpen,
  onClear,
}: {
  target: GenerationTarget;
  message: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const owner = `${getPlatformRulePack(target.platformId).label} · ${target.slotKey}`;

  return (
    <OperationStatus
      tone="danger"
      live="assertive"
      data-testid="generation-failure-status"
      icon={<CircleAlert size={16} />}
      title={`${owner} 生成未完成`}
      description={message}
      actions={(
        <>
        <Button variant="secondary" size="compact" onClick={onOpen}>
          查看槽位
          <ArrowRight size={15} />
        </Button>
        <IconButton label="关闭生成提示" onClick={onClear}>
          <X size={15} />
        </IconButton>
        </>
      )}
    />
  );
}

export function GenerationActions({
  hasVersion,
  generating,
  disabled = false,
  disabledReason,
  errorMessage,
  variant = "primary",
  onGenerate,
}: {
  hasVersion: boolean;
  generating: boolean;
  disabled?: boolean;
  disabledReason?: string;
  errorMessage?: string;
  variant?: "primary" | "secondary";
  onGenerate: () => void;
}) {
  const disabledReasonId = useId();
  return (
    <div className="generation-actions">
      <div className="generation-actions__primary">
        {errorMessage ? (
          <StatusMessage
            tone="danger"
            live="assertive"
            appearance="inline"
            className="generation-actions__error"
            title={errorMessage}
          >
            {compactGenerationError(errorMessage)}
          </StatusMessage>
        ) : null}
        <Button
          variant={variant}
          size="compact"
          disabled={generating || disabled}
          aria-describedby={disabledReason ? disabledReasonId : undefined}
          onClick={onGenerate}
        >
          {generating ? (
            <LoaderCircle className="spin" size={15} />
          ) : hasVersion ? (
            <RotateCcw size={15} />
          ) : (
            <ImagePlus size={15} />
          )}
          {generating ? "正在生成..." : hasVersion ? "重新生成" : "生成图片"}
        </Button>
      </div>
      {disabledReason ? (
        <StatusMessage id={disabledReasonId} className="generation-actions__hint" live="off">
          {disabledReason}
        </StatusMessage>
      ) : null}
    </div>
  );
}
