import { describe, expect, it } from "vitest";

import type { SlotVersion, SlotVersionState } from "../src/domain/generation/types";
import type { PlatformSession } from "../src/domain/workspace/project-workspace";
import {
  getAmazonPrimaryAction,
  getAmazonStage,
} from "../src/domain/workspace/amazon-stage";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";

const facts = {
  productName: "Northwind Travel Pillow",
  brand: "Northwind",
  sku: "NW-P01",
  sellingPoints: ["Washable cover"],
};

function versionFor(
  slot: NonNullable<PlatformSession["plan"]>["slots"][number],
  signature = "plan-current",
): SlotVersion {
  return {
    id: `version_${slot.slotKey}`,
    slotKey: slot.slotKey,
    assetId: `asset_${slot.slotKey}`,
    createdAt: "2026-07-20T00:00:00.000Z",
    source: "demo",
    promptSnapshot: slot.prompt,
    visibleCopySnapshot: slot.visibleCopy,
    planningInputSignature: signature,
    width: 2000,
    height: 2000,
    mimeType: "image/svg+xml",
    parameters: {},
  };
}

async function listingSession(completedCount: number): Promise<PlatformSession> {
  const plan = await demoPlanner.plan(
    facts,
    amazonRulePack,
    new AbortController().signal,
    [],
    { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
  );
  const slotVersions = Object.fromEntries(
    plan.slots.slice(0, completedCount).map((slot): [string, SlotVersionState] => [
      slot.slotKey,
      { versions: [versionFor(slot)], activeVersionId: `version_${slot.slotKey}` },
    ]),
  );
  return {
    id: "session_listing",
    projectId: "project_01",
    platformId: "amazon",
    workflowId: "amazon-listing",
    sourceInput: { listingText: "Title: Northwind Travel Pillow" },
    options: {
      platformId: "amazon",
      marketplaceId: "us",
      plannerMode: "listing",
      listingImageCount: 7,
      aPlusType: "standard-large",
      aPlusModuleSpecs: [],
      sizeTier: "2K",
    },
    selectedReferenceAssetIds: [],
    plan,
    planInputSignature: "plan-current",
    selectedSlotKey: plan.slots[0]?.slotKey,
    slotVersions,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("Amazon production stage", () => {
  it.each([
    [0, "review"],
    [1, "produce"],
    [6, "produce"],
    [7, "deliver"],
  ] as const)("maps %i/7 current outputs to %s", async (completedCount, expectedStage) => {
    expect(getAmazonStage(await listingSession(completedCount))).toBe(expectedStage);
  });

  it("does not count an output with a stale planning signature", async () => {
    const session = await listingSession(1);
    session.slotVersions.MAIN.versions[0].planningInputSignature = "old-plan";

    expect(getAmazonStage(session)).toBe("review");
  });

  it("keeps an older valid active version complete after a failed retry", async () => {
    const session = await listingSession(1);
    session.slotVersions.MAIN.versions.push({
      ...session.slotVersions.MAIN.versions[0],
      id: "failed-retry-placeholder",
      planningInputSignature: "old-plan",
    });

    expect(getAmazonStage(session)).toBe("produce");
  });

  it("returns the next exact primary action without changing stage for partial export", async () => {
    const review = await listingSession(0);
    const producing = await listingSession(1);
    const ready = await listingSession(7);

    expect(getAmazonPrimaryAction(review)).toEqual({
      kind: "generate",
      label: "生成当前图片",
      slotKey: "MAIN",
    });
    expect(getAmazonPrimaryAction(producing)).toEqual({
      kind: "select",
      label: "继续下一槽位",
      slotKey: "PT01",
    });
    producing.selectedSlotKey = "PT01";
    expect(getAmazonPrimaryAction(producing)).toEqual({
      kind: "generate",
      label: "生成当前图片",
      slotKey: "PT01",
    });
    expect(getAmazonPrimaryAction(ready)).toEqual({
      kind: "export",
      label: "导出完整交付包",
    });
    expect(getAmazonStage({ ...producing })).toBe("produce");
  });
});
