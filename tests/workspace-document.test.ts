import { describe, expect, it } from "vitest";

import type { PlatformPlan } from "../src/domain/planning/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import {
  createLocalStorageWorkspaceRepository,
  createMemoryWorkspaceRepository,
  type ProjectWorkspaceDocument,
} from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";

const productFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹", "可拆洗"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉" },
};

function storageDouble(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

async function amazonPlan(): Promise<PlatformPlan> {
  return demoPlanner.plan(productFacts, amazonRulePack, new AbortController().signal);
}

async function amazonModePlan(mode: "listing" | "aplus"): Promise<PlatformPlan> {
  return demoPlanner.plan(
    productFacts,
    amazonRulePack,
    new AbortController().signal,
    [],
    { plannerMode: mode },
  );
}

describe("project workspace document repository", () => {
  it("round-trips platform plans without sharing mutable references", async () => {
    const repository = createMemoryWorkspaceRepository();
    const plan = await amazonPlan();
    const document: ProjectWorkspaceDocument = {
      projectId: "project_01",
      sessions: [],
      runs: [],
      plans: { amazon: plan },
      planInputSignatures: { amazon: "amazon-input-v1" },
      selectedSlotKeys: { amazon: "PT01" },
      slotVersions: {},
      taskHistory: [],
      updatedAt: "2026-07-17T08:00:00.000Z",
    };

    await repository.save(document);
    plan.slots[1].prompt = "外部修改";

    const restored = await repository.load("project_01");
    expect(restored.plans.amazon?.slots[1].prompt).not.toBe("外部修改");
    expect(restored.planInputSignatures.amazon).toBe("amazon-input-v1");
    expect(restored.selectedSlotKeys.amazon).toBe("PT01");

    restored.plans.amazon!.slots[1].visibleCopy = "Changed";
    expect((await repository.load("project_01")).plans.amazon!.slots[1].visibleCopy).not.toBe(
      "Changed",
    );
  });

  it("isolates a malformed saved platform plan and keeps valid sibling data", async () => {
    const plan = await amazonPlan();
    const storage = storageDouble({
      "ecom-workbench.workspace.v2.project_01": JSON.stringify({
        projectId: "project_01",
        sessions: [],
        runs: [],
        plans: {
          amazon: plan,
          taobao: { platformId: "taobao", source: "demo", slots: [] },
        },
        selectedSlotKeys: { amazon: "PT01", taobao: "UNKNOWN" },
        updatedAt: "2026-07-17T08:00:00.000Z",
      }),
    });
    const repository = createLocalStorageWorkspaceRepository({ storage });

    const restored = await repository.load("project_01");

    expect(restored.plans.amazon?.slots).toHaveLength(amazonRulePack.slots.length);
    expect(restored.plans.taobao).toBeUndefined();
    expect(restored.selectedSlotKeys).toEqual({ amazon: "PT01" });
  });

  it("round-trips separate Listing and A+ workspace snapshots", async () => {
    const listing = await amazonModePlan("listing");
    const aplus = await amazonModePlan("aplus");
    const storage = storageDouble({
      "ecom-workbench.workspace.v2.project_01": JSON.stringify({
        projectId: "project_01",
        sessions: [],
        runs: [],
        plans: { amazon: aplus },
        planInputSignatures: { amazon: "aplus-input" },
        selectedSlotKeys: { amazon: "A+L03" },
        amazonWorkspaces: {
          listing: {
            plan: listing,
            planInputSignature: "listing-input",
            selectedSlotKey: "PT03",
          },
          aplus: {
            plan: aplus,
            planInputSignature: "aplus-input",
            selectedSlotKey: "A+L03",
          },
        },
        slotVersions: {},
        taskHistory: [],
        updatedAt: "2026-07-20T01:00:00.000Z",
      }),
    });
    const repository = createLocalStorageWorkspaceRepository({ storage });

    const restored = (await repository.load("project_01")) as ProjectWorkspaceDocument & {
      amazonWorkspaces?: Record<
        "listing" | "aplus",
        { plan: PlatformPlan; planInputSignature?: string; selectedSlotKey?: string }
      >;
    };

    expect(restored.amazonWorkspaces?.listing.plan.amazonSession?.plannerMode).toBe("listing");
    expect(restored.amazonWorkspaces?.listing.plan.slots).toHaveLength(7);
    expect(restored.amazonWorkspaces?.listing.planInputSignature).toBe("listing-input");
    expect(restored.amazonWorkspaces?.listing.selectedSlotKey).toBe("PT03");
    expect(restored.amazonWorkspaces?.aplus.plan.amazonSession?.plannerMode).toBe("aplus");
    expect(restored.amazonWorkspaces?.aplus.plan.slots).toHaveLength(5);
    expect(restored.amazonWorkspaces?.aplus.selectedSlotKey).toBe("A+L03");
  });

  it("normalizes a v2 single-mode Amazon plan into its mode snapshot", async () => {
    const listing = await amazonModePlan("listing");
    const storage = storageDouble({
      "ecom-workbench.workspace.v2.project_01": JSON.stringify({
        projectId: "project_01",
        sessions: [],
        runs: [],
        plans: { amazon: listing },
        planInputSignatures: { amazon: "listing-input" },
        selectedSlotKeys: { amazon: "PT02" },
        slotVersions: {},
        taskHistory: [],
        updatedAt: "2026-07-20T01:00:00.000Z",
      }),
    });
    const repository = createLocalStorageWorkspaceRepository({ storage });

    const restored = (await repository.load("project_01")) as ProjectWorkspaceDocument & {
      amazonWorkspaces?: Record<
        "listing" | "aplus",
        { plan: PlatformPlan; planInputSignature?: string; selectedSlotKey?: string }
      >;
    };

    expect(restored.amazonWorkspaces?.listing.plan.slots).toHaveLength(7);
    expect(restored.amazonWorkspaces?.listing.planInputSignature).toBe("listing-input");
    expect(restored.amazonWorkspaces?.listing.selectedSlotKey).toBe("PT02");
    expect(restored.amazonWorkspaces?.aplus).toBeUndefined();
  });

  it("restores legacy sessions and runs that do not have planning input snapshots", async () => {
    const listing = await amazonModePlan("listing");
    const timestamp = "2026-07-20T01:00:00.000Z";
    const session = {
      id: "session_legacy",
      projectId: "project_legacy",
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: Legacy product" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: [],
      plan: listing,
      slotVersions: {},
      activeRunId: "run_legacy",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const run = {
      id: "run_legacy",
      projectId: "project_legacy",
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
      planSnapshot: listing,
      slotVersionsSnapshot: {},
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const storage = storageDouble({
      "ecom-workbench.workspace.v2.project_legacy": JSON.stringify({
        projectId: "project_legacy",
        sessions: [session],
        runs: [run],
        plans: { amazon: listing },
        selectedSlotKeys: { amazon: "MAIN" },
        slotVersions: {},
        taskHistory: [],
        updatedAt: timestamp,
      }),
    });
    const repository = createLocalStorageWorkspaceRepository({ storage });

    const restored = await repository.load("project_legacy");

    expect(restored.sessions).toHaveLength(1);
    expect(restored.sessions[0]?.planningInput).toBeUndefined();
    expect(restored.runs).toHaveLength(1);
    expect(restored.runs[0]?.contextSnapshot.planningInput).toBeUndefined();
  });
});
