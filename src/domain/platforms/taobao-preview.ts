import { currentSlotVersion } from "../generation/current-version";
import type { SlotVersion, SlotVersionState } from "../generation/types";
import type { PlatformPlan } from "../planning/types";
import { taobaoRulePack } from "./taobao";

export interface TaobaoPreviewItem {
  slotKey: string;
  label: string;
  order: number;
  width: number;
  height: number;
  assetId?: string;
  objectUrl?: string;
  version?: SlotVersion;
  missing: boolean;
}

export interface TaobaoPreviewModel {
  source: "session" | "run";
  sourceId: string;
  gallery: TaobaoPreviewItem[];
  details: TaobaoPreviewItem[];
  missingSlots: string[];
  completedCount: number;
  ready: boolean;
}

export function createTaobaoPreviewModel(input: {
  source: TaobaoPreviewModel["source"];
  sourceId: string;
  plan: PlatformPlan;
  planningInputSignature?: string;
  slotVersions?: Record<string, SlotVersionState>;
  assetUrls: Record<string, string>;
}): TaobaoPreviewModel {
  if (input.plan.platformId !== "taobao") {
    throw new Error("淘宝手机预览只能读取淘宝商品生产包快照");
  }

  const items = taobaoRulePack.slots.map((rule): TaobaoPreviewItem => {
    const plannedSlot = input.plan.slots.find((slot) => slot.slotKey === rule.key);
    if (!plannedSlot) throw new Error(`淘宝预览缺少固定槽位：${rule.key}`);
    const version = currentSlotVersion(
      plannedSlot,
      input.slotVersions?.[rule.key],
      input.planningInputSignature,
    );
    const objectUrl = version ? input.assetUrls[version.assetId] : undefined;
    return {
      slotKey: rule.key,
      label: rule.label,
      order: rule.order,
      width: rule.dimensions.width,
      height: rule.dimensions.height,
      ...(version && objectUrl
        ? {
            assetId: version.assetId,
            objectUrl,
            version,
          }
        : {}),
      missing: !version || !objectUrl,
    };
  });
  const missingSlots = items.filter((item) => item.missing).map((item) => item.slotKey);

  return {
    source: input.source,
    sourceId: input.sourceId,
    gallery: items.slice(0, 5),
    details: items.slice(5),
    missingSlots,
    completedCount: items.length - missingSlots.length,
    ready: missingSlots.length === 0,
  };
}
