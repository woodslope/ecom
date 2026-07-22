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

function createDependencies(createId = () => "project_seed") {
  let assetSeq = 0;
  return {
    projectRepository: createMemoryProjectRepository({
      createId,
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

    const session = store
      .getState()
      .sessions.find(
        (candidate) =>
          candidate.projectId === project!.id && candidate.workflowId === "amazon-listing",
      );
    expect(session).toBeTruthy();
    expect(session?.sourceInput.listingText).toContain("Title: 云感旅行颈枕");
    expect(session?.sourceInput.listingText).toContain("- 慢回弹");
    expect(session?.selectedReferenceAssetIds).toEqual(
      uploaded.map((asset) => asset.metadata.id),
    );
    expect(session?.plan).toBeUndefined();
  });

  it("prefills Taobao product text and reference assets without analyzing", async () => {
    const deps = createDependencies(() => "project_taobao_seed");
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

    const session = store
      .getState()
      .sessions.find(
        (candidate) =>
          candidate.projectId === project!.id && candidate.workflowId === "taobao-product",
      );
    expect(session?.sourceInput.taobaoProduct?.productText).toContain("商品名：云感旅行颈枕");
    expect(session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds).toEqual(
      uploaded.map((asset) => asset.metadata.id),
    );
    expect(session?.selectedReferenceAssetIds).toEqual(
      uploaded.map((asset) => asset.metadata.id),
    );
    expect(session?.taobaoAnalysis).toBeUndefined();
    expect(session?.plan).toBeUndefined();
  });

  it("asks before overwriting an existing draft, then force-seeds", async () => {
    const deps = createDependencies(() => "project_confirm");
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

    // Simulate user edits on the session draft.
    const workspace = await deps.workspaceRepository.load(project!.id);
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

    const blocked = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "amazon");
    expect(blocked).toBe("needs-confirm");
    expect(
      store.getState().sessions.find((session) => session.id === edited.id)?.sourceInput
        .listingText,
    ).toContain("Manual draft");

    const forced = await store
      .getState()
      .seedPlatformIntakeFromProject(project!.id, "amazon", { force: true });
    expect(forced).toBe("seeded");
    const session = store.getState().sessions.find((candidate) => candidate.id === edited.id);
    expect(session?.sourceInput.listingText).toContain("Title: 云感旅行颈枕");
    expect(session?.sourceInput.listingText).not.toContain("Manual draft");
  });
});
