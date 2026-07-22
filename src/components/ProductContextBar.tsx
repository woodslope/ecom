import { Database, FolderOpen, PackageOpen } from "lucide-react";

import type { ProductProject } from "../domain/projects/types";
import { Button, StatusChip } from "./ui";

export function ProductContextBar({
  platformLabel,
  project,
  statusLabel,
  statusTone = "neutral",
  detailLabel,
  disabled = false,
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
  onOpenDetails?: () => void;
  onSwitchProduct?: () => void;
  onOpenLibrary?: () => void;
}) {
  const productLabel = project?.facts.productName || project?.name || "未绑定商品档案";

  return (
    <section className="product-context-bar" aria-label={`${platformLabel} 当前商品`}>
      <span className="product-context-bar__icon" aria-hidden="true">
        <PackageOpen size={17} />
      </span>
      <div className="product-context-bar__identity">
        <span>当前商品</span>
        <strong title={productLabel}>{productLabel}</strong>
        <em title={project?.name}>{project ? `档案：${project.name}` : `${platformLabel} 临时任务`}</em>
      </div>
      <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
      <div className="product-context-bar__actions">
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
