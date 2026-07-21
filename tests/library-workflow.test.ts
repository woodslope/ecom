import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { filterLibraryProjects, LibraryView } from "../src/components/LibraryView";
import {
  derivePlatformProgressSummaries,
  platformIdForWorkflow,
} from "../src/components/PlatformProgress";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import type { ProductProject } from "../src/domain/projects/types";
import type { PlatformSession } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";

const noop = () => undefined;
const facts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹"],
  forbiddenClaims: [],
  specifications: { material: "memory foam" },
};

const projects: ProductProject[] = [
  {
    id: "project_01",
    name: "Summer Pillow",
    facts,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
  },
  {
    id: "project_02",
    name: "保温杯上新",
    facts: { ...facts, productName: "轻量保温杯", category: "户外水具" },
    createdAt: "2026-07-20T01:00:00.000Z",
    updatedAt: "2026-07-20T01:00:00.000Z",
  },
];

describe("library workflow", () => {
  it("shows one create-product primary action in an empty library without first-step copy", () => {
    const markup = renderToStaticMarkup(
      createElement(LibraryView, {
        projects: [],
        activeProject: null,
        assets: [],
        loading: false,
        onCreate: noop,
        onSelectProject: noop,
        onOpenWorkflow: noop,
        onSave: async () => true,
        onRemoveProject: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
      }),
    );

    expect(markup).not.toContain("第一步");
    expect(markup.match(/新建商品/g)).toHaveLength(1);
    expect(markup.match(/button--primary/g)).toHaveLength(1);
  });

  it("filters a derived product list without mutating persisted project order", () => {
    const originalOrder = projects.map((project) => project.id);

    expect(filterLibraryProjects(projects, "summer").map((project) => project.id)).toEqual([
      "project_01",
    ]);
    expect(filterLibraryProjects(projects, "户外水具").map((project) => project.id)).toEqual([
      "project_02",
    ]);
    expect(projects.map((project) => project.id)).toEqual(originalOrder);
  });

  it("derives independent Listing, A+, and Taobao progress from sessions", async () => {
    const listingPlan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing" },
    );
    const aplusPlan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus" },
    );
    const taobaoPlan = await demoPlanner.plan(
      facts,
      taobaoRulePack,
      new AbortController().signal,
    );
    const baseSession = {
      projectId: "project_01",
      sourceInput: { listingText: "" },
      selectedReferenceAssetIds: [],
      createdAt: "2026-07-20T01:00:00.000Z",
      updatedAt: "2026-07-20T02:00:00.000Z",
    };
    const sessions: PlatformSession[] = [
      {
        ...baseSession,
        id: "session_listing",
        platformId: "amazon",
        workflowId: "amazon-listing",
        options: {
          platformId: "amazon",
          marketplaceId: "us",
          plannerMode: "listing",
          listingImageCount: 7,
          sizeTier: "2K",
        },
        plan: listingPlan,
        slotVersions: {
          MAIN: {
            activeVersionId: "version_main",
            versions: [
              {
                id: "version_main",
                slotKey: "MAIN",
                assetId: "asset_main",
                createdAt: "2026-07-20T02:00:00.000Z",
                source: "demo",
                promptSnapshot: "prompt",
                visibleCopySnapshot: "",
                width: 2048,
                height: 2048,
                mimeType: "image/svg+xml",
                parameters: {},
              },
            ],
          },
        },
      },
      {
        ...baseSession,
        id: "session_aplus",
        platformId: "amazon",
        workflowId: "amazon-aplus",
        options: {
          platformId: "amazon",
          marketplaceId: "us",
          plannerMode: "aplus",
          aPlusType: "standard-large",
          sizeTier: "2K",
        },
        plan: aplusPlan,
        slotVersions: {},
      },
      {
        ...baseSession,
        id: "session_taobao",
        platformId: "taobao",
        workflowId: "taobao-product",
        options: { platformId: "taobao" },
        plan: taobaoPlan,
        slotVersions: {},
      },
    ];

    expect(derivePlatformProgressSummaries("project_01", sessions, [])).toMatchObject([
      { workflowId: "amazon-listing", status: "producing", completedSlots: 1, totalSlots: 7 },
      { workflowId: "amazon-aplus", status: "planned", completedSlots: 0, totalSlots: 5 },
      { workflowId: "taobao-product", status: "planned", completedSlots: 0 },
    ]);
  });

  it("renders real facts, reference-assets, and platform-progress tabs", () => {
    const commonProps = {
      projects,
      activeProject: projects[0],
      assets: [],
      sessions: [],
      runs: [],
      loading: false,
      onCreate: noop,
      onSelectProject: noop,
      onOpenWorkflow: noop,
      onSave: async () => true,
      onRemoveProject: async () => true,
      onUpload: async () => undefined,
      onRemove: async () => undefined,
    };
    const factsMarkup = renderToStaticMarkup(
      createElement(LibraryView, { ...commonProps, initialTab: "facts" }),
    );
    const assetsMarkup = renderToStaticMarkup(
      createElement(LibraryView, { ...commonProps, initialTab: "assets" }),
    );
    const progressMarkup = renderToStaticMarkup(
      createElement(LibraryView, { ...commonProps, initialTab: "progress" }),
    );

    for (const markup of [factsMarkup, assetsMarkup, progressMarkup]) {
      expect(markup).toContain('role="tablist"');
      expect(markup).toContain("商品资料");
      expect(markup).toContain("参考素材");
      expect(markup).toContain("平台进度");
      expect(markup).toContain(`aria-label="档案详情：${projects[0]!.name}"`);
      expect(markup).toContain('aria-label="新建商品"');
      expect(markup).toContain(`aria-label="更多：${projects[0]!.name}"`);
    }
    expect(factsMarkup).toContain('aria-selected="true">商品资料');
    expect(factsMarkup).toContain("保存商品资料");
    expect(assetsMarkup).toContain('aria-selected="true">参考素材');
    expect(assetsMarkup).toContain('type="file"');
    expect(progressMarkup).toContain('aria-selected="true">平台进度');
    expect(progressMarkup).toContain('data-workflow-id="amazon-listing"');
    expect(progressMarkup).toContain('data-workflow-id="amazon-aplus"');
    expect(progressMarkup).toContain('data-workflow-id="taobao-product"');
    expect(factsMarkup).not.toContain('aria-label="更多商品操作"');
    expect(factsMarkup).not.toContain("删除项目");
  });

  it("maps each progress action to the correct platform workspace", () => {
    expect(platformIdForWorkflow("amazon-listing")).toBe("amazon");
    expect(platformIdForWorkflow("amazon-aplus")).toBe("amazon");
    expect(platformIdForWorkflow("taobao-product")).toBe("taobao");
  });
});
