import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import type {
  PlannerEngine,
  PlanningReferenceImage,
  PlatformPlan,
} from "../src/domain/planning/types";
import { isPlanningInputCurrent } from "../src/domain/planning/input-signature";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { demoPlanner } from "../src/services/demo-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

const productFacts: ProductFacts = {
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

function createDependencies(plannerEngine: PlannerEngine = demoPlanner) {
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-17T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository(),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    }),
    plannerEngine,
    planningTimeoutMs: 1_000,
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => undefined,
  };
}

describe("workbench planning state", () => {
  it("keeps Listing and A+ plans independently switchable after reload", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "Amazon 双模式", facts: productFacts });

    const listing = await store.getState().planPlatform("amazon", {
      plannerMode: "listing",
      listingImageCount: 7,
    });
    await store.getState().selectPlannedSlot("amazon", "PT03");
    await store.getState().updatePlannedSlot("amazon", "PT03", {
      visibleCopy: "Saved listing copy",
      prompt: "Saved listing prompt",
    });
    const aplus = await store.getState().planPlatform("amazon", {
      plannerMode: "aplus",
    });

    type ModeAwareState = ReturnType<typeof store.getState> & {
      amazonWorkspaces: Partial<
        Record<
          "listing" | "aplus",
          { plan: PlatformPlan; planInputSignature?: string; selectedSlotKey?: string }
        >
      >;
      selectAmazonPlannerMode(mode: "listing" | "aplus"): Promise<boolean>;
    };
    const modeState = store.getState() as ModeAwareState;
    expect(modeState.amazonWorkspaces.listing?.plan.slots).toHaveLength(7);
    expect(modeState.amazonWorkspaces.aplus?.plan.slots).toHaveLength(5);
    expect(modeState.plans.amazon).toEqual(aplus);

    expect(await modeState.selectAmazonPlannerMode("listing")).toBe(true);
    expect(store.getState().plans.amazon?.amazonSession?.plannerMode).toBe("listing");
    expect(store.getState().selectedSlotKeys.amazon).toBe("PT03");
    expect(store.getState().plans.amazon?.slots.find((slot) => slot.slotKey === "PT03")).toMatchObject({
      visibleCopy: "Saved listing copy",
      prompt: "Saved listing prompt",
    });

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    const restoredModeState = restoredStore.getState() as ModeAwareState;
    expect(restoredModeState.plans.amazon?.amazonSession?.plannerMode).toBe("listing");
    expect(await restoredModeState.selectAmazonPlannerMode("aplus")).toBe(true);
    expect(restoredStore.getState().plans.amazon?.amazonSession?.plannerMode).toBe("aplus");
    expect(restoredStore.getState().plans.amazon?.slots).toHaveLength(5);
    expect(listing?.amazonSession?.plannerMode).toBe("listing");
  });

  it("plans the active project, selects the first slot, and restores the plan", async () => {
    const dependencies = createDependencies();
    const firstStore = createWorkbenchStore(dependencies);
    await firstStore.getState().createProject({ name: "Amazon 上新", facts: productFacts });

    const plan = await firstStore.getState().planPlatform("amazon");

    expect(plan?.slots).toHaveLength(15);
    expect(firstStore.getState()).toMatchObject({
      planningPlatformId: null,
      planningError: null,
      selectedSlotKeys: { amazon: "MAIN" },
    });
    expect(firstStore.getState().plans.amazon).toEqual(plan);
    expect(
      isPlanningInputCurrent(
        firstStore.getState().planInputSignatures.amazon,
        productFacts,
        firstStore.getState().assets.map((asset) => asset.metadata),
      ),
    ).toBe(true);

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().plans.amazon).toEqual(plan);
    expect(restoredStore.getState().planInputSignatures.amazon).toBe(
      firstStore.getState().planInputSignatures.amazon,
    );
    expect(restoredStore.getState().selectedSlotKeys.amazon).toBe("MAIN");
  });

  it("passes stored reference images to the planning engine", async () => {
    let receivedReferenceImages: readonly PlanningReferenceImage[] | undefined;
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal, referenceImages) {
        receivedReferenceImages = referenceImages;
        return demoPlanner.plan(project, rulePack, signal);
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    await store.getState().createProject({ name: "参考图策划", facts: productFacts });
    await store
      .getState()
      .uploadReferenceFiles([new File(["reference-bytes"], "front.png", { type: "image/png" })]);

    await store.getState().planPlatform("amazon");

    expect(receivedReferenceImages).toHaveLength(1);
    expect(receivedReferenceImages?.[0]).toMatchObject({
      name: "front.png",
      mimeType: "image/png",
    });
    await expect(receivedReferenceImages?.[0]?.blob.text()).resolves.toBe("reference-bytes");
  });

  it("passes only the session-selected product images to the planner", async () => {
    let receivedReferenceImages: readonly PlanningReferenceImage[] | undefined;
    const planner: PlannerEngine = {
      async plan(...args) {
        receivedReferenceImages = args[3];
        return demoPlanner.plan(...args);
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    const project = await store.getState().createProject({ name: "勾选参考图", facts: productFacts });
    const uploaded = await store.getState().uploadReferenceFiles([
      new File(["selected"], "selected.png", { type: "image/png" }),
      new File(["unused"], "unused.png", { type: "image/png" }),
    ]);

    const session = await store.getState().startAmazonSession({
      projectId: project!.id,
      sourceMode: "library",
      workflowId: "amazon-listing",
      listingText: "Title: Selected Image Product\n- Verified benefit",
      files: [],
      selectedReferenceAssetIds: [uploaded[0]!.metadata.id],
      options: { plannerMode: "listing", listingImageCount: 7, sizeTier: "2K" },
    });

    expect(session?.selectedReferenceAssetIds).toEqual([uploaded[0]!.metadata.id]);
    expect(receivedReferenceImages?.map((image) => image.name)).toEqual(["selected.png"]);
  });

  it("blocks editing, generation, Copilot, and export when the saved plan uses old inputs", async () => {
    const store = createWorkbenchStore(createDependencies());
    await store.getState().createProject({ name: "输入版本保护", facts: productFacts });
    await store.getState().planPlatform("amazon");
    await store.getState().updateActiveProject({
      facts: { description: "保存后的新商品描述" },
    });

    const currentProject = store.getState().activeProject!;
    expect(
      isPlanningInputCurrent(
        store.getState().planInputSignatures.amazon,
        currentProject.facts,
        store.getState().assets.map((asset) => asset.metadata),
      ),
    ).toBe(false);

    expect(
      await store.getState().updatePlannedSlot("amazon", "PT01", {
        visibleCopy: "不应保存",
        prompt: "不应保存的旧策划草稿",
      }),
    ).toBe(false);
    expect(store.getState().planningError).toContain("重新策划");

    expect(await store.getState().generateSlot("amazon", "PT01")).toBeNull();
    expect(store.getState().generationError).toContain("重新策划");

    expect(await store.getState().runCopilotCommand("amazon", "PT01", "explain-next")).toBe(
      false,
    );
    expect(store.getState().copilotError).toContain("重新策划");

    expect(await store.getState().exportPlatform("amazon")).toBeNull();
    expect(store.getState().exportError).toContain("重新策划");
  });

  it("updates and persists only the selected slot draft", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "淘宝上新", facts: productFacts });
    const plan = await store.getState().planPlatform("taobao");
    const untouchedPrompt = plan!.slots[1].prompt;

    const saved = await store.getState().updatePlannedSlot("taobao", "TB-HERO-01", {
      visibleCopy: "轻装出发",
      prompt: "用户确认后的主图提示词",
    });

    expect(saved).toBe(true);
    expect(store.getState().plans.taobao?.slots[0]).toMatchObject({
      visibleCopy: "轻装出发",
      prompt: "用户确认后的主图提示词",
    });
    expect(store.getState().plans.taobao?.slots[1].prompt).toBe(untouchedPrompt);

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().plans.taobao?.slots[0].visibleCopy).toBe("轻装出发");
  });

  it("persists a slot selection even when the draft is not edited", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "选择槽位", facts: productFacts });
    await store.getState().planPlatform("amazon");

    await store.getState().selectPlannedSlot("amazon", "PT03");

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().selectedSlotKeys.amazon).toBe("PT03");
  });

  it("blocks an old draft save while the same platform is being replanned", async () => {
    let callCount = 0;
    let releaseReplan!: (plan: PlatformPlan) => void;
    const pendingReplan = new Promise<PlatformPlan>((resolve) => {
      releaseReplan = resolve;
    });
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal) {
        callCount += 1;
        if (callCount === 1) return demoPlanner.plan(project, rulePack, signal);
        return pendingReplan;
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    await store.getState().createProject({ name: "重新策划", facts: productFacts });
    const previousPlan = await store.getState().planPlatform("amazon");

    const replan = store.getState().planPlatform("amazon");
    const saved = await store.getState().updatePlannedSlot("amazon", "PT01", {
      visibleCopy: "Stale copy",
      prompt: "Stale prompt",
    });

    expect(saved).toBe(false);
    expect(store.getState().plans.amazon).toEqual(previousPlan);

    const nextPlan = await demoPlanner.plan(
      { ...productFacts, sellingPoints: ["新的策划证据"] },
      (await import("../src/domain/platforms/amazon")).amazonRulePack,
      new AbortController().signal,
    );
    releaseReplan(nextPlan);
    await replan;
    expect(store.getState().plans.amazon?.slots[1].prompt).not.toBe("Stale prompt");
  });

  it("cancels an in-flight plan and ignores its late result", async () => {
    let release!: (plan: PlatformPlan) => void;
    let markPlannerStarted!: () => void;
    const plannerStarted = new Promise<void>((resolve) => {
      markPlannerStarted = resolve;
    });
    const receivedSignals: AbortSignal[] = [];
    const pendingPlan = new Promise<PlatformPlan>((resolve) => {
      release = resolve;
    });
    const planner: PlannerEngine = {
      plan(_project, rulePack, signal) {
        receivedSignals.push(signal);
        markPlannerStarted();
        return pendingPlan.then((plan) => ({ ...plan, platformId: rulePack.platformId }));
      },
    };
    const dependencies = createDependencies(planner);
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "可取消策划", facts: productFacts });

    const request = store.getState().planPlatform("amazon");
    await plannerStarted;
    expect(store.getState().planningPlatformId).toBe("amazon");
    store.getState().cancelPlanning();
    expect(receivedSignals[0]?.aborted).toBe(true);
    expect(store.getState()).toMatchObject({
      planningPlatformId: null,
      planningError: "已取消本次策划，商品资料和已有结果未受影响。",
    });

    release(await demoPlanner.plan(productFacts, (await import("../src/domain/platforms/amazon")).amazonRulePack, new AbortController().signal));
    await request;

    expect(store.getState().plans.amazon).toBeUndefined();
  });

  it("rolls back a plan canceled after workspace persistence starts", async () => {
    const baseWorkspaceRepository = createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    });
    let delayNextSave = false;
    let releaseDelayedSave!: () => void;
    let markSaveStarted!: () => void;
    let delayedSave = Promise.resolve();
    let saveStarted = Promise.resolve();
    const workspaceRepository = {
      load(projectId: string) {
        return baseWorkspaceRepository.load(projectId);
      },
      async save(document: Parameters<typeof baseWorkspaceRepository.save>[0]) {
        await baseWorkspaceRepository.save(document);
        if (!delayNextSave) return;
        delayNextSave = false;
        markSaveStarted();
        await delayedSave;
      },
    };
    let planningCallCount = 0;
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal) {
        planningCallCount += 1;
        const plan = await demoPlanner.plan(project, rulePack, signal);
        return planningCallCount === 1
          ? plan
          : {
              ...plan,
              slots: plan.slots.map((slot, index) =>
                index === 0 ? { ...slot, prompt: `CANCELED ${slot.prompt}` } : slot,
              ),
            };
      },
    };
    const dependencies = {
      ...createDependencies(planner),
      workspaceRepository,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "保存中取消策划", facts: productFacts });
    const previousPlan = await store.getState().planPlatform("amazon");

    saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    delayedSave = new Promise<void>((resolve) => {
      releaseDelayedSave = resolve;
    });
    delayNextSave = true;
    const replanning = store.getState().planPlatform("amazon");
    await saveStarted;
    store.getState().cancelPlanning();
    releaseDelayedSave();
    await replanning;

    const persisted = await baseWorkspaceRepository.load("project_01");
    expect(persisted.plans.amazon).toEqual(previousPlan);
    expect(persisted.taskHistory).toEqual([]);
    expect(persisted.runs).toHaveLength(1);
    expect(persisted.runs[0]?.events).toEqual([
      expect.objectContaining({ kind: "plan", status: "success" }),
    ]);
    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().plans.amazon).toEqual(previousPlan);
  });

  it("rolls back a plan that times out while workspace persistence is pending", async () => {
    const baseWorkspaceRepository = createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    });
    let releaseDelayedSave!: () => void;
    let markSaveStarted!: () => void;
    const delayedSave = new Promise<void>((resolve) => {
      releaseDelayedSave = resolve;
    });
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    let shouldDelaySave = true;
    const workspaceRepository = {
      load(projectId: string) {
        return baseWorkspaceRepository.load(projectId);
      },
      async save(document: Parameters<typeof baseWorkspaceRepository.save>[0]) {
        await baseWorkspaceRepository.save(document);
        if (!shouldDelaySave) return;
        shouldDelaySave = false;
        markSaveStarted();
        await delayedSave;
      },
    };
    let planningSignal!: AbortSignal;
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal) {
        planningSignal = signal;
        return demoPlanner.plan(project, rulePack, signal);
      },
    };
    const store = createWorkbenchStore({
      ...createDependencies(planner),
      workspaceRepository,
      planningTimeoutMs: 10,
    });
    await store.getState().createProject({ name: "保存中超时策划", facts: productFacts });

    const planning = store.getState().planPlatform("amazon");
    await saveStarted;
    await new Promise<void>((resolve) => {
      if (planningSignal.aborted) resolve();
      else planningSignal.addEventListener("abort", () => resolve(), { once: true });
    });
    releaseDelayedSave();
    await planning;

    const persisted = await baseWorkspaceRepository.load("project_01");
    expect(persisted.plans.amazon).toBeUndefined();
    expect(persisted.taskHistory).toEqual([]);
    expect(persisted.runs).toEqual([]);
    expect(store.getState().planningError).toContain("超时");
  });

  it("requires workspace recovery when a canceled plan cannot be rolled back", async () => {
    const baseWorkspaceRepository = createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    });
    let delayNextSave = false;
    let failNextSave = false;
    let releaseDelayedSave!: () => void;
    let markSaveStarted!: () => void;
    let delayedSave = Promise.resolve();
    let saveStarted = Promise.resolve();
    const workspaceRepository = {
      load(projectId: string) {
        return baseWorkspaceRepository.load(projectId);
      },
      async save(document: Parameters<typeof baseWorkspaceRepository.save>[0]) {
        if (failNextSave) {
          failNextSave = false;
          throw new Error("rollback unavailable");
        }
        await baseWorkspaceRepository.save(document);
        if (!delayNextSave) return;
        delayNextSave = false;
        markSaveStarted();
        await delayedSave;
        failNextSave = true;
      },
    };
    let planningCallCount = 0;
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal) {
        planningCallCount += 1;
        const plan = await demoPlanner.plan(project, rulePack, signal);
        return planningCallCount === 1
          ? plan
          : {
              ...plan,
              slots: plan.slots.map((slot, index) =>
                index === 0 ? { ...slot, prompt: `CANCELED ${slot.prompt}` } : slot,
              ),
            };
      },
    };
    const store = createWorkbenchStore({
      ...createDependencies(planner),
      workspaceRepository,
    });
    await store.getState().createProject({ name: "策划回滚失败", facts: productFacts });
    await store.getState().planPlatform("amazon");

    saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    delayedSave = new Promise<void>((resolve) => {
      releaseDelayedSave = resolve;
    });
    delayNextSave = true;
    const replanning = store.getState().planPlatform("amazon");
    await saveStarted;
    store.getState().cancelPlanning();
    releaseDelayedSave();
    await replanning;

    expect(store.getState()).toMatchObject({
      planningPlatformId: null,
      generationRecoveryRequired: true,
    });
    expect(store.getState().planningError).toContain("回滚失败");
    expect(store.getState().resourceRestoreError).toContain("重试恢复");
  });

  it("blocks a second platform plan while another platform plan is in flight", async () => {
    const amazonRulePack = (await import("../src/domain/platforms/amazon")).amazonRulePack;
    const taobaoRulePack = (await import("../src/domain/platforms/taobao")).taobaoRulePack;
    const amazonPlan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );
    const taobaoPlan = await demoPlanner.plan(
      productFacts,
      taobaoRulePack,
      new AbortController().signal,
    );
    const calls: Array<{ platformId: string; signal: AbortSignal }> = [];
    let releaseAmazon!: (plan: PlatformPlan) => void;
    let releaseTaobao: ((plan: PlatformPlan) => void) | undefined;
    const planner: PlannerEngine = {
      plan(_project, rulePack, signal) {
        calls.push({ platformId: rulePack.platformId, signal });
        return new Promise<PlatformPlan>((resolve) => {
          if (rulePack.platformId === "amazon") releaseAmazon = resolve;
          else releaseTaobao = resolve;
        });
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    await store.getState().createProject({ name: "跨平台策划锁", facts: productFacts });

    const amazonRequest = store.getState().planPlatform("amazon");
    const taobaoRequest = store.getState().planPlatform("taobao");
    await Promise.resolve();

    const observedCalls = calls.map((call) => call.platformId);
    const amazonWasAborted = calls[0]?.signal.aborted;
    const pendingPlatform = store.getState().planningPlatformId;
    const lockMessage = store.getState().planningError;

    releaseAmazon(amazonPlan);
    releaseTaobao?.(taobaoPlan);
    await Promise.all([amazonRequest, taobaoRequest]);

    expect(observedCalls).toEqual(["amazon"]);
    expect(amazonWasAborted).toBe(false);
    expect(pendingPlatform).toBe("amazon");
    expect(lockMessage).toContain("Amazon");
    expect(store.getState().plans.amazon).toEqual(amazonPlan);
    expect(store.getState().plans.taobao).toBeUndefined();
    expect(store.getState().taskHistory).toEqual([]);
    expect(store.getState().runs[0]?.events).toEqual([
      expect.objectContaining({ kind: "plan", status: "success" }),
    ]);
  });

  it("blocks product fact saves while planning is in flight", async () => {
    let release!: (plan: PlatformPlan) => void;
    const pendingPlan = new Promise<PlatformPlan>((resolve) => {
      release = resolve;
    });
    const planner: PlannerEngine = {
      plan() {
        return pendingPlan;
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    await store.getState().createProject({ name: "策划中锁定资料", facts: productFacts });

    const request = store.getState().planPlatform("amazon");
    const updated = await store.getState().updateActiveProject({
      facts: { description: "策划启动后修改的描述" },
    });

    expect(updated).toBeNull();
    expect(store.getState().activeProject?.facts.description).toBe(productFacts.description);
    expect(store.getState().error).toContain("策划");

    release(
      await demoPlanner.plan(
        productFacts,
        (await import("../src/domain/platforms/amazon")).amazonRulePack,
        new AbortController().signal,
      ),
    );
    await request;
  });

  it("keeps the previous plan when retry fails", async () => {
    let fail = false;
    const planner: PlannerEngine = {
      async plan(project, rulePack, signal) {
        if (fail) throw new Error("模型服务暂时不可用");
        return demoPlanner.plan(project, rulePack, signal);
      },
    };
    const store = createWorkbenchStore(createDependencies(planner));
    await store.getState().createProject({ name: "保留旧策划", facts: productFacts });
    const first = await store.getState().planPlatform("amazon");
    fail = true;

    const retried = await store.getState().planPlatform("amazon");

    expect(retried).toBeNull();
    expect(store.getState().plans.amazon).toEqual(first);
    expect(store.getState().planningError).toContain("模型服务暂时不可用");
    expect(store.getState().taskHistory).toEqual([]);
    expect(store.getState().runs).toHaveLength(1);
    expect(store.getState().runs[0]?.events).toEqual([
      expect.objectContaining({ kind: "plan", status: "success" }),
    ]);
  });

  it("persists and restores A+ external copy edits on the active session", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "A+ 外部文案", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-aplus",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "jp" },
    });

    expect(session?.plan?.slots.find((slot) => slot.slotKey === "A+S05")?.externalText).toEqual(
      expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
    );
    const saved = await store.getState().updatePlannedSlot("amazon", "A+S05", {
      visibleCopy: "",
      prompt: session?.plan?.slots.find((slot) => slot.slotKey === "A+S05")?.prompt ?? "",
      externalText: { title: "确认的利点", body: "洗濯できるカバー。" },
    });
    expect(saved).toBe(true);

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    const restoredSlot = restoredStore
      .getState()
      .plans.amazon?.slots.find((slot) => slot.slotKey === "A+S05");
    const restoredSessionSlot = restoredStore
      .getState()
      .sessions.find((item) => item.id === session?.id)
      ?.plan?.slots.find((slot) => slot.slotKey === "A+S05");

    expect(restoredSlot?.externalText).toEqual({ title: "确认的利点", body: "洗濯できるカバー。" });
    expect(restoredSessionSlot?.externalText).toEqual(restoredSlot?.externalText);
    expect(restoredSlot?.prompt).not.toContain("确认的利点");
  });
});
