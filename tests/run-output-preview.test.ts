import { describe, expect, it } from "vitest";

import { selectRunOutputPreviews } from "../src/domain/history/run-output-preview";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";

function buildRun(): ProductionRun {
  return {
    id: "run_preview",
    projectId: "project_preview",
    sessionId: "session_preview",
    platformId: "amazon",
    workflowId: "amazon-listing",
    source: "api",
    status: "ready",
    contextSnapshot: {
      sourceInput: { listingText: "" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        sizeTier: "2K",
        stylePresetId: "clean-retail",
      },
      selectedReferenceAssetIds: [],
    },
    planSnapshot: {
      platformId: "amazon",
      source: "api",
      slots: ["MAIN", "PT01", "PT02"].map((slotKey) => ({
        slotKey,
        visibleCopy: "",
        strategy: slotKey,
        evidence: [],
        prompt: "prompt",
        negativePrompt: "negative",
      })),
    },
    events: [
      { id: "event_pt01_old", runId: "run_preview", kind: "generate", status: "success", slotKey: "PT01", assetId: "asset_pt01_old", versionId: "v1", createdAt: "2026-08-09T10:00:00.000Z" },
      { id: "event_main", runId: "run_preview", kind: "generate", status: "success", slotKey: "MAIN", assetId: "asset_main", versionId: "v1", createdAt: "2026-08-09T10:01:00.000Z" },
      { id: "event_pt02_failed", runId: "run_preview", kind: "generate", status: "failed", slotKey: "PT02", createdAt: "2026-08-09T10:02:00.000Z" },
      { id: "event_pt01_new", runId: "run_preview", kind: "regenerate", status: "success", slotKey: "PT01", assetId: "asset_pt01_new", versionId: "v2", createdAt: "2026-08-09T10:03:00.000Z" },
    ],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:03:00.000Z",
  };
}

describe("run output previews", () => {
  it("keeps the latest successful result per slot in plan order", () => {
    expect(selectRunOutputPreviews(buildRun()).map((event) => [event.slotKey, event.assetId])).toEqual([
      ["MAIN", "asset_main"],
      ["PT01", "asset_pt01_new"],
    ]);
  });

  it("limits preview loading without changing selection order", () => {
    expect(selectRunOutputPreviews(buildRun(), 1).map((event) => event.slotKey)).toEqual(["MAIN"]);
  });
});
