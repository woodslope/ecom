import { applyTaobaoAnalysisToFacts } from "../platforms/taobao-analysis";
import { listingParseToFactsPatch, parseAmazonListingText } from "../planning/listing-parse";
import type { ProductionRun } from "../workspace/project-workspace";
import type { ProductFacts } from "./types";

function clean(value: string): string {
  return value.trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function extractSharedFactsFromRun(run: ProductionRun, taskFacts: ProductFacts): ProductFacts {
  if (run.platformId === "amazon") {
    const sourceFacts = run.contextSnapshot.localizedFactsDraft?.sourceFactsSnapshot;
    if (sourceFacts) {
      return {
        ...sourceFacts,
        sellingPoints: unique(sourceFacts.sellingPoints),
        forbiddenClaims: unique(sourceFacts.forbiddenClaims),
        specifications: { ...sourceFacts.specifications },
      };
    }
    const patch = listingParseToFactsPatch(parseAmazonListingText(run.contextSnapshot.sourceInput.listingText));
    return {
      ...taskFacts,
      ...(patch.productName ? { productName: patch.productName } : {}),
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.sellingPoints ? { sellingPoints: unique(patch.sellingPoints) } : {}),
    };
  }
  return applyTaobaoAnalysisToFacts(taskFacts, run.contextSnapshot.taobaoAnalysis);
}

export interface ProductFactsMergeConflict {
  field: keyof ProductFacts;
  existing: string;
  candidate: string;
}

export function mergeProductFacts(
  existing: ProductFacts,
  candidate: ProductFacts,
  selectedFields: ReadonlySet<keyof ProductFacts> = new Set(),
): { facts: ProductFacts; conflicts: ProductFactsMergeConflict[] } {
  const conflicts: ProductFactsMergeConflict[] = [];
  const next: ProductFacts = { ...existing, sellingPoints: [...existing.sellingPoints], forbiddenClaims: [...existing.forbiddenClaims], specifications: { ...existing.specifications } };
  const scalarFields: Array<keyof ProductFacts> = ["productName", "category", "brand", "model", "sku", "targetAudience", "description"];
  for (const field of scalarFields) {
    const existingValue = clean(existing[field] as string);
    const candidateValue = clean(candidate[field] as string);
    if (!candidateValue) continue;
    if (!existingValue || selectedFields.has(field)) {
      (next[field] as string) = candidateValue;
    } else if (existingValue !== candidateValue) {
      conflicts.push({ field, existing: existingValue, candidate: candidateValue });
    }
  }
  next.sellingPoints = unique([...existing.sellingPoints, ...candidate.sellingPoints]);
  next.forbiddenClaims = unique([...existing.forbiddenClaims, ...candidate.forbiddenClaims]);
  next.specifications = { ...existing.specifications };
  for (const [key, value] of Object.entries(candidate.specifications)) {
    const normalizedKey = clean(key);
    const normalizedValue = clean(value);
    if (!normalizedKey || !normalizedValue) continue;
    if (!next.specifications[normalizedKey] || selectedFields.has("specifications")) {
      next.specifications[normalizedKey] = normalizedValue;
    } else if (next.specifications[normalizedKey] !== normalizedValue) {
      conflicts.push({ field: "specifications", existing: `${normalizedKey}: ${next.specifications[normalizedKey]}`, candidate: `${normalizedKey}: ${normalizedValue}` });
    }
  }
  return { facts: next, conflicts };
}
