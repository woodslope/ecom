import type { IndustryTemplateBrief, IndustryTemplateSnapshot } from "../prompt-templates/industry-template-packs";
import type { PlanningInputAssessment } from "../planning/input-assessment";
import type { PlanningProjectFacts, PlanningReferenceImage } from "../planning/types";
import type { PlatformId, PlatformRulePack, PlatformWorkflowId } from "../platforms/types";
import type {
  APlusContentType,
  AmazonAPlusModuleSpec,
  AmazonPlannerMode,
  SizeTier,
} from "../platforms/amazon-catalog";
import type { AmazonMarketplaceId } from "../platforms/amazon-marketplaces";
import type { LocalizationRules } from "../localization/product-localizer";
import type { ImageGenerationRequest } from "../generation/types";

export type PromptKind = "planner" | "localization" | "industry-template" | "generation";
export type PromptVersion = string;
export type PromptSource =
  | "system"
  | "builtin"
  | "platform"
  | "project"
  | "profile"
  | "industry-template"
  | "user"
  | "runtime";

/** Lower numbers are evaluated first; higher numbers override conflicting guidance. */
export type PromptPriority = number;

export interface PromptSourceRef {
  kind: PromptSource;
  id?: string;
  version?: string;
  label?: string;
}

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string | readonly PromptContentPart[];
}

export type PromptContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface PromptTrace {
  planner?: {
    promptId: string;
    promptVersion: string;
    contractVersion: string;
    profileId?: string | null;
    industryTemplateId?: string;
    industryTemplateVersion?: number;
  };
  generation?: {
    promptId: string;
    promptVersion: string;
    contractVersion: string;
  };
  providerSummary?: {
    text?: { provider?: string; model?: string; protocol?: string };
    image?: { provider?: string; model?: string; protocol?: string };
  };
  /** Correlates a prompt with an adapter request or production run. */
  requestId?: string;
  runId?: string;
  provider?: string;
  model?: string;
  source?: PromptSource;
  version?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PromptBundle {
  readonly kind: PromptKind;
  readonly version: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly contractVersion: string;
  readonly priority: PromptPriority;
  readonly source: PromptSource;
  readonly sources: readonly PromptSourceRef[];
  /** Transport-friendly projections of the canonical messages. */
  readonly system: string;
  readonly user: string;
  readonly outputFormat?: "json-object" | "text";
  readonly messages: readonly PromptMessage[];
  readonly trace?: PromptTrace;
}

export interface PlannerPromptInput {
  project: PlanningProjectFacts;
  rulePack: PlatformRulePack;
  /** Explicit run settings selected in the task UI. Keep this separate from the resolved rule pack. */
  taskSettings?: PlannerTaskSettings;
  referenceImages?: readonly PlanningReferenceImage[];
  inputAssessment?: PlanningInputAssessment;
  industryTemplate?: IndustryTemplateSnapshot;
  strategySnippet?: string;
  /** Set when the configured planner cannot receive the selected product images. */
  referenceImagesSkipped?: string;
}

/** JSON-safe task settings sent to the planner as authoritative run variables. */
export interface PlannerTaskSettings {
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  locale: string;
  marketplaceId?: AmazonMarketplaceId;
  plannerMode?: AmazonPlannerMode;
  listingImageCount?: number;
  aPlusType?: APlusContentType;
  aPlusModuleSpecs?: readonly AmazonAPlusModuleSpec[];
  sizeTier?: SizeTier;
  stylePresetId?: string | null;
  selectedReferenceAssetIds: readonly string[];
}

export interface LocalizationPromptInput {
  facts: unknown;
  targetLocale: string;
  rules: LocalizationRules;
}

export interface IndustryTemplatePromptInput {
  /** `rulePack` matches IndustryTemplateTransformRequest; `platform` is a readable alias. */
  rulePack?: PlatformRulePack;
  platform?: PlatformRulePack;
  brief: IndustryTemplateBrief;
  baseTemplate: IndustryTemplateSnapshot;
}

/** Deliberately contains only generation-domain data; transport/API options are not accepted. */
export type GenerationPromptFields = Pick<ImageGenerationRequest, "productName" | "platformId" | "slotKey" | "prompt" | "negativePrompt" | "visibleCopy"> & Partial<Pick<ImageGenerationRequest, "dimensions" | "uploadDimensions" | "sizeTier" | "productFacts" | "platformRules" | "aiInstructions" | "additionalRequirements" | "referenceImageNames" | "slotStrategy" | "slotEvidence">>;
export type GenerationPromptInput = { request: GenerationPromptFields } | GenerationPromptFields;
