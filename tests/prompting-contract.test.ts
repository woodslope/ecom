import { describe, expect, it } from "vitest";
import {
  PROMPT_BUNDLE_VERSION,
  buildPlannerPrompt,
  buildGenerationPrompt,
  buildLocalizationPrompt,
  createPlannerTaskSettings,
  type PromptTrace,
} from "../src/domain/prompting";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import { createGeneralIndustryTemplateSnapshot } from "../src/domain/prompt-templates/industry-template-packs";

describe("prompting contract", () => {
  it("stamps version, priority, and source on every bundle", () => {
    const bundle = buildLocalizationPrompt({
      facts: { productName: "Lamp" },
      targetLocale: "en-US",
      rules: {
        preserveBrand: true,
        preserveModel: true,
        preserveSku: true,
        preserveNumbers: true,
        preserveForbiddenClaims: true,
      },
    });
    expect(bundle.version).toBe(PROMPT_BUNDLE_VERSION);
    expect(bundle.priority).toBeGreaterThan(0);
    expect(bundle.source).toBe("system");
    expect(bundle.messages).toHaveLength(2);
  });

  it("keeps generation prompt free of API configuration", () => {
    const bundle = buildGenerationPrompt({
      request: {
        productName: "Lamp",
        platformId: "amazon",
        slotKey: "MAIN",
        prompt: "A clean product photo",
        negativePrompt: "blurry",
        visibleCopy: "",
      },
    });
    expect(bundle.kind).toBe("generation");
    expect(bundle.user).not.toMatch(/apiKey|endpoint|model/i);
  });

  it("includes the provider aspect ratio and both canvas contracts", () => {
    const bundle = buildGenerationPrompt({
      request: {
        productName: "Lamp",
        platformId: "taobao",
        slotKey: "TB-DETAIL-01",
        prompt: "制作商品详情图",
        negativePrompt: "模糊",
        visibleCopy: "",
        dimensions: { width: 1024, height: 1536, unit: "px" },
        uploadDimensions: { width: 750, height: 1000, unit: "px" },
      },
    });
    expect(bundle.user).toContain("Target aspect ratio: 2:3.");
    expect(bundle.user).toContain("Expected output resolution: 1024x1536.");
    expect(bundle.user).toContain("Upload reference size: 750x1000.");
  });

  it("keeps selected planner task settings explicit and separate from rule data", () => {
    const resolved = resolvePlanningRulePack("amazon", {
      marketplaceId: "jp",
      plannerMode: "listing",
      listingImageCount: 9,
      sizeTier: "4K",
      stylePresetId: "soft-lifestyle",
    });
    const settings = createPlannerTaskSettings(resolved.rulePack, {
      marketplaceId: "jp",
      plannerMode: "listing",
      listingImageCount: 9,
      sizeTier: "4K",
      stylePresetId: "soft-lifestyle",
    }, "soft-lifestyle");
    const bundle = buildPlannerPrompt({
      project: { productName: "旅行枕", listingText: "Title: CloudRest" },
      rulePack: resolved.rulePack,
      taskSettings: settings,
    });
    expect(JSON.parse(bundle.user)).toMatchObject({
      taskSettings: {
        platformId: "amazon",
        workflowId: "amazon-listing",
        locale: "ja-JP",
        marketplaceId: "jp",
        plannerMode: "listing",
        listingImageCount: 9,
        sizeTier: "4K",
        stylePresetId: "soft-lifestyle",
      },
      originalListingText: "Title: CloudRest",
    });
  });

  it("resolves Taobao settings without importing Amazon-only defaults", () => {
    expect(createPlannerTaskSettings(taobaoRulePack, undefined, "clean-retail")).toEqual({
      platformId: "taobao",
      workflowId: "taobao-product",
      locale: "zh-CN",
      stylePresetId: "clean-retail",
      selectedReferenceAssetIds: [],
    });
  });

  it("sends active industry guidance separately and replaces general slot direction", () => {
    const general = createGeneralIndustryTemplateSnapshot(
      { platformId: "taobao", workflowId: "taobao-product" },
      taobaoRulePack,
    );
    const industryTemplate = {
      ...general,
      id: "industry-home",
      name: "家居饰品",
      source: "custom" as const,
      version: 2,
      slots: general.slots.map((slot, index) => index === 0
        ? { ...slot, guidance: "仅使用家居行业构图方向" }
        : slot),
    };
    const bundle = buildPlannerPrompt({
      project: { productName: "陶瓷花瓶" },
      rulePack: taobaoRulePack,
      industryTemplate,
    });
    const payload = JSON.parse(bundle.user) as Record<string, any>;
    const platformSlot = payload.platformContract.slots[0];
    const activeSlot = payload.activeIndustryGuidance.slots[0];

    expect(payload).not.toHaveProperty("rulePack");
    expect(payload).not.toHaveProperty("industryTemplate");
    expect(platformSlot).not.toHaveProperty("purpose");
    expect(platformSlot).not.toHaveProperty("planningHints");
    expect(platformSlot.dimensions).toEqual(taobaoRulePack.slots[0]?.dimensions);
    expect(platformSlot.complianceReminders).toEqual(taobaoRulePack.slots[0]?.complianceReminders);
    expect(activeSlot.guidance).toBe("仅使用家居行业构图方向");
    expect(bundle.system).toContain("activeIndustryGuidance");
  });

  it("allows trace fields to be omitted or supplied", () => {
    const omitted: PromptTrace = {};
    const complete: PromptTrace = {
      requestId: "req-1",
      provider: "openai",
      model: "gpt-5",
      startedAt: new Date().toISOString(),
      durationMs: 42,
    };
    expect(omitted).toEqual({});
    expect(complete.durationMs).toBe(42);
  });
});
