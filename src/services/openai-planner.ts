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
import type { PlanningInputAssessment } from "../domain/planning/input-assessment";
import type { PlatformRulePack } from "../domain/platforms/types";
import { hasAmazonChinesePromptTemplate } from "../domain/platforms/prompt-language";
import { getAmazonMarketplaceByLocale } from "../domain/platforms/amazon-marketplaces";
import { isAPlusExternalTextSlotRule } from "../domain/platforms/amazon-catalog";
import {
  type PromptProfile,
  buildPlanningStrategySnippet,
  resolvePromptProfile,
} from "../domain/prompt-profiles/prompt-profiles";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";

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
  | "capability"
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

function planningSystemPrompt(
  rulePack: PlatformRulePack,
  profile?: PromptProfile | null,
  industryTemplate?: IndustryTemplateSnapshot,
): string {
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
  const amazonListingRule = rulePack.platformId === "amazon"
    ? [
        "Amazon Listing source rule: when project.listingText is present, treat the original pasted Listing as the primary source for title, bullets, product facts, and buyer benefits; parsed project fields are supporting structure only.",
        "For every Amazon slot, strategy must be a detailed Simplified Chinese planning card explaining the visual objective, composition, product evidence, on-image copy approach, and compliance boundaries. This is the human-readable Chinese plan, not the image-model prompt.",
        "For every Amazon slot, prompt is the complete professional US English image-generation prompt. negativePrompt is a separate concise US English exclusion list for the image model.",
      ].join("\n")
    : "";

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
    amazonListingRule,
    "Evidence policy: distinguish three categories explicitly: user-supplied facts, information directly visible in a selected product image, and missing facts.",
    "User-supplied facts may be used as factual copy and evidence. Image-visible information may describe only directly observable appearance, color, shape, count, layout, and visible construction.",
    "Never infer hidden dimensions, material composition, performance, efficacy, certification, warranty, compatibility, package contents, or safety claims from an image.",
    "When a fact is missing, mark it as missing in evidence and keep copy/prompt neutral instead of inventing it.",
    ...(profile ? [buildPlanningStrategySnippet(profile)] : []),
    ...(industryTemplate
      ? [
          `Industry template: ${industryTemplate.name} v${industryTemplate.version}.`,
          industryTemplate.brief.stylePreference
            ? `Template style preference: ${industryTemplate.brief.stylePreference}.`
            : "",
          "Treat the industry template as reusable slot direction, not as product evidence.",
          "Current product facts, reference-image evidence, marketplace rules, and slot compliance always override template guidance.",
          "Do not copy concrete product facts from template guidance unless the same fact is present in the current project evidence.",
        ]
      : []),
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
  inputAssessment?: PlanningInputAssessment,
  industryTemplate?: IndustryTemplateSnapshot,
): Promise<unknown> {
  const images = (allowReferenceImages ? referenceImages : []).filter(
    (image) => image.blob.size > 0 && image.mimeType.startsWith("image/"),
  );
  const text = JSON.stringify({
    project,
    ...(rulePack.platformId === "amazon" && project.listingText?.trim()
      ? {
          originalListingText: project.listingText,
          originalListingTextRule: "Use this pasted Listing as the primary source; do not discard title or bullet wording when planning slots.",
        }
      : {}),
    rulePack,
    ...(inputAssessment ? { inputAssessment } : {}),
    ...(industryTemplate
      ? {
          industryTemplate: {
            id: industryTemplate.id,
            name: industryTemplate.name,
            version: industryTemplate.version,
            brief: industryTemplate.brief,
            slots: industryTemplate.slots,
          },
        }
      : {}),
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
      "API 密钥校验失败（401）。排查步骤：1. 确认密钥完整复制无多余空格；2. 检查密钥是否过期或被吊销；3. 确认密钥属于这个 API 地址对应的服务商。",
      response.status,
    );
  }
  if (response.status === 403) {
    return new OpenAIPlannerError(
      "auth",
      "API 权限不足（403）。排查步骤：1. 确认账户已绑定有效支付方式；2. 检查模型是否有访问权限；3. 部分服务商需先充值才能调用。",
      response.status,
    );
  }
  if (response.status === 404) {
    return new OpenAIPlannerError(
      "path",
      "API 地址不存在（404）。排查步骤：1. 确认地址以 /v1 结尾；2. 完整的 Chat Completions 地址应为 https://你的服务商/v1/chat/completions；3. 检查地址中是否有拼写错误。",
      response.status,
    );
  }
  if (response.status === 429) {
    return new OpenAIPlannerError(
      "quota",
      "请求过于频繁或额度不足（429）。排查步骤：1. 等待 30 秒后重试；2. 检查账户余额和配额限制；3. 降低并发请求数。",
      response.status,
    );
  }
  if (response.status >= 500) {
    return new OpenAIPlannerError(
      "http",
      `服务商服务器错误（${response.status}）。排查步骤：1. 等待 1-2 分钟后重试；2. 访问服务商状态页面确认服务是否正常；3. 尝试更换 API 地址。`,
      response.status,
    );
  }
  return new OpenAIPlannerError(
    "http",
    `API 请求失败（HTTP ${response.status}）。排查步骤：1. 检查网络连接是否正常；2. 确认服务商是否支持浏览器 CORS 访问；3. 查看浏览器 Console 是否有更多错误信息。`,
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
    throw new OpenAIPlannerError(
      "format",
      "AI 返回的策划结果格式异常。排查步骤：1. 点击重试（多数情况一次重试即可恢复）；2. 检查所选模型是否支持 JSON 输出；3. 尝试更换更稳定的模型。",
    );
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
    inputAssessment?: PlanningInputAssessment,
    industryTemplate?: IndustryTemplateSnapshot,
  ): Promise<PlatformPlan> {
    if (signal.aborted) {
      throwAbortReason(signal, this.options.apiKey);
    }
    if (
      inputAssessment?.quality === "image-only" &&
      !inputAssessment.hasAnyFacts &&
      this.options.plannerReferenceImages === false
    ) {
      throw new OpenAIPlannerError(
        "capability",
        "当前策划模型不支持读取商品图。请补充商品名称与可验证卖点/描述，或更换支持图片输入的策划模型。",
      );
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
    const promptProfile = resolvePromptProfile(amazonOptions?.stylePresetId);

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
            "策划请求超时（>2 分钟）。排查步骤：1. 检查网络连接是否稳定；2. 尝试更换更快的模型；3. 减少参考图数量或改用已压缩的小图。",
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
          inputAssessment,
          industryTemplate,
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
                content: planningSystemPrompt(rulePack, promptProfile, industryTemplate),
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
        "无法连接 API。排查步骤：1. 检查浏览器网络是否正常；2. 确认 API 地址支持 HTTPS 和 CORS 跨域请求；3. 尝试用 curl 或 Postman 测试同一地址；4. 如果使用代理，检查代理配置。",
      );
    } finally {
      removeAbortListener();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
