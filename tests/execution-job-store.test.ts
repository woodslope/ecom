import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryExecutionJobRepository } from "../src/domain/jobs/repository";
import { createMemoryExecutionJobCoordinator } from "../src/domain/jobs/execution-coordinator";
import {
  claimNextExecutionJobItem,
  createExecutionJob,
  failExecutionJobItem,
} from "../src/domain/jobs/state";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { mockImageGenerator } from "./fixtures/mock-ai";
import { mockPlanner } from "./fixtures/mock-planner";
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
    plannerEngine: mockPlanner,
    imageGenerator: mockImageGenerator,
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

  it("owns one active job, preserves it on refresh, and does not abort it when another job is canceled", async () => {
    let markStarted!: () => void;
    let releaseFirstGeneration!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const generationGate = new Promise<void>((resolve) => {
      releaseFirstGeneration = resolve;
    });
    let generationCalls = 0;
    let firstSignalAborted = false;
    let firstSignalAbortEvents = 0;
    const deps = dependencies();
    deps.imageGenerator = {
      async generate(request, signal) {
        generationCalls += 1;
        if (generationCalls === 1) {
          signal.addEventListener("abort", () => {
            firstSignalAbortEvents += 1;
          }, { once: true });
          markStarted();
          await generationGate;
          firstSignalAborted = signal.aborted;
        }
        return mockImageGenerator.generate(request, signal);
      },
    };
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "任务 owner 商品", facts });
    await store.getState().planPlatform("amazon");

    const activeExecution = store.getState().startBatchGeneration("amazon");
    await started;
    const activeJob = store.getState().jobs.find((job) => job.status === "running")!;
    const session = store.getState().sessions.find((candidate) => Boolean(candidate.activeRunId))!;
    const target = {
      id: "job-item-secondary",
      projectId: session.projectId,
      sessionId: session.id,
      platformId: session.platformId,
      workflowId: session.workflowId,
      slotKey: session.plan!.slots[0]!.slotKey,
    };
    const queued = createExecutionJob({
      id: "job-secondary-queued",
      kind: "batch-generate",
      targets: [target],
      now: "2026-08-24T00:00:00.000Z",
    });
    const claimedFailed = claimNextExecutionJobItem(
      createExecutionJob({
        id: "job-secondary-failed",
        kind: "batch-generate",
        targets: [{ ...target, id: "job-item-failed" }],
        now: "2026-08-24T00:00:00.000Z",
      }),
      "2026-08-24T00:01:00.000Z",
    );
    const failed = failExecutionJobItem(
      claimedFailed.job,
      claimedFailed.currentItem!.id,
      "provider unavailable",
      "2026-08-24T00:02:00.000Z",
    );
    await deps.executionJobRepository!.put(queued);
    await deps.executionJobRepository!.put(failed);

    await expect(store.getState().startBatchGeneration("amazon")).resolves.toBeNull();
    await expect(store.getState().resumeExecutionJob(queued.id)).resolves.toBeNull();
    await expect(store.getState().retryExecutionJob(failed.id)).resolves.toBeNull();
    await store.getState().refreshExecutionJobs();
    expect(store.getState().jobs.find((job) => job.id === activeJob.id)?.status).toBe("running");

    await expect(store.getState().cancelExecutionJob(queued.id)).resolves.toBe(true);
    expect(firstSignalAbortEvents).toBe(0);
    releaseFirstGeneration();
    const completed = await activeExecution;

    expect(firstSignalAborted).toBe(false);
    expect(completed?.status).toBe("completed");
    expect(generationCalls).toBeGreaterThan(1);
    expect(await deps.executionJobRepository!.get(queued.id)).toMatchObject({ status: "canceled" });
  });

  it("allows only one generating tab, preserves its running job on refresh, and releases after completion", async () => {
    let markStarted!: () => void;
    let releaseGeneration!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const shared = dependencies();
    const projectIds = ["project_tab_a", "project_tab_b"];
    shared.projectRepository = createMemoryProjectRepository({
      createId: () => projectIds.shift()!,
    });
    const coordinator = createMemoryExecutionJobCoordinator();
    const firstProject = await shared.projectRepository.create({ name: "标签页 A 商品", facts });
    const secondProject = await shared.projectRepository.create({ name: "标签页 B 商品", facts });
    let firstGenerationCalls = 0;
    let secondGenerationCalls = 0;
    let firstSignalAborted = false;
    const firstStore = createWorkbenchStore({
      ...shared,
      executionJobCoordinator: coordinator,
      imageGenerator: {
        async generate(request, signal) {
          firstGenerationCalls += 1;
          if (firstGenerationCalls === 1) {
            markStarted();
            await generationGate;
            firstSignalAborted = signal.aborted;
          }
          return mockImageGenerator.generate(request, signal);
        },
      },
    });
    const secondStore = createWorkbenchStore({
      ...shared,
      executionJobCoordinator: coordinator,
      imageGenerator: {
        async generate(request, signal) {
          secondGenerationCalls += 1;
          return mockImageGenerator.generate(request, signal);
        },
      },
    });

    await firstStore.getState().initialize();
    await firstStore.getState().selectProject(firstProject.id);
    await firstStore.getState().planPlatform("amazon");
    await secondStore.getState().initialize();
    await secondStore.getState().selectProject(secondProject.id);
    await secondStore.getState().planPlatform("amazon");

    const firstExecution = firstStore.getState().startBatchGeneration("amazon");
    await started;
    await secondStore.getState().refreshExecutionJobs();
    expect(secondStore.getState().jobs).toEqual([
      expect.objectContaining({ status: "running" }),
    ]);

    await expect(secondStore.getState().startBatchGeneration("amazon")).resolves.toBeNull();
    expect(secondStore.getState().error).toContain("另一个浏览器标签页");
    expect(secondGenerationCalls).toBe(0);
    expect(firstSignalAborted).toBe(false);
    expect((await shared.executionJobRepository!.list()).items).toHaveLength(1);

    releaseGeneration();
    await expect(firstExecution).resolves.toMatchObject({ status: "completed" });
    await expect(secondStore.getState().startBatchGeneration("amazon")).resolves.toMatchObject({
      status: "completed",
    });
    expect(firstSignalAborted).toBe(false);
    expect(secondGenerationCalls).toBeGreaterThan(0);
  });

  it("cancels an active project job before deleting the project and its task records", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const deps = dependencies();
    deps.executionJobCoordinator = createMemoryExecutionJobCoordinator();
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
    const project = await store.getState().createProject({ name: "删除中的任务商品", facts });
    await store.getState().planPlatform("amazon");

    const execution = store.getState().startBatchGeneration("amazon");
    await started;
    await expect(store.getState().removeProject(project!.id)).resolves.toBe(true);

    await expect(execution).resolves.toMatchObject({ status: "canceled" });
    await expect(deps.projectRepository.get(project!.id)).resolves.toBeNull();
    expect((await deps.executionJobRepository!.list({ projectId: project!.id })).items).toEqual([]);
    expect(store.getState().jobs).toEqual([]);
  });

  it("requests cancellation from the owning tab before deleting its project", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let abortEvents = 0;
    const shared = dependencies();
    const coordinator = createMemoryExecutionJobCoordinator();
    const ownerStore = createWorkbenchStore({
      ...shared,
      executionJobCoordinator: coordinator,
      imageGenerator: {
        generate: (_request, signal) => new Promise((_resolve, reject) => {
          markStarted();
          const abort = () => {
            abortEvents += 1;
            reject(signal.reason ?? new DOMException("图片生成已取消", "AbortError"));
          };
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }),
      },
    });
    const deletingStore = createWorkbenchStore({
      ...shared,
      executionJobCoordinator: coordinator,
    });
    const project = await ownerStore.getState().createProject({
      name: "跨标签页删除任务商品",
      facts,
    });
    await ownerStore.getState().planPlatform("amazon");
    await deletingStore.getState().initialize();

    const execution = ownerStore.getState().startBatchGeneration("amazon");
    await started;
    const deletion = deletingStore.getState().removeProject(project!.id);

    await expect(execution).resolves.toMatchObject({ status: "canceled" });
    await expect(deletion).resolves.toBe(true);
    expect(abortEvents).toBe(1);
    await expect(shared.projectRepository.get(project!.id)).resolves.toBeNull();
    expect((await shared.executionJobRepository!.list({ projectId: project!.id })).items).toEqual([]);
  });

  it("fails invalid job references before invoking the image generator", async () => {
    let generationCalls = 0;
    const deps = dependencies();
    deps.imageGenerator = {
      async generate(request, signal) {
        generationCalls += 1;
        return mockImageGenerator.generate(request, signal);
      },
    };
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "引用校验商品", facts });
    await store.getState().planPlatform("amazon");
    const session = store.getState().sessions.find((candidate) => Boolean(candidate.activeRunId))!;
    const baseTarget = {
      id: "invalid-target",
      projectId: session.projectId,
      sessionId: session.id,
      platformId: session.platformId,
      workflowId: session.workflowId,
      slotKey: session.plan!.slots[0]!.slotKey,
    };
    const missingSession = createExecutionJob({
      id: "job-missing-session",
      kind: "batch-generate",
      targets: [{ ...baseTarget, sessionId: "missing-session" }],
      now: "2026-08-24T01:00:00.000Z",
    });
    const missingProject = createExecutionJob({
      id: "job-missing-project",
      kind: "batch-generate",
      targets: [{ ...baseTarget, projectId: "missing-project" }],
      now: "2026-08-24T01:00:00.000Z",
    });
    const missingSlot = createExecutionJob({
      id: "job-missing-slot",
      kind: "batch-generate",
      targets: [{ ...baseTarget, slotKey: "MISSING-SLOT" }],
      now: "2026-08-24T01:00:00.000Z",
    });
    await deps.executionJobRepository!.put(missingProject);
    await deps.executionJobRepository!.put(missingSession);
    await deps.executionJobRepository!.put(missingSlot);

    await expect(store.getState().resumeExecutionJob(missingProject.id)).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("商品项目"),
    });
    await expect(store.getState().resumeExecutionJob(missingSession.id)).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("Session"),
    });
    await expect(store.getState().resumeExecutionJob(missingSlot.id)).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("槽位"),
    });

    const missingRun = createExecutionJob({
      id: "job-missing-run",
      kind: "batch-generate",
      targets: [baseTarget],
      now: "2026-08-24T01:00:00.000Z",
    });
    await deps.executionJobRepository!.put(missingRun);
    store.setState({ runs: [] });
    await expect(store.getState().resumeExecutionJob(missingRun.id)).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("ProductionRun"),
    });
    expect(generationCalls).toBe(0);
  });
});
