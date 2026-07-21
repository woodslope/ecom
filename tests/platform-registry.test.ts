import { describe, expect, it } from "vitest";

import {
  getPlatformWorkflow,
  normalizePlatformWorkflowId,
  platformWorkflows,
} from "../src/domain/platforms/registry";
import { createMemoryRunRepository } from "../src/domain/runs/repository";
import { createHistoryQueryService } from "../src/domain/history/query";
import type { ProductionRun } from "../src/domain/workspace/project-workspace";
import type { ProductProject } from "../src/domain/projects/types";

function run(id: string, workflowId: ProductionRun["workflowId"]): ProductionRun {
  const platformId = workflowId.startsWith("amazon") ? "amazon" : "taobao";
  return {
    id,
    projectId: "project_01",
    sessionId: "session_01",
    platformId,
    workflowId,
    source: "demo",
    status: "planned",
    contextSnapshot: {
      sourceInput: { listingText: "" },
      options: platformId === "amazon"
        ? { platformId: "amazon", marketplaceId: "us", plannerMode: "listing", sizeTier: "2K" }
        : { platformId: "taobao" },
      selectedReferenceAssetIds: [],
    },
    planSnapshot: {
      platformId,
      source: "demo",
      slots: [{ slotKey: platformId === "taobao" ? "TB-HERO-01" : "MAIN", visibleCopy: "", strategy: "s", evidence: [], prompt: "p", negativePrompt: "n" }],
    },
    events: [],
    createdAt: "2026-07-21T01:00:00.000Z",
    updatedAt: id === "run_old" ? "2026-07-21T02:00:00.000Z" : "2026-07-21T03:00:00.000Z",
  };
}

const project: ProductProject = {
  id: "project_01",
  name: "Travel Pillow",
  facts: {
    productName: "Travel Pillow", category: "Travel", brand: "", model: "", sku: "TP-01",
    targetAudience: "", description: "", sellingPoints: [], forbiddenClaims: [], specifications: {},
  },
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

describe("platform workflow registry and unified history", () => {
  it("registers the three supported workflows and maps legacy Taobao reads", () => {
    expect(platformWorkflows.map((workflow) => workflow.id)).toEqual([
      "amazon-listing",
      "amazon-aplus",
      "taobao-product",
    ]);
    expect(normalizePlatformWorkflowId("taobao-detail")).toBe("taobao-product");
    expect(getPlatformWorkflow("taobao-product")).toMatchObject({
      platformId: "taobao",
      label: "淘宝商品生产包",
    });
  });

  it("queries paged runs through the unified history service", async () => {
    const repository = createMemoryRunRepository();
    await repository.put(run("run_old", "taobao-detail"));
    await repository.put(run("run_new", "taobao-product"));
    let prepareCalls = 0;
    const service = createHistoryQueryService({
      runRepository: repository,
      getProject: async (projectId) => projectId === project.id ? project : null,
      prepare: async () => { prepareCalls += 1; },
    });

    const result = await service.query({ workflowId: "taobao-product", search: "TP-01" }, undefined, 1);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.run.workflowId).toBe("taobao-product");
    expect(result.items[0]?.project.id).toBe("project_01");
    const next = await service.query({ workflowId: "taobao-product", search: "TP-01" }, result.nextCursor, 1);
    expect(next.items[0]?.run.id).toBe("run_old");
    expect(next.items[0]?.run.workflowId).toBe("taobao-product");
    expect(next.nextCursor).toBeUndefined();
    expect(prepareCalls).toBe(1);
  });
});
