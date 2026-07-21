import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemorySettingsRepository } from "../src/domain/settings";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
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
  sellingPoints: ["慢回弹"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉" },
};

describe("workbench runtime settings", () => {
  it("persists API mode and uses configured planner and image adapters", async () => {
    const settingsRepository = createMemorySettingsRepository();
    const adapterModes: string[] = [];
    const dependencies = {
      projectRepository: createMemoryProjectRepository({ createId: () => "project_01" }),
      assetRepository: createMemoryAssetRepository({ createId: () => "asset_01" }),
      workspaceRepository: createMemoryWorkspaceRepository(),
      settingsRepository,
      plannerEngine: demoPlanner,
      imageGenerator: demoImageGenerator,
      createPlannerEngine(settings: { mode: string }) {
        adapterModes.push(`plan:${settings.mode}`);
        return demoPlanner;
      },
      createImageGenerator(settings: { mode: string }) {
        adapterModes.push(`image:${settings.mode}`);
        return demoImageGenerator;
      },
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:generated/1",
      revokeObjectURL: () => undefined,
    };
    const store = createWorkbenchStore(dependencies);
    await store.getState().initialize();
    const saved = await store.getState().saveRuntimeSettings({
      mode: "api",
      apiKey: "sk-local-only",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "planning-model",
      imageBaseUrl: "https://provider.example/v1",
      imageModel: "image-model",
    });
    await store.getState().createProject({ name: "API 项目", facts: productFacts });
    await store.getState().planPlatform("amazon");
    await store.getState().generateSlot("amazon", "MAIN");

    expect(saved).toBe(true);
    expect(adapterModes).toEqual(["plan:api", "image:api"]);
    expect(store.getState().runtimeSettings.mode).toBe("api");

    const restored = createWorkbenchStore(dependencies);
    await restored.getState().initialize();
    expect(restored.getState().runtimeSettings).toMatchObject({
      mode: "api",
      apiKey: "sk-local-only",
      planningModel: "planning-model",
      imageModel: "image-model",
    });
  });

  it("restores the active project when settings storage fails and falls back to demo", async () => {
    const projectRepository = createMemoryProjectRepository({ createId: () => "project_01" });
    await projectRepository.create({ name: "可恢复项目", facts: productFacts });
    const store = createWorkbenchStore({
      projectRepository,
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository: createMemoryWorkspaceRepository(),
      settingsRepository: {
        async load() {
          throw new Error("设置存储损坏");
        },
        async save() {
          throw new Error("设置存储损坏");
        },
      },
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });

    await store.getState().initialize();

    expect(store.getState().activeProject?.name).toBe("可恢复项目");
    expect(store.getState().runtimeSettings.mode).toBe("demo");
    expect(store.getState().settingsError).toContain("设置存储损坏");
    expect(store.getState().error).toBeNull();
  });

  it("leaves connection testing with a safe error when the adapter throws", async () => {
    const store = createWorkbenchStore({
      projectRepository: createMemoryProjectRepository(),
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository: createMemoryWorkspaceRepository(),
      testConnection: async () => {
        throw new Error("transport leaked sk-secret-value");
      },
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });

    const result = await store.getState().testRuntimeConnection({
      mode: "api",
      apiKey: "sk-secret-value",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "planning-model",
      imageBaseUrl: "https://provider.example/v1",
      imageModel: "image-model",
    });

    expect(result).toEqual({
      ok: false,
      message: "API 连接测试未能完成，请检查网络、代理或服务配置后重试。",
    });
    expect(store.getState().connectionTestStatus).toBe("error");
    expect(store.getState().connectionTestMessage).not.toContain("sk-secret-value");
  });

  it("does not switch runtime settings while image generation is in flight", async () => {
    let markGenerationStarted!: () => void;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const store = createWorkbenchStore({
      projectRepository: createMemoryProjectRepository({ createId: () => "project_01" }),
      assetRepository: createMemoryAssetRepository(),
      workspaceRepository: createMemoryWorkspaceRepository(),
      plannerEngine: demoPlanner,
      imageGenerator: {
        generate(_input, signal) {
          markGenerationStarted();
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
      compressImageFile: async (file: File) => file,
      createObjectURL: () => "blob:asset",
      revokeObjectURL: () => undefined,
    });
    await store.getState().createProject({ name: "生成中锁定设置", facts: productFacts });
    await store.getState().planPlatform("amazon");

    const generation = store.getState().generateSlot("amazon", "MAIN");
    await generationStarted;
    const saved = await store.getState().saveRuntimeSettings({
      mode: "api",
      apiKey: "sk-new-mode",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "planning-model",
      imageBaseUrl: "https://provider.example/v1",
      imageModel: "image-model",
    });

    expect(saved).toBe(false);
    expect(store.getState().runtimeSettings.mode).toBe("demo");
    expect(store.getState().settingsError).toContain("生成");

    store.getState().cancelGeneration();
    await generation;
  });
});
