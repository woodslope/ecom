import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryExecutionJobRepository } from "../src/domain/jobs/repository";
import { createExecutionJob } from "../src/domain/jobs/state";
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

  it("keeps project metadata when task cleanup fails and succeeds on retry", async () => {
    const projectRepository = createMemoryProjectRepository({ createId: () => "project_jobs" });
    const executionJobRepository = createMemoryExecutionJobRepository();
    const originalRemoveProject = executionJobRepository.removeProject.bind(executionJobRepository);
    let shouldFail = true;
    executionJobRepository.removeProject = async (projectId) => {
      if (shouldFail) throw new Error("task store unavailable");
      await originalRemoveProject(projectId);
    };
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository: createMemoryWorkspaceRepository(),
      executionJobRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });
    const project = await store.getState().createProject({
      name: "Task cleanup retry",
      facts: {
        productName: "Task cleanup retry",
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
    const job = createExecutionJob({
      id: "job_project_cleanup",
      kind: "batch-generate",
      targets: [{
        id: "item_project_cleanup",
        projectId: project!.id,
        sessionId: "session_project_cleanup",
        platformId: "amazon",
        workflowId: "amazon-listing",
        slotKey: "MAIN",
      }],
      now: "2026-08-24T05:00:00.000Z",
    });
    await executionJobRepository.put(job);
    await store.getState().refreshExecutionJobs();

    await expect(store.getState().removeProject(project!.id)).resolves.toBe(false);
    await expect(projectRepository.get(project!.id)).resolves.toMatchObject({ id: project!.id });
    expect(store.getState().error).toContain("task store unavailable");

    shouldFail = false;
    await expect(store.getState().removeProject(project!.id)).resolves.toBe(true);
    await expect(projectRepository.get(project!.id)).resolves.toBeNull();
    expect((await executionJobRepository.list({ projectId: project!.id })).items).toEqual([]);
  });
});
