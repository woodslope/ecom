import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AmazonIntake } from "../src/components/AmazonIntake";
import { AmazonSessionSummary, AmazonWorkspace } from "../src/components/AmazonWorkspace";
import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { getAPlusModuleSpecs } from "../src/domain/platforms/amazon-catalog";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

const sharedFacts: ProductFacts = {
  productName: "共享商品名称",
  category: "旅行用品",
  brand: "Northwind",
  model: "P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "共享资料中的原始描述",
  sellingPoints: ["共享卖点"],
  forbiddenClaims: [],
  specifications: { material: "memory foam" },
};

function dependencies() {
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-20T01:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-20T01:00:00.000Z",
    }),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-20T01:00:00.000Z",
    }),
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:asset",
    revokeObjectURL: () => undefined,
  };
}

describe("Amazon direct intake", () => {
  it("keeps a custom style asset while saving new task reference files", async () => {
    const deps = {
      ...dependencies(),
      assetRepository: createMemoryAssetRepository(),
    };
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const project = await store.getState().createProject({ name: "带风格的商品", facts: sharedFacts });
    const style = await store.getState().createStyleReference("clean-retail", {
      name: "静谧棚拍",
    });

    const session = await store.getState().startAmazonSession({
      projectId: project!.id,
      workflowId: "amazon-listing",
      listingText: "Title: Styled Travel Pillow\n- Washable cover",
      files: [new File(["image"], "front.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
      selectedStyleReferenceId: style!.metadata.id,
      options: {
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        aPlusType: "standard-large",
        sizeTier: "2K",
        stylePresetId: "clean-retail",
      },
    });

    expect(session).not.toBeNull();
    expect(session?.selectedStyleReferenceId).toBe(style!.metadata.id);
    expect(session?.selectedReferenceAssetIds).toHaveLength(1);
    expect(store.getState().assets.filter((asset) => asset.metadata.kind === "reference"))
      .toHaveLength(1);
    expect(store.getState().assets.filter((asset) => asset.metadata.kind === "style-reference"))
      .toHaveLength(1);
  });

  it("persists Listing input and options in a session without overwriting shared facts", async () => {
    const deps = dependencies();
    const project = await deps.projectRepository.create({ name: "共享商品", facts: sharedFacts });
    let plannerFacts: { productName?: string; description?: string } | null = null;
    const store = createWorkbenchStore({
      ...deps,
      plannerEngine: {
        async plan(facts, rulePack, signal, images, options) {
          plannerFacts = facts;
          return demoPlanner.plan(facts, rulePack, signal, images, options);
        },
      },
    });
    await store.getState().initialize();

    const session = await store.getState().startAmazonSession({
      projectId: project.id,
      workflowId: "amazon-listing",
      listingText: [
        "Title: Session-only Travel Pillow",
        "About this item",
        "- Session benefit one",
        "- Session benefit two",
        "Session-only product description.",
      ].join("\n"),
      files: [],
      selectedReferenceAssetIds: [],
      options: {
        marketplaceId: "jp",
        plannerMode: "listing",
        listingImageCount: 9,
        aPlusType: "standard-large",
        sizeTier: "4K",
        stylePresetId: "soft-lifestyle",
      },
    });

    expect(session).toMatchObject({
      projectId: project.id,
      workflowId: "amazon-listing",
      sourceInput: { listingText: expect.stringContaining("Session-only Travel Pillow") },
      options: {
        platformId: "amazon",
        marketplaceId: "jp",
        plannerMode: "listing",
        listingImageCount: 9,
        sizeTier: "4K",
        stylePresetId: "soft-lifestyle",
      },
      plan: { platformId: "amazon" },
    });
    expect(plannerFacts).toMatchObject({
      productName: "Session-only Travel Pillow",
      description: "Session-only product description.",
    });
    expect((await deps.projectRepository.get(project.id))?.facts).toEqual(sharedFacts);

    const restored = createWorkbenchStore({ ...deps, plannerEngine: demoPlanner });
    await restored.getState().initialize();
    expect(restored.getState().sessions).toHaveLength(1);
    expect(restored.getState().sessions[0]).toMatchObject({
      workflowId: "amazon-listing",
      sourceInput: { listingText: expect.stringContaining("Session-only Travel Pillow") },
      options: { marketplaceId: "jp", listingImageCount: 9, sizeTier: "4K" },
    });
    expect(restored.getState().runs).toHaveLength(1);
    expect(restored.getState().runs[0]).toMatchObject({
      sessionId: restored.getState().sessions[0].id,
      workflowId: "amazon-listing",
      status: "planned",
    });
    expect(await restored.getState().syncAmazonSessionFacts(restored.getState().sessions[0].id))
      .toBe(true);
    expect((await deps.projectRepository.get(project.id))?.facts).toMatchObject({
      productName: "Session-only Travel Pillow",
      description: "Session-only product description.",
    });
  });

  it("rolls back a newly created draft project and assets when planning fails", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore({
      ...deps,
      plannerEngine: {
        async plan() {
          throw new Error("planner unavailable");
        },
      },
    });
    await store.getState().initialize();

    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Direct Start Pillow\n- Foldable\n- Washable",
      files: [new File(["image"], "front.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, sizeTier: "2K" },
    });

    expect(session).toBeNull();
    expect(await deps.projectRepository.list()).toEqual([]);
    expect(await deps.assetRepository.list("project_01")).toEqual([]);
    expect((await deps.workspaceRepository.load("project_01")).sessions).toEqual([]);
    expect(store.getState().activeProject).toBeNull();
    expect(store.getState().planningError).toContain("planner unavailable");
  });

  it("rejects reference count and payload limits before calling the planner", async () => {
    const deps = dependencies();
    let plannerCalls = 0;
    const store = createWorkbenchStore({
      ...deps,
      plannerEngine: {
        async plan(...args) {
          plannerCalls += 1;
          return demoPlanner.plan(...args);
        },
      },
    });
    await store.getState().initialize();
    const input = {
      workflowId: "amazon-listing" as const,
      listingText: "Title: Direct Start Pillow\n- Foldable",
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing" as const, listingImageCount: 7, sizeTier: "2K" as const },
    };

    await expect(
      store.getState().startAmazonSession({
        ...input,
        files: Array.from(
          { length: 17 },
          (_, index) => new File(["x"], `ref-${index}.png`, { type: "image/png" }),
        ),
      }),
    ).resolves.toBeNull();
    expect(store.getState().planningError).toContain("最多 16 张");

    await expect(
      store.getState().startAmazonSession({
        ...input,
        files: [
          new File([new Uint8Array(8 * 1024 * 1024 + 1)], "too-large.png", {
            type: "image/png",
          }),
        ],
      }),
    ).resolves.toBeNull();
    expect(store.getState().planningError).toContain("超过 8 MiB");
    expect(plannerCalls).toBe(0);
    expect(await deps.projectRepository.list()).toEqual([]);
  });

  it("renders a direct Amazon preparation surface with explicit shared-facts sync", () => {
    const common = {
      assets: [],
      session: undefined,
      loading: false,
      planning: false,
      error: null,
      onSubmit: async () => null,
      onSyncListingFacts: async () => false,
    };
    const directMarkup = renderToStaticMarkup(
      createElement(AmazonIntake, { ...common, activeProject: null }),
    );
    const existingMarkup = renderToStaticMarkup(
      createElement(AmazonIntake, {
        ...common,
        activeProject: {
          id: "project_01",
          name: "共享商品",
          facts: sharedFacts,
          createdAt: "2026-07-20T01:00:00.000Z",
          updatedAt: "2026-07-20T01:00:00.000Z",
        },
        session: {
          id: "session_01",
          projectId: "project_01",
          platformId: "amazon",
          workflowId: "amazon-listing",
          sourceInput: { listingText: "Title: Session-only Travel Pillow\n- Session benefit" },
          options: {
            platformId: "amazon",
            marketplaceId: "us",
            plannerMode: "listing",
            listingImageCount: 7,
            sizeTier: "2K",
          },
          selectedReferenceAssetIds: [],
          slotVersions: {},
          createdAt: "2026-07-20T01:00:00.000Z",
          updatedAt: "2026-07-20T01:00:00.000Z",
        },
      }),
    );

    expect(directMarkup).toContain("Listing 图");
    expect(directMarkup).toContain("A+ 图");
    expect(directMarkup).toContain('aria-label="Amazon Listing 原文"');
    expect(directMarkup).toContain('type="file"');
    expect(directMarkup).toContain("生成图片策划");
    expect(directMarkup).toContain('title="先填写 Listing 原文"');
    expect(directMarkup).toContain('class="amazon-session-controls__additional"');
    expect(directMarkup).toContain("style-reference-picker--embedded");
    expect(directMarkup).toContain("载入资料库");
    expect(directMarkup).toContain("手动填写");
    expect(directMarkup).not.toContain('class="action-bar');
    expect(directMarkup).not.toContain("打开资料库");
    expect(existingMarkup).toContain("不会自动覆盖共享商品资料");
    expect(existingMarkup).toContain("同步到共享商品资料");
    expect(existingMarkup).toContain("Session-only Travel Pillow");
  });

  it("preloads shared facts into Listing draft when no session draft exists", () => {
    const markup = renderToStaticMarkup(
      createElement(AmazonIntake, {
        activeProject: {
          id: "project_01",
          name: "共享商品",
          facts: sharedFacts,
          createdAt: "2026-07-20T01:00:00.000Z",
          updatedAt: "2026-07-20T01:00:00.000Z",
        },
        assets: [],
        session: undefined,
        loading: false,
        planning: false,
        error: null,
        onSubmit: async () => null,
        onSyncListingFacts: async () => false,
      }),
    );

    expect(markup).toContain("Title: 共享商品名称");
    expect(markup).toContain("共享卖点");
    expect(markup).toContain("资料库");
  });

  it("keeps the selected A+ mode when the target workflow has no session yet", () => {
    const markup = renderToStaticMarkup(
      createElement(AmazonIntake, {
        activeProject: null,
        assets: [],
        session: undefined,
        plannerMode: "aplus",
        loading: false,
        planning: false,
        error: null,
        onSubmit: async () => null,
        onSyncListingFacts: async () => false,
      }),
    );

    expect(markup).toMatch(/aria-selected="true"[^>]*>A\+ 图<\/button>/);
    expect(markup).toContain('aria-label="A+ 类型"');
  });

  it("restores A+ type and a 12-module session after reload", async () => {
    const deps = dependencies();
    const project = await deps.projectRepository.create({ name: "A+ 商品", facts: sharedFacts });
    const defaults = getAPlusModuleSpecs("premium");
    const moduleSpecs = Array.from({ length: 12 }, (_, index) => ({
      ...defaults[index % defaults.length],
      slot: `A+P${String(index + 1).padStart(2, "0")}`,
    }));
    const store = createWorkbenchStore({ ...deps, plannerEngine: demoPlanner });
    await store.getState().initialize();

    const session = await store.getState().startAmazonSession({
      projectId: project.id,
      workflowId: "amazon-aplus",
      listingText: "Title: Premium A+ Pillow\n- Foldable\n- Washable",
      files: [],
      selectedReferenceAssetIds: [],
      options: {
        marketplaceId: "de",
        plannerMode: "aplus",
        aPlusType: "premium",
        aPlusModuleSpecs: moduleSpecs,
        sizeTier: "2K",
        stylePresetId: "studio-proof",
      },
    });
    expect(session?.options).toMatchObject({
      marketplaceId: "de",
      plannerMode: "aplus",
      aPlusType: "premium",
      sizeTier: "2K",
      stylePresetId: "studio-proof",
    });
    expect(
      session?.options.platformId === "amazon" ? session.options.aPlusModuleSpecs : [],
    ).toHaveLength(12);

    const restored = createWorkbenchStore({ ...deps, plannerEngine: demoPlanner });
    await restored.getState().initialize();
    const restoredSession = restored.getState().sessions[0];
    expect(restoredSession).toMatchObject({
      workflowId: "amazon-aplus",
      options: { marketplaceId: "de", aPlusType: "premium", stylePresetId: "studio-proof" },
    });
    expect(
      restoredSession.options.platformId === "amazon"
        ? restoredSession.options.aPlusModuleSpecs
        : [],
    ).toHaveLength(12);
  });

  it("keeps the persisted session input inspectable after planning", async () => {
    const deps = dependencies();
    const project = await deps.projectRepository.create({ name: "共享商品", facts: sharedFacts });
    const reference = await deps.assetRepository.put({
      projectId: project.id,
      blob: new Blob(["reference"], { type: "image/png" }),
      metadata: { name: "front-reference.png", kind: "reference" },
    });
    const store = createWorkbenchStore({ ...deps, plannerEngine: demoPlanner });
    await store.getState().initialize();
    const session = await store.getState().startAmazonSession({
      projectId: project.id,
      workflowId: "amazon-listing",
      listingText: "Title: Persisted Session Listing\n- Session-only benefit",
      files: [],
      selectedReferenceAssetIds: [reference.metadata.id],
      options: {
        marketplaceId: "jp",
        plannerMode: "listing",
        listingImageCount: 9,
        sizeTier: "4K",
        stylePresetId: "soft-lifestyle",
      },
    });

    const markup = renderToStaticMarkup(
      createElement(
        AmazonWorkspace,
        {
          activeProject: project,
          assets: store.getState().assets,
          session: session ?? undefined,
          loading: false,
          planning: false,
          error: null,
          onStartSession: async () => null,
          onSyncListingFacts: async () => false,
          children: createElement("div", null, "生产工作台"),
        },
      ),
    );

    expect(markup).toContain("任务输入");
    expect(markup).toContain("Listing 9 张");
    expect(markup).toContain("生产工作台");

    const summary = renderToStaticMarkup(
      createElement(AmazonSessionSummary, {
        open: true,
        session: session!,
        assets: store.getState().assets,
        onClose: () => undefined,
      }),
    );
    expect(summary).toContain("本次任务输入");
    expect(summary).toContain("dialog--sidebar");
    expect(summary).toContain("Persisted Session Listing");
    expect(summary).toContain("日本站");
    expect(summary).toContain("4K");
    expect(summary).toContain("front-reference.png");
  });
});
