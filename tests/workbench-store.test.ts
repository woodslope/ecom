import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import type { ProductFacts } from "../src/domain/projects/types";
import {
  createWorkbenchStore,
  useWorkbenchStore,
  workbenchStore,
} from "../src/store/workbench-store";

const productFacts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "经常乘坐飞机和高铁的通勤人群",
  description: "可折叠记忆棉颈枕，带可拆洗外套。",
  sellingPoints: ["慢回弹记忆棉", "可折叠收纳", "外套可拆洗"],
  forbiddenClaims: ["治疗颈椎病"],
  specifications: { material: "记忆棉", size: "28 x 25 x 12 cm" },
};

function createDependencies() {
  return {
    projectRepository: createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    }),
    assetRepository: createMemoryAssetRepository(),
    compressImageFile: async (file: File) => file,
    createObjectURL: (blob: Blob) => `blob:test/${blob.size}`,
    revokeObjectURL: () => undefined,
  };
}

describe("workbench store", () => {
  it("exports a Node-safe default store and hook with a visible memory warning", () => {
    expect(typeof useWorkbenchStore).toBe("function");
    expect(workbenchStore.getState().warning).toContain("内存");
    expect(workbenchStore.getState()).toMatchObject({
      initialized: false,
      loading: false,
      projects: [],
      activeProject: null,
      assets: [],
    });
  });

  it("creates an active project and restores it when a new store initializes", async () => {
    const dependencies = createDependencies();
    const firstStore = createWorkbenchStore(dependencies);

    await firstStore.getState().initialize();
    const created = await firstStore.getState().createProject({
      name: "旅行颈枕 Amazon 上新",
      facts: productFacts,
    });

    expect(created?.id).toBe("project_01");
    expect(firstStore.getState()).toMatchObject({
      initialized: true,
      loading: false,
      error: null,
      projects: [created],
      activeProject: created,
      assets: [],
    });

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();

    expect(restoredStore.getState().activeProject).toEqual(created);
    expect(restoredStore.getState().projects).toEqual([created]);
  });

  it("keeps restored project metadata visible when asset restoration fails and can retry", async () => {
    const dependencies = createDependencies();
    const project = await dependencies.projectRepository.create({
      name: "素材恢复失败仍可见",
      facts: productFacts,
    });
    const originalList = dependencies.assetRepository.list.bind(dependencies.assetRepository);
    let shouldFail = true;
    dependencies.assetRepository.list = async (projectId) => {
      if (shouldFail) throw new Error("IndexedDB 素材读取失败");
      return originalList(projectId);
    };
    const store = createWorkbenchStore(dependencies);

    await store.getState().initialize();

    expect(store.getState()).toMatchObject({
      initialized: true,
      loading: false,
      projects: [project],
      activeProject: project,
      assets: [],
      error: null,
    });
    expect(store.getState().resourceRestoreError).toContain("IndexedDB 素材读取失败");

    shouldFail = false;
    await store.getState().retryActiveProjectResources();
    expect(store.getState().resourceRestoreError).toBeNull();
  });

  it("updates the active project facts in both detail and project list state", async () => {
    const store = createWorkbenchStore(createDependencies());
    await store.getState().createProject({ name: "旅行颈枕 Amazon 上新", facts: productFacts });

    const updated = await store.getState().updateActiveProject({
      facts: {
        targetAudience: "长途飞行旅客",
        sellingPoints: ["慢回弹承托", "卷起后可放入随身包"],
      },
    });

    expect(updated?.facts).toMatchObject({
      targetAudience: "长途飞行旅客",
      sellingPoints: ["慢回弹承托", "卷起后可放入随身包"],
      category: productFacts.category,
    });
    expect(store.getState().activeProject).toEqual(updated);
    expect(store.getState().projects).toEqual([updated]);
  });

  it("deletes a project with its assets and workspace, then selects the newest remaining project", async () => {
    const ids = ["project_01", "project_02"];
    const dependencies = {
      ...createDependencies(),
      projectRepository: createMemoryProjectRepository({
        createId: () => ids.shift()!,
        now: () => "2026-07-16T08:00:00.000Z",
      }),
      workspaceRepository: createMemoryWorkspaceRepository(),
    };
    const store = createWorkbenchStore(dependencies);
    const first = await dependencies.projectRepository.create({ name: "第一份资料", facts: productFacts });
    const second = await dependencies.projectRepository.create({ name: "第二份资料", facts: productFacts });
    await dependencies.assetRepository.put({
      projectId: second.id,
      blob: new Blob(["reference"], { type: "image/png" }),
      metadata: { name: "reference.png", kind: "reference", role: "reference" },
    });
    const workspace = await dependencies.workspaceRepository.load(second.id);
    await dependencies.workspaceRepository.save({ ...workspace, taskHistory: [{
      id: "task_01", batchId: "batch_01", kind: "plan", platformId: "amazon", status: "success",
      startedAt: workspace.updatedAt, completedAt: workspace.updatedAt, summary: "test",
    }] });
    await store.getState().initialize();

    expect(store.getState().activeProject?.id).toBe(second.id);
    expect(await store.getState().removeProject(second.id)).toBe(true);
    expect(store.getState().activeProject?.id).toBe(first.id);
    expect(store.getState().projects.map((project) => project.id)).toEqual([first.id]);
    expect(await dependencies.assetRepository.list(second.id)).toEqual([]);
    expect((await dependencies.workspaceRepository.load(second.id)).taskHistory).toEqual([]);
  });

  it("blocks AI and export tasks while a workspace mutation is loading", async () => {
    let releaseCompression!: () => void;
    const compressionHeld = new Promise<void>((resolve) => {
      releaseCompression = resolve;
    });
    const dependencies = {
      ...createDependencies(),
      compressImageFile: async (file: File) => {
        await compressionHeld;
        return file;
      },
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().createProject({ name: "加载锁", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const upload = store.getState().uploadReferenceFiles([
      new File(["image"], "front.png", { type: "image/png" }),
    ]);
    expect(store.getState().loading).toBe(true);

    expect(await store.getState().planPlatform("taobao")).toBeNull();
    expect(await store.getState().generateSlot("amazon", "MAIN")).toBeNull();
    expect(
      await store.getState().runCopilotCommand("amazon", "PT01", "explain-next"),
    ).toBe(false);
    expect(await store.getState().exportPlatform("amazon")).toBeNull();

    releaseCompression();
    await upload;
  });

  it("uploads compressed Blobs and restores URL-backed asset views on initialize", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const compressedFiles: string[] = [];
    let objectUrlSequence = 0;
    const dependencies = {
      projectRepository,
      assetRepository,
      compressImageFile: async (file: File) => {
        compressedFiles.push(file.name);
        return new File(["compressed-image"], file.name, { type: "image/webp" });
      },
      createObjectURL: () => `blob:test/${++objectUrlSequence}`,
      revokeObjectURL: () => undefined,
    };
    const firstStore = createWorkbenchStore(dependencies);
    await firstStore.getState().createProject({ name: "旅行颈枕素材", facts: productFacts });

    const uploaded = await firstStore.getState().uploadReferenceFiles([
      new File(["original-image"], "front.png", { type: "image/png" }),
    ]);

    expect(compressedFiles).toEqual(["front.png"]);
    expect(uploaded).toEqual(firstStore.getState().assets);
    expect(firstStore.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({
          id: "asset_01",
          projectId: "project_01",
          name: "front.png",
          kind: "reference",
          mimeType: "image/webp",
        }),
        objectUrl: "blob:test/1",
      },
    ]);
    expect("blob" in firstStore.getState().assets[0]).toBe(false);
    expect("blob" in firstStore.getState().assets[0].metadata).toBe(false);
    expect(await (await assetRepository.get("asset_01"))!.blob.text()).toBe(
      "compressed-image",
    );

    const restoredStore = createWorkbenchStore(dependencies);
    await restoredStore.getState().initialize();
    expect(restoredStore.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({ id: "asset_01" }),
        objectUrl: "blob:test/2",
      },
    ]);
  });

  it("rolls back a failed upload batch so retry cannot create hidden duplicates", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetIds = ["asset_01", "asset_02", "asset_03"];
    const assetRepository = createMemoryAssetRepository({
      createId: () => assetIds.shift()!,
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const put = assetRepository.put.bind(assetRepository);
    let putAttempt = 0;
    assetRepository.put = async (input) => {
      putAttempt += 1;
      if (putAttempt === 2) {
        throw new Error("第二张素材写入失败");
      }
      return put(input);
    };
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: (blob) => `blob:batch/${blob.size}`,
      revokeObjectURL: () => undefined,
    });
    await store.getState().createProject({ name: "批量上传", facts: productFacts });
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.png", { type: "image/png" }),
    ];

    const failed = await store.getState().uploadReferenceFiles(files);

    expect(failed).toEqual([]);
    expect(store.getState().error).toBe("第二张素材写入失败");
    expect(await assetRepository.list("project_01")).toEqual([]);
    expect(store.getState().assets).toEqual([]);

    const retried = await store.getState().uploadReferenceFiles(files);

    expect(retried.map((asset) => asset.metadata.id)).toEqual(["asset_02", "asset_03"]);
    expect((await assetRepository.list("project_01")).map((asset) => asset.id)).toEqual([
      "asset_02",
      "asset_03",
    ]);
  });

  it("refreshes the actual asset state when one rollback removal also fails", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetIds = ["asset_01", "asset_02"];
    const assetRepository = createMemoryAssetRepository({
      createId: () => assetIds.shift()!,
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const put = assetRepository.put.bind(assetRepository);
    let putAttempt = 0;
    assetRepository.put = async (input) => {
      putAttempt += 1;
      if (putAttempt === 3) {
        throw new Error("第三张素材写入失败");
      }
      return put(input);
    };
    const remove = assetRepository.remove.bind(assetRepository);
    assetRepository.remove = async (id) => {
      if (id === "asset_02") {
        throw new Error("asset_02 回滚删除失败");
      }
      await remove(id);
    };
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:rollback/remaining",
      revokeObjectURL: () => undefined,
    });
    await store.getState().createProject({ name: "回滚失败", facts: productFacts });

    const result = await store.getState().uploadReferenceFiles([
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.png", { type: "image/png" }),
      new File(["third"], "third.png", { type: "image/png" }),
    ]);

    expect(result).toEqual([]);
    expect((await assetRepository.list("project_01")).map((asset) => asset.id)).toEqual([
      "asset_02",
    ]);
    expect(store.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({ id: "asset_02", name: "second.png" }),
        objectUrl: "blob:rollback/remaining",
      },
    ]);
    expect(store.getState().error).toContain("第三张素材写入失败");
    expect(store.getState().error).toContain("asset_02 回滚删除失败");
    expect(store.getState().loading).toBe(false);
  });

  it("switches projects, restores that project's assets, and revokes replaced URLs", async () => {
    const projectIds = ["project_01", "project_02"];
    const assetIds = ["asset_01", "asset_02"];
    const projectRepository = createMemoryProjectRepository({
      createId: () => projectIds.shift()!,
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => assetIds.shift()!,
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const first = await projectRepository.create({ name: "项目一", facts: productFacts });
    await assetRepository.put({
      projectId: first.id,
      blob: new Blob(["first"], { type: "image/png" }),
      metadata: { name: "first.png", kind: "reference" },
    });
    const second = await projectRepository.create({ name: "项目二", facts: productFacts });
    await assetRepository.put({
      projectId: second.id,
      blob: new Blob(["second"], { type: "image/png" }),
      metadata: { name: "second.png", kind: "reference" },
    });
    const revoked: string[] = [];
    let objectUrlSequence = 0;
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => `blob:switch/${++objectUrlSequence}`,
      revokeObjectURL: (url) => revoked.push(url),
    });
    await store.getState().initialize();
    expect(store.getState().assets[0].metadata.name).toBe("second.png");

    await store.getState().selectProject(first.id);

    expect(store.getState().activeProject?.id).toBe(first.id);
    expect(store.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({ name: "first.png" }),
        objectUrl: "blob:switch/2",
      },
    ]);
    expect(await projectRepository.getActiveId()).toBe(first.id);
    expect(revoked).toEqual(["blob:switch/1"]);
  });

  it("removes an asset from the repository and revokes its object URL", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const project = await projectRepository.create({ name: "待清理素材", facts: productFacts });
    await assetRepository.put({
      projectId: project.id,
      blob: new Blob(["asset"], { type: "image/png" }),
      metadata: { name: "remove-me.png", kind: "reference" },
    });
    const revoked: string[] = [];
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:remove/1",
      revokeObjectURL: (url) => revoked.push(url),
    });
    await store.getState().initialize();

    await store.getState().removeAsset("asset_01");

    expect(await assetRepository.get("asset_01")).toBeNull();
    expect(store.getState().assets).toEqual([]);
    expect(revoked).toEqual(["blob:remove/1"]);
  });

  it("refreshes assets from the repository and revokes replaced previews", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const project = await projectRepository.create({ name: "刷新素材", facts: productFacts });
    await assetRepository.put({
      projectId: project.id,
      blob: new Blob(["old"], { type: "image/png" }),
      metadata: { name: "old.png", kind: "reference" },
    });
    const revoked: string[] = [];
    let objectUrlSequence = 0;
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => `blob:refresh/${++objectUrlSequence}`,
      revokeObjectURL: (url) => revoked.push(url),
    });
    await store.getState().initialize();
    await assetRepository.put({
      id: "asset_01",
      blob: new Blob(["new"], { type: "image/webp" }),
      metadata: { name: "new.webp" },
    });

    await store.getState().refreshAssets();

    expect(store.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({
          name: "new.webp",
          mimeType: "image/webp",
        }),
        objectUrl: "blob:refresh/2",
      },
    ]);
    expect(revoked).toEqual(["blob:refresh/1"]);
  });

  it("exposes asynchronous repository failures and lets the user clear them", async () => {
    const dependencies = createDependencies();
    dependencies.projectRepository.create = async () => {
      throw new Error("项目写入失败");
    };
    const store = createWorkbenchStore(dependencies);

    const created = await store.getState().createProject({
      name: "失败项目",
      facts: productFacts,
    });

    expect(created).toBeNull();
    expect(store.getState()).toMatchObject({ loading: false, error: "项目写入失败" });

    store.getState().clearError();
    expect(store.getState().error).toBeNull();
  });

  it("disposes asset previews idempotently", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetIds = ["asset_01", "asset_02"];
    const assetRepository = createMemoryAssetRepository({
      createId: () => assetIds.shift()!,
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const project = await projectRepository.create({ name: "释放预览", facts: productFacts });
    await assetRepository.put({
      projectId: project.id,
      blob: new Blob(["first"]),
      metadata: { name: "first.png", kind: "reference" },
    });
    await assetRepository.put({
      projectId: project.id,
      blob: new Blob(["second"]),
      metadata: { name: "second.png", kind: "reference" },
    });
    const revoked: string[] = [];
    let objectUrlSequence = 0;
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => `blob:dispose/${++objectUrlSequence}`,
      revokeObjectURL: (url) => revoked.push(url),
    });
    await store.getState().initialize();

    store.getState().dispose();
    store.getState().dispose();

    expect(revoked).toEqual(["blob:dispose/1", "blob:dispose/2"]);
    expect(store.getState().assets).toEqual([]);
  });

  it("ignores and revokes an initialization result that finishes after dispose", async () => {
    const projectRepository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const assetRepository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const project = await projectRepository.create({ name: "异步释放", facts: productFacts });
    await assetRepository.put({
      projectId: project.id,
      blob: new Blob(["asset"]),
      metadata: { name: "asset.png", kind: "reference" },
    });

    const originalGet = assetRepository.get.bind(assetRepository);
    let releaseFirstRead!: () => void;
    let notifyFirstRead!: () => void;
    const firstReadStarted = new Promise<void>((resolve) => {
      notifyFirstRead = resolve;
    });
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let delayNextRead = true;
    assetRepository.get = async (id) => {
      if (delayNextRead) {
        delayNextRead = false;
        notifyFirstRead();
        await firstReadGate;
      }
      return originalGet(id);
    };

    const revoked: string[] = [];
    let objectUrlSequence = 0;
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository,
      compressImageFile: async (file) => file,
      createObjectURL: () => `blob:lifecycle/${++objectUrlSequence}`,
      revokeObjectURL: (url) => revoked.push(url),
    });

    const staleInitialization = store.getState().initialize();
    await firstReadStarted;
    store.getState().dispose();
    releaseFirstRead();
    await staleInitialization;

    expect(store.getState().assets).toEqual([]);
    expect(revoked).toEqual(["blob:lifecycle/1"]);

    await store.getState().initialize();
    expect(store.getState().assets).toEqual([
      {
        metadata: expect.objectContaining({ id: "asset_01" }),
        objectUrl: "blob:lifecycle/2",
      },
    ]);
  });
});
