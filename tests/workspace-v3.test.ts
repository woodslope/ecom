import { describe, expect, it } from "vitest";

import {
  createLocalStorageWorkspaceV3Repository,
  createMemoryWorkspaceV3Repository,
} from "../src/domain/workspace/workspace-v3";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("workspace v3", () => {
  it("stores only current sessions under the API workspace key", async () => {
    const repository = createMemoryWorkspaceV3Repository({
      now: () => "2026-07-21T01:00:00.000Z",
    });

    const document = await repository.load("project_01");

    expect(document).toEqual({
      version: 3,
      projectId: "project_01",
      currentSessions: [],
      updatedAt: "2026-07-21T01:00:00.000Z",
    });
    expect(document).not.toHaveProperty("runs");
    expect(document).not.toHaveProperty("taskHistory");
    expect(document).not.toHaveProperty("plans");
    expect(document).not.toHaveProperty("slotVersions");
    expect(document).not.toHaveProperty("amazonWorkspaces");
  });

  it("restores a V3 document from its own storage key", async () => {
    const storage = createStorage();
    const repository = createLocalStorageWorkspaceV3Repository({ storage });
    const document = await repository.load("project_01");

    await repository.save(document);

    await expect(createLocalStorageWorkspaceV3Repository({ storage }).load("project_01"))
      .resolves.toMatchObject({
        version: 3,
        projectId: "project_01",
        currentSessions: [],
      });
    expect(JSON.parse(storage.getItem("ecom-workbench.workspace.api.v1.project_01")!))
      .not.toHaveProperty("runs");
  });
});
