import type { SizeTier } from "../platforms/amazon-catalog";
import type { PlatformId, SlotDimensions } from "../platforms/types";

export type GenerationSource = "demo" | "api";

export interface GenerationReferenceImage {
  name: string;
  mimeType: string;
  blob: Blob;
  kind?: "product" | "style";
}

export interface ImageEditInput {
  target: GenerationReferenceImage;
  mask: GenerationReferenceImage;
}

export interface ImageGenerationRequest {
  projectId: string;
  productName: string;
  platformId: PlatformId;
  slotKey: string;
  prompt: string;
  negativePrompt: string;
  visibleCopy: string;
  /** Seller Central / delivery upload-reference size. */
  uploadDimensions: SlotDimensions;
  /** Provider generation canvas size (may differ from upload). */
  dimensions: SlotDimensions;
  sizeTier?: SizeTier;
  referenceImages: readonly GenerationReferenceImage[];
  /** Explicit local edit input. The mask uses transparent pixels as the editable area. */
  edit?: ImageEditInput;
}

export interface GeneratedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  source: GenerationSource;
  parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface ImageGenerator {
  generate(request: ImageGenerationRequest, signal: AbortSignal): Promise<GeneratedImage>;
}

export interface SlotVersion {
  id: string;
  slotKey: string;
  assetId: string;
  createdAt: string;
  source: GenerationSource;
  promptSnapshot: string;
  visibleCopySnapshot: string;
  planningInputSignature?: string;
  width: number;
  height: number;
  mimeType: string;
  parameters: Record<string, string | number | boolean>;
}

export interface SlotVersionState {
  versions: SlotVersion[];
  activeVersionId: string | null;
}
