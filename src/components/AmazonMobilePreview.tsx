import { useEffect, useMemo, useState } from "react";
import { Archive, Download, ImageOff, Smartphone } from "lucide-react";

import type { SlotVersionState } from "../domain/generation/types";
import type { PlatformPlan } from "../domain/planning/types";
import {
  createAmazonPreviewModel,
  type AmazonPreviewItem,
} from "../domain/platforms/amazon-preview";
import { Button, Dialog, IconButton, MediaSlot, StatusChip, StatusMessage } from "./ui";

function extensionFor(item: AmazonPreviewItem): string {
  if (item.version?.mimeType === "image/svg+xml") return "svg";
  if (item.version?.mimeType === "image/jpeg") return "jpg";
  if (item.version?.mimeType === "image/webp") return "webp";
  return "png";
}

function downloadItem(item: AmazonPreviewItem, mode: "listing" | "aplus"): void {
  if (!item.objectUrl) return;
  const anchor = document.createElement("a");
  anchor.href = item.objectUrl;
  anchor.download = `amazon-${mode}-${String(item.order).padStart(2, "0")}-${item.slotKey}.${extensionFor(item)}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function AmazonMobilePreview({
  open,
  title,
  source,
  sourceId,
  plan,
  planningInputSignature,
  slotVersions,
  assetUrls,
  exporting = false,
  onExport,
  onClose,
}: {
  open: boolean;
  title: string;
  source: "session" | "run";
  sourceId: string;
  plan: PlatformPlan;
  planningInputSignature?: string;
  slotVersions?: Record<string, SlotVersionState>;
  assetUrls: Record<string, string>;
  exporting?: boolean;
  onExport?: () => void;
  onClose: () => void;
}) {
  const model = useMemo(() => createAmazonPreviewModel({
    source,
    sourceId,
    plan,
    planningInputSignature,
    slotVersions,
    assetUrls,
  }), [assetUrls, plan, planningInputSignature, slotVersions, source, sourceId]);
  const defaultListingKey = model.items.find((item) => !item.missing)?.slotKey ?? model.items[0]?.slotKey ?? "";
  const [selectedListingKey, setSelectedListingKey] = useState(defaultListingKey);

  useEffect(() => {
    if (open) setSelectedListingKey(defaultListingKey);
  }, [defaultListingKey, open, sourceId]);

  const selectedListing = model.items.find((item) => item.slotKey === selectedListingKey) ?? model.items[0];
  const modeLabel = model.mode === "listing" ? "Listing" : "A+";
  const modeCountLabel = model.mode === "listing" ? "张图片" : "个模块";

  return (
    <Dialog
      open={open}
      title="Amazon 手机内容预览"
      eyebrow={source === "run" ? `历史快照 · ${modeLabel}` : `当前任务 · ${modeLabel}`}
      className="amazon-preview-dialog"
      onClose={onClose}
      footer={
        <>
          <span className="amazon-preview-dialog__footer-status">
            <StatusChip tone={model.ready ? "success" : "warning"}>
              {model.ready
                ? `${model.items.length}/${model.items.length} 可完整交付`
                : `${model.completedCount}/${model.items.length} 已生成`}
            </StatusChip>
          </span>
          {onExport ? (
            <Button disabled={exporting || model.completedCount === 0} onClick={onExport}>
              <Archive size={15} />
              {exporting
                ? "正在打包..."
                : source === "run"
                  ? "重新导出历史记录"
                  : model.ready
                    ? "导出完整交付包"
                    : "导出当前结果"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="amazon-preview-layout">
        <aside className="amazon-preview-meta">
          <div>
            <Smartphone size={18} aria-hidden="true" />
            <strong>{title}</strong>
          </div>
          {model.missingSlots.length > 0 ? (
            <div className="amazon-preview-meta__readiness">
              <StatusMessage tone="warning" className="amazon-preview-meta__summary">
                <strong>还需完成 {model.missingSlots.length} 个槽位</strong>
                <span>{modeLabel} 还缺 {model.missingSlots.length} {modeCountLabel}</span>
              </StatusMessage>
              <details className="amazon-preview-meta__details">
                <summary>查看槽位明细</summary>
                <span>{model.missingSlots.join("、")}</span>
              </details>
            </div>
          ) : (
            <StatusMessage tone="success">当前 {modeLabel} 内容已完整。</StatusMessage>
          )}
        </aside>

        <div
          className="amazon-phone-preview"
          aria-label={model.mode === "listing" ? "Amazon Listing 手机内容" : "Amazon A+ 手机内容"}
        >
          <header className="amazon-phone-preview__bar">
            <span>{modeLabel}</span>
            <strong>{title}</strong>
          </header>
          <div className="amazon-phone-preview__scroll">
            {model.mode === "listing" ? (
              <>
                {selectedListing ? (
                  <div className="amazon-phone-preview__listing-hero" data-slot-key={selectedListing.slotKey}>
                    <MediaSlot
                      aspectRatio="1 / 1"
                      state={selectedListing.missing ? "empty" : "ready"}
                      src={selectedListing.objectUrl}
                      alt={`${selectedListing.label}预览`}
                    />
                    {!selectedListing.missing ? (
                      <IconButton
                        label={`下载 ${selectedListing.slotKey}`}
                        onClick={() => downloadItem(selectedListing, model.mode)}
                      >
                        <Download size={15} />
                      </IconButton>
                    ) : null}
                  </div>
                ) : null}
                <div className="amazon-phone-preview__thumbs" aria-label="Listing 图片切换">
                  {model.items.map((item) => (
                    <button
                      type="button"
                      key={item.slotKey}
                      className={item.slotKey === selectedListing?.slotKey ? "amazon-phone-preview__thumb--selected" : ""}
                      aria-label={`查看 ${item.slotKey} ${item.label}`}
                      aria-pressed={item.slotKey === selectedListing?.slotKey}
                      onClick={() => setSelectedListingKey(item.slotKey)}
                    >
                      {item.objectUrl ? <img src={item.objectUrl} alt="" /> : <ImageOff size={15} />}
                      <span>{item.order}</span>
                    </button>
                  ))}
                </div>
                <section className="amazon-phone-preview__product-copy">
                  <strong>{title}</strong>
                  <span>图片序列</span>
                </section>
              </>
            ) : (
              <div className="amazon-phone-preview__aplus">
                {model.items.map((item) => (
                  <article key={item.slotKey} data-slot-key={item.slotKey}>
                    <header>
                      <span>{item.slotKey} · {item.label}</span>
                      {!item.missing ? (
                        <IconButton label={`下载 ${item.slotKey}`} onClick={() => downloadItem(item, model.mode)}>
                          <Download size={14} />
                        </IconButton>
                      ) : null}
                    </header>
                    <MediaSlot
                      aspectRatio={`${item.width} / ${item.height}`}
                      state={item.missing ? "empty" : "ready"}
                      src={item.objectUrl}
                      alt={`${item.label}预览`}
                    />
                    {item.externalText ? (
                      <div className="amazon-phone-preview__external-copy">
                        {item.externalText.title ? <strong>{item.externalText.title}</strong> : null}
                        {item.externalText.body ? <p>{item.externalText.body}</p> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
