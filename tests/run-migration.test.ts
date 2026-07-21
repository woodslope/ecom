import { describe, expect, it } from "vitest";

import { createMemoryRunRepository } from "../src/domain/runs/repository";
import { migrateWorkspaceV2ToV3 } from "../src/domain/runs/migration";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import {
  createMemoryWorkspaceRepository,
  type PlatformSession,
  type ProductionRun,
} from "../src/domain/workspace/project-workspace";
import { createMemoryWorkspaceV3Repository } from "../src/domain/workspace/workspace-v3";
import { demoPlanner } from "../src/services/demo-planner";

async function fixture(): Promise<{ session: PlatformSession; run: ProductionRun }> {
  const plan = await demoPlanner.plan(
    {
      productName: "Travel Pillow",
      description: "Memory foam travel pillow",
      sellingPoints: ["Packable"],
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
    sourceInput: { listingText: "Title: Travel Pillow" },
    options: {
      platformId: "amazon",
      marketplaceId: "us",
      plannerMode: "listing",
      listingImageCount: 7,
      sizeTier: "2K",
    },
    selectedReferenceAssetIds: [],
    plan,
    slotVersions: {},
    activeRunId: "run_01",
    createdAt: "2026-07-20T01:00:00.000Z",
    updatedAt: "2026-07-20T02:00:00.000Z",
  };
  const run: ProductionRun = {
    id: "run_01",
    projectId: "project_01",
    sessionId: session.id,
    platformId: "amazon",
    workflowId: "amazon-listing",
    source: "demo",
    status: "planned",
    contextSnapshot: {
      sourceInput: session.sourceInput,
      options: session.options,
      selectedReferenceAssetIds: [],
    },
    planSnapshot: plan,
    events: [],
    createdAt: "2026-07-20T02:00:00.000Z",
    updatedAt: "2026-07-20T02:00:00.000Z",
  };
  return { session, run };
}

describe("workspace v2 to v3 migration", () => {
  it("is idempotent and keeps runs after the current session is removed", async () => {
    const v2Repository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const baseRunRepository = createMemoryRunRepository();
    let putCount = 0;
    const runRepository = {
      ...baseRunRepository,
      async put(run: ProductionRun) {
        putCount += 1;
        await baseRunRepository.put(run);
      },
    };
    const { session, run } = await fixture();
    const v2 = await v2Repository.load("project_01");
    await v2Repository.save({ ...v2, sessions: [session], runs: [run] });

    const first = await migrateWorkspaceV2ToV3({
      projectId: "project_01",
      v2Repository,
      v3Repository,
      runRepository,
      now: () => "2026-07-21T01:00:00.000Z",
    });
    await v3Repository.save({ ...first, currentSessions: [] });
    const second = await migrateWorkspaceV2ToV3({
      projectId: "project_01",
      v2Repository,
      v3Repository,
      runRepository,
      now: () => "2026-07-21T02:00:00.000Z",
    });

    expect(first).toMatchObject({
      version: 3,
      currentSessions: [{ id: "session_01", activeRunId: "run_01" }],
      migration: {
        sourceVersion: 2,
        status: "completed",
        completedAt: "2026-07-21T01:00:00.000Z",
      },
    });
    expect(second.currentSessions).toEqual([]);
    expect(second.migration.completedAt).toBe("2026-07-21T01:00:00.000Z");
    expect(putCount).toBe(1);
    await expect(baseRunRepository.get("run_01")).resolves.toMatchObject({
      id: "run_01",
      sessionId: "session_01",
    });
    await expect(v2Repository.load("project_01")).resolves.toMatchObject({
      sessions: [{ id: "session_01" }],
      runs: [{ id: "run_01" }],
    });
  });

  it("leaves migration pending when a run cannot be written", async () => {
    const v2Repository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const { session, run } = await fixture();
    const v2 = await v2Repository.load("project_01");
    await v2Repository.save({ ...v2, sessions: [session], runs: [run] });
    const runRepository = createMemoryRunRepository();
    const failingRunRepository = {
      ...runRepository,
      async put() {
        throw new Error("disk full");
      },
    };

    await expect(migrateWorkspaceV2ToV3({
      projectId: "project_01",
      v2Repository,
      v3Repository,
      runRepository: failingRunRepository,
    })).rejects.toThrow("disk full");
    await expect(v3Repository.load("project_01")).resolves.toMatchObject({
      migration: { status: "pending" },
    });
  });

  it("migrates a run even when its old current session is already gone", async () => {
    const v2Repository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const runRepository = createMemoryRunRepository();
    const { run } = await fixture();
    const v2 = await v2Repository.load("project_01");
    await v2Repository.save({ ...v2, sessions: [], runs: [run] });

    await migrateWorkspaceV2ToV3({
      projectId: "project_01",
      v2Repository,
      v3Repository,
      runRepository,
    });

    await expect(runRepository.get("run_01")).resolves.toMatchObject({
      id: "run_01",
      sessionId: "session_01",
    });
  });
});
