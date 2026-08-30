import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { mockImageGenerator } from "./fixtures/mock-ai";
import { mockPlanner } from "./fixtures/mock-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

const productFacts: ProductFacts = {
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
};

function createDependencies() {
  let assetSequence = 0;
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-17T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository({
      createId: () => `asset_${++assetSequence}`,
      now: () => "2026-07-17T09:00:00.000Z",
    }),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    }),
    plannerEngine: mockPlanner,
    imageGenerator: mockImageGenerator,
    createVersionId: () => "version_main",
    now: () => "2026-07-17T10:00:00.000Z",
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:generated/main",
    revokeObjectURL: () => undefined,
  };
}

describe("workbench export", () => {
  it("returns a real incomplete ZIP and restores the successful export run", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "旅行颈枕", facts: productFacts });
    await store.getState().planPlatform("amazon");
    await store.getState().generateSlot("amazon", "MAIN");

    const exported = await store.getState().exportPlatform("amazon");

    expect(exported?.blob.type).toBe("application/zip");
    expect(exported?.manifest.ready).toBe(false);
    expect(exported?.manifest.missingSlots).toContain("PT01");
    expect(store.getState().exportingPlatform).toBeNull();
    expect(store.getState().runs.at(-1)?.events.at(-1)).toMatchObject({
      kind: "export",
      status: "success",
      missingSlots: expect.any(Array),
    });

    const restored = createWorkbenchStore(dependencies);
    await restored.getState().initialize();
    expect(restored.getState().runs).toEqual(store.getState().runs);
  });

  it("keeps generated versions and records a failed export when an asset cannot be read", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "导出失败", facts: productFacts });
    await store.getState().planPlatform("amazon");
    await store.getState().generateSlot("amazon", "MAIN");
    const previousVersions = store.getState().slotVersions.amazon?.MAIN;
    dependencies.assetRepository.get = async () => {
      throw new Error("IndexedDB 读取失败");
    };

    const exported = await store.getState().exportPlatform("amazon");

    expect(exported).toBeNull();
    expect(store.getState().exportError).toContain("IndexedDB 读取失败");
    expect(store.getState().slotVersions.amazon?.MAIN).toEqual(previousVersions);
    expect(store.getState().runs.at(-1)?.events.at(-1)).toMatchObject({
      kind: "export",
      status: "failed",
    });
  });
});
