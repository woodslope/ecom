import { describe, expect, it } from "vitest";

import {
  getPlatformPrimaryAction,
  getPlatformStage,
  getPlatformStageIndex,
  getPlatformStageLabel,
} from "../src/domain/workspace/platform-stage";
import type { PlatformSession } from "../src/domain/workspace/project-workspace";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { demoPlanner } from "../src/services/demo-planner";

const facts = {
  productName: "云感旅行颈枕",
  brand: "Northwind",
  sku: "NW-P01",
  sellingPoints: ["慢回弹"],
};

async function taobaoPlan() {
  return demoPlanner.plan(
    facts,
    taobaoRulePack,
    new AbortController().signal,
    [],
  );
}

describe("shared platform stage", () => {
  it("labels stages 1–4 consistently", () => {
    expect(getPlatformStageLabel("prepare")).toBe("准备");
    expect(getPlatformStageIndex("deliver")).toBe(4);
  });

  it("maps Taobao prepare → review → produce → deliver", async () => {
    expect(
      getPlatformStage({
        platform: "taobao",
        hasTaobaoAnalysis: false,
        plan: null,
      }),
    ).toBe("prepare");

    const plan = await taobaoPlan();
    expect(
      getPlatformStage({
        platform: "taobao",
        hasTaobaoAnalysis: true,
        plan,
        slotVersions: {},
      }),
    ).toBe("review");

    const first = plan.slots[0]!;
    expect(
      getPlatformStage({
        platform: "taobao",
        hasTaobaoAnalysis: true,
        plan,
        planInputSignature: "sig",
        slotVersions: {
          [first.slotKey]: {
            versions: [
              {
                id: "v1",
                slotKey: first.slotKey,
                assetId: "a1",
                createdAt: "2026-07-21T00:00:00.000Z",
                source: "demo",
                promptSnapshot: first.prompt,
                visibleCopySnapshot: first.visibleCopy,
                planningInputSignature: "sig",
                width: 800,
                height: 800,
                mimeType: "image/png",
                parameters: {},
              },
            ],
            activeVersionId: "v1",
          },
        },
      }),
    ).toBe("produce");
  });

  it("uses the shared planning action for Taobao preparation", () => {
    expect(
      getPlatformPrimaryAction({
        platform: "taobao",
        hasTaobaoAnalysis: false,
        plan: null,
      }),
    ).toEqual({ kind: "plan", label: "生成图片策划" });
  });

  it("delegates Amazon stages to existing session helpers", () => {
    const session: PlatformSession = {
      id: "s1",
      projectId: "p1",
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: x" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: [],
      slotVersions: {},
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    expect(getPlatformStage({ platform: "amazon", session })).toBe("prepare");
    expect(getPlatformPrimaryAction({ platform: "amazon", session })).toEqual({
      kind: "plan",
      label: "生成图片策划",
    });
  });
});
