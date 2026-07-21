/**
 * Resolve the effective PlatformRulePack for planning / UI / export.
 * Amazon sessions override slots (and locale) from AIS-aligned catalogs.
 */

import {
  buildLegacyCombinedAmazonSlotRules,
  resolveAmazonPlanningSession,
  type AmazonPlanningSessionOptions,
  type ResolvedAmazonPlanningSession,
} from "./amazon-catalog";
import { getAmazonMarketplace } from "./amazon-marketplaces";
import { amazonRulePack } from "./amazon";
import { getPlatformRulePack } from "./registry";
import type { PlatformId, PlatformRulePack } from "./types";
import { definePlatformRulePack } from "./types";
import type { AmazonPlanSessionMeta, PlatformPlan } from "../planning/types";

export function amazonSessionFromMeta(
  meta: AmazonPlanSessionMeta,
): ResolvedAmazonPlanningSession {
  if (meta.plannerMode === "legacy-combined") {
    const slots = buildLegacyCombinedAmazonSlotRules();
    return Object.freeze({
      marketplaceId: meta.marketplaceId,
      plannerMode: "legacy-combined" as const,
      listingImageCount: meta.listingImageCount ?? 7,
      aPlusType: meta.aPlusType ?? "standard",
      aPlusModuleSpecs: Object.freeze([]),
      sizeTier: meta.sizeTier ?? "2K",
      stylePresetId: meta.stylePresetId ?? "clean-retail",
      slotKeys: Object.freeze(slots.map((slot) => slot.key)),
      slots,
    });
  }

  return resolveAmazonPlanningSession({
    marketplaceId: meta.marketplaceId,
    plannerMode: meta.plannerMode === "aplus" ? "aplus" : "listing",
    listingImageCount: meta.listingImageCount,
    aPlusType: meta.aPlusType,
    aPlusModuleSpecs: meta.aPlusModuleSpecs,
    sizeTier: meta.sizeTier,
    stylePresetId: meta.stylePresetId,
  });
}

export function createAmazonSessionRulePack(
  session: ResolvedAmazonPlanningSession,
): PlatformRulePack {
  const marketplace = getAmazonMarketplace(session.marketplaceId);
  const modeLabel =
    session.plannerMode === "aplus"
      ? "A+"
      : session.plannerMode === "listing"
        ? "Listing"
        : "Listing + A+";

  return definePlatformRulePack({
    platformId: "amazon",
    label: `Amazon · ${marketplace.shortLabel} · ${modeLabel}`,
    locale: marketplace.locale,
    promptLanguage: "en",
    slots: session.slots,
    planningInstructions: [
      ...amazonRulePack.planningInstructions,
      ...marketplace.localGuidance,
    ],
    promptGuardrails: amazonRulePack.promptGuardrails,
    complianceReminders: [
      ...amazonRulePack.complianceReminders,
      ...marketplace.compliancePolicy,
    ],
    exportRules: amazonRulePack.exportRules,
  });
}

export function createAmazonRulePackFromOptions(
  options: AmazonPlanningSessionOptions,
): { rulePack: PlatformRulePack; session: ResolvedAmazonPlanningSession } {
  const session = resolveAmazonPlanningSession(options);
  return { session, rulePack: createAmazonSessionRulePack(session) };
}

/** Compatibility pack for restored plans without split-session metadata. */
export function createLegacyCombinedAmazonRulePack(): {
  rulePack: PlatformRulePack;
  session: ResolvedAmazonPlanningSession;
} {
  const session = amazonSessionFromMeta({
    marketplaceId: "us",
    plannerMode: "legacy-combined",
    listingImageCount: 7,
    aPlusType: "standard",
    sizeTier: "2K",
    slotKeys: amazonRulePack.slots.map((slot) => slot.key),
  });
  return {
    session,
    rulePack: createAmazonSessionRulePack(session),
  };
}

export function resolveRulePackForPlan(
  platformId: PlatformId,
  plan?: PlatformPlan | null,
): PlatformRulePack {
  if (platformId !== "amazon") {
    return getPlatformRulePack(platformId);
  }
  if (plan?.amazonSession) {
    return createAmazonSessionRulePack(amazonSessionFromMeta(plan.amazonSession));
  }
  return getPlatformRulePack("amazon");
}

export function sessionMetaFromResolved(
  session: ResolvedAmazonPlanningSession,
): AmazonPlanSessionMeta {
  return {
    marketplaceId: session.marketplaceId,
    plannerMode: session.plannerMode,
    listingImageCount: session.listingImageCount,
    aPlusType: session.aPlusType,
    aPlusModuleSpecs:
      session.plannerMode === "aplus" ? session.aPlusModuleSpecs : undefined,
    sizeTier: session.sizeTier,
    stylePresetId: session.stylePresetId,
    slotKeys: session.slotKeys,
  };
}
