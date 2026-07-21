import { useEffect, useMemo, useState } from "react";
import { Archive, Download, ImageOff, Smartphone } from "lucide-react";

import type { SlotVersionState } from "../domain/generation/types";
import type { PlatformPlan } from "../domain/planning/types";
import {
  createTaobaoPreviewModel,
  type TaobaoPreviewItem,
} from "../domain/platforms/taobao-preview";
import { Button, Dialog, IconButton, MediaSlot, StatusChip, StatusMessage } from "./ui";

function extensionFor(item: TaobaoPreviewItem): string {
  if (item.version?.mimeType === "image/svg+xml") return "svg";
  if (item.version?.mimeType === "image/jpeg") return "jpg";
  if (item.version?.mimeType === "image/webp") return "webp";
  return "png";
}

function downloadItem(item: TaobaoPreviewItem): void {
  if (!item.objectUrl) return;
  const anchor = document.createElement("a");
  anchor.href = item.objectUrl;
  anchor.download = `taobao-${String(item.order).padStart(2, "0")}-${item.slotKey}.${extensionFor(item)}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function TaobaoMobilePreview({
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
  const model = useMemo(() => createTaobaoPreviewModel({
    source,
    sourceId,
    plan,
    planningInputSignature,
    slotVersions,
    assetUrls,
  }), [assetUrls, plan, planningInputSignature, slotVersions, source, sourceId]);
  const defaultGalleryKey = model.gallery.find((item) => !item.missing)?.slotKey ?? model.gallery[0]?.slotKey ?? "";
  const [selectedGalleryKey, setSelectedGalleryKey] = useState(defaultGalleryKey);

  useEffect(() => {
    if (open) setSelectedGalleryKey(defaultGalleryKey);
  }, [defaultGalleryKey, open, sourceId]);

  const selectedGallery = model.gallery.find((item) => item.slotKey === selectedGalleryKey) ?? model.gallery[0];

  return (
    <Dialog
      open={open}
      title="淘宝手机商品页预览"
      eyebrow={source === "run" ? "历史快照" : "当前 session"}
      className="taobao-preview-dialog"
      onClose={onClose}
      footer={
        <>
          <span className="taobao-preview-dialog__footer-status">
            <StatusChip tone={model.ready ? "success" : "warning"}>
              {model.ready ? "12/12 可完整交付" : `${model.completedCount}/12 已生成`}
            </StatusChip>
          </span>
          {onExport ? (
            <Button disabled={exporting || model.completedCount === 0} onClick={onExport}>
              <Archive size={15} />
              {exporting ? "正在打包..." : source === "run" ? "重新导出历史记录" : model.ready ? "导出完整交付包" : "导出当前结果"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="taobao-preview-layout">
        <aside className="taobao-preview-meta">
          <div>
            <Smartphone size={18} aria-hidden="true" />
            <strong>{title}</strong>
          </div>
          <code>{sourceId}</code>
          {model.missingSlots.length > 0 ? (
            <StatusMessage tone="warning">
              缺少 {model.missingSlots.length} 个槽位：{model.missingSlots.join("、")}
            </StatusMessage>
          ) : (
            <StatusMessage tone="success">主图与详情图已完整。</StatusMessage>
          )}
        </aside>

        <div className="taobao-phone-preview" aria-label="淘宝手机商品页">
          <header className="taobao-phone-preview__bar">
            <span>商品</span>
            <strong>{title}</strong>
          </header>
          <div className="taobao-phone-preview__scroll">
            {selectedGallery ? (
              <div className="taobao-phone-preview__hero">
                <MediaSlot
                  aspectRatio="1 / 1"
                  state={selectedGallery.missing ? "empty" : "ready"}
                  src={selectedGallery.objectUrl}
                  alt={`${selectedGallery.label}预览`}
                />
                {!selectedGallery.missing ? (
                  <IconButton label={`下载 ${selectedGallery.slotKey}`} onClick={() => downloadItem(selectedGallery)}>
                    <Download size={15} />
                  </IconButton>
                ) : null}
              </div>
            ) : null}
            <div className="taobao-phone-preview__thumbs" aria-label="主图切换">
              {model.gallery.map((item) => (
                <button
                  type="button"
                  key={item.slotKey}
                  className={item.slotKey === selectedGallery?.slotKey ? "taobao-phone-preview__thumb--selected" : ""}
                  aria-label={`查看 ${item.slotKey} ${item.label}`}
                  aria-pressed={item.slotKey === selectedGallery?.slotKey}
                  onClick={() => setSelectedGalleryKey(item.slotKey)}
                >
                  {item.objectUrl ? <img src={item.objectUrl} alt="" /> : <ImageOff size={15} />}
                  <span>{item.order}</span>
                </button>
              ))}
            </div>
            <section className="taobao-phone-preview__product-copy">
              <strong>{title}</strong>
              <span>商品详情</span>
            </section>
            <div className="taobao-phone-preview__details">
              {model.details.map((item) => (
                <article key={item.slotKey} data-slot-key={item.slotKey}>
                  <header>
                    <span>{item.slotKey} · {item.label}</span>
                    {!item.missing ? (
                      <IconButton label={`下载 ${item.slotKey}`} onClick={() => downloadItem(item)}>
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
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
