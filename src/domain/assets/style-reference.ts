import type { AmazonStylePreset } from "../platforms/amazon-style-presets";

export type StyleTypography = "sans" | "serif" | "display";
export type StyleLighting = "neutral" | "soft" | "dramatic";
export type StyleMaterial = "clean" | "matte" | "glossy" | "natural";
export type StyleDensity = "airy" | "balanced" | "dense";

export interface StyleReferenceDefinition {
  name: string;
  sourcePresetId: string;
  palette: string[];
  typography: StyleTypography;
  lighting: StyleLighting;
  material: StyleMaterial;
  density: StyleDensity;
  promptGuidance: string;
}

export type StyleReferenceDraft = Omit<StyleReferenceDefinition, "promptGuidance"> & {
  promptGuidance?: string;
};

const FALLBACK_PALETTE = ["#ffffff", "#111827", "#d1d5db", "#2563eb"];
const HEX = /^#[0-9a-f]{6}$/i;

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

export function normalizeStyleReferenceDefinition(input: StyleReferenceDraft): StyleReferenceDefinition {
  const palette = input.palette.filter((value) => HEX.test(value)).slice(0, 6);
  const typography = enumValue(input.typography, ["sans", "serif", "display"], "sans");
  const lighting = enumValue(input.lighting, ["neutral", "soft", "dramatic"], "neutral");
  const material = enumValue(input.material, ["clean", "matte", "glossy", "natural"], "clean");
  const density = enumValue(input.density, ["airy", "balanced", "dense"], "balanced");
  const name = input.name.trim() || "My style";
  const sourcePresetId = input.sourcePresetId.trim() || "clean-retail";
  const promptGuidance = input.promptGuidance?.trim() ||
    `${name}: ${palette.join(", ")} palette, ${typography} typography, ${lighting} lighting, ${material} material finish, ${density} composition density.`;
  return {
    name,
    sourcePresetId,
    palette: palette.length >= 2 ? palette : [...FALLBACK_PALETTE],
    typography,
    lighting,
    material,
    density,
    promptGuidance,
  };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

export function createStyleReferenceBoard(
  preset: AmazonStylePreset,
  draft: Partial<StyleReferenceDraft> = {},
): { definition: StyleReferenceDefinition; blob: Blob; width: number; height: number } {
  const definition = normalizeStyleReferenceDefinition({
    name: draft.name ?? preset.label,
    sourcePresetId: preset.id,
    palette: draft.palette ?? [...preset.palette],
    typography: draft.typography ?? preset.typography,
    lighting: draft.lighting ?? preset.lighting,
    material: draft.material ?? preset.material,
    density: draft.density ?? preset.density,
    promptGuidance: draft.promptGuidance ?? preset.promptGuidance,
  });
  const width = 1200;
  const height = 800;
  const swatches = definition.palette.map((color, index) =>
    `<rect x="${80 + index * 135}" y="560" width="115" height="115" rx="10" fill="${color}"/>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="1200" height="800" fill="${definition.palette[0]}"/><rect x="60" y="60" width="1080" height="680" rx="24" fill="white" stroke="#d1d5db"/><text x="80" y="150" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#111827">${escapeXml(preset.promptGuidance.split(":")[0] || definition.name)}</text><text x="80" y="215" font-family="Arial, sans-serif" font-size="28" fill="#4b5563">${escapeXml(definition.name)}</text><text x="80" y="320" font-family="Arial, sans-serif" font-size="24" fill="#111827">${escapeXml(`${definition.typography} / ${definition.lighting} / ${definition.material} / ${definition.density}`)}</text><rect x="790" y="285" width="270" height="210" rx="16" fill="${definition.palette[1]}" opacity=".94"/><circle cx="925" cy="390" r="72" fill="${definition.palette[2]}"/>${swatches}</svg>`;
  return { definition, blob: new Blob([svg], { type: "image/svg+xml" }), width, height };
}

export async function createStyleReferenceBoardBitmap(
  preset: AmazonStylePreset,
  draft: Partial<StyleReferenceDraft> = {},
): Promise<{ definition: StyleReferenceDefinition; blob: Blob; width: number; height: number }> {
  const board = createStyleReferenceBoard(preset, draft);
  if (typeof document === "undefined") return board;
  const canvas = document.createElement("canvas");
  canvas.width = board.width;
  canvas.height = board.height;
  const context = canvas.getContext("2d");
  if (!context) return board;
  const definition = board.definition;
  context.fillStyle = definition.palette[0]!;
  context.fillRect(0, 0, board.width, board.height);
  context.fillStyle = "#ffffff";
  context.fillRect(60, 60, 1080, 680);
  context.fillStyle = "#111827";
  context.font = "700 52px Arial, sans-serif";
  context.fillText(preset.promptGuidance.split(":")[0] || definition.name, 80, 150);
  context.fillStyle = "#4b5563";
  context.font = "28px Arial, sans-serif";
  context.fillText(definition.name, 80, 215);
  context.fillStyle = "#111827";
  context.font = "24px Arial, sans-serif";
  context.fillText(`${definition.typography} / ${definition.lighting} / ${definition.material} / ${definition.density}`, 80, 320);
  definition.palette.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(80 + index * 135, 560, 115, 115);
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { ...board, blob } : board;
}
