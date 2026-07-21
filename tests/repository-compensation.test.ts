import { describe, expect, it } from "vitest";

import { createV3WorkspacePersistence } from "../src/application/workspace-persistence";
import { createMemoryRunRepository } from "../src/domain/runs/repository";
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
    selectedSlotKey: "MAIN",
    slotVersions: {},
    activeRunId: "run_01",
    createdAt: "2026-07-20T01:00:00.000Z",
    updatedAt: "2026-07-20T02:00:00.000Z",
  };
  return {
    session,
    run: {
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
    },
  };
}

describe("application workspace persistence", () => {
  it("removes a newly written run when the following V3 save fails", async () => {
    const legacyRepository = createMemoryWorkspaceRepository();
    const baseV3Repository = createMemoryWorkspaceV3Repository();
    const runRepository = createMemoryRunRepository();
    const { session, run } = await fixture();
    const legacy = await legacyRepository.load("project_01");
    await legacyRepository.save({ ...legacy, sessions: [session], runs: [run] });
    let failSave = false;
    const v3Repository = {
      ...baseV3Repository,
      async save(document: Parameters<typeof baseV3Repository.save>[0]) {
        if (failSave) throw new Error("workspace unavailable");
        await baseV3Repository.save(document);
      },
    };
    const persistence = createV3WorkspacePersistence({
      legacyRepository,
      v3Repository,
      runRepository,
    });
    const current = await persistence.load("project_01");
    const nextRun: ProductionRun = {
      ...run,
      id: "run_02",
      sessionId: "session_02",
      updatedAt: "2026-07-21T03:00:00.000Z",
    };
    failSave = true;

    await expect(persistence.save({
      ...current,
      sessions: [{ ...session, id: "session_02", activeRunId: "run_02" }],
      runs: [...current.runs, nextRun],
    })).rejects.toThrow("workspace unavailable");

    await expect(runRepository.get("run_02")).resolves.toBeNull();
    await expect(runRepository.get("run_01")).resolves.toMatchObject({ id: "run_01" });
    await expect(baseV3Repository.load("project_01")).resolves.toMatchObject({
      currentSessions: [{ id: "session_01", activeRunId: "run_01" }],
    });
  });

  it("persists updates to an existing run instead of restoring its old snapshot", async () => {
    const legacyRepository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const runRepository = createMemoryRunRepository();
    const { session, run } = await fixture();
    const legacy = await legacyRepository.load("project_01");
    await legacyRepository.save({ ...legacy, sessions: [session], runs: [run] });
    const persistence = createV3WorkspacePersistence({
      legacyRepository,
      v3Repository,
      runRepository,
    });
    const current = await persistence.load("project_01");
    const updatedRun: ProductionRun = {
      ...run,
      status: "producing",
      events: [{ id: "event_generate", runId: run.id, kind: "generate", status: "success", createdAt: "2026-07-21T04:00:00.000Z" }],
      updatedAt: "2026-07-21T04:00:00.000Z",
    };

    await persistence.save({ ...current, runs: [updatedRun], updatedAt: updatedRun.updatedAt });

    await expect(runRepository.get(run.id)).resolves.toMatchObject({
      status: "producing",
      events: [{ id: "event_generate" }],
    });
  });
});
