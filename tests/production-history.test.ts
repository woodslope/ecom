import { describe, expect, it } from "vitest";

import { queryProductionRuns } from "../src/domain/tasks/production-runs";
import type { ProductProject } from "../src/domain/projects/types";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";
import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { demoImageGenerator } from "../src/services/demo-image-generator";
import { createWorkbenchStore } from "../src/store/workbench-store";

const project = (id: string, name: string): ProductProject => ({
  id, name,
  facts: { productName: name, category: "Travel", brand: "", model: "", sku: "", targetAudience: "", description: "", sellingPoints: [], forbiddenClaims: [], specifications: {} },
  createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
});

function run(overrides: Partial<ProductionRun> & Pick<ProductionRun, "id" | "projectId" | "workflowId">): ProductionRun {
  const platformId = overrides.workflowId === "taobao-detail" ? "taobao" : "amazon";
  const { id, projectId, workflowId, ...rest } = overrides;
  return {
    id, projectId, sessionId: `session_${id}`,
    platformId, workflowId, source: "demo", status: "planned",
    contextSnapshot: {
      sourceInput: { listingText: "Title: Product" },
      options: platformId === "amazon"
        ? { platformId: "amazon", marketplaceId: "us", plannerMode: workflowId === "amazon-aplus" ? "aplus" : "listing", sizeTier: "2K" }
        : { platformId: "taobao" },
      selectedReferenceAssetIds: [],
    },
    planSnapshot: {
      platformId, source: "demo",
      ...(platformId === "amazon" ? { amazonSession: {
        marketplaceId: "us" as const,
        plannerMode: workflowId === "amazon-aplus" ? "aplus" as const : "listing" as const,
        listingImageCount: 7,
        aPlusType: "standard-large" as const,
        sizeTier: "2K" as const,
        stylePresetId: "clean-retail",
        slotKeys: [workflowId === "amazon-aplus" ? "A+L01" : "MAIN"],
      } } : {}),
      slots: [{ slotKey: platformId === "taobao" ? "TB-HERO-01" : workflowId === "amazon-aplus" ? "A+L01" : "MAIN", visibleCopy: "", strategy: "s", evidence: ["e"], prompt: "p", negativePrompt: "n" }],
    },
    events: [], createdAt: "2026-07-20T01:00:00.000Z", updatedAt: rest.updatedAt ?? "2026-07-20T01:00:00.000Z",
    ...rest,
  };
}

describe("production history query", () => {
  it("filters a derived newest-first view without mutating saved runs", () => {
    const records = [
      { project: project("p1", "Cloud Pillow"), run: run({ id: "r1", projectId: "p1", workflowId: "amazon-listing", status: "ready", updatedAt: "2026-07-20T03:00:00.000Z" }) },
      { project: project("p2", "Travel Bottle"), run: run({ id: "r2", projectId: "p2", workflowId: "taobao-detail", status: "producing", updatedAt: "2026-07-20T04:00:00.000Z" }) },
      { project: project("p1", "Cloud Pillow"), run: run({ id: "r3", projectId: "p1", workflowId: "amazon-aplus", source: "api", status: "partial", updatedAt: "2026-07-20T05:00:00.000Z" }) },
    ];
    const before = JSON.stringify(records);

    const result = queryProductionRuns(records, {
      search: "pillow", platformId: "amazon", workflowId: "amazon-aplus", source: "api", status: "partial", shape: "landscape",
    });

    expect(result.map(({ run }) => run.id)).toEqual(["r3"]);
    expect(JSON.stringify(records)).toBe(before);
    expect(queryProductionRuns(records, {}).map(({ run }) => run.id)).toEqual(["r3", "r2", "r1"]);
  });

  it("groups generation under its run, keeps replan history, resumes, forks and reuses output", async () => {
    let id = 0;
    const dependencies = {
      projectRepository: createMemoryProjectRepository({ createId: () => "p1", now: () => "2026-07-20T01:00:00.000Z" }),
      assetRepository: createMemoryAssetRepository({ createId: () => `asset_${++id}`, now: () => `2026-07-20T0${Math.min(id + 1, 9)}:00:00.000Z` }),
      workspaceRepository: createMemoryWorkspaceRepository({ now: () => "2026-07-20T01:00:00.000Z" }),
      plannerEngine: demoPlanner,
      imageGenerator: demoImageGenerator,
      createVersionId: () => `version_${++id}`,
      createTaskId: () => `event_${++id}`,
      now: () => `2026-07-20T${String(Math.min(++id, 23)).padStart(2, "0")}:00:00.000Z`,
      compressImageFile: async (file: File) => file,
      createObjectURL: () => `blob:${id}`,
      revokeObjectURL: () => undefined,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "Cloud Pillow", facts: project("p1", "Cloud Pillow").facts });
    await store.getState().planPlatform("taobao");
    const firstRun = store.getState().runs[0]!;
    const slotKey = firstRun.planSnapshot.slots[0]!.slotKey;
    await store.getState().generateSlot("taobao", slotKey);
    const generatedEvent = store.getState().runs[0]!.events.find((event) => event.kind === "generate")!;

    await store.getState().planPlatform("taobao");

    const persistedAfterReplan = await dependencies.workspaceRepository.load("p1");
    expect(persistedAfterReplan.runs.map((item) => item.id)).toContain(firstRun.id);

    expect(store.getState().runs).toHaveLength(2);
    expect(store.getState().runs.find((item) => item.id === firstRun.id)?.events).toContainEqual(
      expect.objectContaining({ slotKey, assetId: generatedEvent.assetId, versionId: generatedEvent.versionId }),
    );
    expect(await store.getState().resumeRun(firstRun.id)).toBe(false);
    const fork = await store.getState().forkRun(firstRun.id);
    expect(fork).toMatchObject({ workflowId: "taobao-product", slotVersions: {} });
    expect(store.getState().runs.at(-1)).toMatchObject({ sessionId: fork?.id, status: "planned" });
    expect(store.getState().runs.at(-1)?.events).toHaveLength(1);
    expect(store.getState().runs.find((item) => item.id === firstRun.id)?.events).toContainEqual(
      expect.objectContaining({ id: generatedEvent.id, assetId: generatedEvent.assetId, slotKey }),
    );
    const persistedAfterFork = await dependencies.workspaceRepository.load("p1");
    expect(persistedAfterFork.runs.map((item) => item.id)).toContain(firstRun.id);
    expect(persistedAfterFork.runs.find((item) => item.id === firstRun.id)?.events).toContainEqual(
      expect.objectContaining({ id: generatedEvent.id, assetId: generatedEvent.assetId, slotKey }),
    );

    const reused = await store.getState().reuseRunImageAsReference(firstRun.id, generatedEvent.id);
    expect(reused, store.getState().error ?? JSON.stringify(store.getState().assets.map((asset) => asset.metadata.id))).not.toBeNull();
    expect(reused?.metadata).toMatchObject({ kind: "reference", role: `source:taobao:${slotKey}` });
    expect(reused?.metadata.tags).toEqual(expect.arrayContaining(["history-reuse", firstRun.id, slotKey]));
    expect(await store.getState().resumeRun(store.getState().runs.at(-1)!.id)).toBe(true);
  });

  it("keeps a failed generation event inside the active run", async () => {
    const dependencies = {
      projectRepository: createMemoryProjectRepository({ createId: () => "p1" }),
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository: createMemoryWorkspaceRepository(),
      plannerEngine: demoPlanner,
      imageGenerator: { async generate() { throw new Error("provider unavailable"); } },
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:unused",
      revokeObjectURL: () => undefined,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "Cloud Pillow", facts: project("p1", "Cloud Pillow").facts });
    await store.getState().planPlatform("taobao");
    const runId = store.getState().runs[0]!.id;
    const slotKey = store.getState().runs[0]!.planSnapshot.slots[0]!.slotKey;

    await store.getState().generateSlot("taobao", slotKey);

    expect(store.getState().runs.find((item) => item.id === runId)?.events.at(-1)).toMatchObject({
      kind: "generate", status: "failed", slotKey,
    });
  });
});
