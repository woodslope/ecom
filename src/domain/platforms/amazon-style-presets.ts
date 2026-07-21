/** Amazon style presets used by text guidance and project-scoped style-reference boards. */

export interface AmazonStylePreset {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  /** English direction injected into generation prompts (not user-facing Chinese strategy). */
  readonly promptGuidance: string;
  readonly palette: readonly string[];
  readonly typography: "sans" | "serif" | "display";
  readonly lighting: "neutral" | "soft" | "dramatic";
  readonly material: "clean" | "matte" | "glossy" | "natural";
  readonly density: "airy" | "balanced" | "dense";
}

export const AMAZON_STYLE_PRESETS: readonly AmazonStylePreset[] = Object.freeze([
  Object.freeze({
    id: "clean-retail",
    label: "干净零售",
    shortLabel: "零售",
    promptGuidance:
      "Clean retail ecommerce style: neutral lighting, accurate product color, uncluttered composition, premium but restrained finish.",
    palette: ["#ffffff", "#111827", "#d1d5db", "#2563eb"],
    typography: "sans", lighting: "neutral", material: "clean", density: "balanced",
  }),
  Object.freeze({
    id: "soft-lifestyle",
    label: "柔和场景",
    shortLabel: "场景",
    promptGuidance:
      "Soft lifestyle style: natural ambient light, believable environment, product remains the clear hero, no cluttered props.",
    palette: ["#f8fafc", "#334155", "#dbeafe", "#86efac"],
    typography: "serif", lighting: "soft", material: "natural", density: "airy",
  }),
  Object.freeze({
    id: "studio-proof",
    label: "棚拍证据",
    shortLabel: "棚拍",
    promptGuidance:
      "Studio proof style: controlled lighting, crisp material detail, high micro-contrast, documentary product photography feel.",
    palette: ["#ffffff", "#0f172a", "#64748b", "#f59e0b"],
    typography: "sans", lighting: "dramatic", material: "matte", density: "dense",
  }),
]);

export const DEFAULT_AMAZON_STYLE_PRESET_ID = AMAZON_STYLE_PRESETS[0]!.id;

export function getAmazonStylePreset(id: string | null | undefined): AmazonStylePreset | null {
  if (!id) return null;
  return AMAZON_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

export const STYLE_REFERENCE_PROMPT_GUARD = [
  "Style direction rule:",
  "- Follow the selected visual style text for color palette, lighting, contrast, material finish, and overall polish only.",
  "- Do not copy fixed layouts, placeholder text, color swatch boards, product counts, or unrelated props from any style board.",
  "- Product facts, slot objective, and negative prompt outrank aesthetic suggestions when they conflict.",
].join("\n");

export function appendStyleGuidanceToPrompt(
  prompt: string,
  stylePresetId: string | null | undefined,
  options: { apply: boolean },
): string {
  if (!options.apply) return prompt;
  const preset = getAmazonStylePreset(stylePresetId);
  if (!preset) return prompt;
  return [prompt.trim(), STYLE_REFERENCE_PROMPT_GUARD, `Selected visual style: ${preset.promptGuidance}`]
    .filter(Boolean)
    .join("\n\n");
}

export function appendStyleReferenceGuidance(
  prompt: string,
  promptGuidance: string | null | undefined,
  apply: boolean,
): string {
  if (!apply || !promptGuidance?.trim()) return prompt;
  return [prompt.trim(), STYLE_REFERENCE_PROMPT_GUARD, `Selected visual style: ${promptGuidance.trim()}`]
    .filter(Boolean)
    .join("\n\n");
}

/** MAIN listing images keep product-truth priority; style is for PT/A+ by default. */
export function shouldApplyStyleToSlot(slotKey: string): boolean {
  return slotKey.trim().toUpperCase() !== "MAIN";
}
