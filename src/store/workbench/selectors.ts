import type { PlatformId } from "../../domain/platforms/types";
import type { PlatformPlan } from "../../domain/planning/types";
import { isPlanningInputCurrent } from "../../domain/planning/input-signature";
import { resolveAmazonPlanningSession } from "../../domain/platforms/amazon-catalog";
import { resolveSessionEffectiveFacts } from "../../domain/workspace/effective-facts";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
  PlatformWorkflowId,
  ProjectWorkspaceDocument,
} from "../../domain/workspace/project-workspace";
import type { WorkbenchState } from "./types";

export function hasCurrentPlanningInputs(state: WorkbenchState, platformId: PlatformId): boolean {
  const plan = state.plans[platformId];
  if (!plan) return false;
  const workflowId = workflowForPlan(platformId, plan);
  const planningSession = [...state.sessions]
    .filter((session) =>
      session.projectId === state.activeProject?.id && session.workflowId === workflowId
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const planningFacts = state.activeProject
    ? resolveSessionEffectiveFacts(state.activeProject, planningSession)
    : undefined;
  if (!planningFacts || !planningSession) return false;
  const savedSignature = state.planInputSignatures[platformId];
  const assets = state.assets.map((asset) => asset.metadata);
  const contextualCurrent = isPlanningInputCurrent(
    savedSignature,
    planningFacts,
    assets,
    planningSession.selectedReferenceAssetIds,
    {
      workflowId: planningSession.workflowId,
      industryTemplate: planningSession.industryTemplate,
      sessionOptions: planningSession.options,
    },
  );
  // Legacy sessions created before contextual signatures remain readable.
  // Once a custom industry template is selected, the contextual signature is mandatory.
  return contextualCurrent || (!planningSession.industryTemplate && isPlanningInputCurrent(
    savedSignature,
    planningFacts,
    assets,
    planningSession.selectedReferenceAssetIds,
  ));
}

export function selectedKeysFor(document: ProjectWorkspaceDocument): Partial<Record<PlatformId, string>> {
  const selectedSlotKeys = { ...document.selectedSlotKeys };
  for (const [platformId, plan] of Object.entries(document.plans) as [PlatformId, PlatformPlan | undefined][]) {
    if (!plan) continue;
    const selected = selectedSlotKeys[platformId];
    if (!selected || !plan.slots.some((slot) => slot.slotKey === selected)) {
      selectedSlotKeys[platformId] = plan.slots[0]?.slotKey;
    }
  }
  return selectedSlotKeys;
}

export function amazonModeForPlan(plan?: PlatformPlan): AmazonWorkspaceMode | null {
  const mode = plan?.amazonSession?.plannerMode;
  return mode === "listing" || mode === "aplus" ? mode : null;
}

export function workflowForPlan(platformId: PlatformId, plan: PlatformPlan): PlatformWorkflowId {
  if (platformId === "taobao") return "taobao-product";
  return plan.amazonSession?.plannerMode === "aplus" ? "amazon-aplus" : "amazon-listing";
}

export function optionsForPlan(
  platformId: PlatformId,
  plan: PlatformPlan,
  existingOptions?: PlatformSession["options"],
): PlatformSession["options"] {
  if (platformId === "taobao") {
    return {
      platformId: "taobao",
      stylePresetId: existingOptions?.platformId === "taobao" ? existingOptions.stylePresetId ?? null : null,
    };
  }
  const resolved = resolveAmazonPlanningSession({
    plannerMode: plan.amazonSession?.plannerMode === "aplus" ? "aplus" : "listing",
    marketplaceId: plan.amazonSession?.marketplaceId,
    listingImageCount: plan.amazonSession?.listingImageCount,
    aPlusType: plan.amazonSession?.aPlusType,
    aPlusModuleSpecs: plan.amazonSession?.aPlusModuleSpecs,
    sizeTier: plan.amazonSession?.sizeTier,
    stylePresetId: plan.amazonSession?.stylePresetId,
  });
  return {
    platformId: "amazon",
    marketplaceId: resolved.marketplaceId,
    plannerMode: resolved.plannerMode === "aplus" ? "aplus" : "listing",
    listingImageCount: resolved.listingImageCount,
    aPlusType: resolved.aPlusType,
    aPlusModuleSpecs: resolved.aPlusModuleSpecs.map((spec) => ({ ...spec })),
    sizeTier: resolved.sizeTier,
    stylePresetId: resolved.stylePresetId,
  };
}
