import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { createWorkbenchStore } from "../src/store/workbench-store";

describe("project deletion recovery", () => {
  it("keeps project metadata visible when asset cleanup fails", async () => {
    const projectRepository = createMemoryProjectRepository({ createId: () => "project_01" });
    const assetRepository = createMemoryAssetRepository();
    const originalClear = assetRepository.clearProject.bind(assetRepository);
    assetRepository.clearProject = async () => {
      throw new Error("asset store unavailable");
    };
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      workspaceRepository: createMemoryWorkspaceRepository(),
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });
    await store.getState().createProject({
      name: "Travel Pillow",
      facts: {
        productName: "Travel Pillow",
        category: "Travel",
        brand: "",
        model: "",
        sku: "",
        targetAudience: "Travelers",
        description: "Pillow",
        sellingPoints: [],
        forbiddenClaims: [],
        specifications: {},
      },
    });

    await expect(store.getState().removeProject("project_01")).resolves.toBe(false);
    expect(store.getState().activeProject?.id).toBe("project_01");
    await expect(projectRepository.get("project_01")).resolves.toMatchObject({
      id: "project_01",
    });
    expect(store.getState().error).toContain("asset store unavailable");

    assetRepository.clearProject = originalClear;
  });
});
