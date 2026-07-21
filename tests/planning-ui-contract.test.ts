import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SlotBoard } from "../src/components/SlotBoard";
import { SlotInspector } from "../src/components/SlotInspector";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";

const productFacts = {
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

describe("planning workspace UI contract", () => {
  it("renders every rule-backed slot and exposes a selected slot", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );
    const markup = renderToStaticMarkup(
      createElement(SlotBoard, {
        rulePack: amazonRulePack,
        plan,
        selectedSlotKey: "PT01",
        onSelect: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="平台交付槽位"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("MAIN");
    expect(markup).toContain("A+S08");
    expect(markup).toContain("2000 × 2000 px");
    expect((markup.match(/class="slot-card(?: |")/g) ?? [])).toHaveLength(
      amazonRulePack.slots.length,
    );
  });

  it("renders editable visible copy and prompt while keeping evidence visible", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );
    const slot = plan.slots.find((item) => item.slotKey === "PT01")!;
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: amazonRulePack,
        slot,
        saving: false,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("可见文案");
    expect(markup).toContain("模型提示词（英文，可复制）");
    expect(markup).toContain("策划依据");
    expect(markup).toContain("模型负面约束（英文）");
    expect(markup).toContain("保存文案与提示词");
    expect(markup).toContain(slot.visibleCopy);
    expect(markup).toContain("Create an Amazon");
    expect(markup).toContain('aria-label="槽位身份"');
    expect(markup).toContain('aria-label="槽位内容"');
    expect(markup).toContain('aria-label="槽位操作"');
    expect(markup.indexOf('aria-label="槽位身份"')).toBeLessThan(
      markup.indexOf('aria-label="槽位内容"'),
    );
    expect(markup.indexOf('aria-label="槽位内容"')).toBeLessThan(
      markup.indexOf('aria-label="槽位操作"'),
    );
  });
});
