import { ArrowRight, Database, FileText, FolderOpen, MoreHorizontal, PackageOpen, RotateCcw } from "lucide-react";
import { useRef } from "react";

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
  onSyncToPlatform,
  syncingToPlatform = false,
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
  /** e.g. Amazon → Taobao: shown when a plan exists on the source platform. */
  onSyncToPlatform?: () => void;
  syncingToPlatform?: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
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
  const hasMoreActions = Boolean(onOpenLibrary || onSyncToPlatform);
  const closeMenuAndRun = (action?: () => void) => {
    menuRef.current?.removeAttribute("open");
    action?.();
  };

  return (
    <section
      className={`product-context-bar${hasSourceControls ? " product-context-bar--with-source" : ""}`}
      aria-label={`${platformLabel} ${hasSourceControls ? "商品与任务来源" : "当前商品"}`}
    >
      <span className="product-context-bar__icon" aria-hidden="true">
        {isManualTask ? <FileText size={17} /> : <PackageOpen size={17} />}
      </span>
      <button
        type="button"
        className="product-context-bar__identity"
        aria-label={detailLabel && onOpenDetails ? detailLabel : undefined}
        title={detailLabel && onOpenDetails ? detailLabel : detailText}
        disabled={!detailLabel || !onOpenDetails || disabled}
        onClick={detailLabel && onOpenDetails ? onOpenDetails : undefined}
      >
        <span>{identityLabel}</span>
        <strong title={productLabel}>{productLabel}</strong>
        <em title={detailText}>{detailText}</em>
      </button>
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
        {onSwitchProduct ? (
          <IconButton
            className="product-context-bar__switch"
            label={project ? "切换商品" : "选择商品"}
            disabled={disabled}
            onClick={onSwitchProduct}
          >
            <PackageOpen size={14} />
          </IconButton>
        ) : null}
        {hasMoreActions ? (
          <details ref={menuRef} className="product-context-bar__menu">
            <summary aria-label="更多商品操作" title="更多商品操作">
              <MoreHorizontal size={16} aria-hidden="true" />
            </summary>
            <div className="product-context-bar__menu-popover" role="menu">
              {detailLabel && onOpenDetails ? (
                <Button
                  role="menuitem"
                  variant="quiet"
                  size="compact"
                  disabled={disabled}
                  onClick={() => closeMenuAndRun(onOpenDetails)}
                >
                  <Database size={14} />
                  {detailLabel}
                </Button>
              ) : null}
              {onOpenLibrary ? (
                <Button
                  role="menuitem"
                  variant="quiet"
                  size="compact"
                  disabled={disabled}
                  onClick={() => closeMenuAndRun(onOpenLibrary)}
                >
                  <FolderOpen size={14} />
                  管理资料
                </Button>
              ) : null}
              {onSyncToPlatform && project ? (
                <Button
                  role="menuitem"
                  variant="quiet"
                  size="compact"
                  disabled={disabled || syncingToPlatform}
                  onClick={() => closeMenuAndRun(onSyncToPlatform)}
                >
                  <ArrowRight size={14} />
                  {syncingToPlatform
                    ? "同步中…"
                    : `同步到${platformLabel === "Amazon" ? "淘宝 / 天猫" : "Amazon"}`}
                </Button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
