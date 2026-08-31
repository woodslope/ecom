import { resolveImageEndpoint, resolveTextEndpoint } from "./endpoints";
import { detectProviderCapabilities } from "./provider-capabilities";
import type {
  ImageGenerationMode,
  ImageServiceConfig,
  ImageServiceProtocol,
  RuntimeServiceSummary,
  RuntimeSettings,
  TextServiceConfig,
  TextServiceProtocol,
} from "./types";

/** Current API-only runtime settings document. */
export const RUNTIME_SETTINGS_STORAGE_KEY = "ecom-workbench.runtime-settings.api.v1";

export const defaultRuntimeSettings: RuntimeSettings = {
  mode: "api",
  connectionMode: "dual",
  textBaseUrl: "https://api.openai.com/v1",
  textApiKey: "",
  planningModel: "",
  textProtocol: "chat-completions",
  imageBaseUrl: "https://api.openai.com/v1",
  imageApiKey: "",
  imageModel: "",
  imageGenerationMode: "sync",
  imageProtocol: "images-api",
};

type UnknownRecord = Record<string, unknown>;

function recordValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function nestedRecord(value: UnknownRecord, ...keys: string[]): UnknownRecord {
  for (const key of keys) {
    const nested = recordValue(value[key]);
    if (Object.keys(nested).length > 0) return nested;
  }
  return {};
}

function stringField(value: UnknownRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key].trim();
  }
  return undefined;
}

function firstString(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value.length > 0)
    ?? values.find((value) => value !== undefined)
    ?? "";
}

function normalizedUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function baseUrlFromLegacyEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\/(?:chat\/completions|responses)\/?$/i, "").replace(/\/+$/, "");
}

function normalizeTextProtocol(value: unknown, endpoint: string): TextServiceProtocol {
  if (value === "responses") return "responses";
  if (value === "chat-completions") return "chat-completions";
  return /\/responses\/?$/i.test(endpoint) ? "responses" : "chat-completions";
}

function normalizeImageProtocol(value: unknown, baseUrl: string): ImageServiceProtocol {
  if (value === "chat-completions") return "chat-completions";
  if (value === "images-api") return "images-api";
  return detectProviderCapabilities(baseUrl).imageTransport;
}

/**
 * Normalize current settings and migrate legacy flat or nested v2 documents.
 * The returned object is the only runtime and persistence shape used by the app.
 */
export function normalizeRuntimeSettings(value: unknown): RuntimeSettings {
  const input = recordValue(value);
  const text = nestedRecord(input, "text", "textService", "textConfig");
  const image = nestedRecord(input, "image", "imageService", "imageConfig");
  const legacyEndpoint = stringField(input, "planningEndpoint");
  const textBaseUrl = normalizedUrl(
    firstString(
      stringField(input, "textBaseUrl"),
      stringField(text, "baseUrl", "url"),
      baseUrlFromLegacyEndpoint(legacyEndpoint),
    ),
    defaultRuntimeSettings.textBaseUrl,
  );
  const imageBaseUrl = normalizedUrl(
    firstString(
      stringField(input, "imageBaseUrl"),
      stringField(image, "baseUrl", "url"),
    ),
    defaultRuntimeSettings.imageBaseUrl,
  );
  const textProtocolValue = input.textProtocol ?? text.protocol;
  const imageProtocolValue = input.imageProtocol ?? image.protocol;

  return {
    mode: "api",
    connectionMode: input.connectionMode === "single" ? "single" : "dual",
    textBaseUrl,
    textApiKey: firstString(
      stringField(input, "textApiKey"),
      stringField(text, "apiKey", "key"),
      stringField(input, "apiKey"),
    ),
    planningModel: firstString(
      stringField(input, "planningModel"),
      stringField(text, "model"),
    ),
    textProtocol: normalizeTextProtocol(textProtocolValue, legacyEndpoint ?? textBaseUrl),
    imageBaseUrl,
    imageApiKey: firstString(
      stringField(input, "imageApiKey"),
      stringField(image, "apiKey", "key"),
      stringField(input, "apiKey"),
    ),
    imageModel: firstString(
      stringField(input, "imageModel"),
      stringField(image, "model"),
    ),
    imageGenerationMode:
      (input.imageGenerationMode ?? image.generationMode) === "async" ? "async" : "sync",
    imageProtocol: normalizeImageProtocol(imageProtocolValue, imageBaseUrl),
  };
}

export function runtimeTextService(settings: RuntimeSettings): TextServiceConfig {
  const normalized = normalizeRuntimeSettings(settings);
  return {
    name: "文本策划",
    baseUrl: normalized.textBaseUrl,
    apiKey: normalized.textApiKey,
    model: normalized.planningModel,
    endpoint: resolveTextEndpoint(normalized.textBaseUrl, normalized.textProtocol),
    protocol: normalized.textProtocol,
  };
}

export function runtimeImageService(settings: RuntimeSettings): ImageServiceConfig {
  const normalized = normalizeRuntimeSettings(settings);
  if (normalized.connectionMode === "single") {
    return {
      name: "统一模型连接",
      baseUrl: normalized.textBaseUrl,
      apiKey: normalized.textApiKey,
      model: normalized.imageModel || normalized.planningModel,
      generationMode: normalized.imageGenerationMode,
      protocol: detectProviderCapabilities(normalized.textBaseUrl).imageTransport,
    };
  }
  return {
    name: "图片生成",
    baseUrl: normalized.imageBaseUrl,
    apiKey: normalized.imageApiKey,
    model: normalized.imageModel,
    generationMode: normalized.imageGenerationMode,
    protocol: normalized.imageProtocol,
  };
}

export const getTextServiceConfig = runtimeTextService;
export const getImageServiceConfig = runtimeImageService;
export const getTextConfig = runtimeTextService;
export const getImageConfig = runtimeImageService;
export const runtimeTextConfig = runtimeTextService;
export const runtimeImageConfig = runtimeImageService;

export function runtimeTextServiceSummary(settings: RuntimeSettings): RuntimeServiceSummary {
  const service = runtimeTextService(settings);
  const capabilities = detectProviderCapabilities(service.baseUrl);
  return {
    name: service.name,
    baseUrl: service.baseUrl,
    model: service.model,
    provider: capabilities.provider,
    protocol: service.protocol,
  };
}

export function runtimeImageServiceSummary(settings: RuntimeSettings): RuntimeServiceSummary {
  const service = runtimeImageService(settings);
  const capabilities = detectProviderCapabilities(service.baseUrl);
  return {
    name: service.name,
    baseUrl: service.baseUrl,
    model: service.model,
    provider: capabilities.provider,
    protocol: service.protocol,
  };
}

export function runtimeTextBaseUrl(settings: RuntimeSettings): string {
  return settings.textBaseUrl.trim();
}

export function runtimeTextApiKey(settings: RuntimeSettings): string {
  return settings.textApiKey.trim();
}

export function runtimeImageApiKey(settings: RuntimeSettings): string {
  return settings.connectionMode === "single"
    ? runtimeTextApiKey(settings)
    : settings.imageApiKey.trim();
}

export function runtimeImageBaseUrl(settings: RuntimeSettings): string {
  return settings.connectionMode === "single"
    ? runtimeTextBaseUrl(settings)
    : settings.imageBaseUrl.trim();
}

export function runtimeImageGenerationMode(settings: RuntimeSettings): ImageGenerationMode {
  return settings.imageGenerationMode;
}

export function runtimeTextRequestUrl(settings: RuntimeSettings): string {
  return runtimeTextService(settings).endpoint ?? "";
}

export function runtimeImageRequestUrl(settings: RuntimeSettings): string {
  const service = runtimeImageService(settings);
  return resolveImageEndpoint(service.baseUrl, service.protocol, "generation");
}

export function runtimeSupportsImageEditing(settings: RuntimeSettings): boolean {
  return detectProviderCapabilities(runtimeImageBaseUrl(settings)).imageEditing;
}

export function validateRuntimeSettings(settings: RuntimeSettings): string | null {
  const planningUrlError = validateServiceUrl(runtimeTextBaseUrl(settings), "文本 API 根地址");
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
  initial: unknown = defaultRuntimeSettings,
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
      if (raw) {
        try {
          const settings = normalizeRuntimeSettings(JSON.parse(raw) as unknown);
          storage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
          return settings;
        } catch {
          // Malformed API settings fall back to defaults.
        }
      }
      return { ...defaultRuntimeSettings };
    },
    async save(settings) {
      storage.setItem(
        RUNTIME_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeRuntimeSettings(settings)),
      );
    },
  };
}
