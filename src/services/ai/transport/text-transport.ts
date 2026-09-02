import { abortTransportReason, AiTransportError, httpTransportError, safeTransportError } from "./errors";
import { inferTextProtocol, resolveTextEndpoint, type TextTransportProtocol } from "./endpoint";
import { parseTextResponse, type ParsedTextResponse } from "./response-parser";
import type { PromptBundle } from "../../../domain/prompting/contracts";

export interface TextReferenceImage {
  name: string;
  mimeType: string;
  blob: Blob;
}

export interface TextRequest {
  service: "planner" | "localizer" | "industry-template";
  model: string;
  prompt: PromptBundle;
  referenceImages?: readonly TextReferenceImage[];
  maxOutputTokens?: number;
  signal: AbortSignal;
}

export interface TextResponse extends ParsedTextResponse {}

export interface TextTransportOptions {
  endpoint: string;
  apiKey: string;
  model?: string;
  protocol?: TextTransportProtocol;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Five minutes gives slower providers enough time to finish generation and response delivery. */
export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 300_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function imageDataUrl(image: TextReferenceImage): Promise<string> {
  return `data:${image.mimeType};base64,${bytesToBase64(new Uint8Array(await image.blob.arrayBuffer()))}`;
}

async function userContent(prompt: PromptBundle, images: readonly TextReferenceImage[]): Promise<unknown> {
  if (images.length === 0) return prompt.user;
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt.user }];
  for (const image of images) {
    content.push({
      type: "image_url",
      image_url: { url: await imageDataUrl(image), detail: "low" },
    });
  }
  return content;
}

function tokenFields(model: string, maxOutputTokens: number): Record<string, number> {
  return /^(?:gpt-5|o\d)/i.test(model.trim())
    ? { max_completion_tokens: maxOutputTokens }
    : { max_tokens: maxOutputTokens };
}

export class OpenAICompatibleTextTransport {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: TextTransportOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request(request: TextRequest): Promise<TextResponse> {
    const model = request.model.trim() || this.options.model?.trim() || "";
    const protocol = this.options.protocol ?? inferTextProtocol(this.options.endpoint);
    const requestEndpoint = resolveTextEndpoint(this.options.endpoint, protocol);
    if (request.signal.aborted) throw abortTransportReason(request.signal, this.options.apiKey, "AI 请求已取消");
    const controller = new AbortController();
    let timeoutTriggered = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let parsingResponse = false;
    let rejectAbort: ((reason?: unknown) => void) | undefined;
    let rejectTimeout: ((reason?: unknown) => void) | undefined;
    const abortGate = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const timeoutError = new AiTransportError("timeout", "AI 请求超时，请检查网络或稍后重试。");
    const timeoutGate = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const forwardAbort = () => {
      const reason = abortTransportReason(request.signal, this.options.apiKey, "AI 请求已取消");
      controller.abort(reason);
      rejectAbort?.(reason);
    };
    request.signal.addEventListener("abort", forwardAbort, { once: true });
    timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort(timeoutError);
      rejectTimeout?.(timeoutError);
    }, this.options.timeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS);
    try {
      const images = (request.referenceImages ?? []).filter((image) => image.blob.size > 0 && image.mimeType.startsWith("image/"));
      const content = await userContent(request.prompt, images);
      const maxOutputTokens = request.maxOutputTokens ?? 12_000;
      const responseInputContent = typeof content === "string"
        ? [{ type: "input_text", text: content }]
        : [
            { type: "input_text", text: request.prompt.user },
            ...await Promise.all(images.map(async (image) => ({
              type: "input_image",
              image_url: await imageDataUrl(image),
            }))),
          ];
      const body = protocol === "responses"
        ? {
            model,
            ...(request.prompt.system.trim() ? { instructions: request.prompt.system } : {}),
            input: [{ role: "user", content: responseInputContent }],
            stream: true,
            max_output_tokens: maxOutputTokens,
            ...(request.prompt.outputFormat === "json-object" ? { text: { format: { type: "json_object" } } } : {}),
          }
        : {
            model,
            messages: [
              ...(request.prompt.system.trim() ? [{ role: "system", content: request.prompt.system }] : []),
              { role: "user", content },
            ],
            stream: true,
            ...(request.prompt.outputFormat === "json-object" ? { response_format: { type: "json_object" } } : {}),
            ...tokenFields(model, maxOutputTokens),
          };
      const response = await Promise.race([
        this.fetch(requestEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        abortGate,
        timeoutGate,
      ]);
      if (!response.ok) throw await httpTransportError(response, "AI API");
      parsingResponse = true;
      return await Promise.race([
        parseTextResponse(response, protocol),
        abortGate,
        timeoutGate,
      ]);
    } catch (error) {
      if (request.signal.aborted) throw abortTransportReason(request.signal, this.options.apiKey, "AI 请求已取消");
      if (timeoutTriggered || (controller.signal.aborted && error instanceof AiTransportError && error.code === "timeout")) {
        throw timeoutError;
      }
      if (error instanceof AiTransportError) throw safeTransportError(error, this.options.apiKey);
      if (parsingResponse && error instanceof Error) {
        throw new AiTransportError("format", error.message || "AI API 返回格式不正确，请重试。");
      }
      throw new AiTransportError("network", "无法连接 AI API，请检查网络、CORS 配置和接口地址。");
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", forwardAbort);
    }
  }
}
