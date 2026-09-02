import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { analyzeTaobaoProduct } from "../src/domain/platforms/taobao-analysis";
import { mockPlanner } from "./fixtures/mock-planner";
import { mockImageGenerator } from "./fixtures/mock-ai";
import { createWorkbenchStore } from "../src/store/workbench-store";

const facts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹"],
  forbiddenClaims: ["治疗颈椎病"],
  specifications: { material: "记忆棉" },
};

function dependencies() {
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_taobao",
      now: () => "2026-07-21T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository(),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-21T08:00:00.000Z",
    }),
    plannerEngine: mockPlanner,
    imageGenerator: mockImageGenerator,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:test/reference",
    revokeObjectURL: () => undefined,
    now: () => "2026-07-21T08:01:00.000Z",
  };
}

describe("Taobao product workflow", () => {
  it("analyzes current task facts and product input with citations without mutating the input", () => {
    const original = structuredClone(facts);
    const analysis = analyzeTaobaoProduct({
      facts,
      productText: "商品名：云感旅行颈枕 Pro\n卖点：可折叠收纳\n规格：尺寸：28 x 25 x 12 cm\n禁用声明：治疗失眠",
      referenceAssets: [{ id: "asset_front", name: "正面图.png" }],
    });

    expect(analysis).toMatchObject({
      suggestedProductName: "云感旅行颈枕 Pro",
      sellingPoints: ["慢回弹", "可折叠收纳"],
      specifications: {
        material: "记忆棉",
        尺寸: "28 x 25 x 12 cm",
      },
      forbiddenClaims: ["治疗颈椎病", "治疗失眠"],
      referenceAssets: [{ id: "asset_front", name: "正面图.png" }],
    });
    expect(analysis.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "productName", source: "analysis-input" }),
      expect.objectContaining({ field: "material", source: "platform-task" }),
      expect.objectContaining({ field: "referenceAssets", source: "reference-asset" }),
    ]));
    expect(facts).toEqual(original);
  });

  it("starts an independent Taobao task with its own facts and no production run", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();

    const session = await store.getState().startTaobaoSession({
      facts,
      productText: "",
      selectedReferenceAssetIds: [],
    });

    expect(session).toMatchObject({
      projectId: "project_taobao",
      platformId: "taobao",
      workflowId: "taobao-product",
      options: { platformId: "taobao" },
      sourceInput: { listingText: "" },
    });
    expect(store.getState().sessions).toEqual([session]);
    expect(store.getState().runs).toEqual([]);
    expect(store.getState().activeProject).toMatchObject({
      id: "project_taobao",
      platformId: "taobao",
      facts,
    });

    const restored = createWorkbenchStore(deps);
    await restored.getState().initialize();
    expect(restored.getState().sessions).toMatchObject([
      { id: session?.id, platformId: "taobao", workflowId: "taobao-product" },
    ]);
    expect(restored.getState().runs).toEqual([]);
  });

  it("stores first-step facts and files only in the current Taobao task", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();

    const session = await store.getState().analyzeTaobaoProduct({
      facts,
      productText: "商品名：旅行颈枕 Pro\n卖点：可折叠收纳",
      files: [new File([new Uint8Array([1, 2, 3])], "正面图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
      stylePresetId: "soft-lifestyle",
    });
    const referenceId = session?.selectedReferenceAssetIds[0];

    expect(session?.sourceInput.taobaoProduct).toEqual({
      productText: "商品名：旅行颈枕 Pro\n卖点：可折叠收纳",
      selectedReferenceAssetIds: [referenceId],
    });
    expect(session?.taobaoAnalysis).toMatchObject({
      suggestedProductName: "旅行颈枕 Pro",
      sellingPoints: ["慢回弹", "可折叠收纳"],
    });
    expect(session?.options).toEqual({
      platformId: "taobao",
      stylePresetId: "soft-lifestyle",
    });
    expect(store.getState().activeProject).toMatchObject({
      platformId: "taobao",
      facts: {
        productName: "旅行颈枕 Pro",
        sellingPoints: ["慢回弹", "可折叠收纳"],
      },
    });
    // Analysis now continues into planning (Amazon-like one-shot entry).
    expect(store.getState().plans.taobao?.slots).toHaveLength(12);
    expect(store.getState().plans.taobao?.slots[0]?.visibleCopy).toBe("旅行颈枕 Pro");
    expect(store.getState().runs).toHaveLength(1);

    const restored = createWorkbenchStore(deps);
    await restored.getState().initialize();
    expect(restored.getState().sessions[0]?.taobaoAnalysis?.suggestedProductName).toBe(
      "旅行颈枕 Pro",
    );
    expect(restored.getState().sessions[0]?.options).toEqual({
      platformId: "taobao",
      stylePresetId: "soft-lifestyle",
    });
    expect(restored.getState().plans.taobao?.slots).toHaveLength(12);
    expect(store.getState().sessions[0]?.taobaoAnalysis?.suggestedProductName).toBe(
      "旅行颈枕 Pro",
    );
    expect(store.getState().runs[0]?.contextSnapshot.taobaoAnalysis?.suggestedProductName).toBe(
      "旅行颈枕 Pro",
    );
  });

  it("persists edited facts to the current Taobao task", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    await store.getState().startTaobaoSession({
      facts,
      productText: "商品名：初始淘宝任务",
      selectedReferenceAssetIds: [],
    });
    const editedFacts = { ...facts, productName: "编辑后的淘宝任务" };
    await store.getState().startTaobaoSession({
      facts: editedFacts,
      productText: "商品名：编辑后的淘宝任务",
      selectedReferenceAssetIds: [],
    });

    expect((await deps.projectRepository.get("project_taobao"))?.facts.productName).toBe(
      "编辑后的淘宝任务",
    );
  });

  it("accepts a new reference file from the one-shot analysis and planning form", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();

    const session = await store.getState().analyzeTaobaoProduct({
      facts,
      productText: "商品名：旅行颈枕 Pro\n卖点：可折叠收纳",
      files: [new File([new Uint8Array([1, 2, 3])], "本次分析图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
    });

    expect(session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds).toHaveLength(1);
    expect(session?.taobaoAnalysis?.referenceAssets).toEqual([
      expect.objectContaining({ name: "本次分析图.png" }),
    ]);
    expect(store.getState().plans.taobao?.slots).toHaveLength(12);
    expect(store.getState().planningError).toBeNull();
  });

  it("rejects Taobao reference count and bytes before creating a draft or calling the planner", async () => {
    const deps = dependencies();
    let plannerCalls = 0;
    const store = createWorkbenchStore({
      ...deps,
      plannerEngine: {
        async plan(...args) {
          plannerCalls += 1;
          return mockPlanner.plan(...args);
        },
      },
    });
    await store.getState().initialize();
    const input = {
      sourceMode: "manual" as const,
      productText: "商品名：旅行颈枕",
      selectedReferenceAssetIds: [],
    };

    await expect(store.getState().analyzeTaobaoProduct({
      ...input,
      files: Array.from(
        { length: 17 },
        (_, index) => new File(["x"], `ref-${index}.png`, { type: "image/png" }),
      ),
    })).resolves.toBeNull();
    expect(store.getState().planningError).toContain("最多 16 张");

    await expect(store.getState().analyzeTaobaoProduct({
      ...input,
      files: [new File([new Uint8Array(8 * 1024 * 1024 + 1)], "too-large.png", {
        type: "image/png",
      })],
    })).resolves.toBeNull();
    expect(store.getState().planningError).toContain("超过 8 MiB");
    expect(plannerCalls).toBe(0);
    expect(await deps.projectRepository.list()).toEqual([]);
    expect(store.getState().sessions).toEqual([]);
  });

  it("starts from only a product image without inventing hidden product facts", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore({ ...deps, plannerEngine: mockPlanner });
    await store.getState().initialize();

    const session = await store.getState().analyzeTaobaoProduct({
      sourceMode: "manual",
      productText: "",
      files: [new File(["image-only"], "商品图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
    });

    expect(store.getState().activeProject).toMatchObject({
      id: "project_taobao",
      name: "淘宝草稿商品",
      facts: { productName: "", description: "", sellingPoints: [], specifications: {} },
    });
    expect(session).toMatchObject({
      projectId: "project_taobao",
      planningInput: {
        sourceMode: "manual",
        quality: "image-only",
        missingFacts: ["商品名称", "可验证卖点或商品描述"],
        productText: "",
        selectedReferenceAssetIds: [expect.any(String)],
      },
      taobaoAnalysis: {
        suggestedProductName: "",
        sellingPoints: [],
        specifications: {},
      },
      plan: { platformId: "taobao" },
    });
    expect(store.getState().runs[0]?.contextSnapshot.planningInput).toEqual(
      session?.planningInput,
    );
  });

  it("reopens Taobao intake without dropping selected references", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    const session = await store.getState().analyzeTaobaoProduct({
      facts,
      productText: "商品名：旅行颈枕 Pro",
      files: [new File([new Uint8Array([1, 2, 3])], "正面图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
    });
    const referenceId = session?.selectedReferenceAssetIds[0];
    expect(session?.plan?.slots).toHaveLength(12);

    expect(await store.getState().reopenTaobaoAnalysis(session!.id)).toBe(true);
    const reopened = store.getState().sessions.find((candidate) => candidate.id === session!.id);
    expect(reopened?.taobaoAnalysis).toBeUndefined();
    expect(reopened?.sourceInput.taobaoProduct).toEqual({
      productText: "商品名：旅行颈枕 Pro",
      selectedReferenceAssetIds: [referenceId],
    });
    // Prior plan remains queryable until the next analysis+plan cycle overwrites it.
    expect(reopened?.plan?.slots).toHaveLength(12);
  });

  it("selects and generates a Taobao slot through the active taobao-product session", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    await store.getState().analyzeTaobaoProduct({
      facts,
      productText: "卖点：可折叠收纳",
      files: [new File([new Uint8Array([1, 2, 3])], "正面图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
    });
    const session = store.getState().sessions.find((candidate) => candidate.workflowId === "taobao-product")!;
    expect(session.plan?.slots).toHaveLength(12);

    expect(await store.getState().selectSessionSlot(session.id, "TB-HERO-02")).toBe(true);
    const version = await store.getState().generateSessionSlot(session.id, "TB-HERO-02");

    expect(version).toMatchObject({ slotKey: "TB-HERO-02", width: 1024, height: 1024 });
    expect(store.getState().sessions.find((candidate) => candidate.id === session.id)?.slotVersions["TB-HERO-02"])
      .toMatchObject({ activeVersionId: version?.id, versions: [version] });
    expect(store.getState().runs.find((run) => run.id === session.activeRunId)?.events.at(-1))
      .toMatchObject({ kind: "generate", status: "success", slotKey: "TB-HERO-02" });

    const originalPrompt = store.getState().plans.taobao?.slots.find((slot) => slot.slotKey === "TB-HERO-02")?.prompt;
    expect(await store.getState().updatePlannedSlot("taobao", "TB-HERO-02", {
      visibleCopy: "可折叠收纳",
      prompt: `${originalPrompt} 使用更清楚的收纳结构近景。`,
    })).toBe(true);
    const second = await store.getState().generateSessionSlot(session.id, "TB-HERO-02");
    const versionsAfterRegenerate = store.getState().sessions
      .find((candidate) => candidate.id === session.id)?.slotVersions["TB-HERO-02"];
    expect(versionsAfterRegenerate?.versions).toHaveLength(2);
    expect(versionsAfterRegenerate?.versions[0]).toEqual(version);
    expect(versionsAfterRegenerate?.activeVersionId).toBe(second?.id);

    expect(await store.getState().activateSlotVersion("taobao", "TB-HERO-02", version!.id)).toBe(true);
    expect(store.getState().sessions.find((candidate) => candidate.id === session.id)
      ?.slotVersions["TB-HERO-02"]?.activeVersionId).toBe(version?.id);

    const edited = await store.getState().generateMaskedVersion(
      session.id,
      "TB-HERO-02",
      version!.id,
      {
        blob: new Blob(["mask"], { type: "image/png" }),
        width: version!.width,
        height: version!.height,
        coverage: 0.2,
      },
      "只调整选区背景，保持商品结构不变。",
    );
    expect(edited).toMatchObject({
      slotKey: "TB-HERO-02",
      parameters: {
        operation: "edit",
        editPrompt: "只调整选区背景，保持商品结构不变。",
      },
    });
    expect(store.getState().sessions.find((candidate) => candidate.id === session.id)
      ?.slotVersions["TB-HERO-02"]?.versions).toHaveLength(3);
    expect(store.getState().runs.find((run) => run.id === session.activeRunId)?.events.at(-1))
      .toMatchObject({ kind: "edit", status: "success", slotKey: "TB-HERO-02" });

    const currentExport = await store.getState().exportPlatform("taobao");
    expect(currentExport?.manifest).toMatchObject({
      ready: false,
      run: { id: session.activeRunId, workflowId: "taobao-product" },
    });
    expect(currentExport?.manifest.slots).toHaveLength(12);
    expect(currentExport?.manifest.missingSlots).toHaveLength(11);

    const historyExport = await store.getState().exportRun(session.activeRunId!);
    expect(historyExport?.manifest.run?.id).toBe(session.activeRunId);
    expect(historyExport?.manifest.missingSlots).toEqual(currentExport?.manifest.missingSlots);
  });

  it("exports a complete Taobao package after all fixed 5+7 slots have current versions", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().initialize();
    await store.getState().analyzeTaobaoProduct({
      facts,
      productText: "卖点：慢回弹、可折叠收纳",
      files: [new File([new Uint8Array([1, 2, 3])], "正面图.png", { type: "image/png" })],
      selectedReferenceAssetIds: [],
    });
    const plan = store.getState().plans.taobao;
    const session = store.getState().sessions.find((candidate) => candidate.workflowId === "taobao-product")!;
    for (const slot of plan!.slots) {
      expect(await store.getState().generateSessionSlot(session.id, slot.slotKey)).not.toBeNull();
    }

    const exported = await store.getState().exportPlatform("taobao");
    expect(exported?.manifest.ready).toBe(true);
    expect(exported?.manifest.missingSlots).toEqual([]);
    expect(exported?.manifest.slots.map((slot) => slot.fileName)).toEqual([
      "taobao/01-TB-HERO-01.svg",
      "taobao/02-TB-HERO-02.svg",
      "taobao/03-TB-HERO-03.svg",
      "taobao/04-TB-HERO-04.svg",
      "taobao/05-TB-HERO-05.svg",
      "taobao/06-TB-DETAIL-01.svg",
      "taobao/07-TB-DETAIL-02.svg",
      "taobao/08-TB-DETAIL-03.svg",
      "taobao/09-TB-DETAIL-04.svg",
      "taobao/10-TB-DETAIL-05.svg",
      "taobao/11-TB-DETAIL-06.svg",
      "taobao/12-TB-DETAIL-07.svg",
    ]);
  });
});
