import { describe, expect, it } from "vitest";

import {
  activateVersion,
  appendRunEvent,
  commitVersion,
  commitPlan,
  forkRun,
  updateSlot,
  type PlanCommitInput,
} from "../src/application/production-mutations";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";

async function input(): Promise<PlanCommitInput> {
  const plan = await demoPlanner.plan(
    {
      productName: "Travel Pillow",
      description: "Memory foam pillow",
      sellingPoints: ["Packable"],
    },
    amazonRulePack,
    new AbortController().signal,
    [],
    { plannerMode: "listing" },
  );
  return {
    projectId: "project_01",
    platformId: "amazon",
    workflowId: "amazon-listing",
    source: "demo",
    sourceInput: { listingText: "Title: Travel Pillow" },
    options: {
      platformId: "amazon",
      marketplaceId: "us",
      plannerMode: "listing",
      listingImageCount: 7,
      sizeTier: "2K",
    },
    selectedReferenceAssetIds: ["asset_01"],
    plan,
    planInputSignature: "signature_01",
    selectedSlotKey: "MAIN",
    sessionId: "session_01",
    runId: "run_01",
    eventId: "event_01",
    now: "2026-07-21T03:00:00.000Z",
  };
}

describe("production application mutations", () => {
  it("builds independent session and run snapshots for a plan commit", async () => {
    const planned = commitPlan(await input());

    expect(planned.session).toMatchObject({
      id: "session_01",
      activeRunId: "run_01",
      planInputSignature: "signature_01",
    });
    expect(planned.run).toMatchObject({
      id: "run_01",
      sessionId: "session_01",
      status: "planned",
      events: [{ id: "event_01", kind: "plan", status: "success" }],
    });
    expect(planned.run.planSnapshot).not.toBe(planned.session.plan);
    planned.session.plan!.slots[0]!.prompt = "changed session prompt";
    expect(planned.run.planSnapshot.slots[0]!.prompt).not.toBe("changed session prompt");
  });

  it("appends an event without mutating the previous run", async () => {
    const planned = commitPlan(await input());
    const next = appendRunEvent(planned.run, {
      id: "event_02",
      runId: planned.run.id,
      kind: "generate",
      status: "success",
      slotKey: "MAIN",
      createdAt: "2026-07-21T04:00:00.000Z",
    });

    expect(planned.run.events).toHaveLength(1);
    expect(next.events).toHaveLength(2);
    expect(next.updatedAt).toBe("2026-07-21T04:00:00.000Z");
  });

  it("updates a slot and commits or activates immutable versions", async () => {
    const planned = commitPlan(await input());
    const edited = updateSlot(planned.session, "MAIN", {
      visibleCopy: "Verified copy",
      prompt: "Verified prompt",
    }, "2026-07-21T04:00:00.000Z");
    const firstVersion = {
      id: "version_01", slotKey: "MAIN", assetId: "asset_01",
      createdAt: "2026-07-21T05:00:00.000Z", source: "demo" as const,
      promptSnapshot: "Verified prompt", visibleCopySnapshot: "Verified copy",
      planningInputSignature: "signature_01",
      width: 2000, height: 2000, mimeType: "image/png", parameters: {},
    };
    const committed = commitVersion({
      session: edited,
      run: planned.run,
      version: firstVersion,
      eventId: "event_generate",
      now: "2026-07-21T05:00:00.000Z",
    });
    const activated = activateVersion(
      committed.session,
      committed.run,
      "MAIN",
      "version_01",
      "2026-07-21T06:00:00.000Z",
    );

    expect(planned.session.plan?.slots[0]?.prompt).not.toBe("Verified prompt");
    expect(committed.session.slotVersions.MAIN?.activeVersionId).toBe("version_01");
    expect(committed.run.status).toBe("producing");
    expect(committed.run.events.at(-1)).toMatchObject({ kind: "generate", versionId: "version_01" });
    expect(activated.run.slotVersionsSnapshot?.MAIN?.activeVersionId).toBe("version_01");
  });

  it("forks an independent session and planned run from a historical snapshot", async () => {
    const planned = commitPlan(await input());
    const forked = forkRun(planned.run, {
      sessionId: "session_fork",
      runId: "run_fork",
      eventId: "event_fork",
      planInputSignature: "signature_fork",
      now: "2026-07-21T07:00:00.000Z",
    });

    expect(forked.session).toMatchObject({ id: "session_fork", activeRunId: "run_fork", slotVersions: {} });
    expect(forked.run).toMatchObject({ id: "run_fork", sessionId: "session_fork", status: "planned" });
    forked.session.plan!.slots[0]!.prompt = "fork changed";
    expect(planned.run.planSnapshot.slots[0]!.prompt).not.toBe("fork changed");
  });
});
