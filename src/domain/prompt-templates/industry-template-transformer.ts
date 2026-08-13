import type { PlatformRulePack } from "../platforms/types";
import type {
  IndustryTemplateBrief,
  IndustryTemplateSlotGuidance,
  IndustryTemplateSnapshot,
} from "./industry-template-packs";

export interface IndustryTemplateTransformRequest {
  baseTemplate: IndustryTemplateSnapshot;
  brief: IndustryTemplateBrief;
  rulePack: PlatformRulePack;
}

export interface IndustryTemplateTransformResult {
  slots: IndustryTemplateSlotGuidance[];
}

export interface IndustryTemplateTransformer {
  transform(
    request: IndustryTemplateTransformRequest,
    signal: AbortSignal,
  ): Promise<IndustryTemplateTransformResult>;
}

