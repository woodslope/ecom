import { describe, expect, it } from "vitest";

import {
  createStyleReferenceBoard,
  normalizeStyleReferenceDefinition,
} from "../src/domain/assets/style-reference";
import {
  AMAZON_STYLE_PRESETS,
  STYLE_REFERENCE_PROMPT_GUARD,
  appendStyleReferenceGuidance,
} from "../src/domain/platforms/amazon-style-presets";

describe("style reference boards", () => {
  it("renders a restorable bitmap-like board from a built-in preset", async () => {
    const board = createStyleReferenceBoard(AMAZON_STYLE_PRESETS[0]!);

    expect(board.definition.sourcePresetId).toBe("clean-retail");
    expect(board.definition.palette).toHaveLength(4);
    expect(board.blob.type).toBe("image/svg+xml");
    expect(await board.blob.text()).toContain("Clean retail");
  });

  it("normalizes edited palette, typography, lighting, material and density", () => {
    const definition = normalizeStyleReferenceDefinition({
      name: "My calm proof",
      sourcePresetId: "studio-proof",
      palette: ["#102030", "bad", "#ffffff"],
      typography: "serif",
      lighting: "soft",
      material: "matte",
      density: "airy",
    });

    expect(definition).toMatchObject({
      name: "My calm proof",
      sourcePresetId: "studio-proof",
      palette: ["#102030", "#ffffff"],
      typography: "serif",
      lighting: "soft",
      material: "matte",
      density: "airy",
    });
    expect(definition.promptGuidance).toContain("serif typography");
  });

  it("adds the hidden-reference guard only when a style board is attached", () => {
    const prompt = appendStyleReferenceGuidance("Base prompt", "Muted editorial", true);
    expect(prompt).toContain(STYLE_REFERENCE_PROMPT_GUARD);
    expect(prompt).toContain("Muted editorial");
    expect(appendStyleReferenceGuidance("Base prompt", "Muted editorial", false)).toBe(
      "Base prompt",
    );
  });
});
