export type RuntimeMode = "demo" | "api";
export type ImageGenerationMode = "sync" | "async";
export type ConnectionMode = "dual" | "single";
export type TextServiceProtocol = "chat-completions" | "responses";
export type ImageServiceProtocol = "images-api" | "chat-completions";

/** A named, service-specific connection profile used by runtime settings v2. */
export interface NamedServiceConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Common shape for either named AI service; concrete services narrow protocol fields. */
export interface AiServiceConfig extends NamedServiceConfig {
  protocol: TextServiceProtocol | ImageServiceProtocol;
  timeoutMs?: number;
}

export interface TextServiceConfig extends AiServiceConfig {
  /** Optional explicit Chat Completions endpoint for providers that need one. */
  endpoint?: string;
  protocol: TextServiceProtocol;
}

export interface ImageServiceConfig extends AiServiceConfig {
  generationMode: ImageGenerationMode;
  protocol: ImageServiceProtocol;
}

export type RuntimeTextServiceConfig = TextServiceConfig;
export type RuntimeImageServiceConfig = ImageServiceConfig;

/** Public connection metadata. Credentials are intentionally not part of this type. */
export interface RuntimeServiceSummary {
  name: string;
  baseUrl: string;
  model: string;
  provider?: string;
  protocol?: TextServiceProtocol | ImageServiceProtocol;
}

/** Versioned shape persisted under the v2 runtime settings key. */
export interface RuntimeSettingsV2 {
  version: 2;
  /** Preferred explicit schema marker; `version` remains for older callers. */
  schemaVersion?: 2;
  mode: RuntimeMode;
  connectionMode: ConnectionMode;
  text: TextServiceConfig;
  image: ImageServiceConfig;
}

export interface RuntimeSettings {
  /** Legacy shared key retained for existing browser settings and adapters. */
  mode: RuntimeMode;
  /** Missing in legacy v1 payloads; normalization always resolves it to dual. */
  connectionMode?: ConnectionMode;
  apiKey: string;
  planningEndpoint: string;
  planningModel: string;
  imageBaseUrl: string;
  imageModel: string;
  /** VisPath-style service-specific settings. */
  textBaseUrl?: string;
  textApiKey?: string;
  imageApiKey?: string;
  imageGenerationMode?: ImageGenerationMode;
  textProtocol?: TextServiceProtocol;
  imageProtocol?: ImageServiceProtocol;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}
