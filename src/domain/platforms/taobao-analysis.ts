import type { ProductFacts } from "../projects/types";

export type TaobaoAnalysisCitationSource =
  | "shared-product"
  | "analysis-input"
  | "reference-asset";

export interface TaobaoReferenceAsset {
  id: string;
  name: string;
}

export interface TaobaoAnalysisCitation {
  field: string;
  value: string;
  source: TaobaoAnalysisCitationSource;
}

export interface TaobaoProductAnalysis {
  suggestedProductName: string;
  sellingPoints: string[];
  specifications: Record<string, string>;
  forbiddenClaims: string[];
  referenceAssets: TaobaoReferenceAsset[];
  citations: TaobaoAnalysisCitation[];
  missingFacts: string[];
  warnings: string[];
}

export interface TaobaoProductAnalysisInput {
  facts: ProductFacts;
  productText: string;
  referenceAssets: readonly TaobaoReferenceAsset[];
}

export function applyTaobaoAnalysisToFacts(
  facts: ProductFacts,
  analysis?: TaobaoProductAnalysis,
): ProductFacts {
  if (!analysis) return facts;
  return {
    ...facts,
    productName: analysis.suggestedProductName || facts.productName,
    sellingPoints: [...analysis.sellingPoints],
    forbiddenClaims: [...analysis.forbiddenClaims],
    specifications: { ...analysis.specifications },
  };
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeLine).filter(Boolean))];
}

function splitValues(value: string): string[] {
  return unique(value.split(/[、,，;；|]/u));
}

function labeledValue(line: string, labels: readonly string[]): string | null {
  const match = new RegExp(`^(?:${labels.join("|")})\\s*[:：]\\s*(.+)$`, "iu").exec(line);
  return match?.[1] ? normalizeLine(match[1]) : null;
}

function parseInput(text: string): {
  productName?: string;
  sellingPoints: string[];
  specifications: Record<string, string>;
  forbiddenClaims: string[];
} {
  const parsed = {
    sellingPoints: [] as string[],
    specifications: {} as Record<string, string>,
    forbiddenClaims: [] as string[],
  };
  let productName: string | undefined;

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = normalizeLine(rawLine);
    if (!line) continue;
    const name = labeledValue(line, ["商品名", "商品名称", "品名", "标题"]);
    if (name) {
      productName = name;
      continue;
    }
    const points = labeledValue(line, ["卖点", "核心卖点", "特点", "优势"]);
    if (points) {
      parsed.sellingPoints.push(...splitValues(points));
      continue;
    }
    const specification = labeledValue(line, ["规格", "参数", "规格参数"]);
    if (specification) {
      const match = /^([^:：]+)\s*[:：]\s*(.+)$/u.exec(specification);
      if (match?.[1] && match[2]) parsed.specifications[normalizeLine(match[1])] = normalizeLine(match[2]);
      continue;
    }
    const forbidden = labeledValue(line, ["禁用声明", "禁用词", "禁止使用", "不可宣称"]);
    if (forbidden) {
      parsed.forbiddenClaims.push(...splitValues(forbidden));
    }
  }

  return {
    ...(productName ? { productName } : {}),
    sellingPoints: unique(parsed.sellingPoints),
    specifications: parsed.specifications,
    forbiddenClaims: unique(parsed.forbiddenClaims),
  };
}

export function analyzeTaobaoProduct(
  input: TaobaoProductAnalysisInput,
): TaobaoProductAnalysis {
  const parsed = parseInput(input.productText);
  const suggestedProductName = parsed.productName ?? input.facts.productName;
  const sellingPoints = unique([...input.facts.sellingPoints, ...parsed.sellingPoints]);
  const specifications = {
    ...input.facts.specifications,
    ...parsed.specifications,
  };
  const forbiddenClaims = unique([
    ...input.facts.forbiddenClaims,
    ...parsed.forbiddenClaims,
  ]);
  const referenceAssets = input.referenceAssets.map((asset) => ({ ...asset }));
  const citations: TaobaoAnalysisCitation[] = [];

  if (input.facts.productName) {
    citations.push({ field: "productName", value: input.facts.productName, source: "shared-product" });
  }
  if (parsed.productName) {
    citations.push({ field: "productName", value: parsed.productName, source: "analysis-input" });
  }
  input.facts.sellingPoints.forEach((value) => {
    citations.push({ field: "sellingPoints", value, source: "shared-product" });
  });
  parsed.sellingPoints.forEach((value) => {
    citations.push({ field: "sellingPoints", value, source: "analysis-input" });
  });
  Object.entries(input.facts.specifications).forEach(([field, value]) => {
    citations.push({ field, value, source: "shared-product" });
  });
  Object.entries(parsed.specifications).forEach(([field, value]) => {
    citations.push({ field, value, source: "analysis-input" });
  });
  forbiddenClaims.forEach((value) => {
    citations.push({
      field: "forbiddenClaims",
      value,
      source: input.facts.forbiddenClaims.includes(value) ? "shared-product" : "analysis-input",
    });
  });
  if (referenceAssets.length > 0) {
    citations.push({
      field: "referenceAssets",
      value: referenceAssets.map((asset) => asset.name).join("、"),
      source: "reference-asset",
    });
  }

  const missingFacts: string[] = [];
  if (!suggestedProductName) missingFacts.push("商品名称");
  if (!input.facts.category) missingFacts.push("品类");
  if (sellingPoints.length === 0) missingFacts.push("可验证卖点");
  if (Object.keys(specifications).length === 0) missingFacts.push("规格参数");

  return {
    suggestedProductName,
    sellingPoints,
    specifications,
    forbiddenClaims,
    referenceAssets,
    citations,
    missingFacts,
    warnings: forbiddenClaims.length > 0
      ? ["存在禁用声明，详情页文案和生成 Prompt 不得直接使用这些表述。"]
      : [],
  };
}
