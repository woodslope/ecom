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
import {
  buildPlanningStrategySnippet,
  resolvePromptProfile,
} from "../domain/prompt-profiles/prompt-profiles";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";
import type { PlatformPlanningRequest } from "../domain/planning/types";
import { buildPlannerPrompt } from "../domain/prompting";
import {
  AiTransportError,
  OpenAICompatibleTextTransport,
  inferTextProtocol,
  unwrapStructuredJson,
} from "./ai/transport";
import type { TextServiceProtocol } from "../domain/settings/types";
import { createPlannerTaskSettings, type PlannerTaskSettings } from "../domain/prompting";

export interface OpenAIPlannerOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  plannerReferenceImages?: boolean;
  protocol?: TextServiceProtocol;
}

// Planning prompts can contain several reference images and a large structured output.
// Five minutes gives slower but otherwise healthy providers enough time to finish.
export const DEFAULT_PLANNER_REQUEST_TIMEOUT_MS = 300_000;

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

function timeoutLabel(timeoutMs: number): string {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function parsePlanText(
  rawText: string,
  rulePack: PlatformRulePack,
  amazonSession?: PlatformPlan["amazonSession"],
): PlatformPlan {
  try {
    const parsedCandidate = JSON.parse(unwrapStructuredJson(rawText)) as Record<string, unknown>;
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

  async planRequest(request: PlatformPlanningRequest, signal: AbortSignal): Promise<PlatformPlan> {
    return this.plan(
      request.productFacts,
      request.platformRules,
      signal,
      request.referenceImages,
      request.amazonOptions,
      request.inputAssessment,
      request.industryTemplate,
      request.taskSettings,
    );
  }

  async plan(
    project: PlanningProjectFacts,
    rulePack: PlatformRulePack,
    signal: AbortSignal,
    referenceImages: readonly PlanningReferenceImage[] = [],
    amazonOptions?: AmazonPlanningRequestOptions,
    inputAssessment?: PlanningInputAssessment,
    industryTemplate?: IndustryTemplateSnapshot,
    taskSettings?: PlannerTaskSettings,
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
    const effectiveTaskSettings = taskSettings ?? createPlannerTaskSettings(
      rulePack,
      amazonOptions,
      promptProfile.id,
      referenceImages.map((image) => image.name),
    );
    const requestController = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_PLANNER_REQUEST_TIMEOUT_MS;
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
            `策划请求超时（超过 ${timeoutLabel(timeoutMs)}）。排查步骤：1. 检查网络连接是否稳定；2. 尝试更换更快的模型；3. 减少参考图数量或改用已压缩的小图。`,
          );
          reject(error);
          requestController.abort(error);
        }, timeoutMs);
      });
      const request = async () => {
        const prompt = buildPlannerPrompt({
          project,
          rulePack,
          taskSettings: effectiveTaskSettings,
          referenceImages,
          inputAssessment,
          industryTemplate,
          strategySnippet: promptProfile ? buildPlanningStrategySnippet(promptProfile) : undefined,
          ...(this.options.plannerReferenceImages === false && referenceImages.length > 0
            ? { referenceImagesSkipped: "The configured planner provider accepts text only; reference images were intentionally omitted." }
            : {}),
        });
        const transport = new OpenAICompatibleTextTransport({
          endpoint: this.options.endpoint,
          apiKey: this.options.apiKey,
          model: this.options.model,
          protocol: this.options.protocol ?? inferTextProtocol(this.options.endpoint),
          fetch: this.fetch,
          timeoutMs,
        });
        const result = await transport.request({
          service: "planner",
          model: this.options.model,
          prompt,
          referenceImages: this.options.plannerReferenceImages === false ? [] : referenceImages,
          maxOutputTokens: 12_000,
          signal: requestController.signal,
        });
        return parsePlanText(result.text, rulePack, amazonSession);
      };

      return await Promise.race([request(), abortPromise, timeoutPromise]);
    } catch (error) {
      if (signal.aborted) {
        throwAbortReason(signal, this.options.apiKey);
      }
      if (error instanceof AiTransportError) {
        const code = error.code === "timeout" || error.code === "auth" || error.code === "path" || error.code === "quota" || error.code === "format" || error.code === "capability"
          ? error.code
          : error.code === "network" ? "http" : "http";
        throw new OpenAIPlannerError(code, error.userMessage, error.status);
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
