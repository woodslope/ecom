import type { ProductFacts } from "./types";

/** How the platform intake seeds its task-local copy. */
export type ProductIntakeSourceMode = "library" | "manual";

export function hasUsableProductFacts(facts: ProductFacts): boolean {
  return Boolean(
    facts.productName.trim() ||
      facts.description.trim() ||
      facts.sellingPoints.some((item) => item.trim()) ||
      facts.brand.trim() ||
      facts.category.trim(),
  );
}

/** Draft Taobao analysis text from shared product facts (session-local only). */
export function productFactsToTaobaoText(facts: ProductFacts): string {
  const lines: string[] = [];
  if (facts.productName.trim()) lines.push(`商品名：${facts.productName.trim()}`);
  if (facts.category.trim()) lines.push(`品类：${facts.category.trim()}`);
  if (facts.brand.trim()) lines.push(`品牌：${facts.brand.trim()}`);
  if (facts.model.trim()) lines.push(`型号：${facts.model.trim()}`);
  if (facts.sku.trim()) lines.push(`SKU：${facts.sku.trim()}`);
  if (facts.targetAudience.trim()) lines.push(`目标人群：${facts.targetAudience.trim()}`);
  if (facts.description.trim()) lines.push(`描述：${facts.description.trim()}`);
  if (facts.sellingPoints.length > 0) {
    lines.push("卖点：");
    for (const point of facts.sellingPoints) {
      if (point.trim()) lines.push(`- ${point.trim()}`);
    }
  }
  const specs = Object.entries(facts.specifications).filter(
    ([key, value]) => key.trim() && value.trim(),
  );
  if (specs.length > 0) {
    lines.push("规格：");
    for (const [key, value] of specs) {
      lines.push(`${key.trim()}：${value.trim()}`);
    }
  }
  if (facts.forbiddenClaims.length > 0) {
    lines.push("禁用声明：");
    for (const claim of facts.forbiddenClaims) {
      if (claim.trim()) lines.push(`- ${claim.trim()}`);
    }
  }
  return lines.join("\n");
}

/** Draft Amazon Listing paste text from shared product facts (session-local only). */
export function productFactsToAmazonListingText(facts: ProductFacts): string {
  const lines: string[] = [];
  if (facts.productName.trim()) {
    lines.push(`Title: ${facts.productName.trim()}`, "");
  }
  if (facts.sellingPoints.length > 0) {
    lines.push("About this item");
    for (const point of facts.sellingPoints) {
      if (point.trim()) lines.push(`- ${point.trim()}`);
    }
    lines.push("");
  }
  if (facts.description.trim()) {
    lines.push("Product description", facts.description.trim(), "");
  }
  const meta: string[] = [];
  if (facts.brand.trim()) meta.push(`Brand: ${facts.brand.trim()}`);
  if (facts.model.trim()) meta.push(`Model: ${facts.model.trim()}`);
  if (facts.sku.trim()) meta.push(`SKU: ${facts.sku.trim()}`);
  if (facts.category.trim()) meta.push(`Category: ${facts.category.trim()}`);
  if (facts.targetAudience.trim()) meta.push(`Target audience: ${facts.targetAudience.trim()}`);
  if (meta.length > 0) {
    lines.push(...meta, "");
  }
  const specs = Object.entries(facts.specifications).filter(
    ([key, value]) => key.trim() && value.trim(),
  );
  if (specs.length > 0) {
    lines.push("Specifications");
    for (const [key, value] of specs) {
      lines.push(`- ${key.trim()}: ${value.trim()}`);
    }
    lines.push("");
  }
  if (facts.forbiddenClaims.length > 0) {
    lines.push("Forbidden claims");
    for (const claim of facts.forbiddenClaims) {
      if (claim.trim()) lines.push(`- ${claim.trim()}`);
    }
  }
  return lines.join("\n").trim();
}

/**
 * Prefer a saved session draft; otherwise default to library when shared facts exist.
 */
export function resolveInitialIntakeSourceMode(input: {
  hasSessionDraft: boolean;
  hasLibraryFacts: boolean;
}): ProductIntakeSourceMode {
  if (input.hasSessionDraft) return "manual";
  if (input.hasLibraryFacts) return "library";
  return "manual";
}
