import type {
  IndustryTemplateTransformer,
  IndustryTemplateTransformRequest,
  IndustryTemplateTransformResult,
} from "../domain/prompt-templates/industry-template-transformer";

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

export interface OpenAIIndustryTemplateTransformerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content.map((item) =>
    typeof item === "object" && item !== null && "text" in item && typeof item.text === "string"
      ? item.text
      : "",
  ).join("");
}

function parseResult(
  body: ChatCompletionsResponse,
  request: IndustryTemplateTransformRequest,
): IndustryTemplateTransformResult {
  const raw = responseText(body.choices?.[0]?.message?.content).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
  const parsed = JSON.parse(fenced?.[1] ?? raw) as { slots?: unknown };
  if (!Array.isArray(parsed.slots)) throw new Error("AI 返回的行业模板格式不正确");
  const byKey = new Map(parsed.slots.flatMap((value) => {
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
      this.options.timeoutMs ?? 90_000,
    );
    try {
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
                "Return JSON only with one field: slots.",
                "Rewrite every supplied slot into reusable industry-level image planning guidance.",
                "Do not include concrete SKU facts, exact product dimensions, colors, package contents, certifications, or fixed scenes unless explicitly stated as a reusable industry constraint.",
                "Each slot must contain slotKey, guidance, and negativeGuidance.",
                `Return these slot keys exactly once: ${request.rulePack.slots.map((slot) => slot.key).join(", ")}.`,
                "Write guidance in Simplified Chinese so an operator can review it; final model prompt language is handled later by the product planner.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                platform: request.rulePack.label,
                brief: request.brief,
                baseTemplate: request.baseTemplate.slots,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403
          ? "行业模板改造鉴权失败，请检查文本 API 设置"
          : `行业模板改造请求失败（HTTP ${response.status}）`);
      }
      return parseResult(await response.json() as ChatCompletionsResponse, request);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (controller.signal.aborted) throw new Error("行业模板改造超时，请重试");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", forwardAbort);
    }
  }
}
