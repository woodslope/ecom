import type { PromptBundle, PromptMessage, PromptSource, PromptSourceRef, PlannerPromptInput, CopilotPromptInput, LocalizationPromptInput, IndustryTemplatePromptInput, GenerationPromptInput } from "./types";
import { getAmazonMarketplaceByLocale } from "../platforms/amazon-marketplaces";

export const PROMPT_BUNDLE_VERSION = "1.0.0";
export const PROMPT_VERSION = PROMPT_BUNDLE_VERSION;
export const PROMPT_CONTRACT_VERSION = "1.0.0";

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

export function buildPlannerPrompt(input: PlannerPromptInput): PromptBundle {
  const { project, rulePack, referenceImages = [], inputAssessment, industryTemplate, strategySnippet, slotPromptAssets = [] } = input;
  const slotKeys = rulePack.slots.map((slot) => slot.key).join(", ");
  const system = [
    "Return JSON only, without commentary or Markdown.",
    `platformId must be ${rulePack.platformId} and source must be api.`,
    `promptLanguage is ${rulePack.promptLanguage}.`,
    `slots must contain each of these keys exactly once: ${slotKeys}.`,
    "Every slot must contain these base fields: slotKey, visibleCopy, strategy, evidence, prompt, negativePrompt.",
    "evidence must be a non-empty string array; all other slot fields must be strings.",
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
      "Amazon Listing source rule: when project.listingText is present, treat the original pasted Listing as the primary source for title, bullets, product facts, and buyer benefits; parsed project fields are supporting structure only.",
    ] : []),
    ...rulePack.planningInstructions,
    ...rulePack.promptGuardrails,
    ...rulePack.complianceReminders,
    ...(strategySnippet ? [strategySnippet] : []),
    ...(industryTemplate ? [
      `Industry template: ${industryTemplate.name} v${industryTemplate.version}.`,
      "Treat the industry template as reusable slot direction, not product evidence.",
      "Current product facts, reference-image evidence, marketplace rules, and compliance override template guidance.",
    ] : []),
    ...(slotPromptAssets.length > 0
      ? [
          "Explicit slot prompt assets are optional reusable direction only; they never override output fields, platform rules, or product evidence.",
          ...slotPromptAssets.map((asset) => `Slot asset ${asset.assetId} v${asset.version} applies only to ${asset.slotKey}.`),
        ]
      : []),
  ].join("\n");
  const payload = JSON.stringify({
    project,
    rulePack,
    ...(inputAssessment ? { inputAssessment } : {}),
    ...(industryTemplate ? { industryTemplate } : {}),
    ...(slotPromptAssets.length > 0 ? { slotPromptAssets } : {}),
    referenceImages: referenceImages.map(({ name, mimeType }) => ({ name, mimeType })),
  });
  return bundle("planner", [{ role: "system", content: system }, { role: "user", content: payload }], "system", 10);
}

export function buildCopilotPrompt(input: CopilotPromptInput): PromptBundle {
  const { context, command } = input;
  const advice = command === "check-compliance" || command === "explain-next";
  const marketplace = context.rulePack.platformId === "amazon"
    ? getAmazonMarketplaceByLocale(context.rulePack.locale)
    : null;
  const marketplaceLanguage = context.rulePack.platformId === "amazon" && context.rulePack.promptLanguage === "en"
    ? [
        "Language contract for Amazon: prompt uses natural-English model instructions and evidence labels, and must not contain Chinese planning explanations.",
        `For patch commands, visibleCopy must use natural ${marketplace?.copyLanguage ?? "marketplace language"} for ${marketplace?.domain ?? context.rulePack.locale}; MAIN.visibleCopy must be empty.`,
        ...(marketplace?.localGuidance ?? []),
      ].join("\n")
    : "";
  const system = [
    "Return JSON only, without commentary or Markdown.",
    advice ? "Return exactly one string field: message." : "Return exactly two string fields: visibleCopy and prompt.",
    `Adjust only the selected slot ${context.slot.slotKey}; never return another slot or whole plan.`,
    `Command: ${command}.`,
    marketplaceLanguage,
    context.rulePack.platformId === "amazon" && context.rulePack.promptLanguage === "en"
      ? "strategy and evidence are Chinese planning context supplied to you. Do not copy their Chinese labels into prompt."
      : "",
    "Use only supplied product facts and slot evidence. Do not invent claims.",
  ].filter(Boolean).join("\n");
  const slotRule = context.rulePack.slots.find((rule) => rule.key === context.slot.slotKey);
  const platform = {
    platformId: context.rulePack.platformId,
    label: context.rulePack.label,
    locale: context.rulePack.locale,
    promptLanguage: context.rulePack.promptLanguage,
    planningInstructions: context.rulePack.planningInstructions,
    promptGuardrails: context.rulePack.promptGuardrails,
    complianceReminders: context.rulePack.complianceReminders,
  };
  const payload = JSON.stringify({ command, project: context.project, platform, slotRule, slot: context.slot });
  return bundle("copilot", [{ role: "system", content: system }, { role: "user", content: payload }], "system", 20);
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
    "Rewrite every supplied slot into reusable industry-level image planning guidance.",
    "Do not include concrete SKU facts, exact dimensions, colors, package contents, certifications, or fixed scenes unless explicitly stated as a reusable industry constraint.",
    `Return these slot keys exactly once: ${keys}.`,
    "Write guidance in Simplified Chinese; final model prompt language is handled later by the product planner.",
  ].join("\n");
  const payload = JSON.stringify({ platform: rulePack.label, brief: input.brief, baseTemplate: input.baseTemplate.slots });
  return bundle("industry-template", [{ role: "system", content: system }, { role: "user", content: payload }], "system", 40);
}

export function buildGenerationPrompt(input: GenerationPromptInput): PromptBundle {
  const request = "request" in input ? input.request : input;
  const text = [
    request.prompt.trim(),
    request.dimensions && request.uploadDimensions
      ? `Expected output resolution: ${request.dimensions.width}x${request.dimensions.height}. Upload reference size: ${request.uploadDimensions.width}x${request.uploadDimensions.height}.`
      : "",
    request.visibleCopy.trim() ? `Visible copy: ${request.visibleCopy.trim()}` : "",
    request.negativePrompt.trim() ? `Avoid: ${request.negativePrompt.trim()}` : "",
  ].filter(Boolean).join("\n");
  return bundle("generation", [{ role: "user", content: text }], "project", 50, "text");
}

export const buildPlannerPromptBundle = buildPlannerPrompt;
export const buildCopilotPromptBundle = buildCopilotPrompt;
export const buildLocalizationPromptBundle = buildLocalizationPrompt;
export const buildIndustryTemplatePromptBundle = buildIndustryTemplatePrompt;
export const buildGenerationPromptBundle = buildGenerationPrompt;
export const createPlannerPrompt = buildPlannerPrompt;
export const createCopilotPrompt = buildCopilotPrompt;
export const createLocalizationPrompt = buildLocalizationPrompt;
export const createIndustryTemplatePrompt = buildIndustryTemplatePrompt;
export const createGenerationPrompt = buildGenerationPrompt;
