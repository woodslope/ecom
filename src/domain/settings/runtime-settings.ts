import type {
  ImageGenerationMode,
  ImageServiceConfig,
  RuntimeServiceSummary,
  RuntimeSettings,
  RuntimeSettingsV2,
  TextServiceConfig,
  TextServiceProtocol,
  ImageServiceProtocol,
} from "./types";
import { detectProviderCapabilities } from "./provider-capabilities";

/** V1 is kept as a public compatibility alias for backups and old callers. */
export const RUNTIME_SETTINGS_STORAGE_KEY = "ecom-workbench.runtime-settings.v1";
export const RUNTIME_SETTINGS_STORAGE_KEY_V1 = RUNTIME_SETTINGS_STORAGE_KEY;
export const RUNTIME_SETTINGS_STORAGE_KEY_V2 = "ecom-workbench.runtime-settings.v2";

export const defaultRuntimeSettings: RuntimeSettings = {
  mode: "api",
  connectionMode: "dual",
  apiKey: "",
  planningEndpoint: "https://api.openai.com/v1/chat/completions",
  planningModel: "",
  imageBaseUrl: "https://api.openai.com/v1",
  imageModel: "",
};

export const defaultRuntimeSettingsV2: RuntimeSettingsV2 = {
  version: 2,
  schemaVersion: 2,
  mode: "api",
  connectionMode: "dual",
  text: {
    name: "文本策划",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    protocol: "chat-completions",
  },
  image: {
    name: "图片生成",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    generationMode: "sync",
    protocol: "images-api",
  },
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
  return ["textBaseUrl", "textApiKey", "imageApiKey", "imageGenerationMode", "textProtocol", "imageProtocol"].some((key) =>
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
    // Runtime mode is intentionally API-only. Keep accepting the legacy field
    // so older stored payloads can be normalized without a migration step.
    mode: "api",
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
    normalized.textProtocol = value.textProtocol === "responses" ? "responses" : "chat-completions";
    normalized.imageProtocol = value.imageProtocol === "chat-completions" ? "chat-completions" : "images-api";
  }
  return normalized;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function profileValue(value: unknown, ...keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
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

/** Convert either a legacy flat object or a v2 object to the persisted v2 shape. */
export function normalizeRuntimeSettingsV2(value: unknown): RuntimeSettingsV2 {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const flat = normalizeRuntimeSettings(input as Partial<RuntimeSettings>);
  const textInput = profileValue(input, "text", "textService", "textConfig");
  const imageInput = profileValue(input, "image", "imageService", "imageConfig");
  const textRecord = textInput && typeof textInput === "object" ? textInput as Record<string, unknown> : {};
  const imageRecord = imageInput && typeof imageInput === "object" ? imageInput as Record<string, unknown> : {};
  const textBaseUrl = normalizedTextBaseUrl(
    profileValue(textRecord, "baseUrl", "url") ?? flat.textBaseUrl,
    runtimeTextBaseUrl(flat),
  );
  const textApiKey = stringValue(profileValue(textRecord, "apiKey", "key"), runtimeTextApiKey(flat));
  const textModel = stringValue(profileValue(textRecord, "model"), flat.planningModel);
  const imageBaseUrl = normalizedUrl(
    profileValue(imageRecord, "baseUrl", "url") ?? flat.imageBaseUrl,
    flat.imageBaseUrl,
    true,
  );
  const imageApiKey = stringValue(profileValue(imageRecord, "apiKey", "key"), runtimeImageApiKey(flat));
  const imageModel = stringValue(profileValue(imageRecord, "model"), flat.imageModel);
  const rawTextEndpoint = profileValue(textRecord, "endpoint") ??
    (typeof input.planningEndpoint === "string" ? input.planningEndpoint : undefined);
  const textProtocol = normalizeTextProtocol(profileValue(textRecord, "protocol"), String(rawTextEndpoint ?? ""));
  const text: TextServiceConfig = {
    name: stringValue(profileValue(textRecord, "name", "label", "displayName"), "文本策划"),
    baseUrl: textBaseUrl,
    apiKey: textApiKey,
    model: textModel,
    endpoint: normalizedUrl(
      rawTextEndpoint,
      `${textBaseUrl}/${textProtocol === "responses" ? "responses" : "chat/completions"}`,
    ),
    protocol: textProtocol,
  };
  const image: ImageServiceConfig = {
    name: stringValue(profileValue(imageRecord, "name", "label", "displayName"), "图片生成"),
    baseUrl: imageBaseUrl,
    apiKey: imageApiKey,
    model: imageModel,
    generationMode:
      profileValue(imageRecord, "generationMode") === "async" || flat.imageGenerationMode === "async"
        ? "async"
        : "sync",
    protocol: normalizeImageProtocol(profileValue(imageRecord, "protocol"), imageBaseUrl),
  };
  return {
    version: 2,
    schemaVersion: 2,
    mode: input.mode === "demo" ? "demo" : "api",
    connectionMode: input.connectionMode === "single" ? "single" : flat.connectionMode ?? "dual",
    text,
    image,
  };
}

/** Explicit migration entry point for callers processing a known V1 payload. */
export function migrateRuntimeSettingsV1(value: Partial<RuntimeSettings> | unknown): RuntimeSettingsV2 {
  return normalizeRuntimeSettingsV2(value);
}

/** Flatten v2 settings for existing UI/store/service consumers. */
export function runtimeSettingsFromV2(value: RuntimeSettingsV2 | unknown): RuntimeSettings {
  const normalized = normalizeRuntimeSettingsV2(value);
  return normalizeRuntimeSettings({
    mode: normalized.mode,
    connectionMode: normalized.connectionMode,
    textBaseUrl: normalized.text.baseUrl,
    textApiKey: normalized.text.apiKey,
    planningEndpoint: normalized.text.endpoint,
    planningModel: normalized.text.model,
    imageBaseUrl: normalized.image.baseUrl,
    imageApiKey: normalized.image.apiKey,
    imageModel: normalized.image.model,
    imageGenerationMode: normalized.image.generationMode,
    textProtocol: normalized.text.protocol,
    imageProtocol: normalized.image.protocol,
  });
}

export function runtimeSettingsToV2(settings: RuntimeSettings): RuntimeSettingsV2 {
  return persistedRuntimeSettingsV2(settings);
}

function persistedRuntimeSettingsV2(settings: RuntimeSettings | RuntimeSettingsV2): RuntimeSettingsV2 {
  const normalized = normalizeRuntimeSettingsV2(settings);
  // Persist only named service roots. A complete endpoint is accepted as a
  // migration input, then reconstructed from baseUrl + protocol on load.
  const { endpoint: _endpoint, ...text } = normalized.text;
  return { ...normalized, text };
}

export function runtimeTextService(settings: RuntimeSettings | RuntimeSettingsV2): TextServiceConfig {
  if ("text" in settings) return normalizeRuntimeSettingsV2(settings).text;
  return normalizeRuntimeSettingsV2(settings).text;
}

export function runtimeImageService(settings: RuntimeSettings | RuntimeSettingsV2): ImageServiceConfig {
  const normalized = normalizeRuntimeSettingsV2(settings);
  if (normalized.connectionMode === "single") {
    return {
      ...normalized.image,
      name: normalized.text.name,
      baseUrl: normalized.text.baseUrl,
      apiKey: normalized.text.apiKey,
      model: normalized.image.model || normalized.text.model,
    };
  }
  return normalized.image;
}

export const getTextServiceConfig = runtimeTextService;
export const getImageServiceConfig = runtimeImageService;
export const getTextConfig = runtimeTextService;
export const getImageConfig = runtimeImageService;
export const runtimeTextConfig = runtimeTextService;
export const runtimeImageConfig = runtimeImageService;

export function runtimeTextServiceSummary(settings: RuntimeSettings | RuntimeSettingsV2): RuntimeServiceSummary {
  const service = runtimeTextService(settings);
  const capabilities = detectProviderCapabilities(service.baseUrl);
  return { name: service.name, baseUrl: service.baseUrl, model: service.model, provider: capabilities.provider, protocol: service.protocol };
}

export function runtimeImageServiceSummary(settings: RuntimeSettings | RuntimeSettingsV2): RuntimeServiceSummary {
  const service = runtimeImageService(settings);
  const capabilities = detectProviderCapabilities(service.baseUrl);
  return { name: service.name, baseUrl: service.baseUrl, model: service.model, provider: capabilities.provider, protocol: service.protocol };
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
  return detectProviderCapabilities(runtimeImageBaseUrl(settings)).imageEditing;
}

export function validateRuntimeSettings(settings: RuntimeSettings): string | null {
  const singleConnection = settings.connectionMode === "single";
  const unconfigured =
    !runtimeTextApiKey(settings) &&
    !runtimeImageApiKey(settings) &&
    !settings.planningModel &&
    !settings.imageModel;
  if (unconfigured) return null;
  if (!runtimeTextApiKey(settings)) return "请填写文本策划 API Key。";
  if (!singleConnection && !runtimeImageApiKey(settings)) return "请填写图片生成 API Key。";
  if (!settings.planningModel) return "请填写文本策划模型。";
  if (!singleConnection && !settings.imageModel) return "请填写图片生成模型。";
  if (
    singleConnection &&
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
      const candidates = [
        storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY_V2),
        storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY_V1),
      ];
      for (const raw of candidates) {
        if (!raw) continue;
        try {
          return runtimeSettingsFromV2(JSON.parse(raw) as unknown);
        } catch {
          // Try the legacy key when a stale or partially-written v2 value exists.
        }
      }
      return { ...defaultRuntimeSettings };
    },
    async save(settings) {
      storage.setItem(
        RUNTIME_SETTINGS_STORAGE_KEY_V2,
        JSON.stringify(persistedRuntimeSettingsV2(settings)),
      );
    },
  };
}

export interface RuntimeSettingsV2Repository {
  load(): Promise<RuntimeSettingsV2>;
  save(settings: RuntimeSettingsV2): Promise<void>;
}

/** V2-native repository for callers that do not need the legacy flat adapter. */
export function createLocalStorageRuntimeSettingsV2Repository(
  storage: Pick<Storage, "getItem" | "setItem">,
): RuntimeSettingsV2Repository {
  return {
    async load() {
      const raw = storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY_V2);
      if (raw) {
        try {
          return normalizeRuntimeSettingsV2(JSON.parse(raw) as unknown);
        } catch {
          // Fall through to the V1 migration path.
        }
      }
      const legacy = storage.getItem(RUNTIME_SETTINGS_STORAGE_KEY_V1);
      if (legacy) {
        try {
          return migrateRuntimeSettingsV1(JSON.parse(legacy) as unknown);
        } catch {
          // Return defaults for malformed browser storage.
        }
      }
      return normalizeRuntimeSettingsV2(defaultRuntimeSettingsV2);
    },
    async save(settings) {
      storage.setItem(RUNTIME_SETTINGS_STORAGE_KEY_V2, JSON.stringify(persistedRuntimeSettingsV2(settings)));
    },
  };
}
