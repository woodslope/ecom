import type {
  CopilotCommand,
  CopilotAdvice,
  CopilotContext,
  CopilotEngine,
  CopilotResult,
} from "../domain/copilot";
import {
  CopilotPatchNormalizationError,
  normalizeCopilotPatch,
} from "../domain/copilot";
import { getAmazonMarketplaceByLocale } from "../domain/platforms/amazon-marketplaces";

export interface OpenAICopilotOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type OpenAICopilotErrorCode =
  | "timeout"
  | "http"
  | "auth"
  | "path"
  | "quota"
  | "format";

export class OpenAICopilotError extends Error {
  readonly name = "OpenAICopilotError";

  constructor(
    readonly code: OpenAICopilotErrorCode,
    readonly userMessage: string,
    readonly status?: number,
  ) {
    super(userMessage);
  }
}

function redactSecret(value: string, secret: string): string {
  return secret.length > 0 ? value.split(secret).join("[REDACTED]") : value;
}

function safeCopilotError(
  error: OpenAICopilotError,
  apiKey: string,
): OpenAICopilotError {
  return new OpenAICopilotError(
    error.code,
    redactSecret(error.userMessage, apiKey),
    error.status,
  );
}

function abortReason(signal: AbortSignal, apiKey: string): Error {
  if (!(signal.reason instanceof Error)) {
    return new DOMException("Copilot 已取消", "AbortError");
  }

  const safeMessage = redactSecret(signal.reason.message, apiKey);
  if (safeMessage === signal.reason.message) return signal.reason;
  if (signal.reason instanceof DOMException) {
    return new DOMException(safeMessage, signal.reason.name);
  }
  const safeReason = new Error(safeMessage);
  safeReason.name = signal.reason.name;
  return safeReason;
}

function throwAbortReason(signal: AbortSignal, apiKey: string): never {
  throw abortReason(signal, apiKey);
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

function httpError(response: Response): OpenAICopilotError {
  if (response.status === 401) {
    return new OpenAICopilotError(
      "auth",
      "API 密钥校验失败，请检查密钥是否正确且仍然有效。",
      response.status,
    );
  }
  if (response.status === 403) {
    return new OpenAICopilotError(
      "auth",
      "API 权限校验失败，请检查密钥与所选模型的访问权限。",
      response.status,
    );
  }
  if (response.status === 404) {
    return new OpenAICopilotError(
      "path",
      "API 地址不存在，请确认填写的是 Chat Completions endpoint。",
      response.status,
    );
  }
  if (response.status === 429) {
    return new OpenAICopilotError(
      "quota",
      "API 额度或速率限制已触发，请检查余额、配额或稍后重试。",
      response.status,
    );
  }
  return new OpenAICopilotError(
    "http",
    `Copilot 请求失败（HTTP ${response.status}），请稍后重试或检查服务商状态。`,
    response.status,
  );
}

function systemPrompt(context: CopilotContext, command: CopilotCommand): string {
  const outputRule = isAdviceCommand(command)
    ? "Return exactly one string field: message. Do not return or modify slot fields."
    : "Return exactly two string fields: visibleCopy and prompt.";
  const marketplace = context.rulePack.platformId === "amazon"
    ? getAmazonMarketplaceByLocale(context.rulePack.locale)
    : null;
  const languageRule =
    context.rulePack.promptLanguage === "en"
      ? [
          "Language contract for Amazon: prompt uses natural-English model instructions and evidence labels, and must not contain Chinese planning explanations.",
          "Keep brand names, model numbers, SKUs, proper nouns, dimensions, units, numeric values, and any fact value whose translation could alter evidence as supplied when useful.",
          `For patch commands, visibleCopy must use natural ${marketplace?.copyLanguage ?? "marketplace language"} for ${marketplace?.domain ?? context.rulePack.locale}; MAIN.visibleCopy must be empty.`,
          ...(marketplace?.localGuidance ?? []),
          "strategy and evidence are Chinese planning context supplied to you. Do not copy their Chinese labels into prompt.",
          "Advice messages may be Simplified Chinese because they are shown to the user.",
        ].join("\n")
      : "Language contract: keep prompt and visibleCopy in the platform source language; user-facing advice may remain in Simplified Chinese.";
  return [
    "Return JSON only, without commentary or Markdown.",
    outputRule,
    `Adjust only the selected slot ${context.slot.slotKey}; never return another slot or whole plan.`,
    `Command: ${command}.`,
    languageRule,
    "Use only supplied product facts and slot evidence. Do not invent claims.",
  ].join("\n");
}

function isAdviceCommand(command: CopilotCommand): boolean {
  return command === "check-compliance" || command === "explain-next";
}

function requestPayload(context: CopilotContext, command: CopilotCommand): unknown {
  const slotRule = context.rulePack.slots.find((rule) => rule.key === context.slot.slotKey);
  return {
    command,
    project: context.project,
    platform: {
      platformId: context.rulePack.platformId,
      label: context.rulePack.label,
      locale: context.rulePack.locale,
      promptLanguage: context.rulePack.promptLanguage,
      planningInstructions: context.rulePack.planningInstructions,
      promptGuardrails: context.rulePack.promptGuardrails,
      complianceReminders: context.rulePack.complianceReminders,
    },
    slotRule,
    slot: context.slot,
  };
}

function parseResult(
  response: ChatCompletionsResponse,
  context: CopilotContext,
  command: CopilotCommand,
): CopilotResult {
  try {
    const content = response.choices?.[0]?.message?.content;
    const candidate = JSON.parse(String(content)) as unknown;
    if (!isAdviceCommand(command)) {
      return normalizeCopilotPatch(candidate, context);
    }
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new CopilotPatchNormalizationError("Copilot 返回建议格式不正确，请重试。");
    }
    const keys = Object.keys(candidate);
    const message = (candidate as Record<string, unknown>).message;
    if (keys.length !== 1 || keys[0] !== "message" || typeof message !== "string" || !message.trim()) {
      throw new CopilotPatchNormalizationError(
        "Copilot 返回建议格式不正确，只能返回 message。",
      );
    }
    return { message: message.trim() } satisfies CopilotAdvice;
  } catch (error) {
    if (error instanceof OpenAICopilotError) throw error;
    if (error instanceof CopilotPatchNormalizationError) {
      throw new OpenAICopilotError("format", error.userMessage);
    }
    throw new OpenAICopilotError(
      "format",
      "Copilot 返回格式不正确，请重试或更换模型。",
    );
  }
}

export class OpenAICopilot implements CopilotEngine {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAICopilotOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async adjust(
    context: CopilotContext,
    command: CopilotCommand,
    signal: AbortSignal,
  ): Promise<CopilotResult> {
    if (signal.aborted) {
      throwAbortReason(signal, this.options.apiKey);
    }

    const requestController = new AbortController();
    const forwardCallerAbort = () => requestController.abort(signal.reason);
    signal.addEventListener("abort", forwardCallerAbort, { once: true });
    const timeout = setTimeout(
      () => requestController.abort(new DOMException("Copilot 请求超时", "TimeoutError")),
      this.options.timeoutMs ?? 20_000,
    );
    const aborted = new Promise<never>((_resolve, reject) => {
      requestController.signal.addEventListener(
        "abort",
        () => reject(requestController.signal.reason),
        { once: true },
      );
    });

    try {
      const response = await Promise.race([
        this.fetch(this.options.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.options.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt(context, command) },
              { role: "user", content: JSON.stringify(requestPayload(context, command)) },
            ],
          }),
          signal: requestController.signal,
        }),
        aborted,
      ]);

      if (!response.ok) {
        throw httpError(response);
      }
      return parseResult((await response.json()) as ChatCompletionsResponse, context, command);
    } catch (error) {
      if (signal.aborted) {
        throwAbortReason(signal, this.options.apiKey);
      }
      if (
        requestController.signal.aborted &&
        requestController.signal.reason instanceof DOMException &&
        requestController.signal.reason.name === "TimeoutError"
      ) {
        throw new OpenAICopilotError(
          "timeout",
          "Copilot 请求超时，请检查连接后重试。当前槽位内容未受影响。",
        );
      }
      if (error instanceof OpenAICopilotError) {
        throw safeCopilotError(error, this.options.apiKey);
      }
      throw new OpenAICopilotError(
        "http",
        "无法连接 Copilot API，请检查网络、CORS 配置和接口地址。",
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", forwardCallerAbort);
    }
  }
}
