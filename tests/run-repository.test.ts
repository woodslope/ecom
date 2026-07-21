import { describe, expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";

import {
  createIndexedDbRunRepository,
  type RunRepository,
} from "../src/domain/runs/repository";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";

function createRun(id: string, updatedAt: string): ProductionRun {
  return {
    id,
    projectId: "project_01",
    sessionId: "deleted_session",
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
      selectedReferenceAssetIds: [],
    },
    planSnapshot: {
      platformId: "amazon",
      source: "demo",
      slots: [
        {
          slotKey: "MAIN",
          visibleCopy: "",
          strategy: "Hero",
          evidence: ["Product facts"],
          prompt: "Studio hero image",
          negativePrompt: "text",
        },
      ],
    },
    events: [],
    createdAt: "2026-07-21T01:00:00.000Z",
    updatedAt,
  };
}

async function seed(repository: RunRepository): Promise<void> {
  for (let index = 0; index < 55; index += 1) {
    await repository.put(
      createRun(
        `run_${String(index).padStart(2, "0")}`,
        index < 3
          ? "2026-07-21T03:00:00.000Z"
          : `2026-07-21T02:${String(index).padStart(2, "0")}:00.000Z`,
      ),
    );
  }
}

describe("ProductionRunRepository", () => {
  it("paginates newest first with a stable updatedAt and id cursor", async () => {
    const repository = createIndexedDbRunRepository({
      indexedDB,
      databaseName: "run-repository-pagination-test",
    });
    await seed(repository);

    const firstPage = await repository.query({ projectId: "project_01" });
    const secondPage = await repository.query(
      { projectId: "project_01" },
      firstPage.nextCursor,
    );

    expect(firstPage.items).toHaveLength(50);
    expect(secondPage.items).toHaveLength(5);
    expect(firstPage.items.slice(0, 3).map((run) => run.id)).toEqual([
      "run_02",
      "run_01",
      "run_00",
    ]);
    expect(new Set([...firstPage.items, ...secondPage.items].map((run) => run.id)).size).toBe(55);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("gets, filters, removes and clears only one project's runs", async () => {
    const repository = createIndexedDbRunRepository({
      indexedDB,
      databaseName: "run-repository-crud-test",
    });
    const amazon = createRun("run_amazon", "2026-07-21T02:00:00.000Z");
    const taobao: ProductionRun = {
      ...createRun("run_taobao", "2026-07-21T03:00:00.000Z"),
      projectId: "project_02",
      platformId: "taobao",
      workflowId: "taobao-detail",
      contextSnapshot: {
        sourceInput: { listingText: "" },
        options: { platformId: "taobao" },
        selectedReferenceAssetIds: [],
      },
      planSnapshot: {
        platformId: "taobao",
        source: "demo",
        slots: [],
      },
    };
    await repository.put(amazon);
    await repository.put(taobao);

    await expect(repository.get("run_amazon")).resolves.toMatchObject({
      id: "run_amazon",
      projectId: "project_01",
    });
    await expect(repository.query({ platformId: "taobao" })).resolves.toMatchObject({
      items: [{ id: "run_taobao", projectId: "project_02" }],
    });

    await repository.removeProject("project_01");
    await expect(repository.get("run_amazon")).resolves.toBeNull();
    await expect(repository.get("run_taobao")).resolves.toMatchObject({ id: "run_taobao" });
    await repository.remove("run_taobao");
    await expect(repository.query()).resolves.toEqual({ items: [] });
  });
});
