export interface ProviderCapabilities {
  provider: "openrouter" | "deepseek" | "openai-compatible";
  imageTransport: "images-api" | "chat-completions";
  plannerReferenceImages: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  textProtocols: Array<"chat-completions" | "responses">;
  streaming: boolean;
  imageInput: boolean;
  modelList: boolean;
}

export function detectProviderCapabilities(baseUrl: string): ProviderCapabilities {
  let host = "";
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch { /* validation handles this */ }
  if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) {
    return { provider: "openrouter", imageTransport: "chat-completions", plannerReferenceImages: true, imageGeneration: true, imageEditing: false, textProtocols: ["chat-completions", "responses"], streaming: true, imageInput: true, modelList: true };
  }
  if (host === "api.deepseek.com" || host.endsWith(".deepseek.com")) {
    return { provider: "deepseek", imageTransport: "images-api", plannerReferenceImages: false, imageGeneration: false, imageEditing: false, textProtocols: ["chat-completions"], streaming: true, imageInput: false, modelList: true };
  }
  return { provider: "openai-compatible", imageTransport: "images-api", plannerReferenceImages: true, imageGeneration: true, imageEditing: true, textProtocols: ["chat-completions", "responses"], streaming: true, imageInput: true, modelList: true };
}
