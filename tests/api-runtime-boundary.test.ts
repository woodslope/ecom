import { describe, expect, it } from "vitest";

import type { AiRuntimeFactory } from "../src/services/ai/runtime-factory";
import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";
import { createMemorySettingsRepository } from "../src/domain/settings";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { mockImageGenerator, mockIndustryTemplateTransformer } from "./fixtures/mock-ai";
import { mockPlanner } from "./fixtures/mock-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";
import { createGeneralIndustryTemplateSnapshot } from "../src/domain/prompt-templates/industry-template-packs";
import { amazonRulePack } from "../src/domain/platforms/amazon";

const facts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "NW-P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉旅行颈枕，外套可拆洗。",
  sellingPoints: ["慢回弹支撑", "可折叠收纳"],
  forbiddenClaims: [],
  specifications: { 材质: "记忆棉", 尺寸: "28 x 25 x 12 cm" },
};

function runtimeFactory(): AiRuntimeFactory {
  const runtime = {
    planner: mockPlanner,
    imageGenerator: mockImageGenerator,
    productLocalizer: {
      async localize(source: ProductFacts) { return { ...source }; },
    },
    industryTemplateTransformer: mockIndustryTemplateTransformer,
    testTextConnection: async () => ({ ok: true, message: "文本策划 API 连接成功。" }),
    testImageConnection: async () => ({ ok: true, message: "图片生成 API 连接成功。" }),
  };
  return {
    create: () => runtime,
    resolve: () => runtime,
    createPlanner: () => mockPlanner,
    createImageGenerator: () => mockImageGenerator,
    createProductLocalizer: () => runtime.productLocalizer,
    createIndustryTemplateTransformer: () => mockIndustryTemplateTransformer,
    testTextConnection: runtime.testTextConnection,
    testImageConnection: runtime.testImageConnection,
  } as AiRuntimeFactory;
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    mode: "api" as const,
    connectionMode: "dual" as const,
    textBaseUrl: "https://text.example/v1",
    textApiKey: "",
    planningModel: "",
    textProtocol: "chat-completions" as const,
    imageBaseUrl: "https://image.example/v1",
    imageApiKey: "",
    imageModel: "",
    imageGenerationMode: "sync" as const,
    imageProtocol: "images-api" as const,
    ...overrides,
  };
}

function createStore(initialSettings = settings()) {
  return createWorkbenchStore({
    projectRepository: createMemoryProjectRepository({ createId: () => "project-api-boundary" }),
    assetRepository: createMemoryAssetRepository({ createId: () => "asset-api-boundary" }),
    workspaceRepository: createMemoryWorkspaceRepository(),
    settingsRepository: createMemorySettingsRepository(initialSettings),
    aiRuntimeFactory: runtimeFactory(),
    compressImageFile: async (file: File) => file,
    createObjectURL: () => "blob:api-boundary",
    revokeObjectURL: () => undefined,
  });
}

async function initializedStore(initialSettings = settings()) {
  const store = createStore(initialSettings);
  await store.getState().initialize();
  await store.getState().createProject({ name: facts.productName, facts });
  return store;
}

describe("API-only runtime boundaries", () => {
  it("blocks planning without a text API and keeps the app usable", async () => {
    const store = await initializedStore();
    expect(await store.getState().planPlatform("amazon")).toBeNull();
    expect(store.getState().planningError).toContain("未配置文本 API Key");
    expect(store.getState().activeProject?.facts.productName).toBe(facts.productName);
  });

  it("allows planning with text only but blocks image generation", async () => {
    const store = await initializedStore(settings({
      textApiKey: "text-key",
      planningModel: "text-model",
    }));
    expect(await store.getState().planPlatform("amazon")).not.toBeNull();
    expect(await store.getState().generateSlot("amazon", "MAIN")).toBeNull();
    expect(store.getState().generationError).toContain("未配置图片 API Key");
  });

  it("blocks batch generation before creating a local job without an image API", async () => {
    const store = await initializedStore(settings({
      textApiKey: "text-key",
      planningModel: "text-model",
    }));
    expect(await store.getState().planPlatform("amazon")).not.toBeNull();
    expect(await store.getState().startBatchGeneration("amazon")).toBeNull();
    expect(store.getState().error).toContain("未配置图片 API Key");
    expect(store.getState().jobs).toHaveLength(0);
  });

  it("blocks planning with image only", async () => {
    const store = await initializedStore(settings({
      imageApiKey: "image-key",
      imageModel: "image-model",
    }));
    expect(await store.getState().planPlatform("amazon")).toBeNull();
    expect(store.getState().planningError).toContain("未配置文本 API Key");
  });

  it("requires text API for industry template changes", async () => {
    const store = await initializedStore(settings({ textApiKey: "text-key", planningModel: "text-model" }));
    const baseTemplate = createGeneralIndustryTemplateSnapshot(
      { platformId: "amazon", workflowId: "amazon-listing" },
      amazonRulePack,
    );
    expect(await store.getState().transformIndustryTemplate({
      baseTemplate,
      brief: baseTemplate.brief,
      rulePack: amazonRulePack,
    })).not.toBeNull();
    expect(await store.getState().planPlatform("amazon")).not.toBeNull();
    expect(await store.getState().saveRuntimeSettings(settings())).toBe(true);
  });

  it("writes only api sources for new plans and image versions", async () => {
    const store = await initializedStore(settings({
      textApiKey: "text-key",
      planningModel: "text-model",
      imageApiKey: "image-key",
      imageModel: "image-model",
    }));
    const plan = await store.getState().planPlatform("amazon");
    expect(plan?.source).toBe("api");
    const version = await store.getState().generateSlot("amazon", "MAIN");
    expect(version?.source).toBe("api");
    expect(store.getState().runs.every((run) => run.source === "api")).toBe(true);
  });
});
