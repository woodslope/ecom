import { describe, expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";

import {
  createIndexedDbAssetRepository,
  createMemoryAssetRepository,
  DEFAULT_ASSET_DATABASE_NAME,
} from "../src/domain/assets/repository";
import {
  createLocalStorageProjectRepository,
  createMemoryProjectRepository,
  DEFAULT_PROJECT_STORAGE_KEY,
} from "../src/domain/projects/repository";
import {
  createLocalStorageSettingsRepository,
  createMemorySettingsRepository,
  normalizeRuntimeSettings,
  RUNTIME_SETTINGS_STORAGE_KEY,
} from "../src/domain/settings";
import {
  createLocalStorageWorkspaceRepository,
  createMemoryWorkspaceRepository,
  PROJECT_WORKSPACE_STORAGE_PREFIX,
  type PlatformSession,
  type ProductionRun,
} from "../src/domain/workspace/project-workspace";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("v2 business persistence", () => {
  it("starts with empty v2 projects while preserving v1 runtime settings", async () => {
    const storage = createStorage({
      "ecom-workbench.projects.v1": JSON.stringify({
        version: 1,
        projects: [
          {
            id: "legacy_project",
            name: "旧测试商品",
            facts: { productName: "旧测试商品" },
            createdAt: "2026-07-19T00:00:00.000Z",
            updatedAt: "2026-07-19T00:00:00.000Z",
          },
        ],
        activeProjectId: "legacy_project",
      }),
      [RUNTIME_SETTINGS_STORAGE_KEY]: JSON.stringify({
        mode: "api",
        apiKey: "sk-preserved",
        planningEndpoint: "https://provider.example/v1/chat/completions",
        planningModel: "planner-model",
        imageBaseUrl: "https://provider.example/v1",
        imageModel: "image-model",
      }),
    });

    expect(DEFAULT_PROJECT_STORAGE_KEY).toBe("ecom-workbench.projects.v2");
    await expect(createLocalStorageProjectRepository({ storage }).list()).resolves.toEqual([]);
    await expect(createLocalStorageSettingsRepository(storage).load()).resolves.toMatchObject({
      mode: "api",
      apiKey: "sk-preserved",
      planningModel: "planner-model",
      imageModel: "image-model",
    });
  });

  it("ignores v1 workspace data and returns an empty v2 session/run document", async () => {
    const storage = createStorage({
      "ecom-workbench.workspace.v1.project_01": JSON.stringify({
        projectId: "project_01",
        plans: { amazon: { platformId: "amazon", slots: [{ slotKey: "MAIN" }] } },
        updatedAt: "2026-07-19T00:00:00.000Z",
      }),
    });

    expect(PROJECT_WORKSPACE_STORAGE_PREFIX).toBe("ecom-workbench.workspace.v2.");
    await expect(createLocalStorageWorkspaceRepository({ storage }).load("project_01"))
      .resolves.toMatchObject({
        projectId: "project_01",
        sessions: [],
        runs: [],
        plans: {},
        slotVersions: {},
        taskHistory: [],
      });
  });

  it("restores v2 sessions and production runs after a repository reload", async () => {
    const storage = createStorage();
    const plan = await demoPlanner.plan(
      {
        productName: "旅行颈枕",
        description: "可折叠记忆棉颈枕",
        sellingPoints: ["慢回弹"],
      },
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing" },
    );
    const session: PlatformSession = {
      id: "session_01",
      projectId: "project_01",
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: 旅行颈枕\nBullet: 慢回弹" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        sizeTier: "2K",
        stylePresetId: "clean-studio",
      },
      selectedReferenceAssetIds: ["asset_01"],
      plan,
      planInputSignature: "signature_01",
      selectedSlotKey: "PT01",
      slotVersions: {},
      activeRunId: "run_01",
      createdAt: "2026-07-20T01:00:00.000Z",
      updatedAt: "2026-07-20T02:00:00.000Z",
    };
    const run: ProductionRun = {
      id: "run_01",
      projectId: "project_01",
      sessionId: "session_01",
      platformId: "amazon",
      workflowId: "amazon-listing",
      source: "demo",
      status: "planned",
      contextSnapshot: {
        sourceInput: session.sourceInput,
        options: session.options,
        selectedReferenceAssetIds: ["asset_01"],
      },
      planSnapshot: plan,
      events: [
        {
          id: "event_01",
          runId: "run_01",
          kind: "plan",
          status: "success",
          createdAt: "2026-07-20T02:00:00.000Z",
        },
      ],
      createdAt: "2026-07-20T02:00:00.000Z",
      updatedAt: "2026-07-20T02:00:00.000Z",
    };

    const first = createLocalStorageWorkspaceRepository({ storage });
    const document = await first.load("project_01");
    await first.save({ ...document, sessions: [session], runs: [run] });

    session.sourceInput.listingText = "mutated outside";
    run.events[0].status = "failed";

    const restored = await createLocalStorageWorkspaceRepository({ storage }).load("project_01");
    expect(restored.sessions).toHaveLength(1);
    expect(restored.sessions[0]).toMatchObject({
      id: "session_01",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: 旅行颈枕\nBullet: 慢回弹" },
      selectedReferenceAssetIds: ["asset_01"],
      activeRunId: "run_01",
    });
    expect(restored.runs).toHaveLength(1);
    expect(restored.runs[0]).toMatchObject({
      id: "run_01",
      sessionId: "session_01",
      status: "planned",
      events: [{ id: "event_01", status: "success" }],
    });
  });

  it("isolates v1 IndexedDB assets and restores assets written to the v2 database", async () => {
    const legacy = createIndexedDbAssetRepository({
      indexedDB,
      databaseName: "ecom-workbench-assets",
      createId: () => "legacy_asset",
    });
    await legacy.put({
      projectId: "project_01",
      blob: new Blob(["legacy"], { type: "image/png" }),
      metadata: { name: "legacy.png", kind: "reference" },
    });

    expect(DEFAULT_ASSET_DATABASE_NAME).toBe("ecom-workbench-assets-v2");
    const v2 = createIndexedDbAssetRepository({
      indexedDB,
      createId: () => "asset_01",
    });
    await expect(v2.list("project_01")).resolves.toEqual([]);

    await v2.put({
      projectId: "project_01",
      blob: new Blob(["v2"], { type: "image/webp" }),
      metadata: { name: "front.webp", kind: "reference" },
    });
    const restored = createIndexedDbAssetRepository({ indexedDB });
    await expect(restored.list("project_01")).resolves.toEqual([
      expect.objectContaining({ id: "asset_01", name: "front.webp" }),
    ]);
  });

  it("restores active session/run state and deletes only the selected project's v2 business data", async () => {
    const projectIds = ["project_01", "project_02"];
    const projectRepository = createMemoryProjectRepository({
      createId: () => projectIds.shift()!,
      now: () => "2026-07-20T01:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => "asset_02",
      now: () => "2026-07-20T01:00:00.000Z",
    });
    const workspaceRepository = createMemoryWorkspaceRepository();
    const settingsRepository = createMemorySettingsRepository();
    const facts = {
      productName: "旅行颈枕",
      category: "旅行用品",
      brand: "Northwind",
      model: "P01",
      sku: "P01-GRAY",
      targetAudience: "长途出行人群",
      description: "可折叠记忆棉颈枕",
      sellingPoints: ["慢回弹"],
      forbiddenClaims: [],
      specifications: { material: "memory foam" },
    };
    const firstProject = await projectRepository.create({ name: "保留商品", facts });
    const removedProject = await projectRepository.create({ name: "待删除商品", facts });
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing" },
    );
    const session: PlatformSession = {
      id: "session_02",
      projectId: removedProject.id,
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: 旅行颈枕" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: ["asset_02"],
      plan,
      slotVersions: {},
      activeRunId: "run_02",
      createdAt: "2026-07-20T01:00:00.000Z",
      updatedAt: "2026-07-20T01:00:00.000Z",
    };
    const run: ProductionRun = {
      id: "run_02",
      projectId: removedProject.id,
      sessionId: session.id,
      platformId: "amazon",
      workflowId: "amazon-listing",
      source: "demo",
      status: "planned",
      contextSnapshot: {
        sourceInput: session.sourceInput,
        options: session.options,
        selectedReferenceAssetIds: ["asset_02"],
      },
      planSnapshot: plan,
      events: [],
      createdAt: "2026-07-20T01:00:00.000Z",
      updatedAt: "2026-07-20T01:00:00.000Z",
    };
    const removedWorkspace = await workspaceRepository.load(removedProject.id);
    await workspaceRepository.save({
      ...removedWorkspace,
      sessions: [session],
      runs: [run],
    });
    const firstWorkspace = await workspaceRepository.load(firstProject.id);
    await workspaceRepository.save({
      ...firstWorkspace,
      sessions: [{ ...session, id: "session_01", projectId: firstProject.id, activeRunId: undefined }],
    });
    await assetRepository.put({
      projectId: removedProject.id,
      blob: new Blob(["asset"], { type: "image/png" }),
      metadata: { name: "front.png", kind: "reference" },
    });
    await settingsRepository.save(normalizeRuntimeSettings({
      mode: "api",
      apiKey: "sk-preserved",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "planner-model",
      imageBaseUrl: "https://provider.example/v1",
      imageModel: "image-model",
    }));

    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      workspaceRepository,
      settingsRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });
    await store.getState().initialize();

    expect(store.getState().sessions.map((item) => item.id)).toEqual(["session_02"]);
    expect(store.getState().runs.map((item) => item.id)).toEqual(["run_02"]);
    expect(await store.getState().removeProject(removedProject.id)).toBe(true);
    expect(store.getState().activeProject?.id).toBe(firstProject.id);
    expect(store.getState().sessions.map((item) => item.id)).toEqual(["session_01"]);
    expect(store.getState().runs).toEqual([]);
    expect(await assetRepository.list(removedProject.id)).toEqual([]);
    expect((await workspaceRepository.load(removedProject.id)).sessions).toEqual([]);
    expect(await settingsRepository.load()).toMatchObject({
      mode: "api",
      apiKey: "sk-preserved",
    });
  });
});
