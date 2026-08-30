import { describe, expect, it } from "vitest";

import type { SlotVersionState } from "../src/domain/generation/types";
import {
  createLocalStorageWorkspaceRepository,
  createMemoryWorkspaceRepository,
  type ProjectWorkspaceDocument,
} from "../src/domain/workspace/project-workspace";

const versionState: SlotVersionState = {
  activeVersionId: "version_02",
  versions: [
    {
      id: "version_01",
      slotKey: "PT01",
      assetId: "asset_01",
      createdAt: "2026-07-17T08:00:00.000Z",
      source: "api",
      promptSnapshot: "First prompt",
      visibleCopySnapshot: "First copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "mock-svg-v1" },
    },
    {
      id: "version_02",
      slotKey: "PT01",
      assetId: "asset_02",
      createdAt: "2026-07-17T09:00:00.000Z",
      source: "api",
      promptSnapshot: "Second prompt",
      visibleCopySnapshot: "Second copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "mock-svg-v1", attempt: 2 },
    },
  ],
};

type VersionedWorkspaceDocument = ProjectWorkspaceDocument & {
  slotVersions: { amazon: { PT01: SlotVersionState } };
};

describe("workspace slot versions", () => {
  it("round-trips multiple versions and isolates later mutations", async () => {
    const repository = createMemoryWorkspaceRepository();
    const document: VersionedWorkspaceDocument = {
      projectId: "project_01",
      sessions: [],
      runs: [],
      plans: {},
      planInputSignatures: {},
      selectedSlotKeys: {},
      slotVersions: { amazon: { PT01: versionState } },
      updatedAt: "2026-07-17T09:00:00.000Z",
    };

    await repository.save(document);
    versionState.versions[1].promptSnapshot = "External mutation";

    const restored = (await repository.load("project_01")) as VersionedWorkspaceDocument;
    expect(restored.slotVersions.amazon.PT01.activeVersionId).toBe("version_02");
    expect(restored.slotVersions.amazon.PT01.versions).toHaveLength(2);
    expect(restored.slotVersions.amazon.PT01.versions[1].promptSnapshot).toBe("Second prompt");

    restored.slotVersions.amazon.PT01.versions[0].parameters.engine = "changed";
    const again = (await repository.load("project_01")) as VersionedWorkspaceDocument;
    expect(again.slotVersions.amazon.PT01.versions[0].parameters.engine).toBe("mock-svg-v1");
  });

});
