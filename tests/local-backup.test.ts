import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createLocalBackup,
  parseLocalBackup,
  restoreLocalBackup,
} from "../src/application/local-backup";
import {
  createIndexedDbAssetRepository,
} from "../src/domain/assets/repository";
import { createExecutionJob } from "../src/domain/jobs/state";
import { createIndexedDbExecutionJobRepository } from "../src/domain/jobs/repository";
import { DEFAULT_PROJECT_STORAGE_KEY } from "../src/domain/projects/repository";
import { CUSTOM_PROMPT_PROFILES_STORAGE_KEY } from "../src/domain/prompt-profiles/prompt-profiles";
import { SLOT_PROMPT_ASSETS_STORAGE_KEY } from "../src/domain/prompt-profiles/slot-prompt-assets";
import { INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY } from "../src/domain/prompt-templates/industry-template-packs";
import { createIndexedDbRunRepository } from "../src/domain/runs/repository";
import { RUNTIME_SETTINGS_STORAGE_KEY } from "../src/domain/settings/runtime-settings";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";
import { PROJECT_WORKSPACE_STORAGE_PREFIX } from "../src/domain/workspace/project-workspace";
import { LAST_PLATFORM_STORAGE_KEY } from "../src/domain/workspace/preferences";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createRun(): ProductionRun {
  return {
    id: "run_01",
    projectId: "project_01",
    sessionId: "session_01",
    platformId: "amazon",
    workflowId: "amazon-listing",
    source: "demo",
    status: "planned",
    contextSnapshot: {
      sourceInput: { listingText: "Title: Travel Pillow" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: ["asset_01"],
    },
    planSnapshot: { platformId: "amazon", source: "demo", slots: [] },
    events: [],
    createdAt: "2026-07-28T08:00:00.000Z",
    updatedAt: "2026-07-28T08:00:00.000Z",
  };
}

describe("local backup", () => {
  it("round-trips business data and Blob assets without exporting runtime settings", async () => {
    const indexedDB = new IDBFactory();
    const storage = new MemoryStorage();
    const projectState = JSON.stringify({
      version: 2,
      projects: [{ id: "project_01", name: "旅行枕" }],
      activeProjectId: "project_01",
    });
    const workspaceKey = `${PROJECT_WORKSPACE_STORAGE_PREFIX}project_01`;
    const promptProfiles = JSON.stringify([{ id: "profile_01", label: "旅行用品" }]);
    const slotPromptAssets = JSON.stringify({ assets: [], defaults: {} });
    const industryTemplatePacks = JSON.stringify({ packs: [], defaults: {} });
    storage.setItem(DEFAULT_PROJECT_STORAGE_KEY, projectState);
    storage.setItem(workspaceKey, JSON.stringify({ sessions: [{ id: "session_01" }] }));
    storage.setItem(LAST_PLATFORM_STORAGE_KEY, "amazon");
    storage.setItem(CUSTOM_PROMPT_PROFILES_STORAGE_KEY, promptProfiles);
    storage.setItem(SLOT_PROMPT_ASSETS_STORAGE_KEY, slotPromptAssets);
    storage.setItem(INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY, industryTemplatePacks);
    storage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: "sk-secret" }));

    const assets = createIndexedDbAssetRepository({
      indexedDB,
      createId: () => "asset_01",
      now: () => "2026-07-28T08:00:00.000Z",
    });
    const originalBytes = new Uint8Array([0, 17, 128, 255]);
    await assets.put({
      projectId: "project_01",
      blob: new Blob([originalBytes], { type: "image/png" }),
      metadata: { name: "front.png", kind: "reference", tags: ["front"] },
    });

    const runs = createIndexedDbRunRepository({ indexedDB });
    await runs.put(createRun());
    const jobs = createIndexedDbExecutionJobRepository({ indexedDB });
    await jobs.put(createExecutionJob({
      id: "job_01",
      kind: "batch-generate",
      targets: [{
        id: "item_01",
        projectId: "project_01",
        sessionId: "session_01",
        platformId: "amazon",
        workflowId: "amazon-listing",
        slotKey: "MAIN",
      }],
      now: "2026-07-28T08:00:00.000Z",
    }));

    const environment = { storage, indexedDB, now: () => "2026-07-28T09:00:00.000Z" };
    const backup = await createLocalBackup(environment);
    expect(backup.storage).toEqual({
      [DEFAULT_PROJECT_STORAGE_KEY]: projectState,
      [workspaceKey]: JSON.stringify({ sessions: [{ id: "session_01" }] }),
      [LAST_PLATFORM_STORAGE_KEY]: "amazon",
      [CUSTOM_PROMPT_PROFILES_STORAGE_KEY]: promptProfiles,
      [SLOT_PROMPT_ASSETS_STORAGE_KEY]: slotPromptAssets,
      [INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY]: industryTemplatePacks,
    });
    expect(backup.indexedDb.assets).toHaveLength(1);
    expect(backup.indexedDb.runs).toHaveLength(1);
    expect(backup.indexedDb.jobs).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain("sk-secret");
    expect(backup.storage).not.toHaveProperty(RUNTIME_SETTINGS_STORAGE_KEY);

    storage.setItem(DEFAULT_PROJECT_STORAGE_KEY, JSON.stringify({ version: 2, projects: [] }));
    storage.setItem(CUSTOM_PROMPT_PROFILES_STORAGE_KEY, "[]");
    storage.setItem(SLOT_PROMPT_ASSETS_STORAGE_KEY, JSON.stringify({ assets: [{ id: "other" }] }));
    storage.setItem(INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY, JSON.stringify({ packs: [{ id: "other" }] }));
    storage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: "sk-current" }));
    await assets.remove("asset_01");
    await runs.remove("run_01");
    await jobs.remove("job_01");

    const summary = await restoreLocalBackup(parseLocalBackup(JSON.stringify(backup)), environment);
    expect(summary).toEqual({ projectCount: 1, assetCount: 1, runCount: 1, jobCount: 1 });
    expect(storage.getItem(DEFAULT_PROJECT_STORAGE_KEY)).toBe(projectState);
    expect(storage.getItem(CUSTOM_PROMPT_PROFILES_STORAGE_KEY)).toBe(promptProfiles);
    expect(storage.getItem(SLOT_PROMPT_ASSETS_STORAGE_KEY)).toBe(slotPromptAssets);
    expect(storage.getItem(INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY)).toBe(industryTemplatePacks);
    expect(storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY)).toBe(JSON.stringify({ apiKey: "sk-current" }));
    const restoredAsset = await assets.get("asset_01");
    expect(restoredAsset?.metadata.name).toBe("front.png");
    expect(restoredAsset?.blob.type).toBe("image/png");
    expect(new Uint8Array(await restoredAsset!.blob.arrayBuffer())).toEqual(originalBytes);
    await expect(runs.get("run_01")).resolves.toMatchObject({ id: "run_01" });
    await expect(jobs.get("job_01")).resolves.toMatchObject({ id: "job_01" });
  });

  it("rejects unknown storage keys and invalid JSON business data", () => {
    const base = {
      format: "ecom-local-backup",
      version: 1,
      exportedAt: "2026-07-28T09:00:00.000Z",
      storage: {},
      indexedDb: { assets: [], runs: [], jobs: [] },
    };

    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      storage: { "unrelated.secret": "value" },
    }))).toThrow("不允许的本地设置");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      storage: { [DEFAULT_PROJECT_STORAGE_KEY]: "not-json" },
    }))).toThrow("业务数据无效");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      storage: { [`${PROJECT_WORKSPACE_STORAGE_PREFIX}project_01`]: "not-json" },
    }))).toThrow("业务数据无效");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      storage: { [LAST_PLATFORM_STORAGE_KEY]: "amazon" },
    }))).not.toThrow();
  });

  it("validates nested asset, Run, event and job records while keeping V1 optional fields compatible", () => {
    const run = createRun();
    const job = createExecutionJob({
      id: "job_01",
      kind: "batch-generate",
      targets: [{
        id: "item_01",
        projectId: "project_01",
        sessionId: "session_01",
        platformId: "amazon",
        workflowId: "amazon-listing",
        slotKey: "MAIN",
      }],
      now: "2026-07-28T09:00:00.000Z",
    });
    const asset = {
      id: "asset_01",
      projectId: "project_01",
      metadata: {
        id: "asset_01",
        projectId: "project_01",
        name: "front.png",
        kind: "reference",
        tags: ["front"],
        mimeType: "image/png",
        size: 1,
        createdAt: "2026-07-28T08:00:00.000Z",
        updatedAt: "2026-07-28T08:00:00.000Z",
      },
      dataUrl: "data:image/png;base64,AA==",
    };
    const base = {
      format: "ecom-local-backup",
      version: 1,
      exportedAt: "2026-07-28T09:00:00.000Z",
      storage: {},
      indexedDb: { assets: [asset], runs: [run], jobs: [job] },
    };

    expect(() => parseLocalBackup(JSON.stringify(base))).not.toThrow();
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      indexedDb: {
        ...base.indexedDb,
        runs: [{
          ...run,
          contextSnapshot: {
            ...run.contextSnapshot,
            planningInput: {
              sourceMode: "manual",
              quality: "facts-only",
              missingFacts: ["商品参考图"],
              productText: "Title: Travel Pillow",
              selectedReferenceAssetIds: [],
            },
          },
        }],
      },
    }))).not.toThrow();
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      indexedDb: {
        ...base.indexedDb,
        assets: [{ ...asset, metadata: { ...asset.metadata, tags: "front" } }],
      },
    }))).toThrow("素材元数据无效");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      indexedDb: {
        ...base.indexedDb,
        runs: [{
          ...run,
          contextSnapshot: { ...run.contextSnapshot, selectedReferenceAssetIds: "asset_01" },
        }],
      },
    }))).toThrow("生产记录上下文无效");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      indexedDb: {
        ...base.indexedDb,
        runs: [{
          ...run,
          events: [{
            id: "event_01",
            runId: "another_run",
            kind: "generate",
            status: "success",
            createdAt: run.updatedAt,
          }],
        }],
      },
    }))).toThrow("生产事件无效");
    expect(() => parseLocalBackup(JSON.stringify({
      ...base,
      indexedDb: {
        ...base.indexedDb,
        jobs: [{
          ...job,
          items: [{ ...job.items[0], target: { ...job.items[0]!.target, slotKey: 42 } }],
        }],
      },
    }))).toThrow("本地任务项无效");
  });

  it("rejects invalid nested records before clearing current business data", async () => {
    const indexedDB = new IDBFactory();
    const storage = new MemoryStorage();
    const currentProjects = JSON.stringify({
      version: 2,
      projects: [{ id: "current_project", name: "当前商品" }],
      activeProjectId: "current_project",
    });
    storage.setItem(DEFAULT_PROJECT_STORAGE_KEY, currentProjects);
    const run = createRun();
    const invalidBackup = {
      format: "ecom-local-backup",
      version: 1,
      exportedAt: "2026-07-28T09:00:00.000Z",
      storage: {},
      indexedDb: {
        assets: [],
        runs: [{
          ...run,
          planSnapshot: {
            ...run.planSnapshot,
            slots: [{ slotKey: "MAIN", prompt: "missing required fields" }],
          },
        }],
        jobs: [],
      },
    } as unknown as Parameters<typeof restoreLocalBackup>[0];

    await expect(restoreLocalBackup(invalidBackup, { storage, indexedDB }))
      .rejects.toThrow("生产记录无效");
    expect(storage.getItem(DEFAULT_PROJECT_STORAGE_KEY)).toBe(currentProjects);
  });
});
