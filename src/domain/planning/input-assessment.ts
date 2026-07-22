import { listingParseToFactsPatch, parseAmazonListingText } from "./listing-parse";
import type { PlanningProjectFacts } from "./types";
import type { ProductFacts } from "../projects/types";

export type PlanningInputQuality = "standard" | "image-only" | "facts-only" | "empty";
export type PlanningInputSourceMode = "library" | "manual";

export interface PlanningInputAssessment {
  quality: PlanningInputQuality;
  missingFacts: string[];
  hasAnyFacts: boolean;
  hasProductName: boolean;
  hasVerifiableDetails: boolean;
  hasProductImages: boolean;
}

export interface PlanningInputSnapshot {
  sourceMode: PlanningInputSourceMode;
  quality: PlanningInputQuality;
  missingFacts: string[];
  productText: string;
  selectedReferenceAssetIds: string[];
  sourceProjectId?: string;
  sourceProjectUpdatedAt?: string;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTextList(value: unknown): boolean {
  return Array.isArray(value) && value.some(hasText);
}

function hasSpecifications(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).some(([key, item]) => hasText(key) && hasText(item)),
  );
}

export function createEmptyProductFacts(): ProductFacts {
  return {
    productName: "",
    category: "",
    brand: "",
    model: "",
    sku: "",
    targetAudience: "",
    description: "",
    sellingPoints: [],
    forbiddenClaims: [],
    specifications: {},
  };
}

export function resolveAmazonPlanningFacts(
  projectFacts: ProductFacts | undefined,
  listingText: string,
  sourceMode: PlanningInputSourceMode,
): ProductFacts {
  const base = sourceMode === "library" && projectFacts
    ? projectFacts
    : createEmptyProductFacts();
  const patch = listingParseToFactsPatch(parseAmazonListingText(listingText));
  return {
    ...base,
    ...(patch.productName === undefined ? {} : { productName: patch.productName }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.sellingPoints === undefined ? {} : { sellingPoints: [...patch.sellingPoints] }),
  };
}

export function assessPlanningInput(input: {
  facts: PlanningProjectFacts;
  productImageCount: number;
}): PlanningInputAssessment {
  const facts = input.facts;
  const hasProductName = hasText(facts.productName);
  const hasVerifiableDetails =
    hasText(facts.description) ||
    hasTextList(facts.sellingPoints) ||
    hasSpecifications(facts.specifications);
  const hasAnyFacts = Boolean(
    hasProductName ||
      hasVerifiableDetails ||
      hasText(facts.category) ||
      hasText(facts.brand) ||
      hasText(facts.model) ||
      hasText(facts.sku) ||
      hasText(facts.targetAudience) ||
      hasTextList(facts.forbiddenClaims),
  );
  const hasProductImages = input.productImageCount > 0;
  const missingFacts: string[] = [];
  if (!hasProductName) missingFacts.push("商品名称");
  if (!hasVerifiableDetails) missingFacts.push("可验证卖点或商品描述");
  if (!hasProductImages) missingFacts.push("商品参考图");

  const quality: PlanningInputQuality =
    hasProductImages && hasProductName && hasVerifiableDetails
      ? "standard"
      : hasProductImages
        ? "image-only"
        : hasAnyFacts
          ? "facts-only"
          : "empty";

  return {
    quality,
    missingFacts,
    hasAnyFacts,
    hasProductName,
    hasVerifiableDetails,
    hasProductImages,
  };
}

export function planningInputQualityLabel(quality: PlanningInputQuality): string {
  return quality === "standard" ? "达标策划" : quality === "empty" ? "等待输入" : "策划草稿";
}

export function planningInputQualityMessage(assessment: PlanningInputAssessment): string {
  if (assessment.quality === "standard") {
    return "商品资料与商品图齐全，将生成达标策划。";
  }
  if (assessment.quality === "image-only") {
    return assessment.hasProductName || assessment.hasVerifiableDetails
      ? `商品资料仍缺少${assessment.missingFacts.filter((item) => item !== "商品参考图").join("、")}，将生成策划草稿。`
      : "仅有商品图，将生成策划草稿。";
  }
  if (assessment.quality === "facts-only") {
    return "缺少商品参考图，将生成策划草稿；可继续确认策划并出图。";
  }
  return "请填写商品资料或添加至少一张商品图。";
}
