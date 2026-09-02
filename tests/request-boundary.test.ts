import { describe, expect, it } from "vitest";

import { assertPlatformPlanningRequest, assertSlotGenerationRequest } from "../src/domain/ai/request-boundary";
import type { PlatformPlanningRequest } from "../src/domain/planning/types";
import type { SlotGenerationRequest } from "../src/domain/generation/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";

const facts = {
  productName: "旅行颈枕",
  category: "旅行用品",
  description: "可折叠颈枕",
  sellingPoints: ["便携"],
};

function planningRequest(platformId: "amazon" | "taobao"): PlatformPlanningRequest {
  const platformRules = platformId === "amazon" ? amazonRulePack : taobaoRulePack;
  return {
    platformId,
    projectId: `project-${platformId}`,
    taskId: `project-${platformId}`,
    operationId: `planning-${platformId}-1`,
    inputSignature: `signature-${platformId}`,
    productFacts: facts,
    referenceImages: [{ name: "product.png", mimeType: "image/png", blob: new Blob(["image"]) }],
    platformRules,
    aiInstructions: platformRules.planningInstructions,
    outputConstraints: {
      format: "json-object",
      requiredSlotKeys: platformRules.slots.map((slot) => slot.key),
      contractVersion: "1.1.0",
    },
  };
}

describe("runtime request boundary", () => {
  it("accepts a complete planning payload for each platform", () => {
    const amazon = planningRequest("amazon");
    const taobao = planningRequest("taobao");

    expect(() => assertPlatformPlanningRequest(amazon)).not.toThrow();
    expect(() => assertPlatformPlanningRequest(taobao)).not.toThrow();
    expect(amazon.productFacts).toEqual(facts);
    expect(amazon.referenceImages).toHaveLength(1);
    expect(amazon.outputConstraints.requiredSlotKeys).toEqual(amazonRulePack.slots.map((slot) => slot.key));
    expect(taobao.outputConstraints.requiredSlotKeys).toEqual(taobaoRulePack.slots.map((slot) => slot.key));
  });

  it("rejects platform rule cross-wiring", () => {
    const amazon = planningRequest("amazon");
    expect(() => assertPlatformPlanningRequest({ ...amazon, platformRules: taobaoRulePack }))
      .toThrow("平台规则与当前平台不一致");
  });

  it("accepts a complete slot generation payload and rejects a crossed slot constraint", () => {
    const request: SlotGenerationRequest = {
      projectId: "project-amazon",
      taskId: "project-amazon",
      operationId: "generation-project-amazon-1",
      inputSignature: "signature-amazon",
      productName: facts.productName,
      productFacts: facts,
      platformId: "amazon",
      platformRules: amazonRulePack,
      slotKey: "MAIN",
      prompt: "A complete product image prompt",
      negativePrompt: "text, watermark",
      visibleCopy: "",
      uploadDimensions: { width: 2000, height: 2000, unit: "px" },
      dimensions: { width: 2000, height: 2000, unit: "px" },
      referenceImages: [{ name: "product.png", mimeType: "image/png", blob: new Blob(["image"]), kind: "product" }],
      aiInstructions: amazonRulePack.promptGuardrails,
      outputConstraints: { format: "image", slotKey: "MAIN", promptRequired: true },
    };

    expect(() => assertSlotGenerationRequest(request)).not.toThrow();
    expect(() => assertSlotGenerationRequest({
      ...request,
      outputConstraints: { ...request.outputConstraints, slotKey: "PT01" },
    })).toThrow("槽位输出约束不一致");
  });
});
