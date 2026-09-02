import type {
  IndustryTemplateTransformer,
  IndustryTemplateTransformRequest,
  IndustryTemplateTransformResult,
} from "../domain/prompt-templates/industry-template-transformer";
import { buildIndustryTemplatePrompt } from "../domain/prompting";
import {
  AiTransportError,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  OpenAICompatibleTextTransport,
  inferTextProtocol,
  unwrapStructuredJson,
} from "./ai/transport";
import type { TextServiceProtocol } from "../domain/settings/types";
import { validateIndustryTemplateSlots } from "../domain/prompt-templates/industry-template-packs";

export interface OpenAIIndustryTemplateTransformerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  protocol?: TextServiceProtocol;
}

function parseResult(
  body: { slots?: unknown },
  request: IndustryTemplateTransformRequest,
): IndustryTemplateTransformResult {
  if (!Array.isArray(body.slots)) throw new Error("AI 返回的行业模板格式不正确");
  const rawKeys = body.slots.flatMap((value) =>
    typeof value === "object" && value !== null && "slotKey" in value && typeof value.slotKey === "string"
      ? [value.slotKey]
      : []
  );
  if (rawKeys.length !== body.slots.length || new Set(rawKeys).size !== rawKeys.length) {
    throw new Error("AI 返回了无效或重复的行业模板槽位");
  }
  const byKey = new Map(body.slots.flatMap((value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("slotKey" in value) ||
      !("guidance" in value) ||
      !("negativeGuidance" in value) ||
      typeof value.slotKey !== "string" ||
      typeof value.guidance !== "string" ||
      typeof value.negativeGuidance !== "string"
    ) return [];
    return [[value.slotKey, value] as const];
  }));
  const slots = request.rulePack.slots.map((rule) => {
    const value = byKey.get(rule.key);
    if (!value || !value.guidance.trim()) throw new Error(`AI 未返回完整槽位：${rule.key}`);
    return {
      slotKey: rule.key,
      label: rule.label,
      guidance: value.guidance.trim(),
      negativeGuidance: value.negativeGuidance.trim(),
    };
  });
  const validationErrors = validateIndustryTemplateSlots(slots, request.rulePack, request.brief);
  if (validationErrors.length > 0) {
    throw new Error(`AI 行业模板草稿未通过检查：${validationErrors.join("；")}`);
  }
  return { slots };
}

export class OpenAIIndustryTemplateTransformer implements IndustryTemplateTransformer {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAIIndustryTemplateTransformerOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async transform(
    request: IndustryTemplateTransformRequest,
    signal: AbortSignal,
  ): Promise<IndustryTemplateTransformResult> {
    if (signal.aborted) throw signal.reason ?? new DOMException("行业模板改造已取消", "AbortError");
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", forwardAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new DOMException("行业模板改造超时", "TimeoutError")),
      this.options.timeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS,
    );
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
        service: "industry-template",
        model: this.options.model,
        prompt: buildIndustryTemplatePrompt({
          rulePack: request.rulePack,
          platform: request.rulePack,
          brief: request.brief,
          baseTemplate: request.baseTemplate,
        }),
        signal: controller.signal,
        maxOutputTokens: 6_000,
      });
      const parsed = JSON.parse(unwrapStructuredJson(response.text)) as { slots?: unknown };
      return parseResult(parsed, request);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (controller.signal.aborted) throw new Error("行业模板改造超时，请重试");
      if (error instanceof AiTransportError) throw new Error(error.userMessage);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", forwardAbort);
    }
  }
}
