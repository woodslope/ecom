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

import { getPlatformRulePack } from "../domain/platforms/registry";
import type { PlatformId } from "../domain/platforms/types";
import type { RuntimeMode } from "../domain/settings";
import { Button, IconButton, StatusChip, StatusMessage } from "./ui";

export interface GenerationTarget {
  platformId: PlatformId;
  slotKey: string;
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
    <StatusMessage className="generation-task-status">
      <span className="generation-task-status__copy">
        <LoaderCircle className="spin" size={16} />
        <span>
          <strong>{owner} {canceling ? "正在取消生成" : "正在生成"}</strong>
          <span>
            {canceling
              ? "正在回滚未完成写入并清理临时素材，请稍候。"
              : "已有版本保持可用；其他槽位请先等待或取消。"}
          </span>
        </span>
      </span>
      <Button variant="secondary" size="compact" disabled={canceling} onClick={onCancel}>
        {canceling ? <LoaderCircle className="spin" size={15} /> : <Square size={15} />}
        {canceling ? "正在取消..." : "取消生成"}
      </Button>
    </StatusMessage>
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
    <StatusMessage className="generation-task-status copilot-task-status">
      <span className="generation-task-status__copy">
        <Bot size={16} />
        <span>
          <strong>{owner} Copilot 请求处理中</strong>
          <span>请求仅作用于目标槽位；其他任务请先等待或取消。</span>
        </span>
      </span>
      <Button variant="secondary" size="compact" onClick={onCancel}>
        <Square size={15} />
        取消 Copilot
      </Button>
    </StatusMessage>
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
    <StatusMessage tone="danger" className="generation-task-status generation-task-status--error">
      <span className="generation-task-status__copy">
        <CircleAlert size={16} />
        <span>
          <strong>{owner} 生成未完成</strong>
          <span>{message}</span>
        </span>
      </span>
      <span className="generation-task-status__actions">
        <Button variant="secondary" size="compact" onClick={onOpen}>
          查看槽位
          <ArrowRight size={15} />
        </Button>
        <IconButton label="关闭生成提示" onClick={onClear}>
          <X size={15} />
        </IconButton>
      </span>
    </StatusMessage>
  );
}

export function GenerationActions({
  hasVersion,
  generating,
  runtimeMode = "demo",
  disabled = false,
  disabledReason,
  variant = "primary",
  onGenerate,
}: {
  hasVersion: boolean;
  generating: boolean;
  runtimeMode?: RuntimeMode;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary";
  onGenerate: () => void;
}) {
  return (
    <div className="generation-actions">
      <div className="generation-actions__primary">
        <StatusChip tone="mode">
          {runtimeMode === "api" ? "API 图片生成" : "本地 Demo mock"}
        </StatusChip>
        <Button
          variant={variant}
          size="compact"
          disabled={generating || disabled}
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
        <StatusMessage className="generation-actions__hint">{disabledReason}</StatusMessage>
      ) : null}
    </div>
  );
}
