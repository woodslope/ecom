import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

describe("TaskRecord retirement", () => {
  it("records a new plan only as a ProductionRun event", async () => {
    const workspaceRepository = createMemoryWorkspaceRepository();
    const store = createWorkbenchStore({
      projectRepository: createMemoryProjectRepository({ createId: () => "project_01" }),
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository,
      plannerEngine: demoPlanner,
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
        description: "Memory foam pillow",
        sellingPoints: ["Packable"],
        forbiddenClaims: [],
        specifications: {},
      },
    });

    await store.getState().planPlatform("amazon", { plannerMode: "listing" });

    const persisted = await workspaceRepository.load("project_01");
    expect(persisted.taskHistory).toEqual([]);
    expect(persisted.runs).toHaveLength(1);
    expect(persisted.runs[0]?.events).toEqual([
      expect.objectContaining({ kind: "plan", status: "success" }),
    ]);
  });
});
