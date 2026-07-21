import { describe, expect, it } from "vitest";

import {
  createMemorySettingsRepository,
  normalizeRuntimeSettings,
  testImageApiConnection,
  testTextApiConnection,
  testApiConnection,
  validateRuntimeSettings,
} from "../src/domain/settings";

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
      apiKey: "sk-local-secret",
      planningEndpoint: "https://provider.example/v1/chat/completions",
      planningModel: "planning-model",
      imageBaseUrl: "https://provider.example/v1",
      imageModel: "image-model",
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
      apiKey: "sk-local-secret",
      planningEndpoint: "not-a-url",
      planningModel: "planning-model",
      imageBaseUrl: "http://provider.example/v1",
      imageModel: "image-model",
    });

    expect(invalid.planningEndpoint).toBe("not-a-url");
    expect(validateRuntimeSettings(invalid)).toContain("文本策划请求地址无效");

    const insecure = normalizeRuntimeSettings({
      ...invalid,
      planningEndpoint: "https://provider.example/v1/chat/completions",
    });
    expect(validateRuntimeSettings(insecure)).toContain("图片服务地址必须使用 HTTPS");

    const localProxy = normalizeRuntimeSettings({
      ...insecure,
      imageBaseUrl: "http://127.0.0.1:8787/v1",
    });
    expect(validateRuntimeSettings(localProxy)).toBeNull();
  });

  it("supports separate VisPath-style text and image credentials while keeping legacy aliases", () => {
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
      planningEndpoint: "https://text.example/v1/chat/completions",
      apiKey: "text-key",
      imageBaseUrl: "https://image.example/v1",
      imageApiKey: "image-key",
      imageGenerationMode: "sync",
    });
    expect(validateRuntimeSettings(settings)).toBeNull();
  });

  it("tests text and image services independently without generating an image", async () => {
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("chat/completions")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer text-key" });
        return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
          status: 200,
        });
      }
      expect(String(input)).toBe("https://image.example/v1/models");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer image-key" });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
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
      message: "图片生成 API 连接成功（仅验证连接与权限，未消耗生图额度）。",
    });
  });
});
