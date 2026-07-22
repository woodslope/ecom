import type {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from "../domain/generation/types";

export interface OpenAIImageGeneratorOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  transport?: "images-api" | "chat-completions";
}

export type OpenAIImageGeneratorErrorCode =
  | "timeout"
  | "http"
  | "auth"
  | "path"
  | "quota"
  | "format";

export class OpenAIImageGeneratorError extends Error {
  readonly name = "OpenAIImageGeneratorError";

  constructor(
    readonly code: OpenAIImageGeneratorErrorCode,
    readonly userMessage: string,
    readonly status?: number,
  ) {
    super(userMessage);
  }
}

function redactSecret(value: string, secret: string): string {
  return secret.length > 0 ? value.split(secret).join("[REDACTED]") : value;
}

function safeGeneratorError(
  error: OpenAIImageGeneratorError,
  apiKey: string,
): OpenAIImageGeneratorError {
  return new OpenAIImageGeneratorError(
    error.code,
    redactSecret(error.userMessage, apiKey),
    error.status,
  );
}

function abortReason(signal: AbortSignal, apiKey: string): Error {
  if (!(signal.reason instanceof Error)) {
    return new DOMException("图片生成已取消", "AbortError");
  }

  const safeMessage = redactSecret(signal.reason.message, apiKey);
  if (safeMessage === signal.reason.message) {
    return signal.reason;
  }
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

interface ImagesResponse {
  data?: Array<{
    b64_json?: unknown;
    url?: unknown;
  }>;
}

interface ChatImageResponse {
  choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: unknown } }>; content?: unknown } }>;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function composedPrompt(request: ImageGenerationRequest): string {
  const sizeHint = `Expected output resolution: ${request.dimensions.width}x${request.dimensions.height}. Upload reference size: ${request.uploadDimensions.width}x${request.uploadDimensions.height}.`;
  return [
    request.prompt.trim(),
    sizeHint,
    request.visibleCopy.trim() ? `Visible copy: ${request.visibleCopy.trim()}` : "",
    request.negativePrompt.trim() ? `Avoid: ${request.negativePrompt.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function pngDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return blob.slice(0, 24).arrayBuffer().then((buffer) => {
    if (buffer.byteLength < 24) return null;
    const bytes = new Uint8Array(buffer);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value)) return null;
    const view = new DataView(buffer);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  });
}

function formatError(): OpenAIImageGeneratorError {
  return new OpenAIImageGeneratorError(
    "format",
    "图片 API 返回格式不正确，请重试或更换支持 Images API 的模型。",
  );
}

async function parseImagesResponse(response: Response): Promise<ImagesResponse> {
  try {
    const payload = (await response.json()) as unknown;
    if (typeof payload !== "object" || payload === null) {
      throw formatError();
    }
    return payload as ImagesResponse;
  } catch (error) {
    if (error instanceof OpenAIImageGeneratorError) {
      throw error;
    }
    throw formatError();
  }
}

function closestAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  const candidates = [["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["16:9", 16 / 9], ["9:16", 9 / 16]] as const;
  return candidates.reduce((best, candidate) => Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio) ? candidate : best)[0];
}

function closestImageSize(width: number, height: number): "1K" | "2K" | "4K" {
  const edge = Math.max(width, height);
  return edge >= 3072 ? "4K" : edge >= 1536 ? "2K" : "1K";
}

async function blobDataUrl(blob: Blob, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mimeType || blob.type || "image/png"};base64,${btoa(binary)}`;
}

function dataUrlBlob(url: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (!match) return null;
  try { return new Blob([decodeBase64(match[2]!)], { type: match[1]! }); } catch { return null; }
}

async function providerErrorDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;
    const nested = typeof record.error === "object" && record.error !== null
      ? record.error as Record<string, unknown>
      : null;
    const candidate = nested?.message ?? nested?.detail ?? record.message ?? record.detail;
    if (typeof candidate !== "string") return null;
    const detail = candidate.replace(/\s+/g, " ").trim();
    return detail.length > 0 ? detail.slice(0, 240) : null;
  } catch {
    return null;
  }
}

async function httpError(response: Response): Promise<OpenAIImageGeneratorError> {
  if (response.status === 401) {
    return new OpenAIImageGeneratorError(
      "auth",
      "图片 API 密钥校验失败，请检查密钥是否正确且仍然有效。",
      response.status,
    );
  }
  if (response.status === 403) {
    return new OpenAIImageGeneratorError(
      "auth",
      "图片 API 权限校验失败，请检查密钥与所选模型的访问权限。",
      response.status,
    );
  }
  if (response.status === 404) {
    return new OpenAIImageGeneratorError(
      "path",
      "图片 API 地址不存在，请确认填写的是正确的 Images API base URL。",
      response.status,
    );
  }
  if (response.status === 429) {
    return new OpenAIImageGeneratorError(
      "quota",
      "图片 API 额度或速率限制已触发，请检查余额、配额或稍后重试。",
      response.status,
    );
  }
  const detail = await providerErrorDetail(response);
  return new OpenAIImageGeneratorError(
    "http",
    detail
      ? `图片 API 请求失败（HTTP ${response.status}）：${detail}`
      : `图片 API 请求失败（HTTP ${response.status}），请稍后重试或检查服务商状态。`,
    response.status,
  );
}

async function outputBlob(
  payload: ImagesResponse,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<Blob> {
  const output = payload.data?.[0];
  if (typeof output?.b64_json === "string") {
    try {
      const blob = new Blob([decodeBase64(output.b64_json)], { type: "image/png" });
      if (blob.size === 0) {
        throw formatError();
      }
      return blob;
    } catch (error) {
      if (error instanceof OpenAIImageGeneratorError) {
        throw error;
      }
      throw formatError();
    }
  }
  if (typeof output?.url === "string") {
    const response = await fetcher(output.url, { signal });
    if (!response.ok) {
      throw await httpError(response);
    }
    const blob = await response.blob();
    if (blob.size === 0 || (blob.type && !blob.type.toLowerCase().startsWith("image/"))) {
      throw formatError();
    }
    return blob.type ? blob : blob.slice(0, blob.size, "image/png");
  }
  throw formatError();
}

export class OpenAIImageGenerator implements ImageGenerator {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAIImageGeneratorOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(
    request: ImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<GeneratedImage> {
    if (signal.aborted) {
      throwAbortReason(signal, this.options.apiKey);
    }

    const requestController = new AbortController();
    let removeAbortListener: () => void = () => undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const abortPromise = new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          const reason = abortReason(signal, this.options.apiKey);
          reject(reason);
          requestController.abort(reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      });
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          const error = new OpenAIImageGeneratorError(
            "timeout",
            "图片生成请求超时，请检查网络或调高超时设置后重试。",
          );
          reject(error);
          requestController.abort(error);
        }, this.options.timeoutMs ?? 120_000);
      });

      return await Promise.race([
        this.execute(request, requestController.signal),
        abortPromise,
        timeoutPromise,
      ]);
    } catch (error) {
      if (signal.aborted) {
        throwAbortReason(signal, this.options.apiKey);
      }
      if (error instanceof OpenAIImageGeneratorError) {
        throw safeGeneratorError(error, this.options.apiKey);
      }
      throw new OpenAIImageGeneratorError(
        "http",
        "无法连接图片 API，请检查网络、CORS 配置和接口地址。",
      );
    } finally {
      removeAbortListener();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async execute(
    request: ImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<GeneratedImage> {
    const size = `${request.dimensions.width}x${request.dimensions.height}`;
    const prompt = composedPrompt(request);
    if (this.options.transport === "chat-completions") {
      if (request.edit) {
        throw new OpenAIImageGeneratorError(
          "path",
          "当前图片服务不支持显式遮罩编辑，请改用兼容 Images API 的图片服务。",
        );
      }
      const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
      for (const reference of request.referenceImages) {
        content.push({ type: "image_url", image_url: { url: await blobDataUrl(reference.blob, reference.mimeType) } });
      }
      const response = await this.fetch(endpoint(this.options.baseUrl, "chat/completions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
          image_config: {
            aspect_ratio: closestAspectRatio(request.dimensions.width, request.dimensions.height),
            image_size: closestImageSize(request.dimensions.width, request.dimensions.height),
          },
        }),
        signal,
      });
      if (!response.ok) throw await httpError(response);
      const payload = await response.json() as ChatImageResponse;
      const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (typeof url !== "string") throw formatError();
      const inline = dataUrlBlob(url);
      const blob = inline ?? await outputBlob({ data: [{ url }] }, this.fetch, signal);
      const actualDimensions = await pngDimensions(blob);
      const width = actualDimensions?.width ?? request.dimensions.width;
      const height = actualDimensions?.height ?? request.dimensions.height;
      return {
        blob, width, height, mimeType: blob.type, source: "api",
        parameters: {
          engine: "openrouter-image-chat", model: this.options.model,
          operation: request.referenceImages.length > 0 ? "edit" : "generation",
          size, requestedSize: size, uploadSize: `${request.uploadDimensions.width}x${request.uploadDimensions.height}`,
          aspectRatio: closestAspectRatio(request.dimensions.width, request.dimensions.height),
          imageSize: closestImageSize(request.dimensions.width, request.dimensions.height),
          referenceCount: request.referenceImages.length,
        },
      };
    }
    const isEdit = Boolean(request.edit) || request.referenceImages.length > 0;
    let body: BodyInit;
    let headers: HeadersInit;

    if (isEdit) {
      const form = new FormData();
      form.append("model", this.options.model);
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", size);
      form.append("response_format", "b64_json");
      if (request.edit) {
        const target = request.edit.target.blob.type === request.edit.target.mimeType
          ? request.edit.target.blob
          : request.edit.target.blob.slice(
              0,
              request.edit.target.blob.size,
              request.edit.target.mimeType,
            );
        const mask = request.edit.mask.blob.type === request.edit.mask.mimeType
          ? request.edit.mask.blob
          : request.edit.mask.blob.slice(0, request.edit.mask.blob.size, request.edit.mask.mimeType);
        form.append("image", target, request.edit.target.name);
        form.append("mask", mask, request.edit.mask.name);
      }
      for (const reference of request.referenceImages) {
        const image =
          reference.blob.type === reference.mimeType
            ? reference.blob
            : reference.blob.slice(0, reference.blob.size, reference.mimeType);
        form.append("image[]", image, reference.name);
      }
      body = form;
      headers = { Authorization: `Bearer ${this.options.apiKey}` };
    } else {
      body = JSON.stringify({
        model: this.options.model,
        prompt,
        n: 1,
        size,
        response_format: "b64_json",
      });
      headers = {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      };
    }

    const response = await this.fetch(
      endpoint(this.options.baseUrl, isEdit ? "images/edits" : "images/generations"),
      {
        method: "POST",
        headers,
        body,
        signal,
      },
    );
    if (!response.ok) {
      throw await httpError(response);
    }
    const payload = await parseImagesResponse(response);
    const blob = await outputBlob(payload, this.fetch, signal);
    const actualDimensions = await pngDimensions(blob);
    const width = actualDimensions?.width ?? request.dimensions.width;
    const height = actualDimensions?.height ?? request.dimensions.height;

    return {
      blob,
      width,
      height,
      mimeType: blob.type,
      source: "api",
      parameters: {
        engine: "openai-compatible-images",
        model: this.options.model,
        operation: isEdit ? "edit" : "generation",
        size,
        requestedSize: size,
        ...(actualDimensions ? { actualSize: `${width}x${height}` } : {}),
        uploadSize: `${request.uploadDimensions.width}x${request.uploadDimensions.height}`,
        ...(request.sizeTier ? { sizeTier: request.sizeTier } : {}),
        referenceCount: request.referenceImages.length,
        ...(request.edit ? { masked: true } : {}),
      },
    };
  }
}
