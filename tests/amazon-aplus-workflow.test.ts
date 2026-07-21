import { describe, expect, it } from "vitest";

import { normalizePlatformPlan } from "../src/domain/planning/normalizer";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { demoPlanner } from "../src/services/demo-planner";
import { OpenAIPlanner } from "../src/services/openai-planner";
import { buildExportPackage } from "../src/domain/export/build-export-package";
import { strFromU8, unzipSync } from "fflate";
import { runCompliance } from "../src/domain/compliance";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlotInspector } from "../src/components/SlotInspector";
import {
  AmazonSessionControls,
  amazonControlsMatchPlan,
  controlsFromPlan,
} from "../src/components/AmazonSessionControls";
import {
  getAPlusModuleSpecs,
  insertAPlusModuleSpecAfter,
  isAPlusExternalTextModuleSpec,
  removeAPlusModuleSpecAt,
  type APlusContentType,
} from "../src/domain/platforms/amazon-catalog";

const facts = {
  productName: "Northwind Travel Pillow",
  category: "Travel",
  brand: "Northwind",
  sku: "NW-P01",
  sellingPoints: ["Washable cover"],
  specifications: { Size: "28 x 25 x 12 cm" },
  forbiddenClaims: [] as string[],
};

const project = {
  id: "project_aplus",
  name: "A+ 项目",
  facts: {
    productName: facts.productName,
    category: facts.category,
    brand: facts.brand,
    model: "P01",
    sku: facts.sku,
    targetAudience: "Travelers",
    description: "Travel pillow with a washable cover.",
    sellingPoints: [...facts.sellingPoints],
    specifications: { ...facts.specifications },
    forbiddenClaims: [...facts.forbiddenClaims],
  },
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

describe("Amazon A+ workflow", () => {
  it("keeps all four A+ catalogs within the 1-12 module boundary", () => {
    const expected: Record<APlusContentType, { keys: string[]; sizes: string[] }> = {
      "standard-large": {
        keys: ["A+L01", "A+L02", "A+L03", "A+L04", "A+L05"],
        sizes: ["970x300", "970x600", "970x600", "970x600", "970x600"],
      },
      standard: {
        keys: ["A+S01", "A+S02", "A+S03", "A+S04", "A+S05", "A+S06", "A+S07", "A+S08"],
        sizes: ["970x300", "970x600", "970x600", "970x600", "220x220", "220x220", "220x220", "220x220"],
      },
      premium: {
        keys: ["A+P01", "A+P02", "A+P03", "A+P04", "A+P05", "A+P06"],
        sizes: ["1464x600", "970x600", "970x600", "970x600", "463x625", "463x625"],
      },
      mobile: {
        keys: ["A+M01", "A+M02", "A+M03", "A+M04", "A+M05"],
        sizes: ["600x450", "600x450", "600x450", "600x450", "600x450"],
      },
    };

    for (const type of Object.keys(expected) as APlusContentType[]) {
      const defaults = getAPlusModuleSpecs(type);
      expect(defaults.map((spec) => spec.slot)).toEqual(expected[type].keys);
      expect(defaults.map((spec) => `${spec.uploadWidth}x${spec.uploadHeight}`)).toEqual(
        expected[type].sizes,
      );
      let expanded = defaults;
      while (expanded.length < 12) {
        expanded = insertAPlusModuleSpecAfter(type, expanded, expanded.length - 1);
      }
      expect(insertAPlusModuleSpecAfter(type, expanded, 0)).toHaveLength(12);
      let reduced = expanded;
      while (reduced.length > 1) reduced = removeAPlusModuleSpecAt(type, reduced, 0);
      expect(removeAPlusModuleSpecAt(type, reduced, 0)).toHaveLength(1);
    }

    expect(getAPlusModuleSpecs("standard").filter(isAPlusExternalTextModuleSpec)).toHaveLength(4);
    expect(getAPlusModuleSpecs("standard-large").some(isAPlusExternalTextModuleSpec)).toBe(false);
  });

  it("keeps 220x220 tile title and body outside the image copy and prompt", () => {
    const { rulePack, amazonSession } = resolvePlanningRulePack("amazon", {
      plannerMode: "aplus",
      aPlusType: "standard",
      marketplaceId: "us",
    });
    const candidate = {
      platformId: "amazon",
      source: "api",
      amazonSession,
      slots: rulePack.slots.map((rule) => {
        const isExternalTextTile = rule.dimensions.width === 220 && rule.dimensions.height === 220;
        return {
          slotKey: rule.key,
          visibleCopy: isExternalTextTile ? "" : `${rule.label} copy`,
          strategy: `${rule.label} 策略`,
          evidence: [`${rule.label} 证据`],
          prompt: `Create a product-only image for ${rule.key}.`,
          negativePrompt: "Do not invent product facts.",
          ...(isExternalTextTile
            ? {
                externalText: {
                  title: `Benefit ${rule.order - 4}`,
                  body: `Verified supporting copy ${rule.order - 4}.`,
                },
              }
            : {}),
        };
      }),
    };

    const plan = normalizePlatformPlan(candidate, rulePack);
    const tile = plan.slots.find((slot) => slot.slotKey === "A+S05")!;

    expect(tile.visibleCopy).toBe("");
    expect(tile.externalText).toEqual({
      title: "Benefit 1",
      body: "Verified supporting copy 1.",
    });
    expect(tile.prompt).not.toContain("Benefit 1");
    expect(tile.prompt).not.toContain("Verified supporting copy 1.");
  });

  it("creates external title and body for every standard A+ tile in Demo mode", async () => {
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "jp" },
    );
    const tiles = plan.slots.filter((slot) => ["A+S05", "A+S06", "A+S07", "A+S08"].includes(slot.slotKey));

    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.visibleCopy).toBe("");
      expect(tile.externalText?.title).toMatch(/確認済みの利点/);
      expect(tile.externalText?.body).toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
      expect(tile.prompt).not.toContain(tile.externalText?.title ?? "missing-title");
      expect(tile.prompt).not.toContain(tile.externalText?.body ?? "missing-body");
    }
  });

  it("tells the API planner which A+ slots use external text", async () => {
    const { rulePack } = resolvePlanningRulePack("amazon", {
      plannerMode: "aplus",
      aPlusType: "standard",
      marketplaceId: "us",
    });
    const candidate = {
      platformId: "amazon",
      source: "api",
      slots: rulePack.slots.map((rule) => {
        const isTile = rule.dimensions.width === 220 && rule.dimensions.height === 220;
        return {
          slotKey: rule.key,
          visibleCopy: isTile ? "" : `${rule.label} copy`,
          strategy: `${rule.label} 策略`,
          evidence: [`${rule.label} 证据`],
          prompt: `Create a product-only image for ${rule.key}.`,
          negativePrompt: "Do not invent product facts.",
          ...(isTile
            ? { externalText: { title: `Benefit ${rule.order - 4}`, body: "Verified benefit." } }
            : {}),
        };
      }),
    };
    let requestBody = "";
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-key",
      model: "planning-model",
      fetch: async (_input, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const plan = await planner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "us" },
    );
    const systemPrompt = (JSON.parse(requestBody) as { messages: Array<{ content: string }> })
      .messages[0].content;

    expect(systemPrompt).toContain("A+S05, A+S06, A+S07, A+S08");
    expect(systemPrompt).toContain("externalText");
    expect(systemPrompt).toContain("outside the image");
    expect(plan.slots.find((slot) => slot.slotKey === "A+S05")?.externalText?.title).toBe("Benefit 1");
  });

  it("exports A+ external copy independently from image prompts", async () => {
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "us" },
    );
    const { rulePack } = resolvePlanningRulePack("amazon", plan.amazonSession);
    const exported = await buildExportPackage({
      project,
      rulePack,
      plan,
      planningInputSignature: "standard-aplus",
      loadAsset: async () => null,
      now: () => "2026-07-20T00:00:00.000Z",
    });
    const archive = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    const externalCopy = strFromU8(archive["external-copy.md"]);
    const tile = exported.manifest.slots.find((slot) => slot.slotKey === "A+S05")!;

    expect(tile.externalText).toEqual(plan.slots.find((slot) => slot.slotKey === "A+S05")?.externalText);
    expect(externalCopy).toContain("A+S05");
    expect(externalCopy).toContain(tile.externalText?.title ?? "missing-title");
    expect(tile.version?.promptSnapshot ?? "").not.toContain(tile.externalText?.title ?? "missing-title");
  });

  it("checks external A+ title and body for module and marketplace compliance", () => {
    const { rulePack } = resolvePlanningRulePack("amazon", {
      plannerMode: "aplus",
      aPlusType: "standard",
      marketplaceId: "us",
    });
    const result = runCompliance(project, rulePack, {
      slotKey: "A+S05",
      visibleCopy: "",
      externalText: {
        title: "Buy now",
        body: "Verified product benefit.",
      },
      strategy: "卖点方块",
      evidence: ["卖点：Washable cover"],
      prompt: "Create a product-only benefit tile image.",
      negativePrompt: "Do not invent facts.",
    });

    expect(result.findings.some((finding) => finding.code === "amazon-a-plus-aggressive-cta"))
      .toBe(true);
    expect(result.manualReviewRequired).toBe(true);
  });

  it("renders external A+ copy as separate editable and copyable fields", async () => {
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "us" },
    );
    const rulePack = resolvePlanningRulePack("amazon", plan.amazonSession).rulePack;
    const slot = plan.slots.find((item) => item.slotKey === "A+S05")!;
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack,
        slot,
        onSave: async () => true,
      }),
    );

    expect(markup).toContain("外部标题（图片外）");
    expect(markup).toContain("外部正文（图片外）");
    expect(markup).toContain("复制外部文案");
    expect(markup).toContain("保存外部文案与提示词");
    expect(markup).not.toContain('aria-label="可见文案"');
  });

  it("marks an existing plan stale when its A+ module arrangement changes", async () => {
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "us" },
    );
    const controls = controlsFromPlan(plan);
    const specs = controls.aPlusModuleSpecs ?? plan.amazonSession?.aPlusModuleSpecs ?? [];
    const changedSpecs = insertAPlusModuleSpecAfter("standard", specs, 0);

    expect(amazonControlsMatchPlan(controls, plan)).toBe(true);
    expect(
      amazonControlsMatchPlan({ ...controls, aPlusModuleSpecs: changedSpecs }, plan),
    ).toBe(false);
    expect(amazonControlsMatchPlan({ ...controls, marketplaceId: "jp" }, plan)).toBe(false);
  });

  it("keeps a planned A+ module list read-only until the user enters adjustment mode", async () => {
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "aplus", aPlusType: "standard", marketplaceId: "us" },
    );
    const value = controlsFromPlan(plan);
    const prepareMarkup = renderToStaticMarkup(
      createElement(AmazonSessionControls, { value, onChange: () => undefined }),
    );
    const plannedMarkup = renderToStaticMarkup(
      createElement(AmazonSessionControls, {
        value,
        hasPlan: true,
        onChange: () => undefined,
      }),
    );

    expect(prepareMarkup).toContain("删除第 1 个模块");
    expect(plannedMarkup).toContain("当前策划模块只读");
    expect(plannedMarkup).toContain("调整模块");
    expect(plannedMarkup).not.toContain("删除第 1 个模块");
  });
});
