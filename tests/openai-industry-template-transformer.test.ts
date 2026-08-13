import { describe, expect, it } from "vitest";

import { createGeneralIndustryTemplateSnapshot } from "../src/domain/prompt-templates/industry-template-packs";
import { getPlatformRulePack } from "../src/domain/platforms/registry";
import { OpenAIIndustryTemplateTransformer } from "../src/services/openai-industry-template-transformer";

describe("OpenAIIndustryTemplateTransformer", () => {
  it("requests and validates a complete reusable slot set", async () => {
    const rulePack = getPlatformRulePack("taobao");
    let requestBody: Record<string, unknown> | null = null;
    const transformer = new OpenAIIndustryTemplateTransformer({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "secret",
      model: "planner-model",
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                slots: rulePack.slots.map((slot) => ({
                  slotKey: slot.key,
                  guidance: `${slot.label}的家居行业方向`,
                  negativeGuidance: "不得写入具体 SKU 参数",
                })),
              }),
            },
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await transformer.transform({
      baseTemplate: createGeneralIndustryTemplateSnapshot(
        { platformId: "taobao", workflowId: "taobao-product" },
        rulePack,
      ),
      brief: {
        industry: "家居软装",
        productTypes: "花瓶、摆件",
        targetAudience: "家居审美人群",
        stylePreference: "自然质感",
        extraRequirements: "突出材质比例",
        forbiddenContent: "固定具体场景",
      },
      rulePack,
    }, new AbortController().signal);

    expect(result.slots).toHaveLength(rulePack.slots.length);
    expect(result.slots[0]).toMatchObject({
      slotKey: rulePack.slots[0]?.key,
      label: rulePack.slots[0]?.label,
    });
    expect(JSON.stringify(requestBody)).toContain("Do not include concrete SKU facts");
    expect(JSON.stringify(requestBody)).toContain("家居软装");
  });
});
