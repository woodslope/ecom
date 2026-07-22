import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TaobaoMobilePreview } from "../src/components/TaobaoMobilePreview";
import { createTaobaoPreviewModel } from "../src/domain/platforms/taobao-preview";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { demoPlanner } from "../src/services/demo-planner";

const facts = {
  productName: "云感旅行颈枕",
  category: "旅行用品",
  sellingPoints: ["慢回弹"],
  specifications: { 材质: "记忆棉" },
  forbiddenClaims: [] as string[],
};

describe("Taobao mobile preview", () => {
  it("builds a fixed 5+7 preview from a session or run snapshot and reports missing slots", async () => {
    const plan = await demoPlanner.plan(facts, taobaoRulePack, new AbortController().signal);
    const first = plan.slots[0]!;
    const model = createTaobaoPreviewModel({
      source: "run",
      sourceId: "run_taobao",
      plan,
      planningInputSignature: "signature_taobao",
      slotVersions: {
        [first.slotKey]: {
          activeVersionId: "version_hero",
          versions: [{
            id: "version_hero",
            slotKey: first.slotKey,
            assetId: "asset_hero",
            createdAt: "2026-07-21T09:00:00.000Z",
            source: "demo",
            promptSnapshot: first.prompt,
            visibleCopySnapshot: first.visibleCopy,
            planningInputSignature: "signature_taobao",
            width: 800,
            height: 800,
            mimeType: "image/svg+xml",
            parameters: {},
          }],
        },
      },
      assetUrls: { asset_hero: "blob:test/hero" },
    });

    expect(model).toMatchObject({
      source: "run",
      sourceId: "run_taobao",
      ready: false,
      completedCount: 1,
    });
    expect(model.gallery).toHaveLength(5);
    expect(model.details).toHaveLength(7);
    expect(model.gallery[0]).toMatchObject({
      slotKey: "TB-HERO-01",
      assetId: "asset_hero",
      objectUrl: "blob:test/hero",
      missing: false,
    });
    expect(model.missingSlots).toEqual(taobaoRulePack.slots.slice(1).map((slot) => slot.key));
  });

  it("renders five gallery controls, seven stacked detail slots, missing hints, and package export", async () => {
    const plan = await demoPlanner.plan(facts, taobaoRulePack, new AbortController().signal);
    const markup = renderToStaticMarkup(createElement(TaobaoMobilePreview, {
      open: true,
      title: facts.productName,
      source: "session",
      sourceId: "session_taobao",
      plan,
      planningInputSignature: "signature_taobao",
      slotVersions: {},
      assetUrls: {},
      onExport: () => undefined,
      onClose: () => undefined,
    }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("淘宝手机商品页预览");
    expect(markup.match(/aria-label="查看 TB-HERO-/g)).toHaveLength(5);
    expect(markup.match(/data-slot-key="TB-DETAIL-/g)).toHaveLength(7);
    expect(markup).toContain("当前商品");
    expect(markup).toContain("还需完成 12 个槽位");
    expect(markup).toContain("头图 5 个 · 详情 7 个");
    expect(markup).toContain("查看槽位明细");
    expect(markup).not.toContain("当前 session");
    expect(markup).not.toContain("session_taobao");
    expect(markup).toContain("导出当前结果");
  });
});
