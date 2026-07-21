import type { PlatformId, PlatformRulePack } from "../platforms/types";
import type {
  AmazonPlanningRequestOptions,
  AmazonPlanSessionMeta,
  PlannedSlot,
  PlannerEngine,
  PlanningProjectFacts,
  PlanningReferenceImage,
  PlanningSource,
  PlatformPlan,
  PlatformPlanCandidate,
} from "./types";
import {
  createAmazonRulePackFromOptions,
  createLegacyCombinedAmazonRulePack,
  sessionMetaFromResolved,
} from "../platforms/resolve-rule-pack";
import { getPlatformRulePack } from "../platforms/registry";

/**
 * Resolve the rule pack used for a planning call.
 * Amazon defaults to AIS listing session (7 slots) when no options are passed.
 * Pass `{ plannerMode: "legacy-combined" }` for the pre-alignment 15-slot pack.
 */
export function resolvePlanningRulePack(
  platformId: PlatformId,
  options?: AmazonPlanningRequestOptions,
): { rulePack: PlatformRulePack; amazonSession?: AmazonPlanSessionMeta } {
  if (platformId !== "amazon") {
    return { rulePack: getPlatformRulePack(platformId) };
  }

  if (!options) {
    const { rulePack, session } = createAmazonRulePackFromOptions({
      plannerMode: "listing",
      marketplaceId: "us",
      listingImageCount: 7,
      sizeTier: "2K",
    });
    return { rulePack, amazonSession: sessionMetaFromResolved(session) };
  }

  if (options.plannerMode === "legacy-combined") {
    const { rulePack, session } = createLegacyCombinedAmazonRulePack();
    return {
      rulePack,
      amazonSession: sessionMetaFromResolved({
        ...session,
        marketplaceId: options.marketplaceId ?? session.marketplaceId,
        sizeTier: options.sizeTier ?? session.sizeTier,
      }),
    };
  }

  const { rulePack, session } = createAmazonRulePackFromOptions({
    marketplaceId: options.marketplaceId,
    plannerMode: options.plannerMode === "aplus" ? "aplus" : "listing",
    listingImageCount: options.listingImageCount,
    aPlusType: options.aPlusType,
    aPlusModuleSpecs: options.aPlusModuleSpecs,
    sizeTier: options.sizeTier,
    stylePresetId: options.stylePresetId,
  });
  return { rulePack, amazonSession: sessionMetaFromResolved(session) };
}

export type {
  AmazonPlanningRequestOptions,
  AmazonPlanSessionMeta,
  PlannedSlot,
  PlannerEngine,
  PlanningProjectFacts,
  PlanningReferenceImage,
  PlanningSource,
  PlatformPlan,
  PlatformPlanCandidate,
};
