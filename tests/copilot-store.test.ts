import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoCopilot } from "../src/services/demo-copilot";
import type { CopilotEngine } from "../src/domain/copilot";
import { demoImageGenerator } from "../src/services/demo-image-generator";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

const productFacts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "TP-01",
  sku: "TP-01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉颈枕",
  sellingPoints: ["慢回弹承托", "可拆洗外套"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉" },
};

function dependencies(copilotEngine: CopilotEngine = demoCopilot) {
  return {
    projectRepository: createMemoryProjectRepository({ createId: () => "project_01" }),
    assetRepository: createMemoryAssetRepository(),
    workspaceRepository: createMemoryWorkspaceRepository(),
    plannerEngine: demoPlanner,
    imageGenerator: demoImageGenerator,
    copilotEngine,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:asset",
    revokeObjectURL: () => undefined,
  };
}

describe("workbench Copilot", () => {
  it("updates and restores only the selected slot", async () => {
    const deps = dependencies({
      async adjust(context) {
        return {
          visibleCopy: `${context.slot.visibleCopy} refined`,
          prompt: `${context.slot.prompt} Verified evidence added.`,
        };
      },
    });
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "Copilot 项目", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const previousPt01 = structuredClone(store.getState().plans.amazon!.slots[1]);
    const previousPt02 = structuredClone(store.getState().plans.amazon!.slots[2]);

    const adjusted = await store
      .getState()
      .runCopilotCommand("amazon", "PT01", "strengthen-evidence");

    expect(adjusted).toBe(true);
    expect(store.getState().plans.amazon!.slots[1].prompt).not.toBe(previousPt01.prompt);
    expect(store.getState().plans.amazon!.slots[2]).toEqual(previousPt02);
    expect(store.getState().copilotMessage).toContain("PT01");

    const restored = createWorkbenchStore(deps);
    await restored.getState().initialize();
    expect(restored.getState().plans.amazon!.slots[1]).toEqual(
      store.getState().plans.amazon!.slots[1],
    );
  });

  it("returns read-only Copilot advice without changing the selected slot", async () => {
    const deps = dependencies();
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "Copilot 建议", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const previous = structuredClone(store.getState().plans.amazon!.slots[1]);

    const checked = await store
      .getState()
      .runCopilotCommand("amazon", "PT01", "check-compliance");

    expect(checked).toBe(true);
    expect(store.getState().plans.amazon!.slots[1]).toEqual(previous);
    expect(store.getState().copilotMessage).toContain("AI 建议");
    expect(store.getState().copilotMessage).toContain("人工复核");
  });

  it("sends Taobao session analysis facts to Copilot", async () => {
    const deps = dependencies({
      async adjust(context) {
        return { message: context.project.facts.forbiddenClaims.join("、") };
      },
    });
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "淘宝 Copilot", facts: productFacts });
    const [asset] = await store.getState().uploadReferenceFiles([
      new File([new Uint8Array([1, 2, 3])], "正面图.png", { type: "image/png" }),
    ]);
    await store.getState().analyzeTaobaoProduct({
      productText: "禁用声明：治疗失眠",
      files: [],
      selectedReferenceAssetIds: [asset.metadata.id],
    });

    expect(
      await store.getState().runCopilotCommand("taobao", "TB-HERO-02", "check-compliance"),
    ).toBe(true);
    expect(store.getState().copilotMessage).toContain("治疗失眠");
  });

  it("keeps the original slot and blocks generation while Copilot is pending or canceled", async () => {
    const deps = dependencies({
      adjust(_context, _command, signal) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "取消 Copilot", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const previous = structuredClone(store.getState().plans.amazon!.slots[1]);

    const adjustment = store
      .getState()
      .runCopilotCommand("amazon", "PT01", "shorten-copy");
    expect(store.getState().copilotTarget).toEqual({ platformId: "amazon", slotKey: "PT01" });
    expect(await store.getState().generateSlot("amazon", "PT01")).toBeNull();
    expect(await store.getState().planPlatform("taobao")).toBeNull();
    expect(store.getState().planningError).toContain("Copilot");
    expect(
      await store.getState().uploadReferenceFiles([
        new File(["image"], "during-copilot.png", { type: "image/png" }),
      ]),
    ).toEqual([]);
    expect(store.getState().error).toContain("Copilot");
    expect(
      await store.getState().updateActiveProject({
        facts: { description: "Copilot 运行期间的新描述" },
      }),
    ).toBeNull();
    expect(store.getState().activeProject?.facts.description).toBe(productFacts.description);
    expect(store.getState().error).toContain("Copilot");
    store.getState().cancelCopilot();

    expect(await adjustment).toBe(false);
    expect(store.getState().plans.amazon!.slots[1]).toEqual(previous);
    expect(store.getState().copilotError).toContain("取消");
  });

  it("rolls back a Copilot patch when cancellation happens during workspace save", async () => {
    const deps = dependencies({
      async adjust(context) {
        return {
          visibleCopy: `${context.slot.visibleCopy} changed`,
          prompt: `${context.slot.prompt} changed`,
        };
      },
    });
    const originalSave = deps.workspaceRepository.save.bind(deps.workspaceRepository);
    let releaseSave!: () => void;
    let markSaveStarted!: () => void;
    let firstPatchSave = true;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const holdSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    deps.workspaceRepository.save = async (document) => {
      const copy = document.plans.amazon?.slots.find((item) => item.slotKey === "PT01")?.visibleCopy;
      if (firstPatchSave && copy?.endsWith(" changed")) {
        firstPatchSave = false;
        markSaveStarted();
        await holdSave;
      }
      await originalSave(document);
    };
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "保存中取消", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const previous = structuredClone(store.getState().plans.amazon!.slots[1]);

    const adjustment = store
      .getState()
      .runCopilotCommand("amazon", "PT01", "shorten-copy");
    await saveStarted;
    store.getState().cancelCopilot();
    releaseSave();

    expect(await adjustment).toBe(false);
    expect(store.getState().copilotTarget).toBeNull();
    expect(store.getState().plans.amazon!.slots[1]).toEqual(previous);
    expect(
      (await deps.workspaceRepository.load("project_01")).plans.amazon!.slots[1],
    ).toEqual(previous);
  });

  it("does not claim the slot is unchanged when Copilot rollback fails", async () => {
    const deps = dependencies({
      async adjust(context) {
        return {
          visibleCopy: `${context.slot.visibleCopy} changed`,
          prompt: `${context.slot.prompt} changed`,
        };
      },
    });
    const originalSave = deps.workspaceRepository.save.bind(deps.workspaceRepository);
    let releaseSave!: () => void;
    let markSaveStarted!: () => void;
    let patchPersisted = false;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const holdSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    deps.workspaceRepository.save = async (document) => {
      const copy = document.plans.amazon?.slots.find((item) => item.slotKey === "PT01")?.visibleCopy;
      if (!patchPersisted && copy?.endsWith(" changed")) {
        markSaveStarted();
        await holdSave;
        await originalSave(document);
        patchPersisted = true;
        return;
      }
      if (patchPersisted) {
        throw new Error("回滚存储不可用");
      }
      await originalSave(document);
    };
    const store = createWorkbenchStore(deps);
    await store.getState().createProject({ name: "回滚失败", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const adjustment = store
      .getState()
      .runCopilotCommand("amazon", "PT01", "shorten-copy");
    await saveStarted;
    store.getState().cancelCopilot();
    releaseSave();

    expect(await adjustment).toBe(false);
    expect(store.getState().copilotError).toContain("工作区回滚失败");
    expect(store.getState().copilotError).toContain("槽位状态可能已经变化");
    expect(store.getState().copilotError).not.toContain("草稿未受影响");
    expect(store.getState().generationRecoveryRequired).toBe(true);
  });
});
