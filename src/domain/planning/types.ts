import type { AmazonMarketplaceId } from "../platforms/amazon-marketplaces";
import type {
  AmazonAPlusModuleSpec,
  APlusContentType,
  AmazonPlannerMode,
  SizeTier,
} from "../platforms/amazon-catalog";
import type { PlatformId, PlatformRulePack } from "../platforms/types";

export type PlanningSource = "demo" | "api";

export interface PlanningProjectFacts {
  productName: string;
  category?: string;
  brand?: string;
  model?: string;
  sku?: string;
  targetAudience?: string;
  description?: string;
  sellingPoints?: readonly string[];
  specifications?: unknown;
  forbiddenClaims?: readonly string[];
}

export interface PlanningReferenceImage {
  name: string;
  mimeType: string;
  blob: Blob;
}

export interface PlannedSlot {
  slotKey: string;
  visibleCopy: string;
  externalText?: {
    title?: string;
    body?: string;
  };
  strategy: string;
  evidence: string[];
  prompt: string;
  negativePrompt: string;
}

/** AIS-aligned Amazon session options passed through every Amazon planner call. */
export interface AmazonPlanningRequestOptions {
  marketplaceId?: AmazonMarketplaceId;
  plannerMode?: AmazonPlannerMode;
  listingImageCount?: number;
  aPlusType?: APlusContentType;
  /** Custom A+ module rows for the active type (1–12); omit to use type defaults. */
  aPlusModuleSpecs?: readonly AmazonAPlusModuleSpec[];
  sizeTier?: SizeTier;
  /** Optional style preset id; applied to non-MAIN generation prompts. */
  stylePresetId?: string | null;
}

/** Snapshot of the Amazon session that produced a plan. */
export interface AmazonPlanSessionMeta {
  marketplaceId: AmazonMarketplaceId;
  plannerMode: AmazonPlannerMode;
  listingImageCount?: number;
  aPlusType?: APlusContentType;
  aPlusModuleSpecs?: readonly AmazonAPlusModuleSpec[];
  sizeTier?: SizeTier;
  stylePresetId?: string | null;
  slotKeys: readonly string[];
}

export interface PlatformPlanCandidate {
  platformId: string;
  source: PlanningSource;
  slots: PlannedSlot[];
  amazonSession?: AmazonPlanSessionMeta;
}

export interface PlatformPlan {
  platformId: PlatformId;
  source: PlanningSource;
  slots: PlannedSlot[];
  /** Present when the plan was produced under an AIS-aligned Amazon session. */
  amazonSession?: AmazonPlanSessionMeta;
}

export interface PlannerEngine {
  plan(
    project: PlanningProjectFacts,
    rulePack: PlatformRulePack,
    signal: AbortSignal,
    referenceImages?: readonly PlanningReferenceImage[],
    amazonOptions?: AmazonPlanningRequestOptions,
  ): Promise<PlatformPlan>;
}
