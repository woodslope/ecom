import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AmazonMobilePreview } from "../src/components/AmazonMobilePreview";
import { ProductionRunCard } from "../src/components/ProductionRunCard";
import { createAmazonPreviewModel } from "../src/domain/platforms/amazon-preview";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import type { ProductionRunRecord } from "../src/domain/tasks";
import { mockPlanner } from "./fixtures/mock-planner";

const facts = {
  productName: "Northwind Travel Pillow",
  category: "Travel",
  sellingPoints: ["Washable cover"],
  specifications: { Size: "28 x 25 x 12 cm" },
  forbiddenClaims: [] as string[],
};

const projectFacts = {
  ...facts,
  brand: "Northwind",
  model: "NW-P01",
  sku: "NW-P01",
  targetAudience: "Travelers",
  description: "Travel pillow with a washable cover.",
};

async function createAmazonPlan(mode: "listing" | "aplus", aPlusType?: "standard") {
  const options = mode === "listing"
    ? { plannerMode: "listing" as const, marketplaceId: "us" as const, listingImageCount: 7 }
    : { plannerMode: "aplus" as const, marketplaceId: "us" as const, aPlusType };
  const { rulePack } = resolvePlanningRulePack("amazon", options);
  return mockPlanner.plan(
    facts,
    rulePack,
    new AbortController().signal,
    [],
    options,
  );
}

describe("Amazon mobile content preview", () => {
  it("builds a square Listing carousel from a run snapshot and reports missing slots", async () => {
    const plan = await createAmazonPlan("listing");
    const first = plan.slots[0]!;
    const model = createAmazonPreviewModel({
      source: "run",
      sourceId: "run_amazon_listing",
      plan,
      planningInputSignature: "signature_listing",
      slotVersions: {
        [first.slotKey]: {
          activeVersionId: "version_main",
          versions: [{
            id: "version_main",
            slotKey: first.slotKey,
            assetId: "asset_main",
            createdAt: "2026-07-22T09:00:00.000Z",
            source: "api",
            promptSnapshot: first.prompt,
            visibleCopySnapshot: first.visibleCopy,
            planningInputSignature: "signature_listing",
            width: 2000,
            height: 2000,
            mimeType: "image/svg+xml",
            parameters: {},
          }],
        },
      },
      assetUrls: { asset_main: "blob:test/main" },
    });

    expect(model).toMatchObject({
      source: "run",
      sourceId: "run_amazon_listing",
      mode: "listing",
      ready: false,
      completedCount: 1,
    });
    expect(model.items).toHaveLength(7);
    expect(model.items[0]).toMatchObject({
      slotKey: "MAIN",
      assetId: "asset_main",
      objectUrl: "blob:test/main",
      missing: false,
    });
    expect(model.items.every((item) => item.width === item.height)).toBe(true);
    expect(model.missingSlots).toEqual(plan.slots.slice(1).map((slot) => slot.slotKey));
  });

  it("renders A+ modules in order with existing external title and body only", async () => {
    const plan = await createAmazonPlan("aplus", "standard");
    const tile = plan.slots.find((slot) => slot.slotKey === "A+S05")!;
    const markup = renderToStaticMarkup(createElement(AmazonMobilePreview, {
      open: true,
      title: facts.productName,
      source: "session",
      sourceId: "session_amazon_aplus",
      plan,
      planningInputSignature: "signature_aplus",
      slotVersions: {},
      assetUrls: {},
      onExport: () => undefined,
      onClose: () => undefined,
    }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Amazon 手机内容预览");
    expect(markup).toContain('aria-label="Amazon A+ 手机内容"');
    expect(markup.match(/data-slot-key="A\+S/g)).toHaveLength(8);
    expect(tile.externalText).toBeDefined();
    expect(markup).toContain(tile.externalText!.title!);
    expect(markup).toContain(tile.externalText!.body!);
    expect(markup).toContain("还需完成 8 个槽位");
    expect(markup).not.toContain("价格");
    expect(markup).not.toContain("评分");
    expect(markup).not.toContain("购买");
  });

  it("renders Listing thumbnails without product-page purchase details", async () => {
    const plan = await createAmazonPlan("listing");
    const markup = renderToStaticMarkup(createElement(AmazonMobilePreview, {
      open: true,
      title: facts.productName,
      source: "run",
      sourceId: "run_amazon_listing",
      plan,
      planningInputSignature: "signature_listing",
      slotVersions: {},
      assetUrls: {},
      onClose: () => undefined,
    }));

    expect(markup).toContain('aria-label="Amazon Listing 手机内容"');
    expect(markup.match(/aria-label="查看 (?:MAIN|PT\d{2})/g)).toHaveLength(7);
    expect(markup).toContain("历史快照");
    expect(markup).not.toContain("价格");
    expect(markup).not.toContain("评分");
    expect(markup).not.toContain("加入购物车");
  });

  it("offers the same preview entry from an Amazon history run", async () => {
    const plan = await createAmazonPlan("listing");
    const record = {
      project: {
        id: "project_amazon_preview",
        name: "Amazon 预览项目",
        facts: projectFacts,
        createdAt: "2026-07-22T09:00:00.000Z",
        updatedAt: "2026-07-22T09:00:00.000Z",
      },
      run: {
        id: "run_amazon_preview",
        projectId: "project_amazon_preview",
        sessionId: "session_amazon_preview",
        platformId: "amazon",
        workflowId: "amazon-listing",
        source: "api",
        status: "planned",
        contextSnapshot: {
          sourceInput: { listingText: "" },
          options: {
            platformId: "amazon",
            marketplaceId: "us",
            plannerMode: "listing",
            sizeTier: "2K",
            stylePresetId: "clean-retail",
          },
          selectedReferenceAssetIds: [],
        },
        planSnapshot: plan,
        planningInputSignatureSnapshot: "signature_listing",
        slotVersionsSnapshot: {},
        events: [],
        createdAt: "2026-07-22T09:00:00.000Z",
        updatedAt: "2026-07-22T09:00:00.000Z",
      },
    } as ProductionRunRecord;
    const compactMarkup = renderToStaticMarkup(createElement(ProductionRunCard, {
      record,
      compact: true,
      current: false,
      assetUrls: {},
      onResume: () => undefined,
      onFork: () => undefined,
    }));

    expect(compactMarkup).toContain("手机预览");
    const fullMarkup = renderToStaticMarkup(createElement(ProductionRunCard, {
      record,
      compact: false,
      current: false,
      assetUrls: {},
      onResume: () => undefined,
      onFork: () => undefined,
    }));
    expect(fullMarkup).toContain(">API<");
    expect(compactMarkup).toContain("Northwind Travel Pillow");
    expect(compactMarkup).toContain("Run run_amazon_preview");
    expect(compactMarkup).toContain('aria-label="MAIN 尚未生成"');
    expect(compactMarkup).not.toContain("尚无生成结果");
    expect(compactMarkup).not.toContain("回看阶段");
    expect(compactMarkup).not.toContain("production-run-card__details");
  });
});
