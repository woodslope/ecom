import type { SizeTier } from "../platforms/amazon-catalog";
import type { PlatformId, PlatformRulePack, SlotDimensions } from "../platforms/types";
import type { PlanningProjectFacts } from "../planning/types";

export type GenerationSource = "api";

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
  /** Runtime correlation and freshness metadata. Optional for legacy adapters. */
  operationId?: string;
  taskId?: string;
  inputSignature?: string;
  productFacts?: PlanningProjectFacts;
  platformRules?: PlatformRulePack;
  aiInstructions?: readonly string[];
  /** Optional user-authored requirements that must be translated into the image brief. */
  additionalRequirements?: string;
  /** Names of selected references; binary image payloads remain in referenceImages. */
  referenceImageNames?: readonly string[];
  /** Editable slot planning context included in the final generation brief. */
  slotStrategy?: string;
  slotEvidence?: readonly string[];
  outputConstraints?: {
    format: "image";
    slotKey: string;
    promptRequired: true;
  };
}

/** Canonical runtime boundary for generating one planned slot. */
export interface SlotGenerationRequest extends Omit<ImageGenerationRequest, "operationId" | "taskId" | "inputSignature" | "productFacts" | "platformRules" | "aiInstructions" | "outputConstraints"> {
  operationId: string;
  taskId: string;
  inputSignature: string;
  productFacts: PlanningProjectFacts;
  platformRules: PlatformRulePack;
  aiInstructions: readonly string[];
  outputConstraints: {
    format: "image";
    slotKey: string;
    promptRequired: true;
  };
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
  /** Optional envelope-based adapter entry point. */
  generateRequest?(request: SlotGenerationRequest, signal: AbortSignal): Promise<GeneratedImage>;
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
