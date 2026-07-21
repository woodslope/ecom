/**
 * Request-time reference image compression and payload caps,
 * behavior-aligned with AIS `referenceImagePayload.ts`
 * (bca89d728e415c453db363dcba30ac8ea243edaf).
 */

import { compressImageFile } from "./compress";

export const GENERATION_REFERENCE_PRIMARY_MAX_EDGE = 1024;
export const GENERATION_REFERENCE_PRIMARY_QUALITY = 0.82;
export const GENERATION_REFERENCE_FALLBACK_MAX_EDGE = 768;
export const GENERATION_REFERENCE_FALLBACK_QUALITY = 0.72;
export const GENERATION_REFERENCE_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const GENERATION_REFERENCE_MAX_COUNT = 16;

export interface GenerationReferencePayloadInput {
  name: string;
  mimeType: string;
  blob: Blob;
  kind?: "product" | "style";
}

export interface GenerationReferencePayloadResult {
  images: GenerationReferencePayloadInput[];
  originalBytes: number;
  payloadBytes: number;
  compressedCount: number;
  pass: "none" | "primary" | "fallback";
  notice: string | null;
}

export class GenerationReferencePayloadError extends Error {
  readonly name = "GenerationReferencePayloadError";

  constructor(message: string) {
    super(message);
  }
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function totalBytes(images: readonly GenerationReferencePayloadInput[]): number {
  return images.reduce((sum, image) => sum + image.blob.size, 0);
}

async function compressOne(
  image: GenerationReferencePayloadInput,
  maxEdge: number,
  quality: number,
): Promise<GenerationReferencePayloadInput> {
  const file = new File([image.blob], image.name, {
    type: image.mimeType || image.blob.type || "image/jpeg",
  });
  const compressed = await compressImageFile(file, { maxEdge, quality });
  return {
    name: image.name,
    mimeType: compressed.type || image.mimeType,
    blob: compressed,
    ...(image.kind ? { kind: image.kind } : {}),
  };
}

async function compressAll(
  images: readonly GenerationReferencePayloadInput[],
  maxEdge: number,
  quality: number,
): Promise<GenerationReferencePayloadInput[]> {
  return Promise.all(images.map((image) => compressOne(image, maxEdge, quality)));
}

/**
 * Prepare reference images for an Images API / edit request.
 * Caps count, compresses to AIS primary then fallback edges, enforces 8 MiB total.
 */
export async function prepareGenerationReferencePayload(
  images: readonly GenerationReferencePayloadInput[],
  options: {
    maxCount?: number;
    maxPayloadBytes?: number;
  } = {},
): Promise<GenerationReferencePayloadResult> {
  const maxCount = options.maxCount ?? GENERATION_REFERENCE_MAX_COUNT;
  const maxPayloadBytes = options.maxPayloadBytes ?? GENERATION_REFERENCE_MAX_PAYLOAD_BYTES;

  if (images.length === 0) {
    return {
      images: [],
      originalBytes: 0,
      payloadBytes: 0,
      compressedCount: 0,
      pass: "none",
      notice: null,
    };
  }

  const limited = images.slice(0, maxCount);
  const originalBytes = totalBytes(limited);

  if (originalBytes <= maxPayloadBytes) {
    // Still downscale large edges so provider requests stay light.
    const primary = await compressAll(
      limited,
      GENERATION_REFERENCE_PRIMARY_MAX_EDGE,
      GENERATION_REFERENCE_PRIMARY_QUALITY,
    );
    const primaryBytes = totalBytes(primary);
    if (primaryBytes <= maxPayloadBytes) {
      const compressedCount = primary.filter(
        (image, index) => image.blob.size < limited[index]!.blob.size,
      ).length;
      return {
        images: primary,
        originalBytes,
        payloadBytes: primaryBytes,
        compressedCount,
        pass: compressedCount > 0 ? "primary" : "none",
        notice:
          compressedCount > 0
            ? `本次已压缩 ${compressedCount} 张参考图：${formatMiB(originalBytes)} -> ${formatMiB(primaryBytes)}`
            : null,
      };
    }
  } else {
    const primary = await compressAll(
      limited,
      GENERATION_REFERENCE_PRIMARY_MAX_EDGE,
      GENERATION_REFERENCE_PRIMARY_QUALITY,
    );
    const primaryBytes = totalBytes(primary);
    if (primaryBytes <= maxPayloadBytes) {
      return {
        images: primary,
        originalBytes,
        payloadBytes: primaryBytes,
        compressedCount: limited.length,
        pass: "primary",
        notice: `本次已压缩 ${limited.length} 张参考图：${formatMiB(originalBytes)} -> ${formatMiB(primaryBytes)}`,
      };
    }
  }

  const fallback = await compressAll(
    limited,
    GENERATION_REFERENCE_FALLBACK_MAX_EDGE,
    GENERATION_REFERENCE_FALLBACK_QUALITY,
  );
  const fallbackBytes = totalBytes(fallback);
  if (fallbackBytes <= maxPayloadBytes) {
    return {
      images: fallback,
      originalBytes,
      payloadBytes: fallbackBytes,
      compressedCount: limited.length,
      pass: "fallback",
      notice: `本次已压缩 ${limited.length} 张参考图：${formatMiB(originalBytes)} -> ${formatMiB(fallbackBytes)}，已自动降级压缩`,
    };
  }

  throw new GenerationReferencePayloadError(
    `参考图压缩后仍过大：${formatMiB(fallbackBytes)}，上限为 ${formatMiB(maxPayloadBytes)}。请删除部分参考图或换更小图片后重试。`,
  );
}
