export type RuntimeMode = "demo" | "api";
export type ImageGenerationMode = "sync" | "async";
export type ConnectionMode = "dual" | "single";

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
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}
