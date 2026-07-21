import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryExecutionJobRepository } from "../src/domain/jobs/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoImageGenerator } from "../src/services/demo-image-generator";
import { demoPlanner } from "../src/services/demo-planner";
import {
  createWorkbenchStore,
  type WorkbenchStoreDependencies,
} from "../src/store/workbench-store";

const facts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "TP-01",
  sku: "TP-01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹承托"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉" },
};

function dependencies(): WorkbenchStoreDependencies {
  return {
    projectRepository: createMemoryProjectRepository({ createId: () => "project_jobs" }),
    assetRepository: createMemoryAssetRepository(),
    workspaceRepository: createMemoryWorkspaceRepository(),
    executionJobRepository: createMemoryExecutionJobRepository(),
    plannerEngine: demoPlanner,
    imageGenerator: demoImageGenerator,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:job",
    revokeObjectURL: () => undefined,
  };
}

describe("workbench execution jobs", () => {
  it("creates and completes a local batch for pending slots, then restores it from the repository", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "任务队列商品", facts });
    await store.getState().planPlatform("amazon");

    const job = await store.getState().startBatchGeneration("amazon");

    expect(job).toMatchObject({ kind: "batch-generate", status: "completed" });
    expect(job?.progress.completed).toBe(job?.progress.total);
    expect(store.getState().jobs[0]).toMatchObject({ id: job?.id, status: "completed" });
    expect(store.getState().sessions[0]?.slotVersions).not.toEqual({});

    const restored = createWorkbenchStore(deps);
    await restored.getState().initialize();
    expect(restored.getState().jobs[0]).toMatchObject({ id: job?.id, status: "completed" });
  });

  it("keeps a running batch canceled after its active image request aborts", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const deps = dependencies();
    deps.imageGenerator = {
      generate: (_request, signal) => new Promise((_resolve, reject) => {
        markStarted();
        const abort = () => reject(
          signal.reason ?? new DOMException("图片生成已取消", "AbortError"),
        );
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }),
    };
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "取消任务商品", facts });
    await store.getState().planPlatform("amazon");

    const running = store.getState().startBatchGeneration("amazon");
    await started;
    const jobId = store.getState().jobs[0]?.id;
    expect(jobId).toBeTruthy();

    await store.getState().cancelExecutionJob(jobId!);
    const canceled = await running;

    expect(canceled?.status).toBe("canceled");
    expect(store.getState().jobs[0]).toMatchObject({ id: jobId, status: "canceled" });
    expect(await deps.executionJobRepository!.get(jobId!)).toMatchObject({ status: "canceled" });
  });
});
