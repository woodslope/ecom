import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import platformWorkspaceSource from "../src/components/PlatformWorkspace.tsx?raw";
import {
  PlatformWorkspace,
  shouldDefaultCollapseSource,
  workspaceDraftReason,
} from "../src/components/PlatformWorkspace";
import { createPlanningInputSignature } from "../src/domain/planning/input-signature";
import type { ProductProject } from "../src/domain/projects/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";
import type { PlatformSession } from "../src/domain/workspace/project-workspace";

const project: ProductProject = {
  id: "project_01",
  name: "Amazon 上新",
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  facts: {
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
  },
};

function buttonAttributes(markup: string, label: string): string {
  const button = [...markup.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].find(
    ([, , content]) => content.includes(label),
  );
  return button?.[1] ?? "";
}

describe("platform workspace contract", () => {
  it("routes the Amazon workspace through the active production session", () => {
    expect(appSource).toContain("productionSession={activeAmazonSession}");
    expect(appSource).toContain("selectSessionSlot(activeAmazonSession.id, slotKey)");
    expect(appSource).toContain("generateSessionSlot(activeAmazonSession.id, slotKey)");
  });

  it("restores an existing Taobao session without overwriting its selected analysis inputs", () => {
    expect(appSource).toContain(
      'if (!initialized || activeItem !== "taobao" || !activeProject || activeTaobaoSession) return;',
    );
    expect(appSource).toContain("productionSession={activeTaobaoSession}");
    expect(appSource).toContain("onOpenLibrary={() => changeActiveItem(\"library\")}");
    expect(appSource).toContain("resolveOverviewNextAction");
  });

  it("blocks silent slot switches while the selected slot draft is dirty", () => {
    expect(workspaceDraftReason(false, true)).toBe(
      "当前槽位有未保存修改，请先保存文案与提示词。",
    );
    expect(platformWorkspaceSource).toContain(
      "当前槽位有未保存修改，请先保存文案与提示词，再切换槽位。",
    );
  });

  it("keeps three columns from 1100px and uses a source drawer only below it", () => {
    expect(shouldDefaultCollapseSource(1600, true)).toBe(false);
    expect(shouldDefaultCollapseSource(1100, true)).toBe(false);
    expect(shouldDefaultCollapseSource(1099, true)).toBe(true);
    expect(shouldDefaultCollapseSource(900, true)).toBe(true);
    expect(shouldDefaultCollapseSource(1099, false)).toBe(false);
  });

  it("keeps the selected Amazon mode visible when that mode has no saved plan yet", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        amazonPlannerMode: "aplus",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_01",
              projectId: project.id,
              name: "front.png",
              kind: "reference" as const,
              role: "reference",
              tags: [],
              mimeType: "image/png",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/front",
          },
        ],
        loading: false,
        planning: false,
        planningError: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onAmazonPlannerModeChange: async () => true,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(buttonAttributes(markup, "A+ 图")).toContain('aria-selected="true"');
    expect(buttonAttributes(markup, "Listing 图")).toContain('aria-selected="false"');
    expect(markup).toContain("普通A+");
    expect(markup).toContain("5 个模块");
  });

  it("names the unsaved workspace state that must block planning and navigation", () => {
    expect(workspaceDraftReason(true, false)).toBe(
      "商品资料有未保存修改，请先保存商品资料。",
    );
    expect(workspaceDraftReason(false, true)).toBe(
      "当前槽位有未保存修改，请先保存文案与提示词。",
    );
    expect(workspaceDraftReason(false, false)).toBeNull();
  });

  it("renders a persisted complete plan with a local editor and honest demo source", async () => {
    const plan = await demoPlanner.plan(project.facts, amazonRulePack, new AbortController().signal);
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_01",
              projectId: project.id,
              name: "front.png",
              kind: "reference",
              role: "reference",
              tags: [],
              mimeType: "image/png",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/front",
          },
        ],
        loading: false,
        plan,
        selectedSlotKey: "MAIN",
        planning: false,
        planningError: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain("重新策划");
    expect(markup).toContain("15 个槽位");
    expect(markup).toContain("Demo");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain("当前资料");
    expect(markup).toContain("交付槽位");
    expect(markup).toContain("槽位检查器");
    expect(markup).toContain("保存文案与提示词");
    expect(markup).not.toContain("移动端工作区视图");
  });

  it("shows review stage with one image-generation primary action at 0/7", async () => {
    const plan = await demoPlanner.plan(
      project.facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    );
    const signature = createPlanningInputSignature(project.facts, []);
    const session: PlatformSession = {
      id: "session_review",
      projectId: project.id,
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: Cloud Neck Pillow" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        aPlusType: "standard-large",
        aPlusModuleSpecs: [],
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: [],
      plan,
      planInputSignature: signature,
      selectedSlotKey: "MAIN",
      slotVersions: {},
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [],
        loading: false,
        plan,
        productionSession: session,
        planInputSignature: signature,
        selectedSlotKey: "MAIN",
        planning: false,
        planningError: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain('aria-label="当前步骤 2 / 4"');
    expect(markup).toContain("2/4 · 策划检查");
    expect(buttonAttributes(markup, "生成图片")).toContain("button--primary");
    expect(buttonAttributes(markup, "重新策划")).toContain("button--secondary");
    expect(markup).not.toContain("继续下一槽位");
    expect(markup).not.toContain("导出当前结果");
  });

  it("keeps an old plan visible but blocks downstream work until it is replanned", async () => {
    const plan = await demoPlanner.plan(
      project.facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    );
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_01",
              projectId: project.id,
              name: "front.png",
              kind: "reference",
              role: "reference",
              tags: [],
              mimeType: "image/png",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/front",
          },
        ],
        loading: false,
        plan,
        planInputSignature: "old-input-signature",
        selectedSlotKey: "PT01",
        planning: false,
        planningError: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain(
      "商品资料或参考素材已更新，当前策划仍基于旧输入。请重新策划后再编辑槽位、生成或导出。",
    );
    expect(buttonAttributes(markup, "重新策划") || buttonAttributes(markup, "AI 策划")).not.toContain('disabled=""');
    for (const label of ["保存文案与提示词", "生成图片"]) {
      expect(buttonAttributes(markup, label)).toContain('disabled=""');
    }
    // Delivery strip is hidden until first usable generated output (UI_STYLE_GUIDE).
    expect(markup).not.toContain("导出当前结果");
  });

  it("locks another selected slot while the app-level task banner owns cancel", async () => {
    const plan = await demoPlanner.plan(project.facts, amazonRulePack, new AbortController().signal);
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [],
        loading: false,
        plan,
        selectedSlotKey: "PT02",
        planning: false,
        planningError: null,
        generatingSlot: { platformId: "amazon", slotKey: "PT01" },
        generationErrorTarget: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).not.toContain("取消生成");
    expect(markup).toContain("Amazon · PT01 正在生成");
    expect(markup).toContain("请先等待或取消");
    const copilotMarkup = markup.slice(markup.indexOf('aria-label="AI Copilot"'));
    expect((copilotMarkup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("keeps generation disabled until an inconsistent workspace is restored", async () => {
    const plan = await demoPlanner.plan(
      project.facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    );
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [],
        loading: false,
        plan,
        planInputSignature: createPlanningInputSignature(project.facts, []),
        selectedSlotKey: "PT01",
        planning: false,
        planningError: null,
        generatingSlot: null,
        generationRecoveryRequired: true,
        generationErrorTarget: { platformId: "amazon", slotKey: "PT01" },
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain("上次图片生成状态需要恢复");
    expect(markup).toContain("disabled");
  });

  it("locks every planning entry while another platform owns the planning task", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "taobao",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_01",
              projectId: project.id,
              name: "front.png",
              kind: "reference",
              role: "reference",
              tags: [],
              mimeType: "image/png",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/front",
          },
        ],
        loading: false,
        planning: false,
        planningPlatformId: "amazon",
        planningError: "上一次策划失败，可重试。",
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain("Amazon 正在生成平台策划，请先等待或取消。");
    expect(markup).toContain("Amazon 正在生成平台策划");
    expect(markup.match(/取消策划/g)).toHaveLength(1);
    for (const label of ["AI 策划", "重试策划", "生成平台策划"]) {
      expect(buttonAttributes(markup, label)).toContain('disabled=""');
      expect(buttonAttributes(markup, label)).toContain(
        'aria-describedby="planning-task-status"',
      );
    }
  });

  it("keeps planning, generation, Copilot, and export controls locked while loading", async () => {
    const plan = await demoPlanner.plan(project.facts, amazonRulePack, new AbortController().signal);
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [],
        loading: true,
        plan,
        selectedSlotKey: "PT01",
        planning: false,
        planningError: null,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain("工作台正在加载或保存项目与素材");
    const copilotMarkup = markup.slice(markup.indexOf('aria-label="AI Copilot"'));
    expect((copilotMarkup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("does not count a generated image from an older slot draft as completed", async () => {
    const plan = await demoPlanner.plan(project.facts, amazonRulePack, new AbortController().signal);
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_main",
              projectId: project.id,
              name: "main.svg",
              kind: "generated",
              role: "amazon:MAIN",
              tags: [],
              mimeType: "image/svg+xml",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/main",
          },
        ],
        loading: false,
        plan,
        selectedSlotKey: "MAIN",
        planning: false,
        planningError: null,
        slotVersionStates: {
          MAIN: {
            activeVersionId: "version_main",
            versions: [
              {
                id: "version_main",
                slotKey: "MAIN",
                assetId: "asset_main",
                createdAt: project.createdAt,
                source: "demo",
                promptSnapshot: "Older prompt",
                visibleCopySnapshot: "",
                width: 2000,
                height: 2000,
                mimeType: "image/svg+xml",
                parameters: { engine: "demo" },
              },
            ],
          },
        },
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    // No delivery strip before first usable image.
    expect(markup).not.toContain("已有活动版本");
    expect(markup).toContain("当前图基于旧草稿");
  });

  it("shows produce-stage continuation with one primary action after 1/7 outputs", async () => {
    const plan = await demoPlanner.plan(
      project.facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    );
    const signature = createPlanningInputSignature(project.facts, []);
    const mainVersion = {
      id: "version_main",
      slotKey: "MAIN",
      assetId: "asset_main",
      createdAt: project.createdAt,
      source: "demo" as const,
      promptSnapshot: plan.slots[0].prompt,
      visibleCopySnapshot: plan.slots[0].visibleCopy,
      planningInputSignature: signature,
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      parameters: {},
    };
    const session: PlatformSession = {
      id: "session_listing",
      projectId: project.id,
      platformId: "amazon",
      workflowId: "amazon-listing",
      sourceInput: { listingText: "Title: Cloud Neck Pillow" },
      options: {
        platformId: "amazon",
        marketplaceId: "us",
        plannerMode: "listing",
        listingImageCount: 7,
        aPlusType: "standard-large",
        aPlusModuleSpecs: [],
        sizeTier: "2K",
      },
      selectedReferenceAssetIds: [],
      plan,
      planInputSignature: signature,
      selectedSlotKey: "MAIN",
      slotVersions: {
        MAIN: { versions: [mainVersion], activeVersionId: mainVersion.id },
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const markup = renderToStaticMarkup(
      createElement(PlatformWorkspace, {
        platform: "amazon",
        activeProject: project,
        assets: [
          {
            metadata: {
              id: "asset_main",
              projectId: project.id,
              name: "main.svg",
              kind: "generated" as const,
              role: "amazon:MAIN",
              tags: [],
              mimeType: "image/svg+xml",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/main",
          },
        ],
        productionSession: session,
        loading: false,
        plan,
        planInputSignature: signature,
        selectedSlotKey: "MAIN",
        planning: false,
        planningError: null,
        slotVersionStates: session.slotVersions,
        onCreate: () => undefined,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
        onPlan: async () => undefined,
        onCancelPlanning: () => undefined,
        onClearPlanningError: () => undefined,
        onSelectSlot: () => undefined,
        onUpdateSlot: async () => true,
      }),
    );

    expect(markup).toContain('aria-label="当前步骤 3 / 4"');
    expect(markup).toContain("3/4 · 逐图生产");
    expect(buttonAttributes(markup, "继续下一槽位")).toContain("button--primary");
    expect(buttonAttributes(markup, "重新生成")).toContain("button--secondary");
    expect(buttonAttributes(markup, "导出当前结果")).toContain("button--secondary");
    expect(buttonAttributes(markup, "重新策划")).toContain("button--secondary");
  });
});
