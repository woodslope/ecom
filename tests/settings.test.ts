import { describe, expect, it } from "vitest";

import {
  createLocalStorageSettingsRepository,
  createMemorySettingsRepository,
  normalizeRuntimeSettings,
  runtimeImageRequestUrl,
  runtimeTextRequestUrl,
  testImageApiConnection,
  testTextApiConnection,
  testApiConnection,
  validateRuntimeSettings,
} from "../src/domain/settings";
import { createAiRuntimeFactory } from "../src/services/ai/runtime-factory";

describe("runtime settings", () => {
  it("normalizes and restores an OpenAI-compatible configuration locally", async () => {
    const repository = createMemorySettingsRepository();
    const settings = normalizeRuntimeSettings({
      mode: "api",
      apiKey: "  sk-local-secret  ",
      planningEndpoint: " https://provider.example/v1/chat/completions ",
      planningModel: " planning-model ",
      imageBaseUrl: " https://provider.example/v1/ ",
      imageModel: " image-model ",
    });

    await repository.save(settings);

    expect(await repository.load()).toEqual({
      mode: "api",
      connectionMode: "dual",
      textBaseUrl: "https://provider.example/v1",
      textApiKey: "sk-local-secret",
      planningModel: "planning-model",
      textProtocol: "chat-completions",
      imageBaseUrl: "https://provider.example/v1",
      imageApiKey: "sk-local-secret",
      imageModel: "image-model",
      imageGenerationMode: "sync",
      imageProtocol: "images-api",
    });
  });

  it("migrates a stored v2 document to the single runtime settings shape", async () => {
    const records = new Map<string, string>();
    const storage = {
      getItem(key: string) { return records.get(key) ?? null; },
      setItem(key: string, value: string) { records.set(key, value); },
    };
    records.set("ecom-workbench.runtime-settings.api.v1", JSON.stringify({
      version: 2,
      schemaVersion: 2,
      mode: "api",
      connectionMode: "dual",
      text: {
        baseUrl: "https://text.example/v1",
        apiKey: "text-key",
        model: "text-model",
        protocol: "chat-completions",
      },
      image: {
        baseUrl: "https://image.example/v1",
        apiKey: "image-key",
        model: "image-model",
        generationMode: "sync",
        protocol: "images-api",
      },
    }));

    const settings = await createLocalStorageSettingsRepository(storage).load();

    expect(settings).toEqual({
      mode: "api",
      connectionMode: "dual",
      textBaseUrl: "https://text.example/v1",
      textApiKey: "text-key",
      planningModel: "text-model",
      textProtocol: "chat-completions",
      imageBaseUrl: "https://image.example/v1",
      imageApiKey: "image-key",
      imageModel: "image-model",
      imageGenerationMode: "sync",
      imageProtocol: "images-api",
    });
    expect(JSON.parse(records.get("ecom-workbench.runtime-settings.api.v1") ?? "null")).toEqual(settings);
  });

  it("does not let an empty modern key erase a legacy configured key", () => {
    expect(normalizeRuntimeSettings({
      textApiKey: "",
      imageApiKey: "",
      apiKey: "legacy-key",
    })).toMatchObject({
      textApiKey: "legacy-key",
      imageApiKey: "legacy-key",
    });
  });

  it("returns an actionable connection error without echoing the API key", async () => {
    const apiKey = "sk-never-render-me";
    const result = await testApiConnection(
      normalizeRuntimeSettings({
        mode: "api",
        apiKey,
        planningEndpoint: "https://provider.example/v1/chat/completions",
        planningModel: "planning-model",
        imageBaseUrl: "https://provider.example/v1",
        imageModel: "image-model",
      }),
      {
        fetch: async () =>
          new Response(JSON.stringify({ error: { message: `invalid key ${apiKey}` } }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      },
    );

    expect(result).toEqual({
      ok: false,
      message: "API 密钥校验失败，请检查密钥是否正确且仍然有效。",
    });
    expect(result.message).not.toContain(apiKey);
  });

  it("rejects invalid or insecure remote endpoints instead of silently changing them", () => {
    const invalid = normalizeRuntimeSettings({
      mode: "api",
      textApiKey: "sk-local-secret",
      textBaseUrl: "not-a-url",
      planningModel: "planning-model",
      imageBaseUrl: "http://provider.example/v1",
      imageModel: "image-model",
    });

    expect(invalid.textBaseUrl).toBe("not-a-url");
    expect(validateRuntimeSettings(invalid)).toContain("文本 API 根地址无效");

    const insecure = normalizeRuntimeSettings({
      ...invalid,
      textBaseUrl: "https://provider.example/v1",
    });
    expect(validateRuntimeSettings(insecure)).toContain("图片服务地址必须使用 HTTPS");

    const localProxy = normalizeRuntimeSettings({
      ...insecure,
      imageBaseUrl: "http://127.0.0.1:8787/v1",
    });
    expect(validateRuntimeSettings(localProxy)).toBeNull();
  });

  it("normalizes separate text and image credentials without runtime aliases", () => {
    const settings = normalizeRuntimeSettings({
      mode: "api",
      textBaseUrl: " https://text.example/v1/ ",
      textApiKey: " text-key ",
      planningModel: " planning-model ",
      imageBaseUrl: " https://image.example/v1/ ",
      imageApiKey: " image-key ",
      imageModel: " image-model ",
      imageGenerationMode: "sync",
    });

    expect(settings).toMatchObject({
      textBaseUrl: "https://text.example/v1",
      textApiKey: "text-key",
      imageBaseUrl: "https://image.example/v1",
      imageApiKey: "image-key",
      imageGenerationMode: "sync",
    });
    expect(settings).not.toHaveProperty("apiKey");
    expect(settings).not.toHaveProperty("planningEndpoint");
    expect(settings).not.toHaveProperty("version");
    expect(settings).not.toHaveProperty("text");
    expect(validateRuntimeSettings(settings)).toBeNull();
  });

  it("resolves the same request URLs shown in settings and used by transports", () => {
    const dual = normalizeRuntimeSettings({
      mode: "api",
      connectionMode: "dual",
      textBaseUrl: "https://text.example/v1",
      imageBaseUrl: "https://image.example/v1",
    });
    expect(runtimeTextRequestUrl(dual)).toBe("https://text.example/v1/chat/completions");
    expect(runtimeImageRequestUrl(dual)).toBe("https://image.example/v1/images/generations");

    const single = normalizeRuntimeSettings({
      mode: "api",
      connectionMode: "single",
      textBaseUrl: "https://openrouter.ai/api/v1",
    });
    expect(runtimeImageRequestUrl(single)).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("tests text and image services independently, including a minimal image request", async () => {
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("chat/completions")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer text-key" });
        return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
          status: 200,
        });
      }
      expect(String(input)).toBe("https://image.example/v1/images/generations");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer image-key" });
      return new Response(JSON.stringify({ data: [{ b64_json: btoa("test-image") }] }), { status: 200 });
    };
    const settings = normalizeRuntimeSettings({
      mode: "api",
      textBaseUrl: "https://text.example/v1",
      textApiKey: "text-key",
      planningModel: "planning-model",
      imageBaseUrl: "https://image.example/v1",
      imageApiKey: "image-key",
      imageModel: "image-model",
    });

    await expect(testTextApiConnection(settings, { fetch: fetchMock })).resolves.toEqual({
      ok: true,
      message: "文本策划 API 连接成功。",
    });
    await expect(testImageApiConnection(settings, { fetch: fetchMock })).resolves.toEqual({
      ok: true,
      message: "图片生成 API 测试成功，已收到可用图片（本次测试会消耗一次生图额度）。",
    });
  });

  it("keeps flattened image credentials when the runtime factory tests the image service", async () => {
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://image.example/v1/images/generations");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer image-key" });
      return new Response(JSON.stringify({ data: [{ b64_json: btoa("test-image") }] }), { status: 200 });
    };
    const factory = createAiRuntimeFactory({ fetch: fetchMock });
    const settings = normalizeRuntimeSettings({
      mode: "api",
      connectionMode: "dual",
      textBaseUrl: "https://text.example/v1",
      textApiKey: "text-key",
      planningModel: "planning-model",
      imageBaseUrl: "https://image.example/v1",
      imageApiKey: "image-key",
      imageModel: "image-model",
    });

    await expect(factory.testImageConnection(settings)).resolves.toEqual({
      ok: true,
      message: "图片生成 API 测试成功，已收到可用图片（本次测试会消耗一次生图额度）。",
    });
  });
});
