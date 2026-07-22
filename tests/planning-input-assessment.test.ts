import { describe, expect, it } from "vitest";

import {
  assessPlanningInput,
  createEmptyProductFacts,
  planningInputQualityMessage,
} from "../src/domain/planning/input-assessment";

describe("planning input assessment", () => {
  it.each([
    {
      label: "standard",
      facts: { ...createEmptyProductFacts(), productName: "旅行枕", sellingPoints: ["可折叠"] },
      productImageCount: 1,
      quality: "standard",
      missingFacts: [],
    },
    {
      label: "image-only",
      facts: createEmptyProductFacts(),
      productImageCount: 1,
      quality: "image-only",
      missingFacts: ["商品名称", "可验证卖点或商品描述"],
    },
    {
      label: "facts-only",
      facts: { ...createEmptyProductFacts(), productName: "旅行枕", description: "可折叠旅行枕" },
      productImageCount: 0,
      quality: "facts-only",
      missingFacts: ["商品参考图"],
    },
    {
      label: "empty",
      facts: createEmptyProductFacts(),
      productImageCount: 0,
      quality: "empty",
      missingFacts: ["商品名称", "可验证卖点或商品描述", "商品参考图"],
    },
  ] as const)("classifies $label input", ({ facts, productImageCount, quality, missingFacts }) => {
    const assessment = assessPlanningInput({ facts, productImageCount });

    expect(assessment.quality).toBe(quality);
    expect(assessment.missingFacts).toEqual(missingFacts);
  });

  it("uses the explicit image-only draft message", () => {
    const assessment = assessPlanningInput({ facts: createEmptyProductFacts(), productImageCount: 1 });
    expect(planningInputQualityMessage(assessment)).toBe("仅有商品图，将生成策划草稿。");
  });
});
