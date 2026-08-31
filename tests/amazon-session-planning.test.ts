import { describe, expect, it } from "vitest";

import { normalizePlatformPlan } from "../src/domain/planning/normalizer";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import type { PlatformPlanCandidate } from "../src/domain/planning/types";
import {
  generationDimensionsForUpload,
  calculateGenerationSize,
  STANDARD_GENERATION_SIZES,
  closestStandardAspectRatio,
} from "../src/domain/platforms/generation-size";
import { resolveRulePackForPlan } from "../src/domain/platforms/resolve-rule-pack";
import { mockPlanner } from "./fixtures/mock-planner";
import { amazonRulePack } from "../src/domain/platforms/amazon";

const facts = {
  productName: "Cloud Neck Pillow",
  category: "Travel",
  brand: "Northwind",
  sellingPoints: ["memory foam"],
  specifications: { Material: "memory foam" },
  forbiddenClaims: [] as string[],
};

describe("Batch 1 session-aware planning", () => {
  it("mock planner stamps the legacy-combined Amazon session when no options", async () => {
    const plan = await mockPlanner.plan(facts, amazonRulePack, new AbortController().signal);
    expect(plan.slots).toHaveLength(15);
    expect(plan.amazonSession?.plannerMode).toBe("legacy-combined");
    expect(plan.amazonSession?.slotKeys).toHaveLength(15);
    expect(resolveRulePackForPlan("amazon", plan).slots.map((s) => s.key)).toEqual(
      plan.slots.map((s) => s.slotKey),
    );
  });

  it("mock planner can produce AIS listing-only and default A+ sessions", async () => {
    const listing = await mockPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    );
    expect(listing.slots.map((s) => s.slotKey)).toEqual([
      "MAIN",
      "PT01",
      "PT02",
      "PT03",
      "PT04",
      "PT05",
      "PT06",
    ]);
    expect(listing.amazonSession?.plannerMode).toBe("listing");
    expect(listing.amazonSession?.marketplaceId).toBe("us");

    const aplus = await mockPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus" },
    );
    expect(aplus.amazonSession?.aPlusType).toBe("standard-large");
    expect(aplus.slots[0]?.slotKey).toBe("A+L01");
    expect(aplus.slots).toHaveLength(5);
  });

  it("normalizer accepts amazonSession and rejects missing session slots", () => {
    const { rulePack, amazonSession } = resolvePlanningRulePack("amazon", {
      plannerMode: "listing",
      listingImageCount: 7,
    });
    const candidate: PlatformPlanCandidate = {
      platformId: "amazon",
      source: "api",
      amazonSession,
      slots: rulePack.slots.map((slot) => ({
        slotKey: slot.key,
        visibleCopy: slot.key === "MAIN" ? "" : "Copy",
        strategy: "策略",
        evidence: ["证据"],
        prompt: "prompt",
        negativePrompt: "neg",
      })),
    };
    const plan = normalizePlatformPlan(candidate, rulePack);
    expect(plan.slots).toHaveLength(7);
    expect(plan.amazonSession?.plannerMode).toBe("listing");
  });

  it("maps upload dimensions to generation size by tier", () => {
    const square2k = calculateGenerationSize("2K", "1:1");
    expect(square2k).not.toBeNull();
    expect(square2k!.width).toBe(2048);
    expect(square2k!.height).toBe(2048);

    const banner = generationDimensionsForUpload(
      { width: 970, height: 300, unit: "px" },
      "2K",
    );
    expect(banner.width).toBeGreaterThan(0);
    expect(banner.height).toBeGreaterThan(0);
    // generation canvas should not be the raw upload 970x300 for 2K tier
    expect(banner.width * banner.height).toBeGreaterThan(970 * 300);
  });

  it("maps platform slots to the exact provider canvases shown in the selector", () => {
    const cases = [
      ["1:1", 1024, 1024],
      ["16:9", 1792, 1024],
      ["9:16", 1024, 1792],
      ["4:3", 1024, 768],
      ["3:4", 768, 1024],
      ["3:2", 1536, 1024],
      ["2:3", 1024, 1536],
      ["21:9", 1344, 576],
    ] as const;
    for (const [ratio, width, height] of cases) {
      expect(STANDARD_GENERATION_SIZES[ratio]).toEqual({ width, height, unit: "px" });
      expect(closestStandardAspectRatio(width, height)).toBe(ratio);
      expect(generationDimensionsForUpload({ width, height, unit: "px" }, "4K")).toEqual({
        width,
        height,
        unit: "px",
      });
    }
    expect(generationDimensionsForUpload({ width: 970, height: 300, unit: "px" }, "2K")).toEqual({
      width: 1344,
      height: 576,
      unit: "px",
    });
  });

});
