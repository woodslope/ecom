import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TaobaoAnalysisSummary,
  TaobaoIntake,
  taobaoAnalysisHasReference,
} from "../src/components/TaobaoIntake";
import { PlatformWorkspace } from "../src/components/PlatformWorkspace";
import { createPlanningInputSignature } from "../src/domain/planning/input-signature";
import { applyTaobaoAnalysisToFacts } from "../src/domain/platforms/taobao-analysis";
import { taobaoRulePack } from "../src/domain/platforms/taobao";

const project = {
  id: "project_taobao",
  name: "淘宝商品",
  facts: {
    productName: "云感旅行颈枕",
    category: "旅行用品",
    brand: "Northwind",
    model: "NW-P01",
    sku: "P01-GRAY",
    targetAudience: "长途出行人群",
    description: "可折叠记忆棉颈枕",
    sellingPoints: ["慢回弹"],
    forbiddenClaims: ["治疗颈椎病"],
    specifications: { 材质: "记忆棉" },
  },
  createdAt: "2026-07-21T08:00:00.000Z",
  updatedAt: "2026-07-21T08:00:00.000Z",
};

describe("Taobao intake", () => {
  it("aligns analysis readiness with the PlatformWorkspace reference gate", () => {
    expect(
      taobaoAnalysisHasReference({ selectedReferenceCount: 0, pendingFileCount: 0 }),
    ).toBe(false);
    expect(
      taobaoAnalysisHasReference({ selectedReferenceCount: 1, pendingFileCount: 0 }),
    ).toBe(true);
    expect(
      taobaoAnalysisHasReference({ selectedReferenceCount: 0, pendingFileCount: 2 }),
    ).toBe(true);
  });

  it("offers a library exit when no product is loaded", () => {
    const markup = renderToStaticMarkup(createElement(TaobaoIntake, {
      activeProject: null,
      assets: [],
      loading: false,
      error: null,
      onAnalyze: async () => undefined,
      onOpenLibrary: () => undefined,
    }));

    expect(markup).toContain("先选择商品资料");
    expect(markup).toContain("打开资料库");
  });

  it("renders product text, image input, existing references, and a Taobao analysis action", () => {
    const markup = renderToStaticMarkup(createElement(TaobaoIntake, {
      activeProject: project,
      assets: [{
        metadata: {
          id: "asset_front",
          projectId: project.id,
          name: "正面图.png",
          kind: "reference" as const,
          role: "reference",
          tags: [],
          mimeType: "image/png",
          size: 128,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        objectUrl: "blob:test/front",
      }],
      loading: false,
      error: null,
      onAnalyze: async () => undefined,
    }));

    expect(markup).toContain("淘宝商品资料");
    expect(markup).toContain('aria-label="淘宝分析图片"');
    expect(markup).toContain("正面图.png");
    expect(markup).toContain("分析并策划");
    expect(markup).toContain("不会自动修改资料库");
    expect(markup).toContain("载入资料库");
    expect(markup).toContain("手动填写");
    expect(markup).toContain("云感旅行颈枕");
    expect(markup).not.toContain("Amazon Listing");
  });

  it("blocks analysis without a reference image and explains the shared planning gate", () => {
    const markup = renderToStaticMarkup(createElement(TaobaoIntake, {
      activeProject: project,
      assets: [],
      loading: false,
      error: null,
      onAnalyze: async () => undefined,
      onOpenLibrary: () => undefined,
    }));

    expect(markup).toContain("淘宝策划需要至少一张参考图");
    expect(markup).toContain("打开资料库");
    expect(markup).toContain("disabled");
    expect(markup).toContain("与后续策划一致");
  });

  it("shows explainable analysis fields, missing facts, and forbidden-claim warnings", () => {
    const markup = renderToStaticMarkup(createElement(TaobaoAnalysisSummary, {
      analysis: {
        suggestedProductName: "云感旅行颈枕",
        sellingPoints: ["慢回弹"],
        specifications: { 材质: "记忆棉" },
        forbiddenClaims: ["治疗颈椎病"],
        referenceAssets: [{ id: "asset_front", name: "正面图.png" }],
        citations: [{ field: "productName", value: "云感旅行颈枕", source: "shared-product" }],
        missingFacts: ["目标人群"],
        warnings: ["禁用声明不得进入文案"],
      },
      onReanalyze: () => undefined,
    }));

    expect(markup).toContain("商品分析结果");
    expect(markup).toContain("可用卖点");
    expect(markup).toContain("规格参数");
    expect(markup).toContain("禁用声明");
    expect(markup).toContain("待补资料：目标人群");
    expect(markup).toContain("禁用声明不得进入文案");
    expect(markup).toContain("来源记录 · 1");
    expect(markup).toContain("共享商品");
    expect(markup).toContain("重新分析");
  });

  it("presents the fixed five-gallery plus seven-detail planning contract", () => {
    const markup = renderToStaticMarkup(createElement(PlatformWorkspace, {
      platform: "taobao",
      activeProject: project,
      assets: [{
        metadata: {
          id: "asset_front",
          projectId: project.id,
          name: "正面图.png",
          kind: "reference" as const,
          role: "reference",
          tags: [],
          mimeType: "image/png",
          size: 128,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        objectUrl: "blob:test/front",
      }],
      productionSession: {
        id: "session_taobao",
        projectId: project.id,
        platformId: "taobao",
        workflowId: "taobao-product",
        sourceInput: { listingText: "" },
        options: { platformId: "taobao" },
        selectedReferenceAssetIds: ["asset_front"],
        taobaoAnalysis: {
          suggestedProductName: project.facts.productName,
          sellingPoints: project.facts.sellingPoints,
          specifications: project.facts.specifications,
          forbiddenClaims: project.facts.forbiddenClaims,
          referenceAssets: [{ id: "asset_front", name: "正面图.png" }],
          citations: [],
          missingFacts: [],
          warnings: [],
        },
        slotVersions: {},
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      loading: false,
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
    }));

    expect(markup).toContain("固定图组");
    expect(markup).toContain("AI 策划");
    expect(markup).toContain("淘宝 / 天猫");
    expect(markup).not.toContain("Listing / A+");
  });

  it("checks slot copy against forbidden claims owned by the Taobao session", () => {
    const analysis = {
      suggestedProductName: project.facts.productName,
      sellingPoints: project.facts.sellingPoints,
      specifications: project.facts.specifications,
      forbiddenClaims: [...project.facts.forbiddenClaims, "治疗失眠"],
      referenceAssets: [],
      citations: [],
      missingFacts: [],
      warnings: [],
    };
    const effectiveFacts = applyTaobaoAnalysisToFacts(project.facts, analysis);
    const plan = {
      platformId: "taobao" as const,
      source: "demo" as const,
      slots: taobaoRulePack.slots.map((rule) => ({
        slotKey: rule.key,
        visibleCopy: rule.key === "TB-HERO-02" ? "治疗失眠" : "",
        strategy: rule.purpose,
        evidence: ["淘宝分析输入"],
        prompt: rule.purpose,
        negativePrompt: "不得虚构功效",
      })),
    };
    const session = {
      id: "session_compliance",
      projectId: project.id,
      platformId: "taobao" as const,
      workflowId: "taobao-product" as const,
      sourceInput: { listingText: "" },
      options: { platformId: "taobao" as const },
      selectedReferenceAssetIds: [],
      taobaoAnalysis: analysis,
      plan,
      planInputSignature: createPlanningInputSignature(effectiveFacts, []),
      selectedSlotKey: "TB-HERO-02",
      slotVersions: {},
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const markup = renderToStaticMarkup(createElement(PlatformWorkspace, {
      platform: "taobao",
      activeProject: { ...project, facts: { ...project.facts, forbiddenClaims: [] } },
      assets: [],
      productionSession: session,
      plan,
      planInputSignature: session.planInputSignature,
      selectedSlotKey: session.selectedSlotKey,
      loading: false,
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
    }));

    expect(markup).toContain("槽位内容使用了项目明确禁止的宣称");
    expect(markup).toContain("治疗失眠");
  });
});
