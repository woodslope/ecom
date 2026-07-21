import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { buildExportPackage } from "../src/domain/export";
import type { SlotVersionState } from "../src/domain/generation/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import type { PlatformPlan } from "../src/domain/planning/types";
import type { ProductProject } from "../src/domain/projects/types";

const project: ProductProject = {
  id: "project_01",
  name: "旅行颈枕",
  facts: {
    productName: "云感旅行颈枕",
    category: "旅行用品",
    brand: "Northwind",
    model: "TP-01",
    sku: "TP-01-GRAY",
    targetAudience: "长途出行人群",
    description: "可折叠记忆棉颈枕",
    sellingPoints: ["慢回弹", "可拆洗"],
    forbiddenClaims: [],
    specifications: { 材质: "记忆棉" },
  },
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

const plan: PlatformPlan = {
  platformId: "amazon",
  source: "demo",
  slots: amazonRulePack.slots.map((slot) => ({
    slotKey: slot.key,
    strategy: slot.purpose,
    evidence: ["商品事实"],
    visibleCopy: slot.key === "MAIN" ? "" : `Copy for ${slot.key}`,
    prompt: `Prompt for ${slot.key}`,
    negativePrompt: "No unsupported claims",
  })),
};
const planningInputSignature = "input-v1";

describe("buildExportPackage", () => {
  it("orders active images by the platform pack and records prompt snapshots and missing slots", async () => {
    const assets = createMemoryAssetRepository({
      createId: () => "asset_main",
      now: () => "2026-07-17T09:00:00.000Z",
    });
    await assets.put({
      projectId: project.id,
      blob: new Blob(["<svg>MAIN</svg>"], { type: "image/svg+xml" }),
      metadata: {
        name: "generated-main.svg",
        kind: "generated",
        role: "amazon:MAIN",
        tags: ["amazon", "MAIN", "demo"],
        width: 2000,
        height: 2000,
      },
    });
    const slotVersions: Record<string, SlotVersionState> = {
      MAIN: {
        activeVersionId: "version_main",
        versions: [
          {
            id: "version_main",
            slotKey: "MAIN",
            assetId: "asset_main",
            createdAt: "2026-07-17T10:00:00.000Z",
            source: "demo",
            promptSnapshot: plan.slots[0].prompt,
            visibleCopySnapshot: "",
            planningInputSignature,
            width: 2000,
            height: 2000,
            mimeType: "image/svg+xml",
            parameters: { engine: "demo" },
          },
        ],
      },
    };

    const exported = await buildExportPackage({
      project,
      rulePack: amazonRulePack,
      plan,
      planningInputSignature,
      slotVersions,
      loadAsset: (id) => assets.get(id),
      now: () => "2026-07-17T11:00:00.000Z",
    });

    expect(exported.manifest.ready).toBe(false);
    expect(exported.manifest.slots.map((slot) => slot.slotKey)).toEqual(
      amazonRulePack.slots.map((slot) => slot.key),
    );
    expect(exported.manifest.slots[0]).toMatchObject({
      slotKey: "MAIN",
      fileName: "amazon/01-MAIN.svg",
      version: {
        id: "version_main",
        promptSnapshot: plan.slots[0].prompt,
      },
    });
    expect(exported.manifest.missingSlots).toEqual(
      amazonRulePack.slots.slice(1).map((slot) => slot.key),
    );

    const archive = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(Object.keys(archive).sort()).toEqual([
      "amazon/01-MAIN.svg",
      "manifest.json",
      "prompts.md",
    ]);
    expect(strFromU8(archive["amazon/01-MAIN.svg"])).toBe("<svg>MAIN</svg>");
    expect(JSON.parse(strFromU8(archive["manifest.json"]))).toEqual(exported.manifest);
    expect(strFromU8(archive["prompts.md"])).toContain(
      plan.slots[0].prompt,
    );
  });

  it("excludes an active image version created from an older slot draft", async () => {
    const assets = createMemoryAssetRepository({
      createId: () => "asset_main",
      now: () => "2026-07-17T09:00:00.000Z",
    });
    await assets.put({
      projectId: project.id,
      blob: new Blob(["<svg>STALE MAIN</svg>"], { type: "image/svg+xml" }),
      metadata: {
        name: "stale-main.svg",
        kind: "generated",
        role: "amazon:MAIN",
        tags: ["amazon", "MAIN", "demo"],
        width: 2000,
        height: 2000,
      },
    });

    const exported = await buildExportPackage({
      project,
      rulePack: amazonRulePack,
      plan,
      slotVersions: {
        MAIN: {
          activeVersionId: "version_main",
          versions: [
            {
              id: "version_main",
              slotKey: "MAIN",
              assetId: "asset_main",
              createdAt: "2026-07-17T10:00:00.000Z",
              source: "demo",
              promptSnapshot: "Older prompt that no longer matches the active slot draft.",
              visibleCopySnapshot: "",
              planningInputSignature,
              width: 2000,
              height: 2000,
              mimeType: "image/svg+xml",
              parameters: { engine: "demo" },
            },
          ],
        },
      },
      planningInputSignature,
      loadAsset: (id) => assets.get(id),
      now: () => "2026-07-17T11:00:00.000Z",
    });

    expect(exported.manifest.ready).toBe(false);
    expect(exported.manifest.missingSlots).toContain("MAIN");
    expect(exported.manifest.slots[0]).toMatchObject({
      slotKey: "MAIN",
      fileName: null,
      version: null,
    });

    const archive = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(Object.keys(archive).sort()).toEqual(["manifest.json", "prompts.md"]);
  });
});
