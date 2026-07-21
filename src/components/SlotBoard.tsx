import { Check, FileImage, ImageOff } from "lucide-react";

import { currentSlotVersion } from "../domain/generation/current-version";
import type { SlotVersionState } from "../domain/generation/types";
import type { PlatformPlan } from "../domain/planning/types";
import type { PlatformRulePack, PlatformSlotGroup } from "../domain/platforms/types";
import { StatusChip } from "./ui";

const groupLabels: Record<PlatformSlotGroup, string> = {
  gallery: "头图",
  detail: "移动详情",
  listing: "Listing 图片",
  "a-plus": "A+ 模块",
};

function slotStatus(input: {
  hasCurrentVersion: boolean;
  versionCount: number;
  hasMissingEvidence: boolean;
}): { label: string; tone: "done" | "stale" | "missing" | "todo" } {
  if (input.hasCurrentVersion) return { label: "已完成", tone: "done" };
  if (input.versionCount > 0) return { label: "旧草稿", tone: "stale" };
  if (input.hasMissingEvidence) return { label: "待补资料", tone: "missing" };
  return { label: "待生成", tone: "todo" };
}

export function SlotBoard({
  rulePack,
  plan,
  selectedSlotKey,
  versionStates,
  planningInputSignature,
  disabled = false,
  onSelect,
}: {
  rulePack: PlatformRulePack;
  plan: PlatformPlan;
  selectedSlotKey?: string;
  versionStates?: Record<string, SlotVersionState>;
  planningInputSignature?: string;
  disabled?: boolean;
  onSelect: (slotKey: string) => void;
}) {
  const groups = Array.from(new Set(rulePack.slots.map((slot) => slot.group)));

  return (
    <div className="slot-board" aria-label="平台交付槽位">
      {groups.map((group) => (
        <section className="slot-group" key={group} aria-labelledby={`slot-group-${group}`}>
          <header className="slot-group__header">
            <div>
              <strong id={`slot-group-${group}`}>{groupLabels[group]}</strong>
              <span>{rulePack.slots.filter((slot) => slot.group === group).length} 个必需槽位</span>
            </div>
          </header>
          <div className="slot-list">
            {rulePack.slots
              .filter((rule) => rule.group === group)
              .map((rule) => {
                const slot = plan.slots.find((item) => item.slotKey === rule.key)!;
                const selected = rule.key === selectedSlotKey;
                const versionCount = versionStates?.[rule.key]?.versions.length ?? 0;
                const hasCurrentVersion = Boolean(
                  currentSlotVersion(slot, versionStates?.[rule.key], planningInputSignature),
                );
                const hasMissingEvidence = slot.evidence.some((item) => item.startsWith("待补资料"));
                const status = slotStatus({ hasCurrentVersion, versionCount, hasMissingEvidence });
                return (
                  <button
                    type="button"
                    className={[
                      "slot-card",
                      selected ? "slot-card--selected" : "",
                      `slot-card--${status.tone}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={rule.key}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => onSelect(rule.key)}
                  >
                    <span className="slot-card__media" aria-hidden="true">
                      {hasMissingEvidence ? (
                        <ImageOff size={18} />
                      ) : hasCurrentVersion ? (
                        <Check size={18} />
                      ) : (
                        <FileImage size={18} />
                      )}
                    </span>
                    <span className="slot-card__content">
                      <span className="slot-card__topline">
                        <strong>{rule.key}</strong>
                        <StatusChip
                          className={`slot-status slot-status--${status.tone}`}
                          tone={
                            status.tone === "done"
                              ? "success"
                              : status.tone === "missing" || status.tone === "stale"
                                ? "warning"
                                : "info"
                          }
                        >
                          {status.label}
                        </StatusChip>
                      </span>
                      <span className="slot-card__title">{rule.label}</span>
                      <span className="slot-card__meta">
                        {rule.dimensions.width} × {rule.dimensions.height} px
                        {versionCount > 0 ? ` · ${versionCount} 版` : ""}
                        {selected ? " · 当前" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
