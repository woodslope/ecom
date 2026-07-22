import { describe, expect, it } from "vitest";

import type { AssetMetadata } from "../src/domain/assets/types";
import {
  createPlanningInputSignature,
  isPlanningInputCurrent,
} from "../src/domain/planning/input-signature";
import type { ProductFacts } from "../src/domain/projects/types";

const facts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹", "可拆洗"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉", 尺寸: "28 x 25 cm" },
};

function referenceAsset(id: string, updatedAt = "2026-07-18T08:00:00.000Z"): AssetMetadata {
  return {
    id,
    projectId: "project_01",
    name: `${id}.png`,
    kind: "reference",
    role: "reference",
    tags: [],
    mimeType: "image/png",
    size: 128,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("planning input signature", () => {
  it("invalidates a saved signature when product facts or reference assets change", () => {
    const assets = [referenceAsset("asset_01"), referenceAsset("asset_02")];
    const signature = createPlanningInputSignature(facts, assets);

    expect(isPlanningInputCurrent(signature, facts, [...assets].reverse())).toBe(true);
    expect(
      isPlanningInputCurrent(signature, { ...facts, description: "更新后的商品描述" }, assets),
    ).toBe(false);
    expect(isPlanningInputCurrent(signature, facts, [assets[0]])).toBe(false);
    expect(
      isPlanningInputCurrent(signature, facts, [
        assets[0],
        referenceAsset("asset_02", "2026-07-18T09:00:00.000Z"),
      ]),
    ).toBe(false);
  });

  it("tracks only selected reference assets when a selection is supplied", () => {
    const selected = referenceAsset("asset_selected");
    const unused = referenceAsset("asset_unused");
    const signature = createPlanningInputSignature(facts, [selected, unused], [selected.id]);

    expect(
      isPlanningInputCurrent(
        signature,
        facts,
        [selected, referenceAsset("asset_unused", "2026-07-18T10:00:00.000Z")],
        [selected.id],
      ),
    ).toBe(true);
    expect(
      isPlanningInputCurrent(
        signature,
        facts,
        [referenceAsset("asset_selected", "2026-07-18T10:00:00.000Z"), unused],
        [selected.id],
      ),
    ).toBe(false);
  });
});
