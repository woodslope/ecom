import {
  enforceLocalizationRules,
  type LocalizationRules,
  type ProductLocalizer,
} from "../domain/localization/product-localizer";
import type { ProductFacts } from "../domain/projects/types";

export interface OpenAIProductLocalizerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) return null;
  return value as Record<string, string>;
}

function parseFacts(value: unknown): ProductFacts {
  if (!isRecord(value)) throw new Error("AI 本地化结果不是对象。");
  const textKeys = [
    "productName",
    "category",
    "brand",
    "model",
    "sku",
    "targetAudience",
    "description",
  ] as const;
  if (textKeys.some((key) => typeof value[key] !== "string")) {
    throw new Error("AI 本地化结果缺少商品事实字段。");
  }
  const sellingPoints = stringList(value.sellingPoints);
  const forbiddenClaims = stringList(value.forbiddenClaims);
  const specifications = stringRecord(value.specifications);
  if (!sellingPoints || !forbiddenClaims || !specifications) {
    throw new Error("AI 本地化结果的列表或规格格式不正确。");
  }
  return {
    productName: value.productName as string,
    category: value.category as string,
    brand: value.brand as string,
    model: value.model as string,
    sku: value.sku as string,
    targetAudience: value.targetAudience as string,
    description: value.description as string,
    sellingPoints,
    forbiddenClaims,
    specifications,
  };
}

export class OpenAIProductLocalizer implements ProductLocalizer {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAIProductLocalizerOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async localize(
    facts: ProductFacts,
    targetLocale: string,
    rules: LocalizationRules,
    signal: AbortSignal,
  ): Promise<ProductFacts> {
    const response = await this.fetch(this.options.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Return JSON only. Localize the supplied product facts for the target locale.",
              "Keep the exact JSON shape and array lengths.",
              "Never change brand, model, SKU, numbers, dimensions, quantities, certification identifiers, or factual meaning.",
              "Do not convert units and do not add claims or facts.",
              "Specification keys may be localized, but preserve their order and values precisely.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({ targetLocale, facts }),
          },
        ],
      }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`站点语言草稿生成失败（HTTP ${response.status}）。`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const rawContent = payload.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fenced ? fenced[1] : content);
    } catch {
      throw new Error("AI 本地化结果无法解析，请重试。");
    }
    return enforceLocalizationRules(facts, parseFacts(parsed), rules);
  }
}
