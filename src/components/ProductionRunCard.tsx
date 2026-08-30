import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, CopyPlus, Download, ImageOff, Smartphone, Trash2 } from "lucide-react";

import { selectRunOutputPreviews } from "../domain/history/run-output-preview";
import type { ProductionRunRecord } from "../domain/tasks";
import type { ProductionEvent } from "../domain/workspace/project-workspace";
import { AmazonMobilePreview } from "./AmazonMobilePreview";
import { TaobaoMobilePreview } from "./TaobaoMobilePreview";
import { Button, StatusChip } from "./ui";

const workflowLabels = { "amazon-listing": "Amazon Listing", "amazon-aplus": "Amazon A+", "taobao-product": "淘宝商品生产包", "taobao-detail": "淘宝商品生产包" } as const;
const statusLabels = { planned: "已策划", producing: "生产中", ready: "已完整", partial: "部分交付", failed: "失败", canceled: "已取消" } as const;
const RUN_GALLERY_LIMIT = 6;

function outputEvent(event: ProductionEvent): boolean {
  return Boolean(event.assetId && event.slotKey && event.status === "success");
}

export function ProductionRunCard({ record, current, assetUrls, busy, compact = false, onRequestPreviewAssets, onResume, onFork, onExport, onDeposit, onDelete }: {
  record: ProductionRunRecord;
  current: boolean;
  assetUrls: Record<string, string>;
  busy?: boolean;
  compact?: boolean;
  onRequestPreviewAssets?: (assetIds: readonly string[]) => void;
  onResume: () => void;
  onFork: () => void;
  onExport?: () => void;
  onDeposit?: () => void;
  onDelete?: () => void;
}) {
  const { project, run } = record;
  const cardRef = useRef<HTMLElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const outputEvents = run.events.filter(outputEvent);
  const previewOutputs = selectRunOutputPreviews(run);
  const previewBySlot = new Map(previewOutputs.map((event) => [event.slotKey, event]));
  const visibleSlots = run.planSnapshot.slots.slice(0, RUN_GALLERY_LIMIT);
  const visiblePreviewAssetIds = visibleSlots.flatMap((slot) => {
    const assetId = previewBySlot.get(slot.slotKey)?.assetId;
    return assetId ? [assetId] : [];
  });
  const visiblePreviewAssetKey = visiblePreviewAssetIds.join("|");
  const hiddenPreviewCount = Math.max(0, run.planSnapshot.slots.length - visibleSlots.length);
  const canPreview = Boolean(
    run.planningInputSignatureSnapshot &&
      run.slotVersionsSnapshot &&
      (run.platformId === "taobao" || run.platformId === "amazon"),
  );
  const manual = run.contextSnapshot.planningInput?.sourceMode === "manual" ||
    (!run.contextSnapshot.planningInput && project.scope === "task-draft");
  useEffect(() => {
    if (!onRequestPreviewAssets || visiblePreviewAssetIds.every((id) => assetUrls[id])) return;
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      onRequestPreviewAssets(visiblePreviewAssetIds);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      onRequestPreviewAssets(visiblePreviewAssetIds);
      observer.disconnect();
    }, { rootMargin: "240px 0px" });
    observer.observe(card);
    return () => observer.disconnect();
  }, [assetUrls, onRequestPreviewAssets, visiblePreviewAssetKey]);
  return (
    <article ref={cardRef} className={`production-run-card${current ? " production-run-card--current" : ""}`}>
      <header className="production-run-card__header">
        <div className="production-run-card__identity">
          <strong>{project.name}</strong>
        </div>
        <div className="production-run-card__eyeline">
          <time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString("zh-CN")}</time>
          <em>{workflowLabels[run.workflowId]}</em>
          <StatusChip tone={run.status === "ready" ? "success" : run.status === "failed" ? "warning" : "info"}>{statusLabels[run.status]}</StatusChip>
          {!compact ? <StatusChip tone="neutral">API</StatusChip> : null}
          {current ? <StatusChip tone="success">当前任务</StatusChip> : null}
        </div>
      </header>

      <div className="production-run-card__results">
        {visibleSlots.length > 0 ? (
          <div className="production-run-card__gallery" role="list" aria-label={`${project.name} 生成结果`}>
            {visibleSlots.map((slot) => {
              const event = previewBySlot.get(slot.slotKey);
              const imageUrl = event ? assetUrls[event.assetId] : undefined;
              return (
                <figure className="production-run-card__thumbnail" role="listitem" key={slot.slotKey}>
                  <span className="production-run-card__thumbnail-media">
                    {imageUrl ? (
                      <img src={imageUrl} alt={`${slot.slotKey} 历史生成结果`} loading="lazy" />
                    ) : (
                      <span
                        className="production-run-card__thumbnail-placeholder"
                        aria-label={event ? `${slot.slotKey} 图片正在载入` : `${slot.slotKey} 尚未生成`}
                      >
                        <ImageOff size={18} />
                      </span>
                    )}
                  </span>
                </figure>
              );
            })}
            {hiddenPreviewCount > 0 ? (
              <div className="production-run-card__thumbnail production-run-card__thumbnail--more" role="listitem" aria-label={`还有 ${hiddenPreviewCount} 张结果`}>
                <span className="production-run-card__thumbnail-media">
                  <strong>+{hiddenPreviewCount}</strong>
                  <small>更多</small>
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="production-run-card__gallery-empty">
            <ImageOff size={18} />
            <span>尚无生成结果</span>
          </div>
        )}

        <div className="production-run-card__actions">
          <Button variant="secondary" size="compact" disabled={busy} onClick={onResume}>
            <CopyPlus size={14} />继续任务
          </Button>
          {!compact && manual && onDeposit ? <Button variant="secondary" size="compact" disabled={busy} onClick={onDeposit}><ArchiveRestore size={14} />保存商品</Button> : null}
          {canPreview ? <Button variant="secondary" size="compact" disabled={busy} onClick={() => setPreviewOpen(true)}><Smartphone size={14} />手机预览</Button> : null}
          {!current && onDelete ? <Button variant="danger" size="compact" disabled={busy} onClick={onDelete}><Trash2 size={14} />删除任务</Button> : null}
          {!compact && onExport && outputEvents.length > 0 ? <Button variant="secondary" size="compact" disabled={busy} onClick={onExport}><Download size={14} />重新导出</Button> : null}
        </div>

        <div className="production-run-card__facts">
          {!compact ? <span>{run.planSnapshot.slots.length} 个槽位</span> : null}
          {!compact ? <span>{previewOutputs.length} 张结果</span> : null}
          {!compact ? <span>{manual ? "当前任务填写" : "已保存任务资料"}</span> : null}
          {!compact && !manual ? <span>来源商品：{record.sourceProject?.name ?? "已删除商品"}</span> : null}
          {!compact && run.deposit ? <span>已保存：{new Date(run.deposit.depositedAt).toLocaleString("zh-CN")}</span> : null}
        </div>
      </div>

      {run.platformId === "taobao" && run.planningInputSignatureSnapshot && run.slotVersionsSnapshot ? (
        <TaobaoMobilePreview
          open={previewOpen}
          title={run.contextSnapshot.taobaoAnalysis?.suggestedProductName || project.facts.productName}
          source="run"
          sourceId={run.id}
          plan={run.planSnapshot}
          planningInputSignature={run.planningInputSignatureSnapshot}
          slotVersions={run.slotVersionsSnapshot}
          assetUrls={assetUrls}
          exporting={busy}
          onExport={onExport}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
      {run.platformId === "amazon" && run.planningInputSignatureSnapshot && run.slotVersionsSnapshot ? (
        <AmazonMobilePreview
          open={previewOpen}
          title={project.facts.productName}
          source="run"
          sourceId={run.id}
          plan={run.planSnapshot}
          planningInputSignature={run.planningInputSignatureSnapshot}
          slotVersions={run.slotVersionsSnapshot}
          assetUrls={assetUrls}
          exporting={busy}
          onExport={onExport}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </article>
  );
}
