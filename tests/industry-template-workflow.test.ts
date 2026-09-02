import { describe, expect, it } from "vitest";

import { createMemoryAssetRepository } from "../src/domain/assets/repository";
import type { PlannerEngine } from "../src/domain/planning/types";
import { getPlatformRulePack } from "../src/domain/platforms/registry";
import { createGeneralIndustryTemplateSnapshot } from "../src/domain/prompt-templates/industry-template-packs";
import { createMemoryProjectRepository } from "../src/domain/projects/repository";
import { createMemoryWorkspaceRepository } from "../src/domain/workspace/project-workspace";
import { mockPlanner } from "./fixtures/mock-planner";
import { createWorkbenchStore } from "../src/store/workbench-store";

describe("industry template workflow", () => {
  it("persists the selected snapshot and passes it into planning", async () => {
    let receivedTemplate: Parameters<PlannerEngine["plan"]>[6];
    const planner: PlannerEngine = {
      async plan(...args) {
        receivedTemplate = args[6];
        return mockPlanner.plan(...args);
      },
    };
    const workspaceRepository = createMemoryWorkspaceRepository();
    const store = createWorkbenchStore({
      projectRepository: createMemoryProjectRepository({ createId: () => "project_01" }),
      assetRepository: createMemoryAssetRepository({ createId: () => "asset_01" }),
      workspaceRepository,
      plannerEngine: planner,
      compressImageFile: async (file) => file,
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    });
    await store.getState().initialize();
    const project = await store.getState().createProject({
      name: "家居商品",
      facts: {
        productName: "陶瓷花瓶",
        category: "家居摆件",
        brand: "",
        model: "",
        sku: "",
        targetAudience: "家居审美人群",
        description: "手工釉面花瓶",
        sellingPoints: ["手工釉面"],
        forbiddenClaims: [],
        specifications: {},
      },
    });
    const [asset] = await store.getState().uploadReferenceFiles([
      new File(["image"], "vase.png", { type: "image/png" }),
    ]);
    const template = createGeneralIndustryTemplateSnapshot(
      { platformId: "taobao", workflowId: "taobao-product" },
      getPlatformRulePack("taobao"),
    );
    template.id = "industry_home";
    template.name = "家居饰品";
    template.source = "custom";
    template.version = 2;

    const session = await store.getState().analyzeTaobaoProduct({
      projectId: project!.id,
      sourceMode: "manual",
      productText: "商品名：陶瓷花瓶\n卖点：手工釉面",
      files: [],
      selectedReferenceAssetIds: [asset!.metadata.id],
      industryTemplate: template,
    });

    expect(receivedTemplate).toMatchObject({ id: "industry_home", version: 2 });
    expect(session?.industryTemplate).toEqual(template);
    const workspace = await workspaceRepository.load(store.getState().activeProject!.id);
    expect(workspace.sessions[0]?.industryTemplate).toEqual(template);
    expect(workspace.runs[0]?.contextSnapshot.industryTemplate).toEqual(template);
  });
});
