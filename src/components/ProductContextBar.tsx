import { FileText } from "lucide-react";

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
}: {
  platformLabel: string;
  project: ProductProject | null;
  statusLabel: string;
  statusTone?: "neutral" | "info" | "success" | "warning" | "danger" | "mode";
  detailLabel?: string;
  disabled?: boolean;
  onOpenDetails?: () => void;
}) {
  const taskName = project?.facts.productName || project?.name || "未命名任务";
  const identityContent = (
    <>
      <span>当前任务</span>
      <strong title={taskName}>{taskName}</strong>
    </>
  );

  return (
    <section className="product-context-bar" aria-label={`${platformLabel}当前任务`}>
      <span className="product-context-bar__icon" aria-hidden="true">
        <FileText size={17} />
      </span>
      {detailLabel && onOpenDetails ? (
        <Button
          type="button"
          className="product-context-bar__identity"
          variant="quiet"
          aria-label={`${taskName}，${detailLabel}`}
          title={`${taskName}：${detailLabel}`}
          disabled={disabled}
          onClick={onOpenDetails}
        >
          {identityContent}
        </Button>
      ) : (
        <div className="product-context-bar__identity" title={taskName}>
          {identityContent}
        </div>
      )}
      <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
    </section>
  );
}
