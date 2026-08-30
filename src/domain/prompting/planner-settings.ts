import type { AmazonPlanningRequestOptions } from "../planning/types";
import type { PlatformRulePack } from "../platforms/types";
import type { PlannerTaskSettings } from "./types";

/**
 * Resolve the task-level variables consumed by the planner prompt.
 * The effective rule pack remains the source of slot and policy rules; this
 * object makes the user-selected run settings explicit and JSON-safe.
 */
export function createPlannerTaskSettings(
  rulePack: PlatformRulePack,
  options: AmazonPlanningRequestOptions | undefined,
  resolvedStylePresetId?: string | null,
  selectedReferenceAssetIds: readonly string[] = [],
): PlannerTaskSettings {
  if (rulePack.platformId === "amazon") {
    const plannerMode = options?.plannerMode ?? "legacy-combined";
    return {
      platformId: "amazon",
      workflowId: plannerMode === "aplus" ? "amazon-aplus" : "amazon-listing",
      locale: rulePack.locale,
      selectedReferenceAssetIds: [...selectedReferenceAssetIds],
      ...(options ?? {}),
      plannerMode,
      ...(resolvedStylePresetId !== undefined
        ? { stylePresetId: resolvedStylePresetId }
        : {}),
    };
  }

  return {
    platformId: "taobao",
    workflowId: "taobao-product",
    locale: rulePack.locale,
    selectedReferenceAssetIds: [...selectedReferenceAssetIds],
    ...(resolvedStylePresetId !== undefined
      ? { stylePresetId: resolvedStylePresetId }
      : options?.stylePresetId !== undefined
        ? { stylePresetId: options.stylePresetId }
        : {}),
  };
}
