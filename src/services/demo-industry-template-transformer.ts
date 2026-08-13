import type {
  IndustryTemplateTransformer,
  IndustryTemplateTransformRequest,
  IndustryTemplateTransformResult,
} from "../domain/prompt-templates/industry-template-transformer";

function industryContext(request: IndustryTemplateTransformRequest): string {
  const { brief } = request;
  return [
    brief.industry ? `行业：${brief.industry}` : "",
    brief.productTypes ? `适用产品：${brief.productTypes}` : "",
    brief.targetAudience ? `目标人群：${brief.targetAudience}` : "",
    brief.stylePreference ? `风格：${brief.stylePreference}` : "",
    brief.extraRequirements ? `补充要求：${brief.extraRequirements}` : "",
  ].filter(Boolean).join("；");
}

export const demoIndustryTemplateTransformer: IndustryTemplateTransformer = {
  async transform(request, signal): Promise<IndustryTemplateTransformResult> {
    if (signal.aborted) throw signal.reason ?? new DOMException("行业模板改造已取消", "AbortError");
    const context = industryContext(request);
    const forbidden = request.brief.forbiddenContent.trim();
    return {
      slots: request.rulePack.slots.map((rule) => {
        const base = request.baseTemplate.slots.find((slot) => slot.slotKey === rule.key);
        return {
          slotKey: rule.key,
          label: rule.label,
          guidance: [context, base?.guidance ?? [rule.purpose, ...rule.planningHints].join("；")]
            .filter(Boolean)
            .join("。"),
          negativeGuidance: [
            base?.negativeGuidance ?? [...request.rulePack.promptGuardrails, ...rule.complianceReminders].join("；"),
            forbidden ? `行业额外禁止：${forbidden}` : "",
          ].filter(Boolean).join("；"),
        };
      }),
    };
  },
};

