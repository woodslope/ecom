export interface ProviderCapabilities {
  provider: "openrouter" | "deepseek" | "openai-compatible";
  imageTransport: "images-api" | "chat-completions";
  plannerReferenceImages: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
}

export function detectProviderCapabilities(baseUrl: string): ProviderCapabilities {
  let host = "";
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch { /* validation handles this */ }
  if (host === "openrouter.ai" || host.endsWith(".openrouter.ai")) {
    return { provider: "openrouter", imageTransport: "chat-completions", plannerReferenceImages: true, imageGeneration: true, imageEditing: false };
  }
  if (host === "api.deepseek.com" || host.endsWith(".deepseek.com")) {
    return { provider: "deepseek", imageTransport: "images-api", plannerReferenceImages: false, imageGeneration: false, imageEditing: false };
  }
  return { provider: "openai-compatible", imageTransport: "images-api", plannerReferenceImages: true, imageGeneration: true, imageEditing: true };
}
