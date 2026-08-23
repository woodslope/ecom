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
    expect(markup).toContain("主图");
    expect(markup).toContain("核心卖点");
    expect(markup).not.toContain("<small>PT01</small>");
    expect(markup).toContain("2000 × 2000 px");
    expect((markup.match(/class="slot-card(?: |")/g) ?? [])).toHaveLength(
      amazonRulePack.slots.length,
    );
  });

  it("renders the active generated asset as a scannable slot thumbnail", async () => {
    const plan = await demoPlanner.plan(
      productFacts,
      amazonRulePack,
      new AbortController().signal,
    );
    const slot = plan.slots.find((item) => item.slotKey === "PT01")!;
    const markup = renderToStaticMarkup(
      createElement(SlotBoard, {
        rulePack: amazonRulePack,
        plan,
        selectedSlotKey: "PT01",
        planningInputSignature: "signature-01",
        assets: [
          {
            metadata: {
              id: "asset-active",
              projectId: "project-01",
              name: "pt01.png",
              kind: "generated" as const,
              tags: [],
              mimeType: "image/png",
              size: 256,
              createdAt: "2026-08-09T00:00:00.000Z",
              updatedAt: "2026-08-09T00:00:00.000Z",
            },
            objectUrl: "blob:test/generated-pt01",
          },
        ],
        versionStates: {
          PT01: {
            activeVersionId: "version-02",
            versions: [
              {
                id: "version-01",
                slotKey: "PT01",
                assetId: "asset-old",
                createdAt: "2026-08-09T00:00:00.000Z",
                source: "demo" as const,
                promptSnapshot: slot.prompt,
                visibleCopySnapshot: slot.visibleCopy,
                planningInputSignature: "signature-01",
                width: 2000,
                height: 2000,
                mimeType: "image/png",
                parameters: {},
              },
              {
                id: "version-02",
                slotKey: "PT01",
                assetId: "asset-active",
                createdAt: "2026-08-09T01:00:00.000Z",
                source: "demo" as const,
                promptSnapshot: slot.prompt,
                visibleCopySnapshot: slot.visibleCopy,
                planningInputSignature: "signature-01",
                width: 2000,
                height: 2000,
                mimeType: "image/png",
                parameters: {},
              },
            ],
          },
        },
        onSelect: () => undefined,
      }),
    );

    expect(markup).toContain('src="blob:test/generated-pt01"');
    expect(markup).toContain("2 个版本");
    expect(markup).toContain("已完成");
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
    expect(markup).toContain("核心卖点");
    expect(markup.indexOf('aria-label="槽位身份"')).toBeLessThan(
      markup.indexOf('aria-label="槽位内容"'),
    );
    expect(markup.indexOf('aria-label="槽位内容"')).toBeLessThan(
      markup.indexOf('aria-label="槽位操作"'),
    );
  });
});
