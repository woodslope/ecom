export type RuntimeMode = "api";
export type ImageGenerationMode = "sync" | "async";
export type ConnectionMode = "dual" | "single";
export type TextServiceProtocol = "chat-completions" | "responses";
export type ImageServiceProtocol = "images-api" | "chat-completions";

/** A named, service-specific connection profile used by API-only runtime settings. */
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

export interface RuntimeSettings {
  mode: RuntimeMode;
  connectionMode: ConnectionMode;
  textBaseUrl: string;
  textApiKey: string;
  planningModel: string;
  textProtocol: TextServiceProtocol;
  imageBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
  imageGenerationMode: ImageGenerationMode;
  imageProtocol: ImageServiceProtocol;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}
