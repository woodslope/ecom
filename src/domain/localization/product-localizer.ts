import type { ProductFacts } from "../projects/types";

export type PlatformFactsDraftStatus = "pending" | "generated" | "confirmed";

export interface PlatformFactsDraft {
  sourceFactsSnapshot: ProductFacts;
  targetLocale: string;
  localizedFacts: ProductFacts;
  status: PlatformFactsDraftStatus;
  generatedAt?: string;
  updatedAt: string;
}

export interface LocalizationRules {
  preserveBrand: boolean;
  preserveModel: boolean;
  preserveSku: boolean;
  preserveNumbers: boolean;
  preserveForbiddenClaims: boolean;
}

export interface ProductLocalizer {
  localize(
    facts: ProductFacts,
    targetLocale: string,
    rules: LocalizationRules,
    signal: AbortSignal,
  ): Promise<ProductFacts>;
}

export const DEFAULT_LOCALIZATION_RULES: LocalizationRules = {
  preserveBrand: true,
  preserveModel: true,
  preserveSku: true,
  preserveNumbers: true,
  preserveForbiddenClaims: true,
};

export function cloneProductFacts(facts: ProductFacts): ProductFacts {
  return {
    ...facts,
    sellingPoints: [...facts.sellingPoints],
    forbiddenClaims: [...facts.forbiddenClaims],
    specifications: { ...facts.specifications },
  };
}

function numericTokens(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function keepNumericFacts(source: string, candidate: string): string {
  const sourceNumbers = numericTokens(source);
  if (sourceNumbers.length === 0) return candidate;
  const candidateNumbers = numericTokens(candidate);
  return sourceNumbers.every((number) => candidateNumbers.includes(number)) ? candidate : source;
}

function localizedList(source: readonly string[], candidate: readonly string[]): string[] {
  if (source.length !== candidate.length) return [...source];
  return source.map((item, index) => keepNumericFacts(item, candidate[index]?.trim() || item));
}

function localizedSpecifications(
  source: Readonly<Record<string, string>>,
  candidate: Readonly<Record<string, string>>,
): Record<string, string> {
  const sourceEntries = Object.entries(source);
  const candidateEntries = Object.entries(candidate);
  if (sourceEntries.length !== candidateEntries.length) return { ...source };
  return Object.fromEntries(sourceEntries.map(([sourceKey, sourceValue], index) => {
    const [candidateKey, candidateValue] = candidateEntries[index] ?? [sourceKey, sourceValue];
    return [
      candidateKey.trim() || sourceKey,
      keepNumericFacts(sourceValue, candidateValue.trim() || sourceValue),
    ];
  }));
}

/** Re-applies locked facts after AI localization so marketing copy cannot alter evidence. */
export function enforceLocalizationRules(
  source: ProductFacts,
  candidate: ProductFacts,
  rules: LocalizationRules = DEFAULT_LOCALIZATION_RULES,
): ProductFacts {
  const preserve = (sourceValue: string, candidateValue: string) =>
    rules.preserveNumbers
      ? keepNumericFacts(sourceValue, candidateValue.trim() || sourceValue)
      : candidateValue.trim() || sourceValue;
  return {
    productName: preserve(source.productName, candidate.productName),
    category: preserve(source.category, candidate.category),
    brand: rules.preserveBrand ? source.brand : candidate.brand,
    model: rules.preserveModel ? source.model : candidate.model,
    sku: rules.preserveSku ? source.sku : candidate.sku,
    targetAudience: preserve(source.targetAudience, candidate.targetAudience),
    description: preserve(source.description, candidate.description),
    sellingPoints: rules.preserveNumbers
      ? localizedList(source.sellingPoints, candidate.sellingPoints)
      : [...candidate.sellingPoints],
    forbiddenClaims: rules.preserveForbiddenClaims
      ? [...source.forbiddenClaims]
      : [...candidate.forbiddenClaims],
    specifications: rules.preserveNumbers
      ? localizedSpecifications(source.specifications, candidate.specifications)
      : { ...candidate.specifications },
  };
}

export function productFactsEqual(left: ProductFacts, right: ProductFacts): boolean {
  return JSON.stringify(cloneProductFacts(left)) === JSON.stringify(cloneProductFacts(right));
}
