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
  it("removes target Runs, V3 and legacy V2 documents without touching another project", async () => {
    const legacyRepository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const runRepository = createMemoryRunRepository();
    const { session, run } = await fixture();
    const unrelatedSession = { ...session, id: "session_02", projectId: "project_02" };
    const unrelatedRun = {
      ...run,
      id: "run_02",
      projectId: "project_02",
      sessionId: unrelatedSession.id,
    };
    const legacy = await legacyRepository.load("project_01");
    await legacyRepository.save({ ...legacy, sessions: [session], runs: [run] });
    const unrelatedLegacy = await legacyRepository.load("project_02");
    await legacyRepository.save({
      ...unrelatedLegacy,
      sessions: [unrelatedSession],
      runs: [unrelatedRun],
    });
    const v3 = await v3Repository.load("project_01");
    await v3Repository.save({ ...v3, currentSessions: [session] });
    const unrelatedV3 = await v3Repository.load("project_02");
    await v3Repository.save({ ...unrelatedV3, currentSessions: [unrelatedSession] });
    await runRepository.put(run);
    await runRepository.put(unrelatedRun);
    const persistence = createV3WorkspacePersistence({
      legacyRepository,
      v3Repository,
      runRepository,
    });

    await persistence.remove!("project_01");

    await expect(runRepository.get(run.id)).resolves.toBeNull();
    await expect(v3Repository.load("project_01")).resolves.toMatchObject({ currentSessions: [] });
    await expect(legacyRepository.load("project_01")).resolves.toMatchObject({ sessions: [], runs: [] });
    await expect(runRepository.get(unrelatedRun.id)).resolves.toMatchObject({ id: unrelatedRun.id });
    await expect(v3Repository.load("project_02")).resolves.toMatchObject({
      currentSessions: [{ id: unrelatedSession.id }],
    });
    await expect(legacyRepository.load("project_02")).resolves.toMatchObject({
      sessions: [{ id: unrelatedSession.id }],
      runs: [{ id: unrelatedRun.id }],
    });
  });

  it("can retry an interrupted layered deletion and remains idempotent", async () => {
    const baseLegacyRepository = createMemoryWorkspaceRepository();
    const v3Repository = createMemoryWorkspaceV3Repository();
    const runRepository = createMemoryRunRepository();
    const { session, run } = await fixture();
    const legacy = await baseLegacyRepository.load("project_01");
    await baseLegacyRepository.save({ ...legacy, sessions: [session], runs: [run] });
    const v3 = await v3Repository.load("project_01");
    await v3Repository.save({ ...v3, currentSessions: [session] });
    await runRepository.put(run);
    let failLegacyRemoval = true;
    const legacyRepository = {
      ...baseLegacyRepository,
      async remove(projectId: string) {
        if (failLegacyRemoval) {
          failLegacyRemoval = false;
          throw new Error("legacy storage unavailable");
        }
        await baseLegacyRepository.remove!(projectId);
      },
    };
    const persistence = createV3WorkspacePersistence({
      legacyRepository,
      v3Repository,
      runRepository,
    });

    await expect(persistence.remove!("project_01")).rejects.toThrow("legacy storage unavailable");
    await expect(runRepository.get(run.id)).resolves.toBeNull();
    await expect(v3Repository.load("project_01")).resolves.toMatchObject({ currentSessions: [] });
    await expect(baseLegacyRepository.load("project_01")).resolves.toMatchObject({
      sessions: [{ id: session.id }],
    });

    await expect(persistence.remove!("project_01")).resolves.toBeUndefined();
    await expect(persistence.remove!("project_01")).resolves.toBeUndefined();
    await expect(baseLegacyRepository.load("project_01")).resolves.toMatchObject({ sessions: [], runs: [] });
  });

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
