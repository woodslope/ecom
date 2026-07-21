import { Archive, LoaderCircle, PackageCheck, X } from "lucide-react";

import { Button, IconButton, StatusChip, StatusMessage } from "./ui";

/**
 * Delivery strip — UI_STYLE_GUIDE §4:
 * - Hidden before first usable output (caller responsibility).
 * - Single-line by default; only expands for error / recovery.
 * - Does not compete with the main workbench columns for height.
 */
export function ExportPanel({
  platformLabel,
  completedSlots,
  totalSlots,
  exporting,
  error,
  disabled = false,
  disabledReason,
  onExport,
  onClearError,
  compact = false,
}: {
  platformLabel: string;
  completedSlots: number;
  totalSlots: number;
  exporting: boolean;
  error?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onExport: () => void;
  onClearError: () => void;
  compact?: boolean;
}) {
  const missingCount = Math.max(0, totalSlots - completedSlots);
  const ready = totalSlots > 0 && missingCount === 0;
  const title = ready
    ? "交付包已完整"
    : missingCount > 0
      ? `${completedSlots}/${totalSlots} 已生成 · 缺 ${missingCount}`
      : "等待生成结果";
  const detail = ready
    ? "含当前活动版本、manifest 与 Prompt"
    : "可导出已有活动版本（非历史全量）";
  const buttonLabel = exporting
    ? "正在打包..."
    : ready
      ? "导出完整交付包"
      : "导出当前结果";

  return (
    <section
      className={`export-panel${compact ? " export-panel--compact" : ""}${error ? " export-panel--error" : ""}`}
      aria-label={`${platformLabel} 导出交付包`}
    >
      <div className="export-panel__summary">
        <span className={`export-panel__icon ${ready ? "export-panel__icon--ready" : ""}`}>
          {ready ? <PackageCheck size={compact ? 15 : 18} /> : <Archive size={compact ? 15 : 18} />}
        </span>
        <span className="export-panel__copy">
          <strong>{title}</strong>
          {!compact ? <span>{detail}</span> : null}
        </span>
        <StatusChip tone={ready ? "success" : "warning"}>
          {ready ? "可完整交付" : "部分可导出"}
        </StatusChip>
      </div>
      <Button
        variant={ready ? "primary" : "secondary"}
        size={compact ? "compact" : "normal"}
        disabled={disabled || exporting || totalSlots === 0}
        onClick={onExport}
        title={disabledReason || detail}
      >
        {exporting ? <LoaderCircle className="spin" size={15} /> : <Archive size={15} />}
        {buttonLabel}
      </Button>
      {error ? (
        <StatusMessage tone="danger" className="export-panel__error">
          <span>{error}</span>
          <IconButton label="关闭导出提示" onClick={onClearError}>
            <X size={14} />
          </IconButton>
        </StatusMessage>
      ) : null}
      {!compact && disabledReason ? (
        <span className="export-panel__disabled-reason">{disabledReason}</span>
      ) : null}
    </section>
  );
}
