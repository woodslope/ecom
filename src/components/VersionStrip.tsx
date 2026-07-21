import { ImageOff } from "lucide-react";

import { isSlotVersionCurrent } from "../domain/generation/current-version";
import type { SlotVersionState } from "../domain/generation/types";
import type { PlannedSlot } from "../domain/planning/types";
import type { WorkbenchAsset } from "../store/workbench-store";

export function VersionStrip({
  state,
  slot,
  assets,
  planningInputSignature,
  disabled,
  onActivate,
}: {
  state: SlotVersionState;
  slot?: PlannedSlot;
  assets: WorkbenchAsset[];
  planningInputSignature?: string;
  disabled: boolean;
  onActivate: (versionId: string) => void;
}) {
  return (
    <div className="version-strip" aria-label="图片版本">
      {state.versions.map((version, index) => {
        const asset = assets.find((candidate) => candidate.metadata.id === version.assetId);
        const active = version.id === state.activeVersionId;
        const current = !slot || isSlotVersionCurrent(slot, version, planningInputSignature);
        return (
          <button
            type="button"
            className={`version-tile${active ? " version-tile--active" : ""}`}
            key={version.id}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onActivate(version.id)}
          >
            <span className="version-tile__media">
              {asset ? (
                <img src={asset.objectUrl} alt={`版本 ${index + 1}`} />
              ) : (
                <ImageOff size={17} aria-label={`版本 ${index + 1} 图片缺失`} />
              )}
            </span>
            <span className="version-tile__label">
              <strong>V{index + 1}</strong>
              <span>
                {active
                  ? current
                    ? "当前版本"
                    : "旧草稿版本"
                  : version.source === "demo"
                    ? "Demo"
                    : "API"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
