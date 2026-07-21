import { describe, expect, it } from "vitest";

import type { PlanningProjectFacts } from "../src/domain/planning/types";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import { runCompliance } from "../src/domain/compliance";
import { buildExportPackage } from "../src/domain/export/build-export-package";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import {
  AMAZON_MARKETPLACES,
  type AmazonMarketplaceId,
} from "../src/domain/platforms/amazon-marketplaces";
import { demoPlanner } from "../src/services/demo-planner";
import { demoCopilot } from "../src/services/demo-copilot";
import { OpenAIPlanner } from "../src/services/openai-planner";
import { OpenAICopilot } from "../src/services/openai-copilot";

const facts: PlanningProjectFacts = {
  productName: "Northwind Travel Pillow",
  brand: "Northwind",
  sku: "NW-P01",
  sellingPoints: ["28 x 25 x 12 cm", "washable cover"],
};

const project = {
  id: "project_localization",
  name: "Amazon 本地化测试",
  facts: {
    productName: facts.productName,
    category: "Travel accessories",
    brand: facts.brand ?? "",
    model: "P01",
    sku: facts.sku ?? "",
    targetAudience: "Travelers",
    description: "Travel pillow with a washable cover.",
    sellingPoints: [...(facts.sellingPoints ?? [])],
    specifications: {},
    forbiddenClaims: [],
  },
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

const localizedBenefitSamples: Record<AmazonMarketplaceId, RegExp> = {
  us: /Core benefit/i,
  jp: /主な特長/,
  de: /Hauptvorteil/,
  fr: /Avantage principal/,
  it: /Vantaggio principale/,
  es: /Ventaja principal/,
};

const localizedListingSamples: Record<AmazonMarketplaceId, string[]> = {
  us: ["Core benefit", "Feature proof", "Lifestyle", "Size and fit", "Detail and material", "Package and trust"],
  jp: ["主な特長", "機能の根拠", "利用シーン", "サイズと適合", "素材とディテール", "セット内容"],
  de: ["Hauptvorteil", "Funktionsnachweis", "Anwendungsszene", "Größe und Passform", "Material und Details", "Lieferumfang"],
  fr: ["Avantage principal", "Preuve fonctionnelle", "Mise en situation", "Taille et compatibilité", "Matière et détails", "Contenu de la boîte"],
  it: ["Vantaggio principale", "Prova funzionale", "Scenario d'uso", "Dimensioni e compatibilità", "Materiali e dettagli", "Contenuto della confezione"],
  es: ["Ventaja principal", "Prueba funcional", "Escena de uso", "Tamaño y compatibilidad", "Materiales y detalles", "Contenido de la caja"],
};

describe("Amazon marketplace localization", () => {
  it("produces deterministic target-language Demo copy for all six marketplaces", async () => {
    for (const marketplace of AMAZON_MARKETPLACES) {
      const plan = await demoPlanner.plan(
        facts,
        amazonRulePack,
        new AbortController().signal,
        [],
        {
          plannerMode: "listing",
          marketplaceId: marketplace.id,
          listingImageCount: 7,
        },
      );

      expect(plan.amazonSession?.marketplaceId).toBe(marketplace.id);
      expect(plan.slots.find((slot) => slot.slotKey === "MAIN")?.visibleCopy).toBe("");
      expect(plan.slots.find((slot) => slot.slotKey === "PT01")?.visibleCopy).toMatch(
        localizedBenefitSamples[marketplace.id],
      );
      expect(plan.slots.slice(1).map((slot) => slot.visibleCopy)).toEqual(
        localizedListingSamples[marketplace.id],
      );
    }
  });

  it("instructs the API planner with the selected language and accepts localized Unicode copy", async () => {
    for (const marketplaceId of ["jp", "de", "fr", "it", "es"] as const) {
      const { rulePack } = resolvePlanningRulePack("amazon", {
        plannerMode: "listing",
        marketplaceId,
        listingImageCount: 7,
      });
      const localizedCopy = localizedBenefitSamples[marketplaceId].source.replaceAll("\\", "");
      const candidate = {
        platformId: "amazon",
        source: "api",
        slots: rulePack.slots.map((slot) => ({
          slotKey: slot.key,
          visibleCopy: slot.key === "MAIN" ? "model-added headline" : localizedCopy,
          strategy: `${slot.label} 策略`,
          evidence: [`${slot.label} 证据`],
          prompt: `Create the ${slot.key} image for ${facts.brand} ${facts.sku}.`,
          negativePrompt: "Do not invent product facts.",
        })),
      };
      const fetchMock = async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      const planner = new OpenAIPlanner({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-key",
        model: "planning-model",
        fetch: fetchMock,
      });
      let requestBody = "";
      const capturingPlanner = new OpenAIPlanner({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-key",
        model: "planning-model",
        fetch: async (input, init) => {
          requestBody = String(init?.body ?? "");
          return fetchMock(input, init);
        },
      });

      const plan = await capturingPlanner.plan(
        facts,
        amazonRulePack,
        new AbortController().signal,
        [],
        { plannerMode: "listing", marketplaceId, listingImageCount: 7 },
      );
      const body = JSON.parse(requestBody) as { messages: Array<{ content: string }> };

      expect(body.messages[0].content).toContain(
        AMAZON_MARKETPLACES.find((item) => item.id === marketplaceId)?.copyLanguage,
      );
      expect(plan.slots.find((slot) => slot.slotKey === "MAIN")?.visibleCopy).toBe("");
      expect(plan.slots.find((slot) => slot.slotKey === "PT01")?.visibleCopy).toBe(localizedCopy);
      expect(planner).toBeInstanceOf(OpenAIPlanner);
    }
  });

  it("adapts Demo Copilot copy to the active marketplace language", async () => {
    for (const marketplace of AMAZON_MARKETPLACES) {
      const { rulePack } = resolvePlanningRulePack("amazon", {
        plannerMode: "listing",
        marketplaceId: marketplace.id,
        listingImageCount: 7,
      });
      const result = await demoCopilot.adjust(
        {
          project,
          rulePack,
          slot: {
            slotKey: "PT01",
            visibleCopy: "待本地化卖点",
            strategy: "核心卖点",
            evidence: ["卖点：washable cover"],
            prompt: "Create an Amazon benefit image.",
            negativePrompt: "Do not invent facts.",
          },
        },
        "adapt-platform",
        new AbortController().signal,
      );

      expect("visibleCopy" in result).toBe(true);
      if (!("visibleCopy" in result)) throw new Error("预期 Copilot 返回槽位补丁");
      expect(result.visibleCopy).toMatch(localizedBenefitSamples[marketplace.id]);
      expect(result.prompt).toContain(rulePack.locale);
    }
  });

  it("instructs and normalizes API Copilot patches for all six marketplace languages", async () => {
    for (const marketplace of AMAZON_MARKETPLACES) {
      const { rulePack } = resolvePlanningRulePack("amazon", {
        plannerMode: "listing",
        marketplaceId: marketplace.id,
        listingImageCount: 7,
      });
      const visibleCopy = marketplace.demoCopy.listing[0];
      let requestBody = "";
      const copilot = new OpenAICopilot({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-key",
        model: "copilot-model",
        fetch: async (_input, init) => {
          requestBody = String(init?.body ?? "");
          return new Response(
            JSON.stringify({
              choices: [{
                message: {
                  content: JSON.stringify({
                    visibleCopy,
                    prompt: `Create a localized benefit image. Visible copy: "${visibleCopy}".`,
                  }),
                },
              }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      });

      const result = await copilot.adjust(
        {
          project,
          rulePack,
          slot: {
            slotKey: "PT01",
            visibleCopy: "Draft benefit",
            strategy: "核心卖点",
            evidence: ["卖点：washable cover"],
            prompt: "Create an Amazon benefit image.",
            negativePrompt: "Do not invent facts.",
          },
        },
        "adapt-platform",
        new AbortController().signal,
      );
      const body = JSON.parse(requestBody) as { messages: Array<{ content: string }> };

      expect(body.messages[0].content).toContain(marketplace.copyLanguage);
      expect(result).toMatchObject({ visibleCopy });
    }
  });

  it("applies marketplace-specific high-frequency compliance terms across all six sites", () => {
    const prohibitedCopy: Record<AmazonMarketplaceId, string> = {
      us: "Limited-time deal",
      jp: "期間限定セール",
      de: "Jetzt Rabatt sichern",
      fr: "Réduction limitée",
      it: "Sconto limitato",
      es: "Descuento limitado",
    };

    for (const marketplace of AMAZON_MARKETPLACES) {
      const { rulePack } = resolvePlanningRulePack("amazon", {
        plannerMode: "listing",
        marketplaceId: marketplace.id,
        listingImageCount: 7,
      });
      const result = runCompliance(project, rulePack, {
        slotKey: "PT01",
        visibleCopy: prohibitedCopy[marketplace.id],
        strategy: "核心卖点",
        evidence: ["卖点：washable cover"],
        prompt: `Create an Amazon benefit image with visible copy: "${prohibitedCopy[marketplace.id]}".`,
        negativePrompt: "Do not invent facts.",
      });

      expect(result.findings.some((finding) => finding.code === "amazon-marketplace-forbidden-copy"))
        .toBe(true);
      expect(result.manualReviewRequired).toBe(true);
      expect(rulePack.complianceReminders.join(" ")).toContain(marketplace.domain);
    }
  });

  it("retains the marketplace language contract in export manifests", async () => {
    const marketplace = AMAZON_MARKETPLACES.find((item) => item.id === "jp")!;
    const plan = await demoPlanner.plan(
      facts,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", marketplaceId: marketplace.id, listingImageCount: 7 },
    );
    const { rulePack } = resolvePlanningRulePack("amazon", plan.amazonSession);
    const exported = await buildExportPackage({
      project,
      rulePack,
      plan,
      planningInputSignature: "jp-localized-plan",
      loadAsset: async () => null,
      now: () => "2026-07-20T00:00:00.000Z",
    });

    expect(exported.manifest.platform).toMatchObject({
      id: "amazon",
      marketplaceId: "jp",
      locale: "ja-JP",
      copyLanguage: "Japanese",
    });
  });
});
