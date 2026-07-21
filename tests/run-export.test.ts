import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoImageGenerator } from "../src/services/demo-image-generator";
import { createWorkbenchStore } from "../src/store/workbench-store";
import { buildRunExportPackage } from "../src/domain/export";
import { createAmazonRulePackFromOptions } from "../src/domain/platforms/resolve-rule-pack";
import { getPlatformRulePack } from "../src/domain/platforms/registry";
import type { ProductProject } from "../src/domain/projects/types";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";

const project: ProductProject = {
  id: "p1", name: "Cloud Pillow",
  facts: { productName: "Cloud Pillow", category: "Travel", brand: "Northwind", model: "P1", sku: "P1", targetAudience: "Travelers", description: "Pillow", sellingPoints: ["Soft"], forbiddenClaims: [], specifications: {} },
  createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
};

async function fixture() {
  const { rulePack } = createAmazonRulePackFromOptions({ plannerMode: "listing", marketplaceId: "us", listingImageCount: 7, sizeTier: "2K" });
  const plan = await demoPlanner.plan(project.facts, rulePack, new AbortController().signal, [], { plannerMode: "listing", marketplaceId: "us", listingImageCount: 7, sizeTier: "2K" });
  const assets = createMemoryAssetRepository({ createId: () => "asset_main" });
  await assets.put({ projectId: project.id, blob: new Blob(["main"], { type: "image/png" }), metadata: { name: "main.png", kind: "generated", role: "amazon:MAIN", width: 2000, height: 2000 } });
  const run: ProductionRun = {
    id: "run_old", projectId: project.id, sessionId: "session_old", platformId: "amazon", workflowId: "amazon-listing", source: "demo", status: "producing",
    contextSnapshot: { sourceInput: { listingText: "Title: Cloud Pillow" }, options: { platformId: "amazon", marketplaceId: "us", plannerMode: "listing", listingImageCount: 7, sizeTier: "2K", stylePresetId: "clean-retail" }, selectedReferenceAssetIds: [] },
    planSnapshot: plan, planningInputSignatureSnapshot: "sig-old",
    slotVersionsSnapshot: { MAIN: { activeVersionId: "v1", versions: [{ id: "v1", slotKey: "MAIN", assetId: "asset_main", createdAt: "2026-07-20T01:00:00.000Z", source: "demo", promptSnapshot: plan.slots[0]!.prompt, visibleCopySnapshot: "", planningInputSignature: "sig-old", width: 2000, height: 2000, mimeType: "image/png", parameters: { engine: "demo" } }] } },
    events: [], createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T02:00:00.000Z",
  };
  return { assets, run };
}

describe("run export", () => {
  it("builds a partial package from the historical run snapshot with workflow context", async () => {
    const { assets, run } = await fixture();
    const exported = await buildRunExportPackage({ project, run, loadAsset: (id) => assets.get(id), now: () => "2026-07-20T03:00:00.000Z" });

    expect(exported.manifest).toMatchObject({
      ready: false,
      run: { id: "run_old", workflowId: "amazon-listing", source: "demo" },
      options: { platformId: "amazon", marketplaceId: "us", plannerMode: "listing", listingImageCount: 7, sizeTier: "2K" },
    });
    expect(exported.manifest.missingSlots).toHaveLength(6);
    const archive = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(JSON.parse(strFromU8(archive["manifest.json"]))).toEqual(exported.manifest);
  });

  it("fails when an active version references a missing asset", async () => {
    const { run } = await fixture();
    await expect(buildRunExportPackage({ project, run, loadAsset: async () => null })).rejects.toThrow("历史输出素材不存在");
  });

  it("marks a 7/7 Listing run ready and includes every active image", async () => {
    const { run } = await fixture();
    let sequence = 0;
    const assets = createMemoryAssetRepository({ createId: () => `asset_${++sequence}` });
    const states: NonNullable<ProductionRun["slotVersionsSnapshot"]> = {};
    for (const slot of run.planSnapshot.slots) {
      const stored = await assets.put({ projectId: project.id, blob: new Blob([slot.slotKey], { type: "image/png" }), metadata: { name: `${slot.slotKey}.png`, kind: "generated", role: `amazon:${slot.slotKey}`, width: 2000, height: 2000 } });
      const versionId = `v_${slot.slotKey}`;
      states[slot.slotKey] = { activeVersionId: versionId, versions: [{ id: versionId, slotKey: slot.slotKey, assetId: stored.metadata.id, createdAt: "2026-07-20T01:00:00.000Z", source: "demo", promptSnapshot: slot.prompt, visibleCopySnapshot: slot.visibleCopy, planningInputSignature: "sig-old", width: 2000, height: 2000, mimeType: "image/png", parameters: { engine: "demo" } }] };
    }
    run.slotVersionsSnapshot = states;
    const exported = await buildRunExportPackage({ project, run, loadAsset: (id) => assets.get(id) });
    expect(exported.manifest.ready).toBe(true);
    expect(exported.manifest.missingSlots).toEqual([]);
    expect(exported.manifest.slots.every((slot) => slot.fileName?.endsWith(".png"))).toBe(true);
  });

  it("re-exports an old run after replan and records failures on that run", async () => {
    let assetId = 0;
    const assetRepository = createMemoryAssetRepository({ createId: () => `asset_${++assetId}` });
    const dependencies = {
      projectRepository: createMemoryProjectRepository({ createId: () => "p1" }),
      assetRepository,
      workspaceRepository: createMemoryWorkspaceRepository(),
      plannerEngine: demoPlanner,
      imageGenerator: demoImageGenerator,
      compressImageFile: async (file: File) => file,
      createObjectURL: () => `blob:${assetId}`,
      revokeObjectURL: () => undefined,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: project.name, facts: project.facts });
    await store.getState().planPlatform("amazon", { plannerMode: "listing", marketplaceId: "us", listingImageCount: 7 });
    const oldRunId = store.getState().runs[0]!.id;
    await store.getState().generateSlot("amazon", "MAIN");
    const generatedAssetId = store.getState().runs[0]!.events.find((event) => event.assetId)!.assetId!;
    await store.getState().planPlatform("amazon", { plannerMode: "listing", marketplaceId: "us", listingImageCount: 7 });
    const currentPlan = store.getState().plans.amazon;

    const exported = await store.getState().exportRun(oldRunId);

    expect(exported?.manifest.run?.id).toBe(oldRunId);
    expect(exported?.manifest.ready).toBe(false);
    expect(store.getState().plans.amazon).toEqual(currentPlan);
    expect(store.getState().runs.find((run) => run.id === oldRunId)?.events.at(-1)).toMatchObject({ kind: "export", status: "success", missingSlots: expect.any(Array) });

    await assetRepository.remove(generatedAssetId);
    expect(await store.getState().exportRun(oldRunId)).toBeNull();
    expect(store.getState().runs.find((run) => run.id === oldRunId)?.events.at(-1)).toMatchObject({ kind: "export", status: "failed" });
  });

  it("uses A+ external copy and Taobao required slots from each run snapshot", async () => {
    const { rulePack: aPlusPack } = createAmazonRulePackFromOptions({ plannerMode: "aplus", marketplaceId: "jp", aPlusType: "standard", sizeTier: "2K" });
    const aPlusPlan = await demoPlanner.plan(project.facts, aPlusPack, new AbortController().signal, [], { plannerMode: "aplus", marketplaceId: "jp", aPlusType: "standard", sizeTier: "2K" });
    const aPlusRun: ProductionRun = {
      id: "run_aplus", projectId: project.id, sessionId: "session_aplus", platformId: "amazon", workflowId: "amazon-aplus", source: "demo", status: "planned",
      contextSnapshot: { sourceInput: { listingText: "Title: Cloud Pillow" }, options: { platformId: "amazon", marketplaceId: "jp", plannerMode: "aplus", aPlusType: "standard", sizeTier: "2K" }, selectedReferenceAssetIds: [] },
      planSnapshot: aPlusPlan, planningInputSignatureSnapshot: "sig-a", slotVersionsSnapshot: {}, events: [], createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T01:00:00.000Z",
    };
    const aPlusExport = await buildRunExportPackage({ project, run: aPlusRun, loadAsset: async () => null });
    expect(aPlusExport.manifest.slots.map((slot) => slot.slotKey)).toEqual(aPlusPack.slots.map((slot) => slot.key));
    expect(aPlusExport.manifest.slots.some((slot) => Boolean(slot.externalText))).toBe(true);
    expect(Object.keys(unzipSync(new Uint8Array(await aPlusExport.blob.arrayBuffer())))).toContain("external-copy.md");

    const taobaoPack = getPlatformRulePack("taobao");
    const taobaoPlan = await demoPlanner.plan(project.facts, taobaoPack, new AbortController().signal);
    const taobaoRun: ProductionRun = {
      id: "run_taobao", projectId: project.id, sessionId: "session_taobao", platformId: "taobao", workflowId: "taobao-detail", source: "demo", status: "planned",
      contextSnapshot: { sourceInput: { listingText: "" }, options: { platformId: "taobao" }, selectedReferenceAssetIds: [] },
      planSnapshot: taobaoPlan, planningInputSignatureSnapshot: "sig-t", slotVersionsSnapshot: {}, events: [], createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T01:00:00.000Z",
    };
    const taobaoExport = await buildRunExportPackage({ project, run: taobaoRun, loadAsset: async () => null });
    expect(taobaoExport.manifest.run?.workflowId).toBe("taobao-detail");
    expect(taobaoExport.manifest.missingSlots).toEqual(taobaoPack.slots.map((slot) => slot.key));
  });
});
