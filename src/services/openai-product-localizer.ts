import {
  enforceLocalizationRules,
  type LocalizationRules,
  type ProductLocalizer,
} from "../domain/localization/product-localizer";
import type { ProductFacts } from "../domain/projects/types";
import { buildLocalizationPrompt } from "../domain/prompting";
import {
  AiTransportError,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  OpenAICompatibleTextTransport,
  inferTextProtocol,
  unwrapStructuredJson,
} from "./ai/transport";
import type { TextServiceProtocol } from "../domain/settings/types";

export interface OpenAIProductLocalizerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  protocol?: TextServiceProtocol;
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
    try {
      const transport = new OpenAICompatibleTextTransport({
        endpoint: this.options.endpoint,
        apiKey: this.options.apiKey,
        model: this.options.model,
        protocol: this.options.protocol ?? inferTextProtocol(this.options.endpoint),
        fetch: this.fetch,
        timeoutMs: this.options.timeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS,
      });
      const response = await transport.request({
        service: "localizer",
        model: this.options.model,
        prompt: buildLocalizationPrompt({
          facts: facts as unknown as Record<string, unknown>,
          targetLocale,
          rules,
        }),
        signal,
        maxOutputTokens: 4_000,
      });
      const content = unwrapStructuredJson(response.text);
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("AI 本地化结果无法解析，请重试。");
      }
      return enforceLocalizationRules(facts, parseFacts(parsed), rules);
    } catch (error) {
      if (error instanceof AiTransportError) {
        throw new Error(`站点语言草稿生成失败：${error.userMessage}`);
      }
      throw error;
    }
  }
}
