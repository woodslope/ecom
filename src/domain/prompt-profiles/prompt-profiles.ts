/**
 * Prompt Profile system — extends style presets with planning strategy and
 * prompt-generation preferences. Each profile controls both the AI planner
 * behavior (planning strategy) and the image generation style (style guidance).
 *
 * Built-in profiles serve as starting points; users can create custom profiles
 * derived from any built-in.
 */

import {
  type AmazonStylePreset,
  AMAZON_STYLE_PRESETS,
  getAmazonStylePreset,
  DEFAULT_AMAZON_STYLE_PRESET_ID,
  appendStyleGuidanceToPrompt,
  appendStyleReferenceGuidance,
  shouldApplyStyleToSlot,
  STYLE_REFERENCE_PROMPT_GUARD,
} from "../platforms/amazon-style-presets";

export {
  AMAZON_STYLE_PRESETS,
  getAmazonStylePreset,
  DEFAULT_AMAZON_STYLE_PRESET_ID,
  appendStyleGuidanceToPrompt,
  appendStyleReferenceGuidance,
  shouldApplyStyleToSlot,
  STYLE_REFERENCE_PROMPT_GUARD,
};

export type { AmazonStylePreset };

/** Planning strategy preferences injected into the planner system prompt. */
export interface PlanningStrategy {
  /** Core strategy direction added to the planner's system instructions. */
  readonly direction: string;
  /** Copy tone preference: formal, conversational, product-focused, benefit-driven. */
  readonly copyTone: "formal" | "conversational" | "product" | "benefit";
  /** Slot composition preference: evidence-heavy, lifestyle-heavy, balanced. */
  readonly compositionBias: "evidence" | "lifestyle" | "balanced";
  /** Whether to prefer shorter, punchy slot copy or detailed explanations. */
  readonly copyDensity: "concise" | "detailed";
}

export interface PromptProfile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Underlying style preset for visual guidance. */
  readonly style: AmazonStylePreset;
  /** Planning strategy injected into system prompt. */
  readonly planningStrategy: PlanningStrategy;
  /** Whether this is built-in or user-created. */
  readonly source: "builtin" | "custom";
  /** For custom profiles, the built-in style it was derived from. */
  readonly sourcePresetId?: string;
}

const PLANNING_STRATEGIES = {
  retail: Object.freeze<PlanningStrategy>({
    direction:
      "Prioritize clean, professional product presentation with accurate color and minimal distractions. Each slot should focus on one clear product truth.",
    copyTone: "product",
    compositionBias: "balanced",
    copyDensity: "concise",
  }),
  lifestyle: Object.freeze<PlanningStrategy>({
    direction:
      "Prioritize relatable real-world usage scenarios. Show the product in natural environments where the target audience would use it. Keep the product as the clear hero.",
    copyTone: "conversational",
    compositionBias: "lifestyle",
    copyDensity: "detailed",
  }),
  studio: Object.freeze<PlanningStrategy>({
    direction:
      "Prioritize material detail, texture, and construction evidence. Use documentary-style product photography approach. Maximize micro-contrast and detail visibility.",
    copyTone: "formal",
    compositionBias: "evidence",
    copyDensity: "detailed",
  }),
  conversion: Object.freeze<PlanningStrategy>({
    direction:
      "Prioritize conversion-focused visuals. Use benefit-driven compositions, clear value propositions, and comparison-ready layouts. Every slot should answer 'why buy this'.",
    copyTone: "benefit",
    compositionBias: "balanced",
    copyDensity: "concise",
  }),
  minimal: Object.freeze<PlanningStrategy>({
    direction:
      "Prioritize minimal, distraction-free product presentation. Pure white backgrounds, clean silhouettes, product form and shape as the only subject. Zero props or environmental context.",
    copyTone: "product",
    compositionBias: "evidence",
    copyDensity: "concise",
  }),
} as const satisfies Record<string, PlanningStrategy>;

export const PROMPT_PROFILES: readonly PromptProfile[] = Object.freeze([
  Object.freeze({
    id: "clean-retail",
    label: "干净零售",
    description: "标准电商风格，中性光线、准确色彩、干净构图，适合大多数品类。",
    style: AMAZON_STYLE_PRESETS[0]!,
    planningStrategy: PLANNING_STRATEGIES.retail,
    source: "builtin" as const,
  }),
  Object.freeze({
    id: "soft-lifestyle",
    label: "柔和场景",
    description: "生活场景导向，自然光线、真实环境，适合需要场景代入感的品类（服装、家居）。",
    style: AMAZON_STYLE_PRESETS[1]!,
    planningStrategy: PLANNING_STRATEGIES.lifestyle,
    source: "builtin" as const,
  }),
  Object.freeze({
    id: "studio-proof",
    label: "棚拍证据",
    description: "棚拍纪实风格，强调材质细节和结构证据，适合需要展示做工品质的品类（3C、五金）。",
    style: AMAZON_STYLE_PRESETS[2]!,
    planningStrategy: PLANNING_STRATEGIES.studio,
    source: "builtin" as const,
  }),
  Object.freeze({
    id: "conversion-driven",
    label: "营销转化",
    description: "转化率导向，利益点驱动构图、对比布局，适合需要强说服力的 Listing 和 A+ 模块。",
    style: AMAZON_STYLE_PRESETS[0]!, // retail base
    planningStrategy: PLANNING_STRATEGIES.conversion,
    source: "builtin" as const,
  }),
  Object.freeze({
    id: "minimal-white",
    label: "极简白底",
    description: "纯白背景、零干扰，仅关注产品形态，适合需要严格合规的主图或平台白底要求。",
    style: AMAZON_STYLE_PRESETS[2]!, // studio base
    planningStrategy: PLANNING_STRATEGIES.minimal,
    source: "builtin" as const,
  }),
]);

export const DEFAULT_PROMPT_PROFILE_ID = PROMPT_PROFILES[0]!.id;

export function getPromptProfile(id: string | null | undefined): PromptProfile | null {
  if (!id) return null;
  return PROMPT_PROFILES.find((p) => p.id === id) ?? null;
}

/** Build the planning strategy injection snippet for the system prompt. */
export function buildPlanningStrategySnippet(profile: PromptProfile | null): string {
  if (!profile) return "";
  const s = profile.planningStrategy;
  return [
    `Planning strategy: ${s.direction}`,
    `Copy tone: ${s.copyTone}.`,
    `Composition bias: ${s.compositionBias}.`,
    `Copy density: ${s.copyDensity}.`,
  ].join(" ");
}

/** Get a profile by id, falling back to the default. */
export function resolvePromptProfile(id: string | null | undefined): PromptProfile {
  return allProfiles().find((p) => p.id === id) ?? PROMPT_PROFILES[0]!;
}

// ── Custom profile storage ──────────────────────────────────────────

export const CUSTOM_PROMPT_PROFILES_STORAGE_KEY = "ecom-prompt-profiles-v1";

interface CustomProfileRecord {
  id: string;
  label: string;
  description: string;
  sourcePresetId: string;
  planningStrategy: PlanningStrategy;
}

function loadCustomProfiles(storage: {
  getItem(key: string): string | null;
}): CustomProfileRecord[] {
  try {
    const raw = storage.getItem(CUSTOM_PROMPT_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is CustomProfileRecord =>
        typeof r.id === "string" &&
        typeof r.label === "string" &&
        typeof r.sourcePresetId === "string" &&
        typeof r.planningStrategy === "object",
    );
  } catch {
    return [];
  }
}

function saveCustomProfiles(
  storage: { setItem(key: string, value: string): void },
  records: CustomProfileRecord[],
): void {
  storage.setItem(CUSTOM_PROMPT_PROFILES_STORAGE_KEY, JSON.stringify(records));
}

/** List all profiles: built-in first, then custom. */
export function allProfiles(): PromptProfile[] {
  const builtins = PROMPT_PROFILES as unknown as PromptProfile[];
  let customs: PromptProfile[] = [];
  if (typeof window !== "undefined" && window.localStorage) {
    customs = loadCustomProfiles(window.localStorage).map((r) => {
      const sourcePreset = getAmazonStylePreset(r.sourcePresetId) ?? AMAZON_STYLE_PRESETS[0]!;
      return Object.freeze({
        id: r.id,
        label: r.label,
        description: r.description,
        style: sourcePreset,
        planningStrategy: r.planningStrategy,
        source: "custom" as const,
        sourcePresetId: r.sourcePresetId,
      });
    });
  }
  return [...builtins, ...customs];
}

/** Create or update a custom profile. */
export function saveCustomProfile(
  storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void },
  input: {
    id?: string;
    label: string;
    description: string;
    sourcePresetId: string;
    planningStrategy: PlanningStrategy;
  },
): PromptProfile {
  const existing = input.id ? loadCustomProfiles(storage).filter((r) => r.id !== input.id) : loadCustomProfiles(storage);
  const id = input.id ?? `custom-${Date.now().toString(36)}`;
  const record: CustomProfileRecord = {
    id,
    label: input.label,
    description: input.description,
    sourcePresetId: input.sourcePresetId,
    planningStrategy: input.planningStrategy,
  };
  saveCustomProfiles(storage, [...existing, record]);
  const sourcePreset = getAmazonStylePreset(input.sourcePresetId) ?? AMAZON_STYLE_PRESETS[0]!;
  return Object.freeze({
    id,
    label: input.label,
    description: input.description,
    style: sourcePreset,
    planningStrategy: input.planningStrategy,
    source: "custom" as const,
    sourcePresetId: input.sourcePresetId,
  });
}

/** Delete a custom profile by id. No-op for built-in profiles. */
export function deleteCustomProfile(
  storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void },
  id: string,
): void {
  const records = loadCustomProfiles(storage).filter((r) => r.id !== id);
  saveCustomProfiles(storage, records);
}
