import {
  normalizePlatformPlan,
  PlanningNormalizationError,
} from "../domain/planning/normalizer";
import { resolvePlanningRulePack } from "../domain/planning/resolve-planning-pack";
import type {
  AmazonPlanningRequestOptions,
  PlannerEngine,
  PlanningProjectFacts,
  PlanningReferenceImage,
  PlatformPlan,
} from "../domain/planning/types";
import type { PlatformRulePack } from "../domain/platforms/types";
import { hasAmazonChinesePromptTemplate } from "../domain/platforms/prompt-language";
import { getAmazonMarketplaceByLocale } from "../domain/platforms/amazon-marketplaces";
import { isAPlusExternalTextSlotRule } from "../domain/platforms/amazon-catalog";

export interface OpenAIPlannerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  plannerReferenceImages?: boolean;
}

export const DEFAULT_PLANNER_REQUEST_TIMEOUT_MS = 120_000;

export type OpenAIPlannerErrorCode =
  | "timeout"
  | "http"
  | "auth"
  | "path"
  | "quota"
  | "format";

export class OpenAIPlannerError extends Error {
  readonly name = "OpenAIPlannerError";

  constructor(
    readonly code: OpenAIPlannerErrorCode,
    readonly userMessage: string,
    readonly status?: number,
  ) {
    super(userMessage);
  }
}

function redactSecret(value: string, secret: string): string {
  return secret.length > 0 ? value.split(secret).join("[REDACTED]") : value;
}

function safePlannerError(error: OpenAIPlannerError, apiKey: string): OpenAIPlannerError {
  return new OpenAIPlannerError(
    error.code,
    redactSecret(error.userMessage, apiKey),
    error.status,
  );
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block !== "object" || block === null || !("text" in block)) {
          return "";
        }
        return typeof block.text === "string" ? block.text : "";
      })
      .join("");
  }
  return String(content);
}

function structuredJsonText(content: unknown): string {
  const text = contentText(content).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  return fenced ? fenced[1].trim() : text;
}

function planningSystemPrompt(rulePack: PlatformRulePack): string {
  const slotKeys = rulePack.slots.map((slot) => slot.key).join(", ");
  const externalTextSlotKeys = rulePack.slots
    .filter(isAPlusExternalTextSlotRule)
    .map((slot) => slot.key);
  const amazonMarketplace = rulePack.platformId === "amazon"
    ? getAmazonMarketplaceByLocale(rulePack.locale)
    : null;
  const platformCopyRule =
    amazonMarketplace
      ? [
          'For Amazon, MAIN.visibleCopy must be exactly "".',
          externalTextSlotKeys.length > 0
            ? `For ${externalTextSlotKeys.join(", ")}, visibleCopy must be exactly ""; their localized copy belongs in externalText.`
            : null,
          `Every other non-empty visibleCopy must use natural ${amazonMarketplace.copyLanguage} for ${amazonMarketplace.domain}.`,
          ...amazonMarketplace.localGuidance,
        ].filter(Boolean).join("\n")
      : "For Taobao, visibleCopy may use Simplified Chinese.";
  const promptLanguageRule =
    rulePack.promptLanguage === "en"
      ? [
          "Language contract: strategy and evidence are user-facing planning notes and must be written in Simplified Chinese.",
          "prompt and negativePrompt must use natural-English model instructions and evidence labels.",
          "Translate descriptive product facts when it is safe; preserve brand names, model numbers, SKUs, proper nouns, dimensions, units, numeric values, and any fact value whose translation could alter evidence.",
          "Do not put Chinese planning explanations or labels such as 事实依据 inside prompt or negativePrompt.",
        ].join("\n")
      : "Language contract: prompt and negativePrompt should use the platform source language; strategy and evidence remain readable planning notes in that source language.";

  return [
    "Return JSON only, without commentary or Markdown.",
    `platformId must be ${rulePack.platformId} and source must be api.`,
    `promptLanguage is ${rulePack.promptLanguage}.`,
    `slots must contain each of these keys exactly once: ${slotKeys}.`,
    "Every slot must contain these base fields: slotKey, visibleCopy, strategy, evidence, prompt, negativePrompt.",
    ...(externalTextSlotKeys.length > 0
      ? [
          `Only these slots must also contain externalText with non-empty title and body: ${externalTextSlotKeys.join(", ")}.`,
          "externalText is customer-facing copy outside the image; keep visibleCopy empty and do not include externalText title or body in prompt or negativePrompt.",
        ]
      : []),
    "evidence must be a non-empty string array; all other slot fields must be strings.",
    platformCopyRule,
    promptLanguageRule,
    "Use only supplied product facts and reference images. Treat images as visual context only; do not infer hidden specifications, certifications, or claims.",
    "When evidence is missing, explicitly mark it as missing instead of inventing a claim.",
  ].join("\n");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function planningUserContent(
  project: PlanningProjectFacts,
  rulePack: PlatformRulePack,
  referenceImages: readonly PlanningReferenceImage[],
  signal: AbortSignal,
  apiKey: string,
  allowReferenceImages = true,
): Promise<unknown> {
  const images = (allowReferenceImages ? referenceImages : []).filter(
    (image) => image.blob.size > 0 && image.mimeType.startsWith("image/"),
  );
  const text = JSON.stringify({
    project,
    rulePack,
    referenceImages: images.map(({ name, mimeType }) => ({ name, mimeType })),
    ...(!allowReferenceImages && referenceImages.length > 0
      ? { referenceImagesSkipped: "The configured planner provider accepts text only; reference images were intentionally omitted." }
      : {}),
  });
  if (images.length === 0) return text;

  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  for (const image of images) {
    if (signal.aborted) throwAbortReason(signal, apiKey);
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    if (signal.aborted) throwAbortReason(signal, apiKey);
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${bytesToBase64(bytes)}`,
        detail: "low",
      },
    });
  }
  return content;
}

function enforcePlatformCandidate(
  candidate: Record<string, unknown>,
  rulePack: PlatformRulePack,
): Record<string, unknown> {
  if (rulePack.platformId !== "amazon" || !Array.isArray(candidate.slots)) {
    return candidate;
  }

  return {
    ...candidate,
    slots: candidate.slots.map((slot) => {
      if (typeof slot !== "object" || slot === null || !("slotKey" in slot)) {
        return slot;
      }
      return slot.slotKey === "MAIN" ? { ...slot, visibleCopy: "" } : slot;
    }),
  };
}

function httpError(response: Response): OpenAIPlannerError {
  if (response.status === 401) {
    return new OpenAIPlannerError(
      "auth",
      "API 密钥校验失败，请检查密钥是否正确且仍然有效。",
      response.status,
    );
  }
  if (response.status === 403) {
    return new OpenAIPlannerError(
      "auth",
      "API 权限校验失败，请检查密钥与所选模型的访问权限。",
      response.status,
    );
  }
  if (response.status === 404) {
    return new OpenAIPlannerError(
      "path",
      "API 地址不存在，请确认填写的是 Chat Completions endpoint。",
      response.status,
    );
  }
  if (response.status === 429) {
    return new OpenAIPlannerError(
      "quota",
      "API 额度或速率限制已触发，请检查余额、配额或稍后重试。",
      response.status,
    );
  }
  return new OpenAIPlannerError(
    "http",
    `API 请求失败（HTTP ${response.status}），请稍后重试或检查服务商状态。`,
    response.status,
  );
}

function abortReason(signal: AbortSignal, apiKey: string): Error {
  if (!(signal.reason instanceof Error)) {
    return new DOMException("策划已取消", "AbortError");
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

async function parsePlanResponse(
  response: Response,
  rulePack: PlatformRulePack,
  amazonSession?: PlatformPlan["amazonSession"],
): Promise<PlatformPlan> {
  try {
    const payload = (await response.json()) as ChatCompletionsResponse;
    const content = payload.choices?.[0]?.message?.content;
    const parsedCandidate = JSON.parse(structuredJsonText(content)) as Record<string, unknown>;
    const candidate = enforcePlatformCandidate(parsedCandidate, rulePack);

    const plan = normalizePlatformPlan(
      {
        ...candidate,
        source: "api",
        ...(amazonSession ? { amazonSession } : {}),
      },
      rulePack,
    );
    if (rulePack.platformId === "amazon" && rulePack.promptLanguage === "en") {
      const templateSlot = plan.slots.find((slot) =>
        hasAmazonChinesePromptTemplate(`${slot.prompt}\n${slot.negativePrompt}`),
      );
      if (templateSlot) {
        throw new OpenAIPlannerError(
          "format",
          `Amazon 槽位 ${templateSlot.slotKey} 的模型提示词包含中文策划模板，请重试。`,
        );
      }
    }

    return plan;
  } catch (error) {
    if (error instanceof OpenAIPlannerError) {
      throw error;
    }
    if (error instanceof PlanningNormalizationError) {
      throw new OpenAIPlannerError("format", error.userMessage);
    }
    throw new OpenAIPlannerError("format", "AI 策划结果格式不正确，请重试或更换模型。");
  }
}

export class OpenAIPlanner implements PlannerEngine {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAIPlannerOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async plan(
    project: PlanningProjectFacts,
    rulePack: PlatformRulePack,
    signal: AbortSignal,
    referenceImages: readonly PlanningReferenceImage[] = [],
    amazonOptions?: AmazonPlanningRequestOptions,
  ): Promise<PlatformPlan> {
    if (signal.aborted) {
      throwAbortReason(signal, this.options.apiKey);
    }

    let effectivePack = rulePack;
    let amazonSession = undefined as PlatformPlan["amazonSession"];
    if (rulePack.platformId === "amazon" && amazonOptions) {
      const resolved = resolvePlanningRulePack("amazon", amazonOptions);
      effectivePack = resolved.rulePack;
      amazonSession = resolved.amazonSession;
    } else if (rulePack.platformId === "amazon") {
      const legacy = resolvePlanningRulePack("amazon", { plannerMode: "legacy-combined" });
      amazonSession = legacy.amazonSession;
    }
    // Rebind local name used below
    rulePack = effectivePack;

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
          const error = new OpenAIPlannerError(
            "timeout",
            "AI 策划请求超时，请检查网络或调高超时设置后重试。",
          );
          reject(error);
          requestController.abort(error);
        }, this.options.timeoutMs ?? DEFAULT_PLANNER_REQUEST_TIMEOUT_MS);
      });
      const request = async () => {
        const userContent = await planningUserContent(
          project,
          rulePack,
          referenceImages,
          requestController.signal,
          this.options.apiKey,
          this.options.plannerReferenceImages !== false,
        );
        if (requestController.signal.aborted) {
          throwAbortReason(requestController.signal, this.options.apiKey);
        }
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
                content: planningSystemPrompt(rulePack),
              },
              {
                role: "user",
                content: userContent,
              },
            ],
          }),
          signal: requestController.signal,
        });
        if (!response.ok) {
          throw httpError(response);
        }
        return parsePlanResponse(response, rulePack, amazonSession);
      };

      return await Promise.race([request(), abortPromise, timeoutPromise]);
    } catch (error) {
      if (signal.aborted) {
        throwAbortReason(signal, this.options.apiKey);
      }
      if (error instanceof OpenAIPlannerError) {
        throw safePlannerError(error, this.options.apiKey);
      }
      throw new OpenAIPlannerError(
        "http",
        "无法连接 API，请检查网络、CORS 配置和接口地址。",
      );
    } finally {
      removeAbortListener();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
