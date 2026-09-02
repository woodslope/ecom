import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALIZATION_RULES,
  enforceLocalizationRules,
} from "../src/domain/localization/product-localizer";
import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { OpenAIProductLocalizer } from "../src/services/openai-product-localizer";
import { createWorkbenchStore } from "../src/store/workbench-store";
import { mockPlanner } from "./fixtures/mock-planner";

const facts: ProductFacts = {
  productName: "Northwind 500 ml 旅行杯",
  category: "水杯",
  brand: "Northwind",
  model: "NW-500",
  sku: "NW-500-GRAY",
  targetAudience: "通勤人群",
  description: "容量 500 ml，杯盖可锁定。",
  sellingPoints: ["500 ml 容量", "杯盖可锁定"],
  forbiddenClaims: ["绝对防漏"],
  specifications: { 容量: "500 ml", 材质: "不锈钢" },
};

function dependencies() {
  let projectIndex = 0;
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => `project_${++projectIndex}`,
      now: () => "2026-07-23T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository(),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-23T08:00:00.000Z",
    }),
    plannerEngine: mockPlanner,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => undefined,
  };
}

describe("task-localized product facts", () => {
  it("locks identifiers and numeric facts after AI or user edits", () => {
    const localized = enforceLocalizationRules(facts, {
      ...facts,
      productName: "Northwind 600 ml Travel Mug",
      brand: "North Wind",
      model: "NW-600",
      sku: "changed",
      description: "600 ml leakproof travel mug",
      sellingPoints: ["600 ml capacity", "Lockable lid"],
      forbiddenClaims: ["Guaranteed leakproof"],
      specifications: { Capacity: "600 ml", Material: "Stainless steel" },
    });

    expect(localized).toMatchObject({
      productName: facts.productName,
      brand: facts.brand,
      model: facts.model,
      sku: facts.sku,
      description: facts.description,
      sellingPoints: [facts.sellingPoints[0], "Lockable lid"],
      forbiddenClaims: facts.forbiddenClaims,
      specifications: { Capacity: "500 ml", Material: "Stainless steel" },
    });
  });

  it("normalizes API localization output before returning it", async () => {
    const localizer = new OpenAIProductLocalizer({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-key",
      model: "text-model",
      fetch: async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          productName: "Northwind 500 ml Travel Mug",
          category: "Drinkware",
          brand: "Changed Brand",
          model: "Changed Model",
          sku: "Changed SKU",
          targetAudience: "Commuters",
          description: "500 ml mug with a lockable lid.",
          sellingPoints: ["500 ml capacity", "Lockable lid"],
          forbiddenClaims: ["Guaranteed leakproof"],
          specifications: { Capacity: "500 ml", Material: "Stainless steel" },
        }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    });

    const localized = await localizer.localize(
      facts,
      "en-US",
      DEFAULT_LOCALIZATION_RULES,
      new AbortController().signal,
    );

    expect(localized).toMatchObject({
      productName: "Northwind 500 ml Travel Mug",
      brand: "Northwind",
      model: "NW-500",
      sku: "NW-500-GRAY",
      forbiddenClaims: ["绝对防漏"],
    });
  });

  it("requires confirmation before Amazon planning and snapshots the confirmed draft into the run", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      sourceMode: "manual",
      workflowId: "amazon-listing",
      listingText: "",
      facts,
      files: [],
      selectedReferenceAssetIds: [],
      options: { marketplaceId: "us", plannerMode: "listing", listingImageCount: 7 },
    });

    expect(session?.localizedFactsDraft).toMatchObject({
      targetLocale: "en-US",
      status: "pending",
    });
    expect(store.getState().plans.amazon).toBeUndefined();

    const edited = {
      ...session!.localizedFactsDraft!.localizedFacts,
      productName: "Northwind 500 ml Travel Mug",
      brand: "Changed Brand",
    };
    expect(await store.getState().confirmLocalizedFacts(session!.id, edited)).toBe(true);
    const plan = await store.getState().planPlatform(
      "amazon",
      session!.options.platformId === "amazon" ? session!.options : undefined,
    );

    expect(plan?.amazonSession?.marketplaceId).toBe("us");
    expect(store.getState().sessions.find((item) => item.id === session!.id)?.localizedFactsDraft)
      .toMatchObject({ status: "confirmed", localizedFacts: { brand: "Northwind" } });
    expect(store.getState().runs.at(-1)?.contextSnapshot.localizedFactsDraft).toMatchObject({
      targetLocale: "en-US",
      status: "confirmed",
      localizedFacts: { productName: "Northwind 500 ml Travel Mug" },
    });
    const restored = createWorkbenchStore(deps);
    await restored.getState().initialize();
    expect(restored.getState().runs.at(-1)?.contextSnapshot.localizedFactsDraft).toMatchObject({
      targetLocale: "en-US",
      status: "confirmed",
    });
  });

  it("continues directly into the platform production workspace after successful localization", async () => {
    const deps = {
      ...dependencies(),
      productLocalizer: {
        async localize(source: ProductFacts, targetLocale: string) {
          return {
            ...source,
            productName: targetLocale === "en-US" ? "Northwind 500 ml Travel Mug" : source.productName,
            category: targetLocale === "en-US" ? "Drinkware" : source.category,
            targetAudience: targetLocale === "en-US" ? "Commuters" : source.targetAudience,
            description: targetLocale === "en-US"
              ? "A 500 ml travel mug with a lockable lid."
              : source.description,
            sellingPoints: targetLocale === "en-US"
              ? ["500 ml capacity", "Lockable lid"]
              : source.sellingPoints,
          };
        },
      },
    };
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      sourceMode: "manual",
      workflowId: "amazon-listing",
      listingText: "",
      facts,
      files: [],
      selectedReferenceAssetIds: [],
      options: { marketplaceId: "us", plannerMode: "listing", listingImageCount: 7 },
    });

    expect(session?.localizedFactsDraft).toMatchObject({
      targetLocale: "en-US",
      status: "confirmed",
      localizedFacts: { productName: "Northwind 500 ml Travel Mug" },
    });
    expect(session?.plan?.slots).toHaveLength(7);
    expect(store.getState().plans.amazon?.slots).toHaveLength(7);
    expect(store.getState().runs).toHaveLength(1);
    expect(store.getState().planningError).toBeNull();
  });

  it("keeps source facts as an unconfirmed draft when localization fails", async () => {
    const store = createWorkbenchStore({
      ...dependencies(),
      productLocalizer: {
        async localize() {
          throw new Error("localizer unavailable");
        },
      },
    });
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      sourceMode: "manual",
      workflowId: "amazon-listing",
      listingText: "",
      facts,
      files: [],
      selectedReferenceAssetIds: [],
      options: { marketplaceId: "us", plannerMode: "listing", listingImageCount: 7 },
    });

    expect(session?.localizedFactsDraft).toMatchObject({
      targetLocale: "en-US",
      status: "pending",
      localizedFacts: { productName: facts.productName },
    });
    expect(session?.plan).toBeUndefined();
    expect(store.getState().plans.amazon).toBeUndefined();
    expect(store.getState().planningError).toContain("确认站点语言草稿");
  });

  it("creates a fresh unconfirmed draft after switching Amazon marketplace", async () => {
    const store = createWorkbenchStore(dependencies());
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      sourceMode: "manual",
      workflowId: "amazon-listing",
      listingText: "",
      facts,
      files: [],
      selectedReferenceAssetIds: [],
      options: { marketplaceId: "us", plannerMode: "listing", listingImageCount: 7 },
    });
    await store.getState().confirmLocalizedFacts(
      session!.id,
      session!.localizedFactsDraft!.localizedFacts,
    );
    await store.getState().planPlatform(
      "amazon",
      session!.options.platformId === "amazon" ? session!.options : undefined,
    );

    const switched = await store.getState().planPlatform("amazon", {
      ...session!.options,
      marketplaceId: "jp",
    });
    const current = store.getState().sessions.find((item) => item.id === session!.id);

    expect(switched).toBeNull();
    expect(current?.localizedFactsDraft).toMatchObject({
      targetLocale: "ja-JP",
      status: "pending",
    });
    expect(current?.options).toMatchObject({ marketplaceId: "jp" });
  });

});
