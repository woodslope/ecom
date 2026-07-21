import type { ImageGenerationMode, RuntimeSettings } from "./types";
import { detectProviderCapabilities } from "./provider-capabilities";

export const RUNTIME_SETTINGS_STORAGE_KEY = "ecom-workbench.runtime-settings.v1";

export const defaultRuntimeSettings: RuntimeSettings = {
  mode: "demo",
  connectionMode: "dual",
  apiKey: "",
  planningEndpoint: "https://api.openai.com/v1/chat/completions",
  planningModel: "",
  imageBaseUrl: "https://api.openai.com/v1",
  imageModel: "",
};

function normalizedUrl(value: unknown, fallback: string, stripTrailingSlash = false): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const candidate = trimmed || fallback;
  return stripTrailingSlash ? candidate.replace(/\/+$/, "") : candidate;
}

function normalizedTextBaseUrl(value: unknown, fallback: string): string {
  return normalizedUrl(value, fallback, true);
}

function baseUrlFromPlanningEndpoint(value: unknown): string {
  const endpoint = typeof value === "string" ? value.trim() : "";
  return endpoint.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "") ||
    defaultRuntimeSettings.imageBaseUrl;
}

function hasModernSettings(value: Partial<RuntimeSettings>): boolean {
  return ["textBaseUrl", "textApiKey", "imageApiKey", "imageGenerationMode"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
}

export function normalizeRuntimeSettings(value: Partial<RuntimeSettings>): RuntimeSettings {
  const textApiKey = typeof value.textApiKey === "string" ? value.textApiKey.trim() : "";
  const legacyApiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  const resolvedTextApiKey = textApiKey || legacyApiKey;
  const textBaseUrl = normalizedTextBaseUrl(
    value.textBaseUrl,
    baseUrlFromPlanningEndpoint(value.planningEndpoint ?? defaultRuntimeSettings.planningEndpoint),
  );
  const planningEndpoint = normalizedUrl(
    value.planningEndpoint,
    `${textBaseUrl}/chat/completions`,
  );
  const imageBaseUrl = normalizedUrl(
    value.imageBaseUrl,
    defaultRuntimeSettings.imageBaseUrl,
    true,
  );
  const normalized: RuntimeSettings = {
    mode: value.mode === "api" ? "api" : "demo",
    connectionMode: value.connectionMode === "single" ? "single" : "dual",
    apiKey: resolvedTextApiKey,
    planningEndpoint,
    planningModel: typeof value.planningModel === "string" ? value.planningModel.trim() : "",
    imageBaseUrl,
    imageModel: typeof value.imageModel === "string" ? value.imageModel.trim() : "",
  };
  if (hasModernSettings(value)) {
    normalized.textBaseUrl = textBaseUrl;
    normalized.textApiKey = resolvedTextApiKey;
    normalized.imageApiKey =
      typeof value.imageApiKey === "string" ? value.imageApiKey.trim() : legacyApiKey;
    normalized.imageGenerationMode =
      value.imageGenerationMode === "async" ? "async" : ("sync" as ImageGenerationMode);
  }
  return normalized;
}

export function runtimeTextBaseUrl(settings: RuntimeSettings): string {
  return normalizedTextBaseUrl(
    settings.textBaseUrl,
    baseUrlFromPlanningEndpoint(settings.planningEndpoint),
  );
}

export function runtimeTextApiKey(settings: RuntimeSettings): string {
  return (settings.textApiKey !== undefined ? settings.textApiKey : settings.apiKey || "").trim();
}

export function runtimeImageApiKey(settings: RuntimeSettings): string {
  if (settings.connectionMode === "single") return runtimeTextApiKey(settings);
  return (settings.imageApiKey !== undefined ? settings.imageApiKey : settings.apiKey || "").trim();
}

export function runtimeImageBaseUrl(settings: RuntimeSettings): string {
  return settings.connectionMode === "single" ? runtimeTextBaseUrl(settings) : settings.imageBaseUrl;
}

export function runtimeImageGenerationMode(settings: RuntimeSettings): ImageGenerationMode {
  return settings.imageGenerationMode === "async" ? "async" : "sync";
}

export function runtimeSupportsImageEditing(settings: RuntimeSettings): boolean {
  return settings.mode === "demo" || detectProviderCapabilities(runtimeImageBaseUrl(settings)).imageEditing;
}

export function validateRuntimeSettings(settings: RuntimeSettings): string | null {
  if (settings.mode === "demo") return null;
  if (!runtimeTextApiKey(settings)) return "请填写文本策划 API Key。";
  if (!runtimeImageApiKey(settings)) return "请填写图片生成 API Key。";
  if (!settings.planningModel) return "请填写文本策划模型。";
  if (!settings.imageModel) return "请填写图片生成模型。";
  if (
    settings.connectionMode === "single" &&
    !detectProviderCapabilities(runtimeTextBaseUrl(settings)).imageGeneration
  ) {
    return "DeepSeek 官方连接仅支持文本策划；请切换为双配置并单独填写兼容的图片生成服务。";
  }
  const planningUrlError = validateServiceUrl(
    runtimeTextBaseUrl(settings),
    settings.textBaseUrl !== undefined ? "文本 API 根地址" : "文本策划请求地址",
  );
  if (planningUrlError) return planningUrlError;
  const imageUrlError = validateServiceUrl(runtimeImageBaseUrl(settings), "图片服务地址");
  if (imageUrlError) return imageUrlError;
  return null;
}

function validateServiceUrl(value: string, label: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${label}无效，请填写完整的 http:// 或 https:// 地址。`;
  }
  if (parsed.protocol === "https:") return null;
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (parsed.protocol === "http:" && localHosts.has(parsed.hostname)) return null;
  return `${label}必须使用 HTTPS；仅 localhost 或 127.0.0.1 本机代理允许 HTTP。`;
}

export interface SettingsRepository {
  load(): Promise<RuntimeSettings>;
  save(settings: RuntimeSettings): Promise<void>;
}

export function createMemorySettingsRepository(
  initial: RuntimeSettings = defaultRuntimeSettings,
): SettingsRepository {
  let saved = normalizeRuntimeSettings(initial);
  return {
    async load() {
      return { ...saved };
    },
    async save(settings) {
      saved = normalizeRuntimeSettings(settings);
    },
  };
}

export function createLocalStorageSettingsRepository(
  storage: Pick<Storage, "getItem" | "setItem">,
): SettingsRepository {
  return {
    async load() {
      const raw = storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
      if (!raw) return { ...defaultRuntimeSettings };
      try {
        const settings = normalizeRuntimeSettings(JSON.parse(raw) as Partial<RuntimeSettings>);
        return validateRuntimeSettings(settings) ? { ...settings, mode: "demo" } : settings;
      } catch {
        return { ...defaultRuntimeSettings };
      }
    },
    async save(settings) {
      storage.setItem(
        RUNTIME_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeRuntimeSettings(settings)),
      );
    },
  };
}
