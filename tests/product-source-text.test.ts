import { describe, expect, it } from "vitest";

import {
  hasUsableProductFacts,
  productFactsToAmazonListingText,
  productFactsToTaobaoText,
  resolveInitialIntakeSourceMode,
} from "../src/domain/projects/product-source-text";
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
  forbiddenClaims: ["治疗颈椎病"],
  specifications: { 材质: "记忆棉" },
};

describe("product source text for platform intake", () => {
  it("detects usable shared facts", () => {
    expect(hasUsableProductFacts(facts)).toBe(true);
    expect(
      hasUsableProductFacts({
        ...facts,
        productName: "",
        description: "",
        sellingPoints: [],
        brand: "",
        category: "",
      }),
    ).toBe(false);
  });

  it("renders Taobao analysis draft from shared facts", () => {
    const text = productFactsToTaobaoText(facts);
    expect(text).toContain("商品名：云感旅行颈枕");
    expect(text).toContain("卖点：");
    expect(text).toContain("- 慢回弹");
    expect(text).toContain("材质：记忆棉");
    expect(text).toContain("- 治疗颈椎病");
  });

  it("renders Amazon Listing draft from shared facts", () => {
    const text = productFactsToAmazonListingText(facts);
    expect(text).toContain("Title: 云感旅行颈枕");
    expect(text).toContain("About this item");
    expect(text).toContain("- 慢回弹");
    expect(text).toContain("Product description");
    expect(text).toContain("Brand: Northwind");
  });

  it("defaults intake source mode by session draft and library readiness", () => {
    expect(
      resolveInitialIntakeSourceMode({ hasSessionDraft: true, hasLibraryFacts: true }),
    ).toBe("manual");
    expect(
      resolveInitialIntakeSourceMode({ hasSessionDraft: false, hasLibraryFacts: true }),
    ).toBe("library");
    expect(
      resolveInitialIntakeSourceMode({ hasSessionDraft: false, hasLibraryFacts: false }),
    ).toBe("manual");
  });
});
