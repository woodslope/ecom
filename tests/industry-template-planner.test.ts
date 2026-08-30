import { describe, expect, it } from "vitest";

import { createGeneralIndustryTemplateSnapshot } from "../src/domain/prompt-templates/industry-template-packs";
import { getPlatformRulePack } from "../src/domain/platforms/registry";
import { mockPlanner } from "./fixtures/mock-planner";

describe("industry template planner integration", () => {
  it("replaces general slot direction without replacing current product facts", async () => {
    const rulePack = getPlatformRulePack("taobao");
    const template = createGeneralIndustryTemplateSnapshot(
      { platformId: "taobao", workflowId: "taobao-product" },
      rulePack,
    );
    template.name = "家居饰品";
    template.source = "custom";
    template.version = 3;
    template.slots = template.slots.map((slot) => ({
      ...slot,
      guidance: "仅使用家居空间中的材质与比例方向",
    }));

    const plan = await mockPlanner.plan(
      {
        productName: "当前商品陶瓷花瓶",
        category: "花瓶",
        sellingPoints: ["手工釉面"],
      },
      rulePack,
      new AbortController().signal,
      [],
      undefined,
      undefined,
      template,
    );

    expect(plan.slots[0]?.prompt).toContain("当前商品陶瓷花瓶");
    expect(plan.slots[0]?.prompt).toContain("仅使用家居空间中的材质与比例方向");
    expect(plan.slots[0]?.prompt).not.toContain("主体完整");
    expect(plan.slots[0]?.strategy).toContain("家居饰品 v3");
  });

  it("keeps Amazon model prompts in English when the template guidance is Chinese", async () => {
    const rulePack = getPlatformRulePack("amazon");
    const template = createGeneralIndustryTemplateSnapshot(
      { platformId: "amazon", workflowId: "amazon-listing" },
      rulePack,
    );
    template.name = "旅行用品";
    template.source = "custom";
    template.slots = template.slots.map((slot) => ({
      ...slot,
      guidance: "突出旅行场景中的便携性，但不得固定具体机场或交通工具",
    }));

    const plan = await mockPlanner.plan(
      { productName: "CloudRest Travel Pillow", sellingPoints: ["Foldable"] },
      rulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", listingImageCount: 7 },
      undefined,
      template,
    );

    expect(plan.slots[0]?.strategy).toContain("突出旅行场景中的便携性");
    expect(plan.slots[0]?.prompt).not.toContain("突出旅行场景中的便携性");
    expect(plan.slots[0]?.prompt).toContain("Apply the selected reusable industry direction");
    expect(plan.slots[0]?.negativePrompt).not.toContain("不得固定");
  });
});
