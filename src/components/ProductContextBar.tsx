import { Database, FileText, FolderOpen, PackageOpen, RotateCcw } from "lucide-react";

import type { ProductIntakeSourceMode } from "../domain/projects/product-source-text";
import type { ProductProject } from "../domain/projects/types";
import { Button, IconButton, SegmentedControl, StatusChip } from "./ui";

const sourceOptions = [
  { value: "library", label: "从资料库选择" },
  { value: "manual", label: "手动填写" },
] as const;

export function ProductContextBar({
  platformLabel,
  project,
  statusLabel,
  statusTone = "neutral",
  detailLabel,
  disabled = false,
  sourceMode,
  onSourceModeChange,
  onReloadSource,
  reloadSourceDisabled = false,
  onOpenDetails,
  onSwitchProduct,
  onOpenLibrary,
}: {
  platformLabel: string;
  project: ProductProject | null;
  statusLabel: string;
  statusTone?: "neutral" | "info" | "success" | "warning" | "danger" | "mode";
  detailLabel?: string;
  disabled?: boolean;
  sourceMode?: ProductIntakeSourceMode;
  onSourceModeChange?: (mode: ProductIntakeSourceMode) => void;
  onReloadSource?: () => void;
  reloadSourceDisabled?: boolean;
  onOpenDetails?: () => void;
  onSwitchProduct?: () => void;
  onOpenLibrary?: () => void;
}) {
  const hasSourceControls = Boolean(sourceMode && onSourceModeChange);
  const isManualTask = sourceMode === "manual";
  const identityLabel = isManualTask ? "本次任务" : "当前商品";
  const productLabel = isManualTask
    ? "手动填写"
    : project?.facts.productName || project?.name || "未绑定商品档案";
  const detailText = isManualTask
    ? "未绑定商品档案"
    : project
      ? `档案：${project.name}`
      : `${platformLabel} 临时任务`;

  return (
    <section
      className={`product-context-bar${hasSourceControls ? " product-context-bar--with-source" : ""}`}
      aria-label={`${platformLabel} ${hasSourceControls ? "商品与任务来源" : "当前商品"}`}
    >
      <span className="product-context-bar__icon" aria-hidden="true">
        {isManualTask ? <FileText size={17} /> : <PackageOpen size={17} />}
      </span>
      <div className="product-context-bar__identity">
        <span>{identityLabel}</span>
        <strong title={productLabel}>{productLabel}</strong>
        <em title={detailText}>{detailText}</em>
      </div>
      <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
      <div className="product-context-bar__actions">
        {sourceMode && onSourceModeChange ? (
          <SegmentedControl
            className="product-context-bar__source-switch"
            ariaLabel="商品资料来源"
            value={sourceMode}
            disabled={disabled}
            options={sourceOptions}
            onChange={onSourceModeChange}
          />
        ) : null}
        {sourceMode === "library" && onReloadSource ? (
          <IconButton
            className="product-context-bar__reload"
            label="重新载入资料库内容"
            disabled={disabled || reloadSourceDisabled}
            onClick={onReloadSource}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </IconButton>
        ) : null}
        {detailLabel && onOpenDetails ? (
          <Button variant="secondary" size="compact" disabled={disabled} onClick={onOpenDetails}>
            <Database size={14} />
            {detailLabel}
          </Button>
        ) : null}
        {onSwitchProduct ? (
          <Button variant="secondary" size="compact" disabled={disabled} onClick={onSwitchProduct}>
            <PackageOpen size={14} />
            {project ? "切换商品" : "选择商品"}
          </Button>
        ) : null}
        {onOpenLibrary ? (
          <Button variant="quiet" size="compact" disabled={disabled} onClick={onOpenLibrary}>
            <FolderOpen size={14} />
            管理资料
          </Button>
        ) : null}
      </div>
    </section>
  );
}
