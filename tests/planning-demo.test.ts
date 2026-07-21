import { describe, expect, it } from "vitest";

import type { PlannerEngine } from "../src/domain/planning/types";
import type { ProductFacts } from "../src/domain/projects/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { DemoPlanner, demoPlanner } from "../src/services/demo-planner";

const productFacts: ProductFacts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  brand: "Northwind",
  model: "NW-P01",
  sku: "P01-GRAY",
  targetAudience: "经常乘坐飞机和高铁的通勤人群",
  description: "可折叠记忆棉颈枕，带可拆洗外套。",
  sellingPoints: ["慢回弹记忆棉", "可折叠收纳", "外套可拆洗"],
  specifications: {
    材质: "记忆棉、聚酯纤维",
    尺寸: "28 x 25 x 12 cm",
  },
  forbiddenClaims: [],
};

const productWithoutSpecifications: ProductFacts = {
  ...productFacts,
  specifications: {},
};

const colorOnlyProductFacts: ProductFacts = {
  ...productFacts,
  targetAudience: "",
  description: "",
  sellingPoints: [],
  specifications: {
    颜色: "雾灰色",
  },
};

describe("demo planner", () => {
  it("implements the planner contract with one editable draft per Taobao slot", async () => {
    const planner: PlannerEngine = demoPlanner;
    const signal = new AbortController().signal;

    const firstPlan = await planner.plan(productFacts, taobaoRulePack, signal);
    const secondPlan = await planner.plan(productFacts, taobaoRulePack, signal);

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.source).toBe("demo");
    expect(firstPlan.slots.map((slot) => slot.slotKey)).toEqual(
      taobaoRulePack.slots.map((slot) => slot.key),
    );
    expect(new Set(firstPlan.slots.map((slot) => slot.slotKey))).toHaveLength(
      taobaoRulePack.slots.length,
    );

    for (const [index, slot] of firstPlan.slots.entries()) {
      expect(slot.visibleCopy.length).toBeGreaterThan(0);
      expect(slot.strategy).toContain(taobaoRulePack.slots[index].purpose);
      expect(slot.evidence.length).toBeGreaterThan(0);
      expect(slot.prompt).toContain(productFacts.productName);
      expect(slot.prompt).toContain(
        `${taobaoRulePack.slots[index].dimensions.width}x${taobaoRulePack.slots[index].dimensions.height}`,
      );
    }

    firstPlan.slots[0].prompt = "用户编辑后的提示词";
    firstPlan.slots[0].visibleCopy = "用户编辑后的文案";
    firstPlan.slots[0].strategy = "用户编辑后的策略";
    firstPlan.slots[0].evidence = ["用户编辑后的证据"];
    expect(firstPlan.slots[0].prompt).toBe("用户编辑后的提示词");
  });

  it("adapts the deterministic plan to Amazon MAIN and locale rules", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );

    expect(plan.slots.map((slot) => slot.slotKey)).toEqual(
      amazonRulePack.slots.map((slot) => slot.key),
    );
    expect(plan.slots[0].visibleCopy).toBe("");
    expect(plan.slots[0].prompt).toContain("pure white background");
    expect(plan.slots[0].prompt).toContain("one sold product");
    expect(plan.slots[0].prompt).toContain("Do not add visible copy");
    expect(plan.slots.every((slot) => slot.prompt.includes("en-US"))).toBe(true);
    expect(plan.slots.find((slot) => slot.slotKey === "A+S01")?.negativePrompt).toContain(
      "price",
    );
  });

  it("keeps Amazon model prompts English-shaped while leaving Chinese planning evidence readable", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );
    const main = plan.slots.find((slot) => slot.slotKey === "MAIN")!;
    const benefit = plan.slots.find((slot) => slot.slotKey === "PT01")!;

    expect(main.prompt).toContain("Create an Amazon main image");
    expect(main.prompt).not.toContain("为 Amazon 制作");
    expect(main.prompt).not.toContain("商品：");
    expect(benefit.prompt).not.toContain("卖点：");
    expect(main.negativePrompt).toContain("Do not");
    expect(benefit.strategy).toContain("核心卖点");
    expect(benefit.evidence.some((item) => item.startsWith("卖点："))).toBe(true);
  });

  it("assigns facts by slot purpose instead of rotating unrelated facts by index", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      taobaoRulePack,
      new AbortController().signal,
    );
    const hero = plan.slots.find((slot) => slot.slotKey === "TB-HERO-01")!;
    const usage = plan.slots.find((slot) => slot.slotKey === "TB-DETAIL-04")!;
    const specifications = plan.slots.find((slot) => slot.slotKey === "TB-DETAIL-06")!;

    expect(hero.evidence.some((item) => item.includes(productFacts.brand))).toBe(true);
    expect(usage.evidence.some((item) => item.includes(productFacts.targetAudience))).toBe(true);
    expect(usage.evidence.join(" ")).not.toContain(productFacts.model);
    expect(usage.evidence.join(" ")).not.toContain(productFacts.sku);
    expect(specifications.evidence.some((item) => item.includes("28 x 25 x 12 cm"))).toBe(true);
    expect(specifications.evidence.join(" ")).not.toContain(productFacts.sellingPoints[0]);
  });

  it("marks missing specification, packaging, trust, and service facts without inventing them", async () => {
    const [taobaoPlan, amazonPlan, amazonWithoutSpecifications] = await Promise.all([
      demoPlanner.plan(productFacts, taobaoRulePack, new AbortController().signal),
      demoPlanner.plan(productFacts, amazonRulePack, new AbortController().signal),
      demoPlanner.plan(
        productWithoutSpecifications,
        amazonRulePack,
        new AbortController().signal,
      ),
    ]);
    const expectedGaps = [
      { plan: taobaoPlan, slotKey: "TB-HERO-05" },
      { plan: taobaoPlan, slotKey: "TB-DETAIL-06" },
      { plan: taobaoPlan, slotKey: "TB-DETAIL-07" },
      { plan: amazonPlan, slotKey: "PT06" },
      { plan: amazonWithoutSpecifications, slotKey: "PT04" },
    ];

    for (const { plan, slotKey } of expectedGaps) {
      const slot = plan.slots.find((item) => item.slotKey === slotKey)!;
      expect(slot.evidence.some((item) => item.includes("待补资料"))).toBe(true);
      expect(slot.prompt).toContain(
        plan.platformId === "amazon" ? "Do not invent missing product facts" : "禁止臆造",
      );
    }
  });

  it("keeps every non-empty Amazon visible copy ASCII-safe", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );

    for (const slot of plan.slots) {
      if (slot.visibleCopy.length > 0) {
        expect(slot.visibleCopy).toMatch(/^[\x20-\x7e]+$/);
      }
    }
  });

  it("rejects an already-aborted planning request with the caller's reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("用户取消策划", "AbortError");
    controller.abort(reason);

    await expect(demoPlanner.plan(productFacts, taobaoRulePack, controller.signal)).rejects.toBe(
      reason,
    );
  });

  it("rejects a delayed planning request with the caller's cancellation reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("用户取消慢速策划", "AbortError");
    const request = new DemoPlanner(50).plan(productFacts, taobaoRulePack, controller.signal);

    controller.abort(reason);

    await expect(request).rejects.toBe(reason);
  });

  it("keeps unrelated color and identity facts out of category-specific evidence", async () => {
    const [taobaoPlan, amazonPlan] = await Promise.all([
      demoPlanner.plan(colorOnlyProductFacts, taobaoRulePack, new AbortController().signal),
      demoPlanner.plan(colorOnlyProductFacts, amazonRulePack, new AbortController().signal),
    ]);
    const expectedGaps = [
      { plan: amazonPlan, slotKey: "PT04", gap: /尺寸|规格|适配/ },
      { plan: taobaoPlan, slotKey: "TB-DETAIL-06", gap: /尺寸|规格/ },
      { plan: taobaoPlan, slotKey: "TB-HERO-04", gap: /材质|工艺/ },
      { plan: amazonPlan, slotKey: "PT05", gap: /材质|工艺/ },
      { plan: taobaoPlan, slotKey: "TB-DETAIL-02", gap: /痛点|需求|方案|卖点/ },
      { plan: amazonPlan, slotKey: "A+S02", gap: /痛点|需求|方案|卖点/ },
      { plan: taobaoPlan, slotKey: "TB-HERO-05", gap: /包装|清单/ },
      { plan: amazonPlan, slotKey: "PT06", gap: /包装|清单/ },
      { plan: taobaoPlan, slotKey: "TB-DETAIL-07", gap: /服务|售后|信任/ },
    ];

    for (const { plan, slotKey, gap } of expectedGaps) {
      const slot = plan.slots.find((item) => item.slotKey === slotKey)!;
      expect(
        slot.evidence.some((item) => item.startsWith("待补资料") && gap.test(item)),
      ).toBe(true);
      expect(slot.evidence.join(" ")).not.toContain("颜色：雾灰色");
      expect(slot.prompt).toContain(
        plan.platformId === "amazon" ? "Do not invent missing product facts" : "禁止臆造",
      );
    }

    for (const slotKey of ["TB-DETAIL-02", "A+S02"]) {
      const plan = slotKey.startsWith("TB-") ? taobaoPlan : amazonPlan;
      const evidence = plan.slots.find((item) => item.slotKey === slotKey)!.evidence.join(" ");
      expect(evidence).not.toContain(colorOnlyProductFacts.productName);
      expect(evidence).not.toContain(colorOnlyProductFacts.brand);
    }
  });
});
