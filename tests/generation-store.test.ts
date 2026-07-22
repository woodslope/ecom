import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import type { GeneratedImage, ImageGenerationRequest, ImageGenerator } from "../src/domain/generation/types";
import type { MaskDraft } from "../src/domain/generation/mask";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import {
  createMemoryWorkspaceRepository,
  type ProjectWorkspaceRepository,
} from "../src/domain/workspace/project-workspace";
import { demoImageGenerator } from "../src/services/demo-image-generator";
import { demoPlanner } from "../src/services/demo-planner";
import {
  createWorkbenchStore,
  type WorkbenchStoreDependencies,
} from "../src/store/workbench-store";
import { getAmazonPrimaryAction, getAmazonStage } from "../src/domain/workspace/amazon-stage";

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

function createDependencies(
  imageGenerator: ImageGenerator = demoImageGenerator,
): WorkbenchStoreDependencies & { workspaceRepository: ProjectWorkspaceRepository } {
  const versionIds = ["version_01", "version_02", "version_03"];
  let objectUrlSequence = 0;
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-17T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository({
      createId: (() => {
        let sequence = 0;
        return () => `asset_${String(++sequence).padStart(2, "0")}`;
      })(),
      now: () => "2026-07-17T09:00:00.000Z",
    }),
    workspaceRepository: createMemoryWorkspaceRepository({
      now: () => "2026-07-17T09:00:00.000Z",
    }),
    plannerEngine: demoPlanner,
    imageGenerator,
    createVersionId: () => versionIds.shift()!,
    now: () => "2026-07-17T10:00:00.000Z",
    compressImageFile: async (file: File) => file,
    createObjectURL: () => `blob:generated/${++objectUrlSequence}`,
    revokeObjectURL: () => undefined,
  };
}

describe("workbench generation versions", () => {
  it("excludes hidden style from MAIN and appends it with guard for PT", async () => {
    const requests: ImageGenerationRequest[] = [];
    const generator: ImageGenerator = {
      async generate(request, signal) {
        requests.push(request);
        return demoImageGenerator.generate(request, signal);
      },
    };
    const dependencies = createDependencies(generator);
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "隐藏风格", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow\n- Slow rebound",
      files: [],
      selectedReferenceAssetIds: [],
      selectedStyleReferenceId: "preset:clean-retail",
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 session");

    await store.getState().generateSessionSlot(session.id, "MAIN");
    await store.getState().generateSessionSlot(session.id, "PT01");

    expect(requests[0]!.referenceImages.some((image) => image.kind === "style")).toBe(false);
    expect(requests[0]!.prompt).not.toContain("Style direction rule:");
    expect(requests[1]!.referenceImages.at(-1)?.kind).toBe("style");
    expect(requests[1]!.prompt).toContain("Style direction rule:");

    const styleId = store.getState().sessions.find((item) => item.id === session.id)?.selectedStyleReferenceId;
    expect(styleId).toBeTruthy();
    const aPlusSession = await store.getState().startAmazonSession({
      workflowId: "amazon-aplus",
      listingText: "Title: Cloud Neck Pillow\n- Slow rebound",
      files: [],
      selectedReferenceAssetIds: [],
      selectedStyleReferenceId: styleId,
      options: { plannerMode: "aplus", marketplaceId: "us", aPlusType: "standard-large" },
    });
    if (!aPlusSession?.plan?.slots[0]) throw new Error("预期创建 A+ session");
    await store.getState().generateSessionSlot(aPlusSession.id, aPlusSession.plan.slots[0].slotKey);
    expect(requests[2]!.referenceImages.at(-1)?.kind).toBe("style");
    expect(requests[2]!.prompt).toContain("Style direction rule:");

    await store.getState().removeAsset(styleId!);
    expect(store.getState().sessions.find((item) => item.id === session.id)).toMatchObject({
      selectedStyleReferenceId: undefined,
      styleReferenceNotice: "原风格板已删除，已降级为文本风格。",
    });
    const restored = createWorkbenchStore(dependencies);
    await restored.getState().initialize();
    expect(restored.getState().sessions.find((item) => item.id === session.id)?.styleReferenceNotice)
      .toContain("已降级为文本风格");
  });

  it("generates by session id and syncs the session stage without auto-advancing selection", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "Amazon session 生成", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");

    const version = await store.getState().generateSessionSlot(session.id, "MAIN");
    const currentSession = store.getState().sessions.find((item) => item.id === session.id)!;
    const activeRun = store.getState().runs.find((run) => run.id === currentSession.activeRunId)!;

    expect(version?.slotKey).toBe("MAIN");
    expect(currentSession.slotVersions.MAIN.activeVersionId).toBe(version?.id);
    expect(currentSession.planInputSignature).toBe(version?.planningInputSignature);
    expect(currentSession.selectedSlotKey).toBe("MAIN");
    expect(getAmazonStage(currentSession)).toBe("produce");
    expect(activeRun.status).toBe("producing");
    expect(activeRun.events.at(-1)).toMatchObject({
      runId: activeRun.id,
      kind: "generate",
      status: "success",
      slotKey: "MAIN",
      versionId: version?.id,
      assetId: version?.assetId,
    });
    expect(getAmazonPrimaryAction(currentSession)).toMatchObject({
      kind: "select",
      label: "继续下一槽位",
      slotKey: "PT01",
    });

    expect(await store.getState().selectSessionSlot(session.id, "PT01")).toBe(true);
    const selectedSession = store.getState().sessions.find((item) => item.id === session.id)!;
    expect(selectedSession.selectedSlotKey).toBe("PT01");
    expect(getAmazonPrimaryAction(selectedSession)).toMatchObject({
      kind: "generate",
      label: "生成当前图片",
      slotKey: "PT01",
    });

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(
      restoredStore.getState().sessions.find((item) => item.id === session.id)?.selectedSlotKey,
    ).toBe("PT01");
  });

  it("stores a generated Blob, appends an immutable version, and restores both", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "Amazon 生成", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const version = await store.getState().generateSlot("amazon", "PT01");

    expect(version).toMatchObject({
      id: "version_01",
      slotKey: "PT01",
      assetId: "asset_01",
      source: "demo",
      promptSnapshot: store.getState().plans.amazon?.slots[1].prompt,
      visibleCopySnapshot: store.getState().plans.amazon?.slots[1].visibleCopy,
      planningInputSignature: store.getState().planInputSignatures.amazon,
    });
    expect(store.getState().slotVersions.amazon?.PT01).toEqual({
      versions: [version],
      activeVersionId: "version_01",
    });
    expect(store.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({
          id: "asset_01",
          kind: "generated",
          role: "amazon:PT01",
        }),
        objectUrl: "blob:generated/1",
      },
    ]);
    expect((await dependencies.assetRepository.get("asset_01"))?.blob.type).toBe(
      "image/svg+xml",
    );

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().slotVersions.amazon?.PT01.activeVersionId).toBe(
      "version_01",
    );
    expect(
      restoredStore.getState().slotVersions.amazon?.PT01.versions[0].planningInputSignature,
    ).toBe(store.getState().planInputSignatures.amazon);
    expect(restoredStore.getState().assets[0].objectUrl).toBe("blob:generated/2");
  });

  it("regenerates by appending a version and can reactivate the first version", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "多版本", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");
    const first = await store.getState().generateSessionSlot(session.id, "PT01");
    await store.getState().updatePlannedSlot("amazon", "PT01", {
      visibleCopy: "Updated benefit",
      prompt: "Updated generation prompt",
    });

    const second = await store.getState().generateSessionSlot(session.id, "PT01");

    expect(store.getState().slotVersions.amazon?.PT01.versions).toEqual([first, second]);
    expect(store.getState().slotVersions.amazon?.PT01.activeVersionId).toBe("version_02");
    expect(first?.promptSnapshot).not.toBe(second?.promptSnapshot);

    const activated = await store
      .getState()
      .activateSlotVersion("amazon", "PT01", "version_01");
    expect(activated).toBe(true);
    expect(store.getState().slotVersions.amazon?.PT01.activeVersionId).toBe("version_01");
    const activeSession = store.getState().sessions.find(
      (session) => session.workflowId === "amazon-listing",
    );
    expect(activeSession?.slotVersions.PT01.activeVersionId).toBe("version_01");

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().slotVersions.amazon?.PT01.activeVersionId).toBe(
      "version_01",
    );
    expect(
      restoredStore.getState().sessions.find(
        (session) => session.workflowId === "amazon-listing",
      )?.slotVersions.PT01.activeVersionId,
    ).toBe("version_01");
  });

  it("keeps the previous active version and asset when regeneration fails", async () => {
    let fail = false;
    const generator: ImageGenerator = {
      async generate(request, signal): Promise<GeneratedImage> {
        if (fail) throw new Error("图片服务暂时不可用。");
        return demoImageGenerator.generate(request, signal);
      },
    };
    const dependencies = createDependencies(generator);
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "失败保留", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const first = await store.getState().generateSlot("amazon", "PT01");
    fail = true;

    const failed = await store.getState().generateSlot("amazon", "PT01");

    expect(failed).toBeNull();
    expect(store.getState().slotVersions.amazon?.PT01).toEqual({
      versions: [first],
      activeVersionId: "version_01",
    });
    expect(store.getState().assets).toHaveLength(1);
    expect(store.getState().generationError).toContain("图片服务暂时不可用");
    expect(store.getState().generationError).not.toContain("。。");
    expect(store.getState().generationErrorTarget).toEqual({
      platformId: "amazon",
      slotKey: "PT01",
    });
    expect(store.getState().taskHistory).toEqual([]);
    expect(store.getState().runs.at(-1)?.events).toEqual([
      expect.objectContaining({ kind: "plan", status: "success" }),
      expect.objectContaining({ kind: "generate", status: "success" }),
      expect.objectContaining({ kind: "generate", status: "failed" }),
    ]);
  });

  it("keeps one global generation owner and rejects a second slot without canceling the first", async () => {
    let release!: (image: GeneratedImage) => void;
    const receivedSignals: AbortSignal[] = [];
    const pending = new Promise<GeneratedImage>((resolve) => {
      release = resolve;
    });
    const generator: ImageGenerator = {
      generate(_request, signal) {
        receivedSignals.push(signal);
        return pending;
      },
    };
    const store = createWorkbenchStore(createDependencies(generator));
    await store.getState().createProject({ name: "单生成任务", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const firstRequest = store.getState().generateSlot("amazon", "PT01");
    // Wait until the first owner reaches ImageGenerator.generate (payload prep is async).
    for (let attempt = 0; attempt < 20 && receivedSignals.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    const secondRequest = store.getState().generateSlot("amazon", "PT02");
    await Promise.resolve();
    const signalCountBeforeRelease = receivedSignals.length;
    const firstSignalAbortedBeforeRelease = receivedSignals[0]?.aborted;

    release(
      await demoImageGenerator.generate(
        {
          projectId: "project_01",
          productName: productFacts.productName,
          platformId: "amazon",
          slotKey: "PT01",
          prompt: store.getState().plans.amazon!.slots[1].prompt,
          negativePrompt: store.getState().plans.amazon!.slots[1].negativePrompt,
          visibleCopy: store.getState().plans.amazon!.slots[1].visibleCopy,
          uploadDimensions: { width: 2000, height: 2000, unit: "px" },
  dimensions: { width: 2000, height: 2000, unit: "px" },
          referenceImages: [],
        },
        new AbortController().signal,
      ),
    );
    const firstVersion = await firstRequest;
    const secondVersion = await secondRequest;
    expect(secondVersion).toBeNull();
    expect(signalCountBeforeRelease).toBe(1);
    expect(firstSignalAbortedBeforeRelease).toBe(false);
    expect(firstVersion?.slotKey).toBe("PT01");
    expect(store.getState().slotVersions.amazon?.PT02).toBeUndefined();
  });

  it("clears a pending generation lock even when project switching fails", async () => {
    const generator: ImageGenerator = {
      generate(_request, signal) {
        return new Promise<GeneratedImage>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    };
    const store = createWorkbenchStore(createDependencies(generator));
    await store.getState().createProject({ name: "切换失败", facts: productFacts });
    await store.getState().planPlatform("amazon");
    void store.getState().generateSlot("amazon", "PT01");

    await store.getState().selectProject("missing_project");

    expect(store.getState().generatingSlot).toBeNull();
    expect(store.getState().error).toContain("不存在");
  });

  it("does not commit a timed-out result when asset persistence resolves late", async () => {
    const dependencies = createDependencies();
    dependencies.generationTimeoutMs = 5;
    const originalPut = dependencies.assetRepository.put.bind(dependencies.assetRepository);
    let releasePut!: () => void;
    let markPutStarted!: () => void;
    const putStarted = new Promise<void>((resolve) => {
      markPutStarted = resolve;
    });
    const holdPut = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    dependencies.assetRepository.put = async (input) => {
      const stored = await originalPut(input);
      markPutStarted();
      await holdPut;
      return stored;
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "慢写入超时", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const generation = store.getState().generateSlot("amazon", "PT01");
    await putStarted;
    await new Promise((resolve) => setTimeout(resolve, 20));
    releasePut();
    const result = await generation;

    expect(result).toBeNull();
    expect(store.getState().generationError).toContain("超时");
    expect(store.getState().slotVersions.amazon?.PT01).toBeUndefined();
    expect((await dependencies.assetRepository.list("project_01"))).toEqual([]);
    expect(
      (await dependencies.workspaceRepository.load("project_01")).slotVersions.amazon?.PT01,
    ).toBeUndefined();
  });

  it("rolls back a late workspace commit when the user cancels generation", async () => {
    const dependencies = createDependencies();
    const originalSave = dependencies.workspaceRepository.save.bind(
      dependencies.workspaceRepository,
    );
    const revokedUrls: string[] = [];
    let releaseSave!: () => void;
    let markSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const holdSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    dependencies.workspaceRepository.save = async (document) => {
      if (document.slotVersions.amazon?.PT01) {
        markSaveStarted();
        await holdSave;
      }
      await originalSave(document);
    };
    dependencies.revokeObjectURL = (url) => {
      revokedUrls.push(url);
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "提交中取消", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const generation = store.getState().generateSlot("amazon", "PT01");
    await saveStarted;
    store.getState().cancelGeneration();
    releaseSave();
    const result = await generation;

    expect(result).toBeNull();
    expect(store.getState().generationError).toContain("取消");
    expect(store.getState().slotVersions.amazon?.PT01).toBeUndefined();
    expect((await dependencies.assetRepository.list("project_01"))).toEqual([]);
    expect(
      (await dependencies.workspaceRepository.load("project_01")).slotVersions.amazon?.PT01,
    ).toBeUndefined();
    expect(revokedUrls).toEqual(["blob:generated/1"]);
  });

  it("keeps cancellation ownership until rollback settles and rejects a competing generation", async () => {
    const dependencies = createDependencies();
    const originalSave = dependencies.workspaceRepository.save.bind(
      dependencies.workspaceRepository,
    );
    let releaseFirstSave!: () => void;
    let markFirstSaveStarted!: () => void;
    let firstVersionSaved = false;
    let failRollback = false;
    const firstSaveStarted = new Promise<void>((resolve) => {
      markFirstSaveStarted = resolve;
    });
    const holdFirstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    dependencies.workspaceRepository.save = async (document) => {
      if (document.slotVersions.amazon?.PT01 && !firstVersionSaved) {
        markFirstSaveStarted();
        await holdFirstSave;
        await originalSave(document);
        firstVersionSaved = true;
        return;
      }
      if (failRollback && firstVersionSaved && !document.slotVersions.amazon?.PT01) {
        throw new Error("补偿回滚失败");
      }
      await originalSave(document);
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "取消清理锁", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const firstRequest = store.getState().generateSlot("amazon", "PT01");
    await firstSaveStarted;
    failRollback = true;
    store.getState().cancelGeneration();
    const ownerAfterCancel = store.getState().generatingSlot;
    const secondRequest = store.getState().generateSlot("amazon", "PT02");
    const ownerAfterSecondAttempt = store.getState().generatingSlot;
    releaseFirstSave();
    const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

    expect(ownerAfterCancel).toEqual({ platformId: "amazon", slotKey: "PT01" });
    expect(ownerAfterSecondAttempt).toEqual({ platformId: "amazon", slotKey: "PT01" });
    expect(firstResult).toBeNull();
    expect(secondResult).toBeNull();
    expect(store.getState().generatingSlot).toBeNull();
    expect(store.getState().generationCanceling).toBe(false);
    expect(store.getState().generationRecoveryRequired).toBe(true);
    expect(store.getState().generationError).toContain("补偿回滚失败");
    expect(store.getState().resourceRestoreError).toContain("重试恢复");
    expect(
      (await dependencies.workspaceRepository.load("project_01")).slotVersions.amazon?.PT02,
    ).toBeUndefined();

    failRollback = false;
    await store.getState().retryActiveProjectResources();
    expect(store.getState().generationRecoveryRequired).toBe(false);
    expect(store.getState().slotVersions.amazon?.PT01).toBeDefined();
    expect(await store.getState().generateSlot("amazon", "PT02")).not.toBeNull();
  });

  it("removes the stored Blob when preview URL creation fails before workspace commit", async () => {
    const dependencies = createDependencies();
    dependencies.createObjectURL = () => {
      throw new Error("无法创建预览 URL");
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "预览失败", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const result = await store.getState().generateSlot("amazon", "PT01");

    expect(result).toBeNull();
    expect(store.getState().generationError).toContain("无法创建预览 URL");
    expect(store.getState().slotVersions.amazon?.PT01).toBeUndefined();
    expect((await dependencies.assetRepository.list("project_01"))).toEqual([]);
    expect(
      (await dependencies.workspaceRepository.load("project_01")).slotVersions.amazon?.PT01,
    ).toBeUndefined();
  });

  it("reports cleanup failure and reconciles an unreferenced generated Blob on restore", async () => {
    const dependencies = createDependencies();
    const originalSave = dependencies.workspaceRepository.save.bind(
      dependencies.workspaceRepository,
    );
    const originalRemove = dependencies.assetRepository.remove.bind(dependencies.assetRepository);
    let failGenerationSave = false;
    dependencies.workspaceRepository.save = async (document) => {
      if (failGenerationSave && document.slotVersions.amazon?.PT01) {
        throw new Error("工作区保存不可用");
      }
      await originalSave(document);
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "失败清理", facts: productFacts });
    await store.getState().planPlatform("amazon");
    failGenerationSave = true;
    dependencies.assetRepository.remove = async () => {
      throw new Error("IndexedDB 清理失败");
    };

    const result = await store.getState().generateSlot("amazon", "PT01");

    expect(result).toBeNull();
    expect(store.getState().generationError).toContain("工作区保存不可用");
    expect(store.getState().generationError).toContain("临时图片清理失败");
    expect(store.getState().assets).toEqual([]);
    expect((await dependencies.assetRepository.list("project_01"))).toHaveLength(1);
    expect(
      (await dependencies.workspaceRepository.load("project_01")).slotVersions.amazon?.PT01,
    ).toBeUndefined();

    failGenerationSave = false;
    dependencies.assetRepository.remove = originalRemove;
    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();

    expect(restoredStore.getState().assets).toEqual([]);
    expect((await dependencies.assetRepository.list("project_01"))).toEqual([]);
  });

  it("removes only the marked temporary Blob and preserves committed history on restore", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "保留历史版本", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const committed = await store.getState().generateSlot("amazon", "PT01");
    const originalSave = dependencies.workspaceRepository.save.bind(
      dependencies.workspaceRepository,
    );
    const originalRemove = dependencies.assetRepository.remove.bind(dependencies.assetRepository);
    let failSecondSave = true;
    dependencies.workspaceRepository.save = async (document) => {
      if (
        failSecondSave &&
        (document.slotVersions.amazon?.PT01.versions.length ?? 0) > 1
      ) {
        throw new Error("第二版本保存失败");
      }
      await originalSave(document);
    };
    dependencies.assetRepository.remove = async () => {
      throw new Error("临时 Blob 删除失败");
    };

    expect(await store.getState().generateSlot("amazon", "PT01")).toBeNull();
    expect((await dependencies.assetRepository.list("project_01"))).toHaveLength(2);

    failSecondSave = false;
    dependencies.assetRepository.remove = originalRemove;
    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();

    expect(restoredStore.getState().slotVersions.amazon?.PT01.versions).toEqual([committed]);
    expect(restoredStore.getState().assets.map((asset) => asset.metadata.id)).toEqual([
      committed?.assetId,
    ]);
    expect((await dependencies.assetRepository.list("project_01")).map((asset) => asset.id)).toEqual([
      committed?.assetId,
    ]);
  });

  it("blocks replanning and draft writes while a slot generation is pending", async () => {
    let release!: (image: GeneratedImage) => void;
    const pending = new Promise<GeneratedImage>((resolve) => {
      release = resolve;
    });
    const generator: ImageGenerator = {
      generate() {
        return pending;
      },
    };
    const store = createWorkbenchStore(createDependencies(generator));
    await store.getState().createProject({ name: "生成锁", facts: productFacts });
    const originalPlan = await store.getState().planPlatform("amazon");

    const generation = store.getState().generateSlot("amazon", "PT01");
    const replanned = await store.getState().planPlatform("amazon");
    const saved = await store.getState().updatePlannedSlot("amazon", "PT01", {
      visibleCopy: "Changed during generation",
      prompt: "Changed during generation",
    });

    expect(replanned).toBeNull();
    expect(saved).toBe(false);
    expect(store.getState().plans.amazon).toEqual(originalPlan);

    release(
      await demoImageGenerator.generate(
        {
          projectId: "project_01",
          productName: productFacts.productName,
          platformId: "amazon",
          slotKey: "PT01",
          prompt: originalPlan!.slots[1].prompt,
          negativePrompt: originalPlan!.slots[1].negativePrompt,
          visibleCopy: originalPlan!.slots[1].visibleCopy,
          uploadDimensions: { width: 2000, height: 2000, unit: "px" },
  dimensions: { width: 2000, height: 2000, unit: "px" },
          referenceImages: [],
        },
        new AbortController().signal,
      ),
    );
    await generation;
  });

  it("appends a masked edit as a new immutable version and run event", async () => {
    const requests: ImageGenerationRequest[] = [];
    const generator: ImageGenerator = {
      async generate(request, signal) {
        requests.push(request);
        return demoImageGenerator.generate(request, signal);
      },
    };
    const store = createWorkbenchStore(createDependencies(generator));
    await store.getState().createProject({ name: "局部编辑", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");
    const first = await store.getState().generateSessionSlot(session.id, "PT01");
    if (!first) throw new Error("预期生成首个版本");
    const mask: MaskDraft = {
      blob: new Blob(["mask"], { type: "image/png" }),
      width: first.width,
      height: first.height,
      coverage: 0.18,
    };

    const edited = await store.getState().generateMaskedVersion(
      session.id,
      "PT01",
      first.id,
      mask,
      "Replace only the selected background with a clean studio surface.",
    );

    expect(requests[1]?.edit).toMatchObject({
      target: { name: expect.stringContaining("PT01") },
      mask: { name: "amazon-PT01-mask.png", mimeType: "image/png" },
    });
    expect(edited).toMatchObject({ id: "version_02", parameters: { operation: "edit" } });
    expect(store.getState().slotVersions.amazon?.PT01).toEqual({
      versions: [first, edited],
      activeVersionId: "version_02",
    });
    const currentSession = store.getState().sessions.find((item) => item.id === session.id)!;
    const run = store.getState().runs.find((item) => item.id === currentSession.activeRunId)!;
    expect(run.events.at(-1)).toMatchObject({
      kind: "edit",
      status: "success",
      slotKey: "PT01",
      versionId: "version_02",
      assetId: edited?.assetId,
    });
  });

  it("keeps the old version when a masked edit fails", async () => {
    const generator: ImageGenerator = {
      async generate(request, signal) {
        if (request.edit) throw new Error("编辑服务不可用");
        return demoImageGenerator.generate(request, signal);
      },
    };
    const dependencies = createDependencies(generator);
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "局部编辑失败", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");
    const first = await store.getState().generateSessionSlot(session.id, "PT01");
    if (!first) throw new Error("预期生成首个版本");

    const edited = await store.getState().generateMaskedVersion(
      session.id,
      "PT01",
      first.id,
      {
        blob: new Blob(["mask"], { type: "image/png" }),
        width: first.width,
        height: first.height,
        coverage: 0.2,
      },
      "Replace the selected area.",
    );

    expect(edited).toBeNull();
    expect(store.getState().slotVersions.amazon?.PT01).toEqual({
      versions: [first],
      activeVersionId: first.id,
    });
    expect(store.getState().assets.map((asset) => asset.metadata.id)).toEqual([first.assetId]);
    expect(store.getState().generationError).toContain("编辑服务不可用");
    const currentSession = store.getState().sessions.find((item) => item.id === session.id)!;
    const run = store.getState().runs.find((item) => item.id === currentSession.activeRunId)!;
    expect(run.events.at(-1)).toMatchObject({ kind: "edit", status: "failed", slotKey: "PT01" });
  });

  it("copies a current generated asset into a new reference asset", async () => {
    const store = createWorkbenchStore(createDependencies());
    await store.getState().createProject({ name: "生成图复用", facts: productFacts });
    await store.getState().planPlatform("amazon");
    const version = await store.getState().generateSlot("amazon", "PT01");
    if (!version) throw new Error("预期生成首个版本");

    const reference = await store.getState().reuseGeneratedImageAsReference(version.assetId);

    expect(reference?.metadata).toMatchObject({
      kind: "reference",
      role: "source:amazon:PT01",
      tags: ["generated-reuse", version.assetId],
    });
    expect(store.getState().assets.find((asset) => asset.metadata.id === version.assetId)?.metadata.kind)
      .toBe("generated");
    expect(reference?.metadata.id).not.toBe(version.assetId);
  });

  it("rejects masked editing before request when the provider has no mask capability", async () => {
    let editRequests = 0;
    const generator: ImageGenerator = {
      async generate(request, signal) {
        if (request.edit) editRequests += 1;
        return demoImageGenerator.generate(request, signal);
      },
    };
    const store = createWorkbenchStore(createDependencies(generator));
    await store.getState().createProject({ name: "遮罩能力门禁", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");
    const version = await store.getState().generateSessionSlot(session.id, "PT01");
    if (!version) throw new Error("预期生成首个版本");
    await store.getState().saveRuntimeSettings({
      mode: "api",
      connectionMode: "single",
      apiKey: "one-key",
      textApiKey: "one-key",
      textBaseUrl: "https://openrouter.ai/api/v1",
      planningEndpoint: "https://openrouter.ai/api/v1/chat/completions",
      planningModel: "text-model",
      imageBaseUrl: "https://ignored.example/v1",
      imageModel: "image-model",
    });

    const result = await store.getState().generateMaskedVersion(
      session.id,
      "PT01",
      version.id,
      {
        blob: new Blob(["mask"], { type: "image/png" }),
        width: version.width,
        height: version.height,
        coverage: 0.2,
      },
      "Replace selected area.",
    );

    expect(result).toBeNull();
    expect(editRequests).toBe(0);
    expect(store.getState().generationError).toContain("不支持显式遮罩编辑");
  });

  it("rolls back a masked edit canceled immediately after workspace persistence", async () => {
    const dependencies = createDependencies();
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "编辑提交回滚", facts: productFacts });
    const session = await store.getState().startAmazonSession({
      workflowId: "amazon-listing",
      listingText: "Title: Cloud Neck Pillow",
      files: [],
      selectedReferenceAssetIds: [],
      options: { plannerMode: "listing", listingImageCount: 7, marketplaceId: "us" },
    });
    if (!session) throw new Error("预期创建 Amazon session");
    const first = await store.getState().generateSessionSlot(session.id, "PT01");
    if (!first) throw new Error("预期生成首个版本");
    const originalSave = dependencies.workspaceRepository.save.bind(
      dependencies.workspaceRepository,
    );
    let cancelAfterPersist = true;
    dependencies.workspaceRepository.save = async (document) => {
      await originalSave(document);
      if (
        cancelAfterPersist &&
        (document.slotVersions.amazon?.PT01.versions.length ?? 0) > 1
      ) {
        cancelAfterPersist = false;
        store.getState().cancelGeneration();
      }
    };

    const edited = await store.getState().generateMaskedVersion(
      session.id,
      "PT01",
      first.id,
      {
        blob: new Blob(["mask"], { type: "image/png" }),
        width: first.width,
        height: first.height,
        coverage: 0.2,
      },
      "Replace selected area.",
    );

    expect(edited).toBeNull();
    const persisted = await dependencies.workspaceRepository.load("project_01");
    expect(persisted.slotVersions.amazon?.PT01.versions).toEqual([first]);
    expect((await dependencies.assetRepository.list("project_01")).map((asset) => asset.id))
      .toEqual([first.assetId]);
  });
});
