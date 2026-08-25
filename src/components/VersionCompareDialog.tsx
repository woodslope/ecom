import { useState } from "react";
import { Columns3, ImageOff, X } from "lucide-react";

import type { SlotVersion } from "../domain/generation/types";
import type { WorkbenchAsset } from "../store/workbench-store";
import { Button, Dialog, IconButton } from "./ui";

export function VersionCompareDialog({
  open,
  versions,
  assets,
  onClose,
}: {
  open: boolean;
  versions: SlotVersion[];
  assets: WorkbenchAsset[];
  onClose: () => void;
}) {
  const compareVersions = versions.slice(0, 4);
  if (compareVersions.length < 2) return null;

  return (
    <Dialog
      open={open}
      title={`版本对比（${compareVersions.length} 个版本）`}
      eyebrow="并排查看，选择最佳版本"
      className="version-compare-dialog"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div
        className={`version-compare-grid version-compare-grid--${compareVersions.length}`}
      >
        {compareVersions.map((version, i) => {
          const asset = assets.find((a) => a.metadata.id === version.assetId);
          return (
            <div key={version.id} className="version-compare-tile">
              <div className="version-compare-tile__header">
                <strong>V{i + 1}</strong>
                <span>
                  API
                </span>
              </div>
              <div className="version-compare-tile__media">
                {asset ? (
                  <img
                    src={asset.objectUrl}
                    alt={`版本 ${i + 1}`}
                  />
                ) : (
                  <div className="version-compare-tile__placeholder">
                    <ImageOff size={32} />
                    <span>图片缺失</span>
                  </div>
                )}
              </div>
              <div className="version-compare-tile__meta">
                <span>{asset?.metadata.name ?? "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
