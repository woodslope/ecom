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
import { buildCopilotPrompt } from "../domain/prompting";
import {
  AiTransportError,
  OpenAICompatibleTextTransport,
  inferTextProtocol,
  unwrapStructuredJson,
} from "./ai/transport";
import type { TextServiceProtocol } from "../domain/settings/types";

export interface OpenAICopilotOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  protocol?: TextServiceProtocol;
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

function isAdviceCommand(command: CopilotCommand): boolean {
  return command === "check-compliance" || command === "explain-next";
}

function parseResultText(
  raw: string,
  context: CopilotContext,
  command: CopilotCommand,
): CopilotResult {
  try {
    const candidate = JSON.parse(unwrapStructuredJson(raw)) as unknown;
    if (!isAdviceCommand(command)) return normalizeCopilotPatch(candidate, context);
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new CopilotPatchNormalizationError("Copilot 返回建议格式不正确，请重试。");
    }
    const keys = Object.keys(candidate);
    const message = (candidate as Record<string, unknown>).message;
    if (keys.length !== 1 || keys[0] !== "message" || typeof message !== "string" || !message.trim()) {
      throw new CopilotPatchNormalizationError("Copilot 返回建议格式不正确，只能返回 message。");
    }
    return { message: message.trim() } satisfies CopilotAdvice;
  } catch (error) {
    if (error instanceof CopilotPatchNormalizationError) {
      throw new OpenAICopilotError("format", error.userMessage);
    }
    throw new OpenAICopilotError("format", "Copilot 返回格式不正确，请重试或更换模型。");
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

    try {
      const prompt = buildCopilotPrompt({ context, command });
      const transport = new OpenAICompatibleTextTransport({
        endpoint: this.options.endpoint,
        apiKey: this.options.apiKey,
        model: this.options.model,
        protocol: this.options.protocol ?? inferTextProtocol(this.options.endpoint),
        fetch: this.fetch,
        timeoutMs: this.options.timeoutMs ?? 20_000,
      });
      const result = await transport.request({
        service: "copilot",
        model: this.options.model,
        prompt,
        signal,
        maxOutputTokens: 4_000,
      });
      return parseResultText(result.text, context, command);
    } catch (error) {
      if (signal.aborted) {
        throwAbortReason(signal, this.options.apiKey);
      }
      if (error instanceof AiTransportError) {
        const code = error.code === "timeout" || error.code === "auth" || error.code === "path" || error.code === "quota" || error.code === "format"
          ? error.code
          : "http";
        throw new OpenAICopilotError(code, error.userMessage, error.status);
      }
      if (error instanceof OpenAICopilotError) {
        throw safeCopilotError(error, this.options.apiKey);
      }
      throw new OpenAICopilotError(
        "http",
        "无法连接 Copilot API，请检查网络、CORS 配置和接口地址。",
      );
    } finally {
    }
  }
}
