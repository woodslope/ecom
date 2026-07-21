import { describe, expect, it } from "vitest";

import { MaskValidationError, type MaskDraft } from "../src/domain/generation/mask";
import { prepareMaskTarget } from "../src/domain/generation/mask-preprocess";

const target = {
  name: "amazon-PT01-version-01.png",
  blob: new Blob(["target"], { type: "image/png" }),
  mimeType: "image/png",
  width: 100,
  height: 80,
};

function mask(overrides: Partial<MaskDraft> = {}): MaskDraft {
  return {
    blob: new Blob(["mask"], { type: "image/png" }),
    width: 100,
    height: 80,
    coverage: 0.25,
    ...overrides,
  };
}

describe("mask edit preprocessing", () => {
  it("accepts only a partial mask that matches an existing target", async () => {
    await expect(prepareMaskTarget(target, mask())).resolves.toMatchObject({
      target: { width: 100, height: 80 },
      mask: { width: 100, height: 80, coverage: 0.25 },
    });

    await expect(prepareMaskTarget(target, mask({ coverage: 0 }))).rejects.toMatchObject({
      name: "MaskValidationError",
      code: "empty",
    });
    await expect(prepareMaskTarget(target, mask({ coverage: 1 }))).rejects.toMatchObject({
      name: "MaskValidationError",
      code: "full",
    });
    await expect(prepareMaskTarget(target, mask({ width: 99 }))).rejects.toMatchObject({
      name: "MaskValidationError",
      code: "dimensions",
    });
    await expect(prepareMaskTarget(null, mask())).rejects.toBeInstanceOf(MaskValidationError);
  });
});
