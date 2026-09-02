import type { PromptBundle, PromptMessage, PromptSource, PromptSourceRef, PlannerPromptInput, LocalizationPromptInput, IndustryTemplatePromptInput, GenerationPromptInput } from "./types";
import { getAmazonMarketplaceByLocale } from "../platforms/amazon-marketplaces";
import { closestStandardAspectRatio } from "../platforms/generation-size";
import { resolveIndustryTemplateGuidance } from "../prompt-templates/industry-template-packs";

export const PROMPT_BUNDLE_VERSION = "1.1.0";
export const PROMPT_VERSION = PROMPT_BUNDLE_VERSION;
export const PROMPT_CONTRACT_VERSION = "1.1.0";

function bundle(
  kind: PromptBundle["kind"],
  messages: PromptMessage[],
  source: PromptSource = "system",
  priority = 0,
  outputFormat: PromptBundle["outputFormat"] = "json-object",
): PromptBundle {
  const system = messages.find((message) => message.role === "system")?.content;
  const user = messages.find((message) => message.role === "user")?.content;
  const stringify = (value: PromptMessage["content"] | undefined): string =>
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  const promptId = `ecom.${kind}`;
  const sources: readonly PromptSourceRef[] = Object.freeze([
    { kind: source, id: promptId, version: PROMPT_BUNDLE_VERSION },
  ]);
  return Object.freeze({
    kind,
    version: PROMPT_BUNDLE_VERSION,
    promptId,
    promptVersion: PROMPT_BUNDLE_VERSION,
    contractVersion: PROMPT_CONTRACT_VERSION,
    priority,
    source,
    sources,
    system: stringify(system),
    user: stringify(user),
    outputFormat,
    messages: Object.freeze(messages),
  });
}

function plannerPlatformContract(rulePack: PlannerPromptInput["rulePack"]): Record<string, unknown> {
  return {
    platformId: rulePack.platformId,
    label: rulePack.label,
    locale: rulePack.locale,
    promptLanguage: rulePack.promptLanguage,
    slots: rulePack.slots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      ...(slot.uiLabel ? { uiLabel: slot.uiLabel } : {}),
      group: slot.group,
      order: slot.order,
      required: slot.required,
      dimensions: slot.dimensions,
      complianceReminders: slot.complianceReminders,
    })),
    planningInstructions: rulePack.planningInstructions,
    promptGuardrails: rulePack.promptGuardrails,
    complianceReminders: rulePack.complianceReminders,
  };
}

export function buildPlannerPrompt(input: PlannerPromptInput): PromptBundle {
  const {
    project: product,
    rulePack,
    taskSettings,
    referenceImages = [],
    inputAssessment,
    industryTemplate,
    strategySnippet,
    referenceImagesSkipped,
  } = input;
  const activeIndustryGuidance = resolveIndustryTemplateGuidance(
    rulePack,
    industryTemplate,
    taskSettings?.workflowId,
  );
  const slotKeys = rulePack.slots.map((slot) => slot.key).join(", ");
  const system = [
    "Return JSON only, without commentary or Markdown.",
    `platformId must be ${rulePack.platformId} and source must be api.`,
    `promptLanguage is ${rulePack.promptLanguage}.`,
    `slots must contain each of these keys exactly once: ${slotKeys}.`,
    "Every slot must contain these base fields: slotKey, visibleCopy, strategy, evidence, prompt, negativePrompt.",
    "evidence must be a non-empty string array; all other slot fields must be strings.",
    "Every slot prompt must explicitly state the target aspect ratio derived from that slot's dimensions (for example, Target aspect ratio: 1:1).",
    "The user payload is divided into platformContract, activeIndustryGuidance, taskSettings, product facts, and evidence.",
    "platformContract is immutable for this run: preserve its slot keys, dimensions, counts, marketplace rules, and compliance constraints.",
    "activeIndustryGuidance is the only industry-level visual direction. It replaces the general industry direction for matching slots; do not merge the replaced general direction back into the plan.",
    "Task settings are supplied in the user payload under taskSettings and are authoritative for this run. Do not infer or silently replace them with defaults.",
    ...(rulePack.slots.some((slot) => slot.group === "a-plus" && slot.dimensions.width === 220)
      ? [
          "Only A+ tile slots must also contain externalText with non-empty title and body.",
          "externalText is customer-facing copy outside the image; keep visibleCopy empty and do not include externalText in prompt or negativePrompt.",
        ]
      : []),
    ...(rulePack.platformId === "amazon"
      ? [
          'For Amazon, MAIN.visibleCopy must be exactly "".',
          `For every Amazon slot, strategy must be a detailed Simplified Chinese planning card explaining the visual objective, composition, product evidence, on-image copy approach, and compliance boundaries for ${getAmazonMarketplaceByLocale(rulePack.locale)?.domain ?? "Amazon.com"}.`,
          "For every Amazon slot, prompt is the complete professional US English image-generation prompt. negativePrompt is a separate concise US English exclusion list for the image model.",
          "Every other non-empty visibleCopy must use natural marketplace language for the selected domain.",
        ]
      : []),
    "Evidence policy: distinguish three categories explicitly: user-supplied facts, information directly visible in a selected product image, and missing facts.",
    "User-supplied facts may be used as factual copy and evidence. Image-visible information may describe only directly observable appearance, color, shape, count, layout, and visible construction.",
    "Never infer hidden dimensions, material composition, performance, efficacy, certification, warranty, compatibility, package contents, or safety claims.",
    "When a fact is missing, mark it as missing in evidence and keep copy/prompt neutral instead of inventing it.",
    rulePack.promptLanguage === "en"
      ? "Language contract: strategy and evidence are user-facing planning notes and must be written in Simplified Chinese. prompt and negativePrompt must use natural-English model instructions and evidence labels. Preserve brand names, model numbers, SKUs, proper nouns, dimensions, units, numeric values, and any fact value whose translation could alter evidence. Do not put Chinese planning explanations or labels such as 事实依据 inside prompt or negativePrompt."
      : "prompt and negativePrompt use the platform source language; strategy and evidence remain readable planning notes.",
    ...(rulePack.platformId === "amazon" ? [
      "Amazon Listing source rule: when product.listingText is present, treat the original pasted Listing as the primary source for title, bullets, product facts, and buyer benefits; parsed product fields are supporting structure only.",
    ] : []),
    ...rulePack.planningInstructions,
    ...rulePack.promptGuardrails,
    ...rulePack.complianceReminders,
    ...(strategySnippet ? [strategySnippet] : []),
    `Active industry guidance: ${activeIndustryGuidance.name} v${activeIndustryGuidance.version}.`,
    "Treat activeIndustryGuidance as reusable slot direction, not product evidence.",
    "Current product facts, reference-image evidence, platformContract rules, and compliance constraints override any unsupported industry direction.",
    ...(referenceImagesSkipped ? [referenceImagesSkipped] : []),
  ].join("\n");
  const payload = JSON.stringify({
    product,
    ...(rulePack.platformId === "amazon" && product.listingText?.trim()
      ? {
          originalListingText: product.listingText,
          originalListingTextRule: "Use this pasted Listing as the primary source; do not discard title or bullet wording when planning slots.",
        }
      : {}),
    platformContract: plannerPlatformContract(rulePack),
    activeIndustryGuidance,
    ...(taskSettings ? { taskSettings } : {}),
    ...(inputAssessment ? { inputAssessment } : {}),
    referenceImages: referenceImages.map(({ name, mimeType }) => ({ name, mimeType })),
    ...(referenceImagesSkipped ? { referenceImagesSkipped } : {}),
  });
  return bundle("planner", [{ role: "system", content: system }, { role: "user", content: payload }], "system", 10);
}

export function buildLocalizationPrompt(input: LocalizationPromptInput): PromptBundle {
  const system = [
    "Return JSON only. Localize the supplied product facts for the target locale.",
    "Keep the exact JSON shape and array lengths.",
    "Never change brand, model, SKU, numbers, dimensions, quantities, certification identifiers, or factual meaning.",
    "Do not convert units and do not add claims or facts.",
  ].join("\n");
  return bundle("localization", [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ targetLocale: input.targetLocale, rules: input.rules, facts: input.facts }) }], "system", 30);
}

export function buildIndustryTemplatePrompt(input: IndustryTemplatePromptInput): PromptBundle {
  const rulePack = input.rulePack ?? input.platform;
  if (!rulePack) throw new Error("Industry template prompt requires a platform rule pack");
  const keys = rulePack.slots.map((slot) => slot.key).join(", ");
  const system = [
    "Return JSON only with one field: slots.",
    "Rewrite every supplied slot into reusable industry-level image planning guidance. The generated slots become the active industry guidance and replace the supplied general slot direction.",
    "Do not include concrete SKU facts, exact dimensions, colors, package contents, certifications, or fixed scenes unless explicitly stated as a reusable industry constraint.",
    `Return these slot keys exactly once: ${keys}.`,
    "Write guidance in Simplified Chinese; final model prompt language is handled later by the product planner.",
  ].join("\n");
  const payload = JSON.stringify({ platform: rulePack.label, brief: input.brief, baseTemplate: input.baseTemplate.slots });
  return bundle("industry-template", [{ role: "system", content: system }, { role: "user", content: payload }], "system", 40);
}

export function buildGenerationPrompt(input: GenerationPromptInput): PromptBundle {
  const request = "request" in input ? input.request : input;
  const slotRule = request.platformRules?.slots.find((slot) => slot.key === request.slotKey);
  const facts = request.productFacts;
  const factLines = facts
    ? [
        facts.productName ? `商品身份：${facts.productName}` : "",
        facts.category ? `品类：${facts.category}` : "",
        facts.brand ? `品牌：${facts.brand}` : "",
        facts.model ? `型号：${facts.model}` : "",
        facts.sku ? `SKU：${facts.sku}` : "",
        facts.description ? `已提供描述：${facts.description}` : "",
        facts.sellingPoints?.length ? `已验证卖点：${facts.sellingPoints.join("、")}` : "",
        facts.specifications && typeof facts.specifications === "object"
          ? `已验证规格：${JSON.stringify(facts.specifications)}`
          : "",
        facts.forbiddenClaims?.length ? `禁止使用的声明：${facts.forbiddenClaims.join("、")}` : "",
      ].filter(Boolean)
    : [];
  const context = request.platformRules
    ? [
        `平台：${request.platformRules.label}（${request.platformRules.platformId}，${request.platformRules.locale}）。`,
        slotRule
          ? `槽位角色：${slotRule.label}；${slotRule.purpose}；平台上传画布 ${slotRule.dimensions.width}x${slotRule.dimensions.height}。`
          : "",
        request.referenceImageNames?.length
          ? `参考图身份事实来源：${request.referenceImageNames.join("、")}。以参考图中可见的外形、颜色、比例、结构和配件为唯一商品身份依据，不得重设计或替换商品。`
          : "",
        factLines.length ? `商品与内容上下文：${factLines.join("；")}` : "",
        request.slotStrategy?.trim() ? `槽位策划：${request.slotStrategy.trim()}` : "",
        request.slotEvidence?.length ? `槽位事实证据：${request.slotEvidence.join("；")}` : "",
        "视觉执行：保持项目级视觉风格一致；明确主体、前景、中景、背景层次，使用具体镜头（景别、焦段、视角）、光线、材质和道具；主体关键结构不被遮挡。",
        "商业版式：图内标题、卖点、CTA、徽章仅在槽位文案明确提供且有事实依据时出现；文字与徽章置于安全边距内，避免压住商品和裁切边缘。",
        "物理约束：严格遵守商品已知尺寸、材质、结构、颜色、数量和包装；不添加未提供的功能、配件、材质、认证或功效。",
        request.aiInstructions?.length ? `平台与项目约束：${request.aiInstructions.join("；")}` : "",
        request.additionalRequirements?.trim() ? `用户补充要求：${request.additionalRequirements.trim()}。将其落实到镜头、场景、道具、交互、构图和图内文案，不得只复述。` : "",
      ].filter(Boolean)
    : [];
  const text = [
    context.length ? context.join("\n") : "",
    request.prompt.trim(),
    request.dimensions
      ? [
          `Target aspect ratio: ${closestStandardAspectRatio(request.dimensions.width, request.dimensions.height)}.`,
          `Expected output resolution: ${request.dimensions.width}x${request.dimensions.height}.`,
          request.uploadDimensions
            ? `Upload reference size: ${request.uploadDimensions.width}x${request.uploadDimensions.height}.`
            : "",
        ].filter(Boolean).join(" ")
      : "",
    request.visibleCopy.trim() ? `Visible copy: ${request.visibleCopy.trim()}` : "",
    request.negativePrompt.trim() ? `Avoid: ${request.negativePrompt.trim()}` : "",
  ].filter(Boolean).join("\n");
  return bundle("generation", [{ role: "user", content: text }], "project", 50, "text");
}

export const buildPlannerPromptBundle = buildPlannerPrompt;
export const buildLocalizationPromptBundle = buildLocalizationPrompt;
export const buildIndustryTemplatePromptBundle = buildIndustryTemplatePrompt;
export const buildGenerationPromptBundle = buildGenerationPrompt;
export const createPlannerPrompt = buildPlannerPrompt;
export const createLocalizationPrompt = buildLocalizationPrompt;
export const createIndustryTemplatePrompt = buildIndustryTemplatePrompt;
export const createGenerationPrompt = buildGenerationPrompt;
