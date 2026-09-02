// Deterministic AI implementations for tests only; never imported by production code.
import type { PlannerEngine } from "../../src/domain/planning/types";
import type { ImageGenerator } from "../../src/domain/generation/types";
import type { IndustryTemplateTransformer } from "../../src/domain/prompt-templates/industry-template-transformer";

export const mockPlanner: PlannerEngine = {
  async plan(_project, rulePack, signal, _referenceImages, _amazonOptions, _inputAssessment, _industryTemplate, _taskSettings) {
    if (signal.aborted) throw signal.reason ?? new DOMException("策划已取消", "AbortError");
    return {
      platformId: rulePack.platformId,
      source: "api",
      slots: rulePack.slots.map((slot) => ({
        slotKey: slot.key,
        visibleCopy: slot.key === "MAIN" ? "" : slot.label,
        strategy: "Mock strategy for " + slot.label,
        evidence: ["Mock evidence"],
        prompt: "Mock prompt for " + slot.label,
        negativePrompt: "Mock negative prompt",
        ...(slot.group === "a-plus" && slot.dimensions.width === 220 ? { externalText: { title: slot.label, body: "Mock body" } } : {}),
      })),
      ...(rulePack.platformId === "amazon" ? { amazonSession: { marketplaceId: "us", plannerMode: "listing", slotKeys: rulePack.slots.map((slot) => slot.key) } } : {}),
    };
  },
};

export const mockImageGenerator: ImageGenerator = {
  async generate(request, signal) {
    if (signal.aborted) throw signal.reason ?? new DOMException("图片生成已取消", "AbortError");
    const width = request.dimensions.width;
    const height = request.dimensions.height;
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\"><rect width=\"100%\" height=\"100%\" fill=\"#fff\"/><text x=\"20\" y=\"40\">MOCK IMAGE " + request.slotKey + "</text></svg>";
    return { blob: new Blob([svg], { type: "image/svg+xml" }), width, height, mimeType: "image/svg+xml", source: "api", parameters: { engine: "mock-svg-v1" } };
  },
};

export const mockIndustryTemplateTransformer: IndustryTemplateTransformer = {
  async transform(request, signal) {
    if (signal.aborted) throw signal.reason ?? new DOMException("行业模板改造已取消", "AbortError");
    return { slots: request.rulePack.slots.map((slot) => ({ slotKey: slot.key, label: slot.label, guidance: "Mock industry guidance", negativeGuidance: "Mock negative guidance" })) };
  },
};
