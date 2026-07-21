import { describe, expect, it } from "vitest";

import {
  detectProviderCapabilities,
  runtimeImageBaseUrl,
  runtimeSupportsImageEditing,
} from "../src/domain/settings";
import { normalizeRuntimeSettings, runtimeImageApiKey } from "../src/domain/settings";
import { validateRuntimeSettings } from "../src/domain/settings";

describe("provider modes", () => {
  it("normalizes legacy v1 settings to dual without clearing credentials", () => {
    const settings = normalizeRuntimeSettings({
      mode: "api",
      apiKey: "legacy-key",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "text-model",
      imageBaseUrl: "https://images.example/v1",
      imageModel: "image-model",
    });
    expect(settings.connectionMode).toBe("dual");
    expect(settings.apiKey).toBe("legacy-key");
  });

  it("single mode reuses one compatible connection for image requests", () => {
    const settings = normalizeRuntimeSettings({
      mode: "api",
      connectionMode: "single",
      textBaseUrl: "https://openrouter.ai/api/v1",
      textApiKey: "one-key",
      planningModel: "deepseek/deepseek-chat",
      imageBaseUrl: "https://ignored.example/v1",
      imageApiKey: "ignored-key",
      imageModel: "google/gemini-image",
    });
    expect(runtimeImageBaseUrl(settings)).toBe("https://openrouter.ai/api/v1");
    expect(runtimeImageApiKey(settings)).toBe("one-key");
  });

  it("detects OpenRouter image chat and official DeepSeek text-only planning", () => {
    expect(detectProviderCapabilities("https://openrouter.ai/api/v1")).toMatchObject({
      provider: "openrouter",
      imageTransport: "chat-completions",
      imageEditing: false,
    });
    expect(detectProviderCapabilities("https://api.deepseek.com/v1")).toMatchObject({
      provider: "deepseek",
      plannerReferenceImages: false,
      imageGeneration: false,
      imageEditing: false,
    });
    expect(detectProviderCapabilities("https://images.example/v1").imageEditing).toBe(true);
    expect(runtimeSupportsImageEditing(normalizeRuntimeSettings({ mode: "demo" }))).toBe(true);
  });

  it("rejects official DeepSeek as a single connection before generation", () => {
    const settings = normalizeRuntimeSettings({
      mode: "api", connectionMode: "single", textBaseUrl: "https://api.deepseek.com/v1",
      textApiKey: "secret", planningModel: "deepseek-chat", imageModel: "image-model",
      imageBaseUrl: "https://unused.example/v1",
    });
    expect(validateRuntimeSettings(settings)).toContain("双配置");
  });
});
