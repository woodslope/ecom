import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, ChevronDown, CopyPlus, Download, ImageOff, RotateCcw, Smartphone } from "lucide-react";

import { selectRunOutputPreviews } from "../domain/history/run-output-preview";
import type { ProductionRunRecord } from "../domain/tasks";
import type { ProductionEvent } from "../domain/workspace/project-workspace";
import { AmazonMobilePreview } from "./AmazonMobilePreview";
import { ImageTools } from "./ImageTools";
import { TaobaoMobilePreview } from "./TaobaoMobilePreview";
import { Button, StatusChip } from "./ui";

const workflowLabels = { "amazon-listing": "Amazon Listing", "amazon-aplus": "Amazon A+", "taobao-product": "淘宝商品生产包", "taobao-detail": "淘宝商品生产包" } as const;
const statusLabels = { planned: "已策划", producing: "生产中", ready: "已完整", partial: "部分交付", failed: "失败", canceled: "已取消" } as const;
const eventLabels = { plan: "完成策划", generate: "生成图片", regenerate: "重新生成", edit: "局部编辑", export: "导出交付" } as const;
const RUN_GALLERY_LIMIT = 6;

function outputEvent(event: ProductionEvent): boolean {
  return Boolean(event.assetId && event.slotKey && event.status === "success");
}

function downloadOutput(url: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function ProductionRunCard({ record, expanded, current, assetUrls, busy, onRequestPreviewAssets, onToggle, onResume, onFork, onReuse, onExport, onDeposit }: {
  record: ProductionRunRecord;
  expanded: boolean;
  current: boolean;
  assetUrls: Record<string, string>;
  busy?: boolean;
  onRequestPreviewAssets?: (assetIds: readonly string[]) => void;
  onToggle: () => void;
  onResume: () => void;
  onFork: () => void;
  onReuse: (eventId: string) => void;
  onExport?: () => void;
  onDeposit?: () => void;
}) {
  const { project, run } = record;
  const cardRef = useRef<HTMLElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!expanded) setPreviewOpen(false);
  }, [expanded]);
  const outputEvents = run.events.filter(outputEvent);
  const previewOutputs = selectRunOutputPreviews(run);
  const visiblePreviews = previewOutputs.slice(0, RUN_GALLERY_LIMIT);
  const visiblePreviewAssetIds = visiblePreviews.map((event) => event.assetId);
  const visiblePreviewAssetKey = visiblePreviewAssetIds.join("|");
  const hiddenPreviewCount = Math.max(0, previewOutputs.length - visiblePreviews.length);
  const lastEvent = run.events.at(-1);
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
          <span className="production-run-card__eyeline">
            <time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString("zh-CN")}</time>
            <em>{workflowLabels[run.workflowId]}</em>
          </span>
          <strong>{project.name}</strong>
        </div>
        <div className="production-run-card__chips">
          <StatusChip tone={run.status === "ready" ? "success" : run.status === "failed" ? "warning" : "info"}>{statusLabels[run.status]}</StatusChip>
          <StatusChip tone="neutral">{previewOutputs.length} 张</StatusChip>
          <StatusChip tone="neutral">{run.source === "api" ? "API" : "Demo"}</StatusChip>
          {current ? <StatusChip tone="success">当前任务</StatusChip> : null}
        </div>
      </header>

      <div className="production-run-card__results">
        {visiblePreviews.length > 0 ? (
          <div className="production-run-card__gallery" role="list" aria-label={`${project.name} 生成结果`}>
            {visiblePreviews.map((event) => (
              <figure className="production-run-card__thumbnail" role="listitem" key={event.id}>
                <span className="production-run-card__thumbnail-media">
                  {assetUrls[event.assetId] ? (
                    <img src={assetUrls[event.assetId]} alt={`${event.slotKey} 历史生成结果`} loading="lazy" />
                  ) : (
                    <span className="production-run-card__thumbnail-placeholder" aria-label={`${event.slotKey} 图片正在载入`}>
                      <ImageOff size={18} />
                    </span>
                  )}
                </span>
                <figcaption>{event.slotKey}</figcaption>
              </figure>
            ))}
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
          {current ? <Button size="compact" disabled={busy} onClick={onResume}><RotateCcw size={14} />继续任务</Button> : <Button variant="secondary" size="compact" disabled={busy} onClick={onFork}><CopyPlus size={14} />基于记录新建</Button>}
          {manual && onDeposit ? <Button variant="secondary" size="compact" disabled={busy} onClick={onDeposit}><ArchiveRestore size={14} />保存到资料库</Button> : null}
          {canPreview ? <Button variant="secondary" size="compact" disabled={busy} onClick={() => setPreviewOpen(true)}><Smartphone size={14} />手机预览</Button> : null}
          {onExport && outputEvents.length > 0 ? <Button variant="secondary" size="compact" disabled={busy} onClick={onExport}><Download size={14} />重新导出</Button> : null}
          <Button variant="quiet" size="compact" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? "收起详情" : "查看详情"}
            <ChevronDown size={15} className={expanded ? "production-run-card__chevron--open" : ""} aria-hidden="true" />
          </Button>
        </div>

        <div className="production-run-card__facts">
          <span>{run.planSnapshot.slots.length} 个槽位</span>
          <span>{previewOutputs.length} 张结果</span>
          <span>最近：{lastEvent ? eventLabels[lastEvent.kind] : "无事件"}</span>
          <span>{manual ? "手动来源" : "资料库来源"}</span>
          {!manual ? <span>来源商品：{record.sourceProject?.name ?? "已删除商品"}</span> : null}
          {run.deposit ? <span>已保存：{new Date(run.deposit.depositedAt).toLocaleString("zh-CN")}</span> : null}
        </div>
      </div>

      {expanded ? <div className="production-run-card__details">
        <div className="production-run-card__details-heading">
          <strong>运行详情</strong>
          <code>{run.id}</code>
        </div>
        <ol className="production-run-events">
          {[...run.events].reverse().map((event) => <li key={event.id} className={`production-run-event production-run-event--${event.status}`}>
            {event.assetId && assetUrls[event.assetId] ? <img src={assetUrls[event.assetId]} alt={`${event.slotKey ?? "历史"} 输出缩略图`} /> : <span className="production-run-event__marker" />}
            <span><strong>{eventLabels[event.kind]}{event.slotKey ? ` · ${event.slotKey}` : ""}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("zh-CN")}</time>{event.artifactFileName ? <code>{event.artifactFileName}</code> : null}</span>
            {outputEvent(event) && assetUrls[event.assetId!] ? (
              <ImageTools
                fileName={`${run.platformId}-${event.slotKey}-${event.versionId ?? "output"}.png`}
                editingSupported={false}
                editingDisabledReason="历史快照不可直接改写；请先继续任务或基于记录新建。"
                showEditingHint={false}
                busy={busy}
                onDownload={() => downloadOutput(
                  assetUrls[event.assetId!]!,
                  `${run.platformId}-${event.slotKey}-${event.versionId ?? "output"}.png`,
                )}
                onUseAsReference={() => onReuse(event.id)}
                onEdit={() => undefined}
              />
            ) : null}
          </li>)}
        </ol>
      </div> : null}
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
