import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

const productFacts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹", "可拆洗"],
  forbiddenClaims: ["治疗颈椎病"],
  specifications: { 材质: "记忆棉" },
};

function createDependencies(projectIds = ["project_seed", "task_seed", "task_seed_2", "task_seed_3"]) {
  let assetSeq = 0;
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => projectIds.shift()!,
      now: () => "2026-07-21T10:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository({
      createId: () => `asset_${++assetSeq}`,
      now: () => "2026-07-21T10:00:00.000Z",
    }),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-21T10:00:00.000Z",
    }),
    plannerEngine: demoPlanner,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:seed",
    revokeObjectURL: () => undefined,
  };
}

describe("seedPlatformIntakeFromProject", () => {
  it("prefills Amazon listing text and selects all reference assets", async () => {
    const deps = createDependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const project = await store.getState().createProject({
      name: "颈枕资料",
      facts: productFacts,
    });
    expect(project).toBeTruthy();
    const uploaded = await store.getState().uploadReferenceFiles([
      new File(["front"], "front.png", { type: "image/png" }),
      new File(["side"], "side.png", { type: "image/png" }),
    ]);
    expect(uploaded).toHaveLength(2);

    const result = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "amazon");
    expect(result).toBe("seeded");

    const taskProject = store.getState().activeProject;
    expect(taskProject).toMatchObject({ scope: "task-draft" });
    expect(taskProject?.id).not.toBe(project!.id);
    expect(store.getState().projects).toEqual([project]);
    const session = store.getState().sessions.find(
      (candidate) => candidate.projectId === taskProject?.id && candidate.workflowId === "amazon-listing",
    );
    expect(session).toBeTruthy();
    expect(session?.sourceInput.listingText).toContain("Title: 云感旅行颈枕");
    expect(session?.sourceInput.listingText).toContain("- 慢回弹");
    expect(session?.selectedReferenceAssetIds).toHaveLength(uploaded.length);
    expect(session?.selectedReferenceAssetIds).not.toEqual(uploaded.map((asset) => asset.metadata.id));
    expect(session?.planningInput).toMatchObject({
      sourceProjectId: project!.id,
      sourceProjectUpdatedAt: project!.updatedAt,
    });
    expect(session?.plan).toBeUndefined();
  });

  it("prefills Taobao product text and reference assets without analyzing", async () => {
    const deps = createDependencies(["project_taobao_seed", "task_taobao_seed"]);
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const project = await store.getState().createProject({
      name: "淘宝颈枕",
      facts: productFacts,
    });
    const uploaded = await store.getState().uploadReferenceFiles([
      new File(["ref"], "ref.png", { type: "image/png" }),
    ]);

    const result = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "taobao");
    expect(result).toBe("seeded");

    const taskProject = store.getState().activeProject;
    expect(taskProject).toMatchObject({ scope: "task-draft" });
    const session = store.getState().sessions.find(
      (candidate) => candidate.projectId === taskProject?.id && candidate.workflowId === "taobao-product",
    );
    expect(session?.sourceInput.taobaoProduct?.productText).toContain("商品名：云感旅行颈枕");
    expect(session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds).toHaveLength(uploaded.length);
    expect(session?.selectedReferenceAssetIds).toHaveLength(uploaded.length);
    expect(session?.selectedReferenceAssetIds).not.toEqual(uploaded.map((asset) => asset.metadata.id));
    expect(session?.taobaoAnalysis).toBeUndefined();
    expect(session?.plan).toBeUndefined();
  });

  it("creates a new task copy without overwriting an earlier platform draft", async () => {
    const deps = createDependencies(["project_confirm", "task_first", "task_second"]);
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const project = await store.getState().createProject({
      name: "有草稿",
      facts: productFacts,
    });

    const first = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "amazon");
    expect(first).toBe("seeded");
    const firstTaskId = store.getState().activeProject!.id;

    // Simulate user edits on the session draft.
    const workspace = await deps.workspaceRepository.load(firstTaskId);
    const existing = workspace.sessions[0]!;
    const edited = {
      ...existing,
      sourceInput: { listingText: "Title: Manual draft that should be protected" },
      updatedAt: "2026-07-21T10:05:00.000Z",
    };
    await deps.workspaceRepository.save({
      ...workspace,
      sessions: [edited],
      updatedAt: edited.updatedAt,
    });
    store.setState({
      sessions: [edited],
    });

    const restored = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "amazon");
    expect(restored).toBe("seeded");
    expect(store.getState().activeProject?.id).toBe("task_second");
    expect(store.getState().activeProject?.id).not.toBe(firstTaskId);
    expect((await deps.workspaceRepository.load(firstTaskId)).sessions[0]?.sourceInput.listingText)
      .toContain("Manual draft");
  });
});
