/**
 * Generation size helpers aligned with Amazon Image Studio `src/lib/size.ts`
 * (commit bca89d728e415c453db363dcba30ac8ea243edaf).
 *
 * Separates upload-reference dimensions from provider generation canvas size.
 */

import type { SizeTier } from "./amazon-catalog";
import type { SlotDimensions } from "./types";

const SIZE_MULTIPLE = 16;
const MAX_EDGE = 3840;
const MAX_ASPECT_RATIO = 3;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;

const TIER_PIXEL_BUDGET: Readonly<Record<SizeTier, number>> = Object.freeze({
  "1K": 1_572_864,
  "2K": 4_194_304,
  "4K": MAX_PIXELS,
});

const MAX_RATIO_ERROR = 0.01;
const RATIO_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[:xX×]\s*(\d+(?:\.\d+)?)\s*$/;

/**
 * Provider-safe generation canvases exposed by the image API selector.
 * Keep these dimensions stable: the upload canvas and the provider canvas are
 * different contracts (for example Amazon A+ uploads are 970x300).
 */
export const STANDARD_GENERATION_SIZES = Object.freeze({
  "1:1": Object.freeze({ width: 1024, height: 1024, unit: "px" as const }),
  "16:9": Object.freeze({ width: 1792, height: 1024, unit: "px" as const }),
  "9:16": Object.freeze({ width: 1024, height: 1792, unit: "px" as const }),
  "4:3": Object.freeze({ width: 1024, height: 768, unit: "px" as const }),
  "3:4": Object.freeze({ width: 768, height: 1024, unit: "px" as const }),
  "3:2": Object.freeze({ width: 1536, height: 1024, unit: "px" as const }),
  "2:3": Object.freeze({ width: 1024, height: 1536, unit: "px" as const }),
  "21:9": Object.freeze({ width: 1344, height: 576, unit: "px" as const }),
});

export type StandardGenerationAspectRatio = keyof typeof STANDARD_GENERATION_SIZES;

const STANDARD_RATIO_ENTRIES = Object.entries(STANDARD_GENERATION_SIZES) as Array<
  [StandardGenerationAspectRatio, SlotDimensions]
>;

function floorToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

function ceilToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

export function parseImageRatio(
  ratio: string,
): { width: number; height: number } | null {
  const match = ratio.match(RATIO_PATTERN);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function formatUploadRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const w = Math.round(width);
  const h = Math.round(height);
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

/** Return the closest ratio supported by the image provider selector. */
export function closestStandardAspectRatio(width: number, height: number): StandardGenerationAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }
  const target = width / height;
  return STANDARD_RATIO_ENTRIES.reduce((best, candidate) => {
    const bestDistance = Math.abs(Math.log(target / (STANDARD_GENERATION_SIZES[best[0]].width / STANDARD_GENERATION_SIZES[best[0]].height)));
    const candidateDistance = Math.abs(Math.log(target / (candidate[1].width / candidate[1].height)));
    return candidateDistance < bestDistance ? candidate : best;
  })[0];
}

/**
 * Convert a platform upload slot to one of the exact provider canvases shown
 * in the UI. This intentionally does not scale to an arbitrary pixel budget.
 */
export function standardGenerationSizeForUpload(upload: SlotDimensions): SlotDimensions {
  return STANDARD_GENERATION_SIZES[closestStandardAspectRatio(upload.width, upload.height)];
}

/**
 * Pick provider generation width/height for a size tier and aspect ratio string ("W:H").
 * Returns null when the ratio cannot be parsed.
 */
export function calculateGenerationSize(
  tier: SizeTier,
  ratio: string,
): SlotDimensions | null {
  const parsed = parseImageRatio(ratio);
  if (!parsed) return null;

  const targetRatio = parsed.width / parsed.height;
  const pixelBudget = TIER_PIXEL_BUDGET[tier];

  let bestWidth = 0;
  let bestHeight = 0;
  let bestPixels = 0;

  for (let w = SIZE_MULTIPLE; w <= MAX_EDGE; w += SIZE_MULTIPLE) {
    const idealH = w / targetRatio;
    const candidates = [
      floorToMultiple(idealH, SIZE_MULTIPLE),
      ceilToMultiple(idealH, SIZE_MULTIPLE),
    ];

    for (const h of candidates) {
      if (h < SIZE_MULTIPLE || h > MAX_EDGE) continue;
      const pixels = w * h;
      if (pixels > pixelBudget || pixels < MIN_PIXELS) continue;
      if (Math.max(w / h, h / w) > MAX_ASPECT_RATIO) continue;
      const ratioError = Math.abs(w / h - targetRatio) / targetRatio;
      if (ratioError > MAX_RATIO_ERROR) continue;
      if (pixels > bestPixels) {
        bestPixels = pixels;
        bestWidth = w;
        bestHeight = h;
      }
    }
  }

  if (bestWidth <= 0 || bestHeight <= 0) {
    // Fallback: scale upload-like ratio into the tier budget with 16px rounding.
    const scale = Math.sqrt(pixelBudget / (parsed.width * parsed.height));
    bestWidth = floorToMultiple(parsed.width * scale, SIZE_MULTIPLE);
    bestHeight = floorToMultiple(parsed.height * scale, SIZE_MULTIPLE);
    if (bestWidth * bestHeight < MIN_PIXELS) {
      const grow = Math.sqrt(MIN_PIXELS / (bestWidth * bestHeight));
      bestWidth = ceilToMultiple(bestWidth * grow, SIZE_MULTIPLE);
      bestHeight = ceilToMultiple(bestHeight * grow, SIZE_MULTIPLE);
    }
  }

  return Object.freeze({
    width: bestWidth,
    height: bestHeight,
    unit: "px" as const,
  });
}

export function generationDimensionsForUpload(
  upload: SlotDimensions,
  tier: SizeTier = "2K",
): SlotDimensions {
  // Provider APIs accept a fixed set of canvases. Use the exact selector size
  // whenever possible, then retain the tier-based calculation for malformed
  // or future custom dimensions.
  if (Number.isFinite(upload.width) && Number.isFinite(upload.height) && upload.width > 0 && upload.height > 0) {
    return standardGenerationSizeForUpload(upload);
  }
  const ratio = formatUploadRatio(upload.width, upload.height);
  return calculateGenerationSize(tier, ratio) ?? Object.freeze({
    width: upload.width,
    height: upload.height,
    unit: "px" as const,
  });
}
