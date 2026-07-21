import { useEffect, useState } from "react";
import { ChevronDown, CopyPlus, Download, RotateCcw, Smartphone } from "lucide-react";

import type { ProductionRunRecord } from "../domain/tasks";
import type { ProductionEvent } from "../domain/workspace/project-workspace";
import { ImageTools } from "./ImageTools";
import { TaobaoMobilePreview } from "./TaobaoMobilePreview";
import { Button, StatusChip } from "./ui";

const workflowLabels = { "amazon-listing": "Amazon Listing", "amazon-aplus": "Amazon A+", "taobao-product": "淘宝商品生产包", "taobao-detail": "淘宝商品生产包" } as const;
const statusLabels = { planned: "已策划", producing: "生产中", ready: "已完整", partial: "部分交付", failed: "失败", canceled: "已取消" } as const;
const eventLabels = { plan: "完成策划", generate: "生成图片", regenerate: "重新生成", edit: "局部编辑", export: "导出交付" } as const;

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

export function ProductionRunCard({ record, expanded, current, assetUrls, busy, onToggle, onResume, onFork, onReuse, onExport }: {
  record: ProductionRunRecord;
  expanded: boolean;
  current: boolean;
  assetUrls: Record<string, string>;
  busy?: boolean;
  onToggle: () => void;
  onResume: () => void;
  onFork: () => void;
  onReuse: (eventId: string) => void;
  onExport?: () => void;
}) {
  const { project, run } = record;
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!expanded) setPreviewOpen(false);
  }, [expanded]);
  const outputs = run.events.filter(outputEvent);
  const lastEvent = run.events.at(-1);
  return (
    <article className={`production-run-card${current ? " production-run-card--current" : ""}`}>
      <button type="button" className="production-run-card__summary" aria-expanded={expanded} onClick={onToggle}>
        <span><strong>{project.name}</strong><em>{workflowLabels[run.workflowId]}</em></span>
        <span className="production-run-card__chips"><StatusChip tone={run.status === "ready" ? "success" : run.status === "failed" ? "warning" : "info"}>{statusLabels[run.status]}</StatusChip><StatusChip tone="neutral">{run.source === "api" ? "API" : "Demo"}</StatusChip>{current ? <StatusChip tone="success">当前任务</StatusChip> : null}</span>
        <span className="production-run-card__meta"><code>{run.id}</code><time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString("zh-CN")}</time></span>
        <ChevronDown size={17} className={expanded ? "production-run-card__chevron--open" : ""} aria-hidden="true" />
      </button>
      {expanded ? <div className="production-run-card__body">
        <div className="production-run-card__actions">
          {current ? <Button size="compact" disabled={busy} onClick={onResume}><RotateCcw size={14} />继续当前任务</Button> : <Button variant="secondary" size="compact" disabled={busy} onClick={onFork}><CopyPlus size={14} />基于此记录新建</Button>}
          {run.platformId === "taobao" && run.planningInputSignatureSnapshot && run.slotVersionsSnapshot ? <Button variant="secondary" size="compact" disabled={busy} onClick={() => setPreviewOpen(true)}><Smartphone size={14} />手机预览</Button> : null}
          {onExport && outputs.length > 0 ? <Button variant="secondary" size="compact" disabled={busy} onClick={onExport}><Download size={14} />重新导出</Button> : null}
        </div>
        <div className="production-run-card__facts"><span>{run.planSnapshot.slots.length} 个槽位</span><span>{outputs.length} 张输出</span><span>最近：{lastEvent ? eventLabels[lastEvent.kind] : "无事件"}</span></div>
        <ol className="production-run-events">
          {[...run.events].reverse().map((event) => <li key={event.id} className={`production-run-event production-run-event--${event.status}`}>
            {event.assetId && assetUrls[event.assetId] ? <img src={assetUrls[event.assetId]} alt={`${event.slotKey ?? "历史"} 输出缩略图`} /> : <span className="production-run-event__marker" />}
            <span><strong>{eventLabels[event.kind]}{event.slotKey ? ` · ${event.slotKey}` : ""}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("zh-CN")}</time>{event.artifactFileName ? <code>{event.artifactFileName}</code> : null}</span>
            {outputEvent(event) && assetUrls[event.assetId!] ? (
              <ImageTools
                fileName={`${run.platformId}-${event.slotKey}-${event.versionId ?? "output"}.png`}
                editingSupported={false}
                editingDisabledReason="历史快照不可直接改写；请先继续当前任务或基于此记录新建。"
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
    </article>
  );
}
