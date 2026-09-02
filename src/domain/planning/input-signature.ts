import type { AssetMetadata } from "../assets/types";
import type { IndustryTemplateSnapshot } from "../prompt-templates/industry-template-packs";
import type { ProductFacts } from "../projects/types";
import type { PlatformSessionOptions, PlatformWorkflowId } from "../workspace/project-workspace";

export type PlanningInputFreshness = "unknown" | "fresh" | "stale";

export interface PlanningInputContext {
  workflowId: PlatformWorkflowId;
  industryTemplate?: IndustryTemplateSnapshot;
  sessionOptions?: PlatformSessionOptions;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createPlanningInputSignature(
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
  context?: PlanningInputContext,
): string {
  const specifications = Object.fromEntries(
    Object.entries(facts.specifications).sort(([left], [right]) => compareText(left, right)),
  );
  const selectedIds = selectedReferenceAssetIds
    ? new Set(selectedReferenceAssetIds)
    : null;
  const referenceAssets = assets
    .filter(
      (asset) =>
        asset.kind === "reference" &&
        (!selectedIds || selectedIds.has(asset.id)),
    )
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width ?? null,
      height: asset.height ?? null,
      updatedAt: asset.updatedAt,
    }))
    .sort((left, right) => compareText(left.id, right.id));

  return JSON.stringify({
    facts: {
      productName: facts.productName,
      category: facts.category,
      brand: facts.brand,
      model: facts.model,
      sku: facts.sku,
      targetAudience: facts.targetAudience,
      description: facts.description,
      sellingPoints: [...facts.sellingPoints],
      forbiddenClaims: [...facts.forbiddenClaims],
      specifications,
    },
    referenceAssets,
    ...(context
      ? {
          planningContext: {
            workflowId: context.workflowId,
            industryTemplate: context.industryTemplate
              ? {
                  id: context.industryTemplate.id,
                  version: context.industryTemplate.version,
                  scope: context.industryTemplate.scope,
                  brief: context.industryTemplate.brief,
                  slots: context.industryTemplate.slots,
                }
              : null,
            sessionOptions: context.sessionOptions ?? null,
          },
        }
      : {}),
  });
}

export function getPlanningInputFreshness(
  savedSignature: string | undefined,
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
  context?: PlanningInputContext,
): PlanningInputFreshness {
  if (!savedSignature) return "unknown";
  return savedSignature === createPlanningInputSignature(facts, assets, selectedReferenceAssetIds, context)
    ? "fresh"
    : "stale";
}

export function isPlanningInputCurrent(
  savedSignature: string | undefined,
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
  context?: PlanningInputContext,
): boolean {
  return getPlanningInputFreshness(
    savedSignature,
    facts,
    assets,
    selectedReferenceAssetIds,
    context,
  ) === "fresh";
}
