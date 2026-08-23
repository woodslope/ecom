import { currentSlotVersion } from "../generation/current-version";
import type { SlotVersion, SlotVersionState } from "../generation/types";
import type { PlatformPlan } from "../planning/types";
import { resolveRulePackForPlan } from "./resolve-rule-pack";

export type AmazonPreviewMode = "listing" | "aplus";

export interface AmazonPreviewItem {
  slotKey: string;
  label: string;
  order: number;
  width: number;
  height: number;
  externalText?: {
    title?: string;
    body?: string;
  };
  assetId?: string;
  objectUrl?: string;
  version?: SlotVersion;
  missing: boolean;
}

export interface AmazonPreviewModel {
  source: "session" | "run";
  sourceId: string;
  mode: AmazonPreviewMode;
  items: AmazonPreviewItem[];
  missingSlots: string[];
  completedCount: number;
  ready: boolean;
}

function previewMode(plan: PlatformPlan): AmazonPreviewMode {
  return plan.amazonSession?.plannerMode === "aplus" ? "aplus" : "listing";
}

function cleanExternalText(externalText: AmazonPreviewItem["externalText"]): AmazonPreviewItem["externalText"] {
  const title = externalText?.title?.trim();
  const body = externalText?.body?.trim();
  if (!title && !body) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
  };
}

export function createAmazonPreviewModel(input: {
  source: AmazonPreviewModel["source"];
  sourceId: string;
  plan: PlatformPlan;
  planningInputSignature?: string;
  slotVersions?: Record<string, SlotVersionState>;
  assetUrls: Record<string, string>;
}): AmazonPreviewModel {
  if (input.plan.platformId !== "amazon") {
    throw new Error("Amazon 手机预览只能读取 Amazon 生产包快照");
  }

  const mode = previewMode(input.plan);
  const rules = resolveRulePackForPlan("amazon", input.plan).slots.filter((rule) =>
    mode === "aplus" ? rule.group === "a-plus" : rule.group === "listing",
  );
  const items = rules.map((rule): AmazonPreviewItem => {
    const plannedSlot = input.plan.slots.find((slot) => slot.slotKey === rule.key);
    const version = plannedSlot
      ? currentSlotVersion(
          plannedSlot,
          input.slotVersions?.[rule.key],
          input.planningInputSignature,
        )
      : undefined;
    const objectUrl = version ? input.assetUrls[version.assetId] : undefined;
    const externalText = cleanExternalText(plannedSlot?.externalText);

    return {
      slotKey: rule.key,
      label: rule.uiLabel ?? rule.label,
      order: rule.order,
      width: rule.dimensions.width,
      height: rule.dimensions.height,
      ...(externalText ? { externalText } : {}),
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
    mode,
    items,
    missingSlots,
    completedCount: items.length - missingSlots.length,
    ready: missingSlots.length === 0,
  };
}
