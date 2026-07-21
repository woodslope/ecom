import { describe, expect, it } from "vitest";

import {
  GENERATION_REFERENCE_MAX_PAYLOAD_BYTES,
  GenerationReferencePayloadError,
  prepareGenerationReferencePayload,
} from "../src/domain/assets/reference-payload";
import {
  appendStyleGuidanceToPrompt,
  DEFAULT_AMAZON_STYLE_PRESET_ID,
  shouldApplyStyleToSlot,
} from "../src/domain/platforms/amazon-style-presets";
import { runCompliance } from "../src/domain/compliance";
import { createAmazonRulePackFromOptions } from "../src/domain/platforms/resolve-rule-pack";
import type { ProductProject } from "../src/domain/projects/types";

function blobOf(size: number, name = "big.png"): { name: string; mimeType: string; blob: Blob } {
  return {
    name,
    mimeType: "image/png",
    blob: new Blob([new Uint8Array(size)], { type: "image/png" }),
  };
}

describe("Batch 3 reference payload", () => {
  it("returns empty payload for no images", async () => {
    const result = await prepareGenerationReferencePayload([]);
    expect(result.images).toEqual([]);
    expect(result.pass).toBe("none");
  });

  it("caps count at 16", async () => {
    const images = Array.from({ length: 20 }, (_, index) => blobOf(32, `r${index}.png`));
    const result = await prepareGenerationReferencePayload(images);
    expect(result.images.length).toBeLessThanOrEqual(16);
  });

  it("throws when payload remains above 8 MiB after fallback", async () => {
    // compressImageFile falls back to original file when canvas cannot shrink;
    // fabricate already-huge blobs so total stays over the cap.
    const huge = Array.from({ length: 3 }, (_, index) =>
      blobOf(GENERATION_REFERENCE_MAX_PAYLOAD_BYTES, `h${index}.png`),
    );
    await expect(prepareGenerationReferencePayload(huge)).rejects.toBeInstanceOf(
      GenerationReferencePayloadError,
    );
  });
});

describe("Batch 3 style presets", () => {
  it("applies style guidance only to non-MAIN slots", () => {
    expect(shouldApplyStyleToSlot("MAIN")).toBe(false);
    expect(shouldApplyStyleToSlot("PT01")).toBe(true);
    const withStyle = appendStyleGuidanceToPrompt("Base prompt.", DEFAULT_AMAZON_STYLE_PRESET_ID, {
      apply: true,
    });
    expect(withStyle).toContain("Selected visual style");
    expect(withStyle).toContain("Clean retail");
    const main = appendStyleGuidanceToPrompt("Base prompt.", DEFAULT_AMAZON_STYLE_PRESET_ID, {
      apply: false,
    });
    expect(main).toBe("Base prompt.");
  });
});

describe("Batch 3 marketplace compliance", () => {
  const project: ProductProject = {
    id: "p1",
    name: "p",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    facts: {
      productName: "Pillow",
      category: "Travel",
      brand: "Northwind",
      model: "P1",
      sku: "P1",
      targetAudience: "travelers",
      description: "memory foam pillow",
      sellingPoints: [],
      forbiddenClaims: [],
      specifications: {},
    },
  };

  it("warns CJK visible copy on US locale pack", () => {
    const { rulePack } = createAmazonRulePackFromOptions({
      plannerMode: "listing",
      marketplaceId: "us",
    });
    const result = runCompliance(project, rulePack, {
      slotKey: "PT01",
      visibleCopy: "慢回弹记忆棉",
      strategy: "策略",
      evidence: ["卖点"],
      prompt: "Create a benefit image with soft foam texture.",
      negativePrompt: "no price",
    });
    expect(result.findings.some((f) => f.code === "amazon-marketplace-cjk-visible-copy")).toBe(
      true,
    );
  });

  it("allows CJK visible copy on JP locale pack", () => {
    const { rulePack } = createAmazonRulePackFromOptions({
      plannerMode: "listing",
      marketplaceId: "jp",
    });
    const result = runCompliance(project, rulePack, {
      slotKey: "PT01",
      visibleCopy: "慢回弹",
      strategy: "策略",
      evidence: ["卖点"],
      prompt: "Create a benefit image.",
      negativePrompt: "no price",
    });
    expect(result.findings.some((f) => f.code === "amazon-marketplace-cjk-visible-copy")).toBe(
      false,
    );
  });
});
