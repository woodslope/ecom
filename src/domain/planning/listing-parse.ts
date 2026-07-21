/**
 * Heuristic parse of pasted Amazon Listing text (title + bullets + body).
 * Behavior goal: AIS AmazonPlanner "粘贴标题和五点描述" input → product facts fields.
 * Pure local parse (no API); LLM still does planning from structured facts.
 */

export interface ParsedListingText {
  title: string;
  bullets: string[];
  description: string;
  /** Short Chinese note for UI feedback. */
  summary: string;
}

const BULLET_LINE =
  /^(?:[-*•●▪︎]|[0-9]{1,2}[.)、]|[（(]?[0-9]{1,2}[)）]|[①②③④⑤⑥⑦⑧⑨⑩]|Feature\s*\d+\s*[:：]?)\s*(.+)$/iu;

const SECTION_TITLE =
  /^(?:about\s+this\s+item|product\s+description|from\s+the\s+brand|product\s+details|key\s+features|features|highlights|规格|参数|产品描述|商品描述|五点描述|卖点|品牌故事)\s*[:：]?$/iu;

const TITLE_PREFIX = /^(?:title|product\s*title|商品名称|标题|品名)\s*[:：]\s*(.+)$/iu;

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripBullet(line: string): string | null {
  const match = BULLET_LINE.exec(line);
  return match?.[1]?.trim() || null;
}

/**
 * Parse free-form Listing paste into title / bullets / description.
 * Empty paste returns empty fields.
 */
export function parseAmazonListingText(raw: string): ParsedListingText {
  const lines = normalizeLines(raw);
  if (lines.length === 0) {
    return { title: "", bullets: [], description: "", summary: "未识别到可用文本" };
  }

  let title = "";
  const bullets: string[] = [];
  const body: string[] = [];
  let inBulletSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    const titled = TITLE_PREFIX.exec(line);
    if (titled?.[1]) {
      if (!title) title = titled[1].trim();
      continue;
    }

    if (SECTION_TITLE.test(line)) {
      // "About this item" and similar → prefer bullets for following lines
      inBulletSection =
        /about\s+this\s+item|key\s+features|features|highlights|五点|卖点/i.test(line);
      continue;
    }

    const bullet = stripBullet(line);
    if (bullet) {
      bullets.push(bullet);
      inBulletSection = true;
      continue;
    }

    if (!title) {
      // First plain line is usually the product title.
      title = line;
      continue;
    }

    if (inBulletSection && line.length <= 180 && !/[.。]$/.test(line)) {
      // Short lines after bullet section often are more bullets without markers.
      bullets.push(line);
      continue;
    }

    body.push(line);
  }

  // Cap bullets like common Amazon "five points" (keep extras in description).
  const primaryBullets = bullets.slice(0, 8);
  const overflowBullets = bullets.slice(8);
  if (overflowBullets.length) {
    body.unshift(...overflowBullets);
  }

  const description = body.join("\n").trim();
  const parts: string[] = [];
  if (title) parts.push("标题");
  if (primaryBullets.length) parts.push(`${primaryBullets.length} 条卖点`);
  if (description) parts.push("说明");
  const summary = parts.length ? `已识别：${parts.join("、")}` : "未识别到标题或卖点";

  return {
    title,
    bullets: primaryBullets,
    description,
    summary,
  };
}

export interface ProductFactsListingPatch {
  productName?: string;
  sellingPoints?: string[];
  description?: string;
}

/**
 * Map parse result onto ProductFacts-like fields.
 * Empty parse fields are omitted so callers can merge without wiping.
 */
export function listingParseToFactsPatch(
  parsed: ParsedListingText,
  options: { overwriteEmptyOnly?: boolean; current?: ProductFactsListingPatch } = {},
): ProductFactsListingPatch {
  const overwriteEmptyOnly = options.overwriteEmptyOnly ?? false;
  const current = options.current ?? {};
  const patch: ProductFactsListingPatch = {};

  const canWrite = (key: keyof ProductFactsListingPatch, hasValue: boolean) => {
    if (!hasValue) return false;
    if (!overwriteEmptyOnly) return true;
    const existing = current[key];
    if (typeof existing === "string") return existing.trim().length === 0;
    if (Array.isArray(existing)) return existing.length === 0;
    return true;
  };

  if (canWrite("productName", Boolean(parsed.title))) {
    patch.productName = parsed.title;
  }
  if (canWrite("sellingPoints", parsed.bullets.length > 0)) {
    patch.sellingPoints = [...parsed.bullets];
  }
  if (canWrite("description", Boolean(parsed.description))) {
    patch.description = parsed.description;
  }
  return patch;
}
