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
      source: "demo",
      promptSnapshot: "First prompt",
      visibleCopySnapshot: "First copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "demo-svg-v1" },
    },
    {
      id: "version_02",
      slotKey: "PT01",
      assetId: "asset_02",
      createdAt: "2026-07-17T09:00:00.000Z",
      source: "demo",
      promptSnapshot: "Second prompt",
      visibleCopySnapshot: "Second copy",
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: { engine: "demo-svg-v1", attempt: 2 },
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
      taskHistory: [],
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
    expect(again.slotVersions.amazon.PT01.versions[0].parameters.engine).toBe("demo-svg-v1");
  });

  it("drops malformed versions while keeping a valid sibling and repairs the active id", async () => {
    const values = new Map<string, string>();
    values.set(
      "ecom-workbench.workspace.v2.project_01",
      JSON.stringify({
        projectId: "project_01",
        sessions: [],
        runs: [],
        plans: {},
        selectedSlotKeys: {},
        slotVersions: {
          amazon: {
            PT01: {
              activeVersionId: "missing",
              versions: [
                versionState.versions[0],
                { id: "bad", slotKey: "PT01", assetId: null },
              ],
            },
            UNKNOWN: versionState,
          },
        },
        updatedAt: "2026-07-17T09:00:00.000Z",
      }),
    );
    const repository = createLocalStorageWorkspaceRepository({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    });

    const restored = (await repository.load("project_01")) as VersionedWorkspaceDocument;
    expect(restored.slotVersions.amazon.PT01.versions.map((version) => version.id)).toEqual([
      "version_01",
    ]);
    expect(restored.slotVersions.amazon.PT01.activeVersionId).toBe("version_01");
    expect(restored.slotVersions.amazon.UNKNOWN).toBeUndefined();
  });
});
