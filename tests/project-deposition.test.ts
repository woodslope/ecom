import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

describe("task draft identity and library deposition", () => {
  it("keeps manual tasks out of the library and deposits selected raw assets idempotently", async () => {
    let projectId = 0;
    let assetId = 0;
    const dependencies = {
      projectRepository: createMemoryProjectRepository({ createId: () => `project_${++projectId}` }),
      assetRepository: createMemoryAssetRepository({ createId: () => `asset_${++assetId}` }),
      workspaceRepository: createMemoryWorkspaceRepository(),
      plannerEngine: demoPlanner,
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      sourceMode: "manual",
      workflowId: "amazon-listing",
      listingText: "Title: 手动保温杯\n- 杯盖防漏",
      files: [new File(["raw"], "raw.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
      options: {
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        aPlusType: "standard-large",
        sizeTier: "2K",
        stylePresetId: "clean-retail",
      },
    });
    expect(session).toBeTruthy();
    await store.getState().confirmLocalizedFacts(
      session!.id,
      session!.localizedFactsDraft!.localizedFacts,
    );
    await store.getState().planPlatform(
      "amazon",
      session!.options.platformId === "amazon" ? session!.options : undefined,
    );
    const task = store.getState().activeProject!;
    expect(task.scope).toBe("task-draft");
    expect(store.getState().projects).toHaveLength(0);
    expect(store.getState().allProjects).toEqual([task]);
    const rawAsset = store.getState().assets.find((asset) => asset.metadata.kind === "reference")!;
    const run = store.getState().runs[0]!;

    const created = await store.getState().depositRunToLibrary({
      runId: run.id,
      mode: "create",
      name: "保温杯共享事实",
      facts: {
        ...task.facts,
        productName: "手动保温杯",
        specifications: { capacity: "500ml" },
      },
      selectedAssetIds: [rawAsset.metadata.id],
    });
    expect(created).toMatchObject({ scope: "library", name: "保温杯共享事实" });
    expect(store.getState().activeProject?.id).toBe(task.id);
    expect(await dependencies.assetRepository.list(created!.id)).toHaveLength(1);
    expect((await dependencies.assetRepository.list(created!.id))[0]!.id).not.toBe(rawAsset.metadata.id);

    await store.getState().depositRunToLibrary({
      runId: run.id,
      mode: "merge",
      targetProjectId: created!.id,
      facts: { ...task.facts, productName: "冲突名称", brand: "North Cup" },
      selectedAssetIds: [rawAsset.metadata.id],
    });
    expect(await dependencies.assetRepository.list(created!.id)).toHaveLength(1);
    expect(store.getState().runs[0]?.deposit?.targetProjectId).toBe(created!.id);
    expect(await dependencies.projectRepository.get(created!.id)).toMatchObject({
      facts: { productName: "手动保温杯", brand: "North Cup" },
    });
  });
});
