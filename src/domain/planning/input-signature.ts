import type { AssetMetadata } from "../assets/types";
import type { ProductFacts } from "../projects/types";

export type PlanningInputFreshness = "unknown" | "fresh" | "stale";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createPlanningInputSignature(
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
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
  });
}

export function getPlanningInputFreshness(
  savedSignature: string | undefined,
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
): PlanningInputFreshness {
  if (!savedSignature) return "unknown";
  return savedSignature === createPlanningInputSignature(facts, assets, selectedReferenceAssetIds)
    ? "fresh"
    : "stale";
}

export function isPlanningInputCurrent(
  savedSignature: string | undefined,
  facts: ProductFacts,
  assets: readonly AssetMetadata[],
  selectedReferenceAssetIds?: readonly string[],
): boolean {
  return getPlanningInputFreshness(
    savedSignature,
    facts,
    assets,
    selectedReferenceAssetIds,
  ) === "fresh";
}
