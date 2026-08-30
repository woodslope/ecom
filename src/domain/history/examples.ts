import type { AmazonPlanningRequestOptions } from "../planning/types";
import type { PlatformId, PlatformWorkflowId } from "../platforms/types";
import type { ProductProject } from "../projects/types";
import type { PlatformPlan } from "../planning/types";
import type { PlannerTaskSettings } from "../prompting/types";
import type { IndustryTemplateSnapshot } from "../prompt-templates/industry-template-packs";
import { getPlatformRulePack } from "../platforms/registry";

export interface HistoryExampleRefillPayload {
  project: ProductProject;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  sourceMode: "manual" | "library";
  listingText?: string;
  productText?: string;
  selectedReferenceAssetIds: string[];
  selectedStyleReferenceId?: string | null;
  options?: AmazonPlanningRequestOptions;
  stylePresetId?: string | null;
  industryTemplate?: IndustryTemplateSnapshot;
}

export interface HistoryProcessExample {
  id: string;
  title: "流程示例";
  description: string;
  project: ProductProject;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  steps: readonly string[];
  taskSettings: PlannerTaskSettings;
  industryTemplate: IndustryTemplateSnapshot;
  plan: PlatformPlan;
  exportStructure: readonly string[];
  refill: Omit<HistoryExampleRefillPayload, "project" | "platformId" | "workflowId">;
}

const cloudRestFacts = {
  productName: "CloudRest 记忆棉旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "长途出行人群",
  description: "可折叠记忆棉旅行颈枕，配可拆洗涤纶外套，适合飞机、高铁和长途客车等坐姿出行。",
  sellingPoints: ["慢回弹颈部支撑", "可折叠收纳", "外套可拆洗"],
  forbiddenClaims: ["治疗颈椎病", "保证医疗效果", "全网第一"],
  specifications: {
    材质: "记忆棉和涤纶",
    尺寸: "28 x 25 x 12 cm",
    使用场景: "飞机、高铁和长途客车",
    包装清单: "颈枕、外套、收纳袋",
  },
} as const;

function exampleProject(id: string, name: string): ProductProject {
  return {
    id,
    name,
    scope: "task-draft",
    factsLocale: "zh-CN",
    facts: {
      ...cloudRestFacts,
      sellingPoints: [...cloudRestFacts.sellingPoints],
      forbiddenClaims: [...cloudRestFacts.forbiddenClaims],
      specifications: { ...cloudRestFacts.specifications },
    },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

const amazonProject = exampleProject("history-example-amazon-project", "流程示例 · CloudRest 旅行颈枕");
const taobaoProject = exampleProject("history-example-taobao-project", "流程示例 · CloudRest 旅行颈枕");

function exampleTemplate(platformId: PlatformId, workflowId: PlatformWorkflowId): IndustryTemplateSnapshot {
  const rulePack = getPlatformRulePack(platformId);
  return {
    id: `history-example-template-${platformId}`,
    name: "旅行用品行业示例模板",
    description: "静态行业视觉指导示例，仅用于查看流程。",
    source: "custom",
    scope: { platformId, workflowId },
    baseTemplateId: "system-general",
    version: 1,
    brief: {
      industry: "旅行用品",
      productTypes: "颈枕与便携出行用品",
      targetAudience: "长途出行人群",
      stylePreference: "干净、可信、轻量旅行场景",
      extraRequirements: "突出真实材质与可折叠结构",
      forbiddenContent: "不添加医疗效果或未经验证的承诺",
    },
    slots: rulePack.slots.map((slot) => ({
      slotKey: slot.key,
      label: slot.label,
      guidance: `展示${slot.label}中的真实产品证据与旅行使用语境。`,
      negativeGuidance: "避免夸张光效、虚构材质和不可验证承诺。",
    })),
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function examplePlan(platformId: PlatformId, workflowId: PlatformWorkflowId): PlatformPlan {
  const rulePack = getPlatformRulePack(platformId);
  return {
    platformId,
    source: "api",
    slots: rulePack.slots.map((slot) => ({
      slotKey: slot.key,
      visibleCopy: slot.key === "MAIN" ? "" : `CloudRest ${slot.label}`,
      strategy: `流程示例：围绕${slot.label}组织可验证的商品视觉证据。`,
      evidence: ["示例商品资料：慢回弹颈部支撑、可折叠收纳、外套可拆洗。"],
      prompt: `Professional product image for CloudRest travel pillow, ${slot.label}, realistic travel context, accurate product geometry.`,
      negativePrompt: "no medical claims, no invented accessories, no distorted product",
      ...(platformId === "amazon" && slot.group === "a-plus" && slot.dimensions.width === 220
        ? { externalText: { title: "Verified travel comfort", body: "Foldable support for long journeys." } }
        : {}),
    })),
    ...(platformId === "amazon"
      ? { amazonSession: { marketplaceId: "us", plannerMode: workflowId === "amazon-aplus" ? "aplus" : "listing", sizeTier: "2K", slotKeys: rulePack.slots.map((slot) => slot.key) } }
      : {}),
  };
}

export const historyProcessExamples: readonly HistoryProcessExample[] = Object.freeze([
  {
    id: "history-example-amazon-listing",
    title: "流程示例",
    description: "从商品资料到 Amazon Listing 生产包的完整路径。示例仅供查看，不代表已执行任务。",
    project: amazonProject,
    platformId: "amazon",
    workflowId: "amazon-listing",
    steps: ["确认商品资料与参考图", "AI 策划 Listing 槽位", "逐槽位生成并检查", "导出交付包"],
    taskSettings: { platformId: "amazon", workflowId: "amazon-listing", locale: "en-US", marketplaceId: "us", plannerMode: "listing", listingImageCount: 7, aPlusType: "standard", aPlusModuleSpecs: [], sizeTier: "2K", stylePresetId: null, selectedReferenceAssetIds: [] },
    industryTemplate: exampleTemplate("amazon", "amazon-listing"),
    plan: examplePlan("amazon", "amazon-listing"),
    exportStructure: ["product.json", "platform-plan.json", "slots/MAIN/prompt.txt", "manifest.json"],
    refill: {
      sourceMode: "manual",
      listingText: "CloudRest memory foam travel pillow with washable cover and foldable snap closure.",
      selectedReferenceAssetIds: [],
      selectedStyleReferenceId: null,
      options: { marketplaceId: "us", plannerMode: "listing", sizeTier: "2K" },
    },
  },
  {
    id: "history-example-taobao-product",
    title: "流程示例",
    description: "从商品资料到淘宝商品生产包的完整路径。示例仅供查看，不代表已执行任务。",
    project: taobaoProject,
    platformId: "taobao",
    workflowId: "taobao-product",
    steps: ["确认商品资料与参考图", "AI 策划商品详情槽位", "逐槽位生成并检查", "导出交付包"],
    taskSettings: { platformId: "taobao", workflowId: "taobao-product", locale: "zh-CN", stylePresetId: null, selectedReferenceAssetIds: [] },
    industryTemplate: exampleTemplate("taobao", "taobao-product"),
    plan: examplePlan("taobao", "taobao-product"),
    exportStructure: ["product.json", "platform-plan.json", "slots/TB-HERO-01/prompt.txt", "manifest.json"],
    refill: {
      sourceMode: "manual",
      productText: "可折叠记忆棉旅行颈枕，外套可拆洗，适合长途出行。",
      selectedReferenceAssetIds: [],
      stylePresetId: null,
    },
  },
]);

export function getHistoryProcessExamples(platformId?: PlatformId): readonly HistoryProcessExample[] {
  return platformId
    ? historyProcessExamples.filter((example) => example.platformId === platformId)
    : historyProcessExamples;
}

/** Build a detached payload so refilling cannot mutate the static example. */
export function createHistoryExampleRefillPayload(example: HistoryProcessExample): HistoryExampleRefillPayload {
  return {
    ...example.refill,
    project: structuredClone(example.project),
    platformId: example.platformId,
    workflowId: example.workflowId,
    selectedReferenceAssetIds: [...example.refill.selectedReferenceAssetIds],
    ...(example.refill.options ? { options: structuredClone(example.refill.options) } : {}),
    ...(example.refill.industryTemplate ? { industryTemplate: structuredClone(example.refill.industryTemplate) } : {}),
  };
}
