import { describe, expect, it, vi } from "vitest";

import type { ImageGenerationRequest } from "../src/domain/generation/types";
import {
  OpenAIImageGenerator,
  OpenAIImageGeneratorError,
} from "../src/services/openai-image-generator";

const request: ImageGenerationRequest = {
  projectId: "project_01",
  productName: "Travel Pillow",
  platformId: "amazon",
  slotKey: "PT01",
  prompt: "Create a clean ecommerce benefit image.",
  negativePrompt: "No unsupported claims.",
  visibleCopy: "Travel comfort",
  uploadDimensions: { width: 2000, height: 2000, unit: "px" },
  dimensions: { width: 2000, height: 2000, unit: "px" },
  referenceImages: [],
};

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("OpenAIImageGenerator", () => {
  it("uses OpenRouter chat completions with closest aspect ratio and image size", async () => {
    const image = btoa(String.fromCharCode(...pngHeader(2000, 2000)));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${image}` } }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-secret-key",
      model: "google/gemini-image",
      transport: "chat-completions",
      fetch: fetchMock,
    });

    const result = await generator.generate(request, new AbortController().signal);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "google/gemini-image",
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "1:1", image_size: "2K" },
    });
    expect(result.parameters).toMatchObject({ engine: "openrouter-image-chat" });
  });

  it("posts a JSON generation request and returns a base64 API image", async () => {
    const returnedImage = pngHeader(1254, 1254);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: btoa(String.fromCharCode(...returnedImage)) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1/",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
      timeoutMs: 1_000,
    });

    const result = await generator.generate(request, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://provider.example/v1/images/generations");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "image-model",
      prompt: [
        request.prompt,
        "Expected output resolution: 2000x2000. Upload reference size: 2000x2000.",
        `Visible copy: ${request.visibleCopy}`,
        `Avoid: ${request.negativePrompt}`,
      ].join("\n"),
      n: 1,
      size: "2000x2000",
      response_format: "b64_json",
    });
    expect(result).toMatchObject({
      width: 1254,
      height: 1254,
      mimeType: "image/png",
      source: "api",
      parameters: {
        engine: "openai-compatible-images",
        model: "image-model",
        operation: "generation",
        size: "2000x2000",
        requestedSize: "2000x2000",
        actualSize: "1254x1254",
        uploadSize: "2000x2000",
        referenceCount: 0,
      },
    });
    expect(result.blob.type).toBe("image/png");
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(returnedImage);
  });

  it("posts reference images as multipart form data to the edits endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ data: [{ b64_json: btoa("edited-image") }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });
    const editRequest: ImageGenerationRequest = {
      ...request,
      referenceImages: [
        {
          name: "front.png",
          mimeType: "image/png",
          blob: new Blob(["front"], { type: "image/png" }),
        },
        {
          name: "detail.webp",
          mimeType: "image/webp",
          blob: new Blob(["detail"], { type: "image/webp" }),
        },
      ],
    };

    const result = await generator.generate(editRequest, new AbortController().signal);

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://provider.example/v1/images/edits");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-secret-key" });
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("image-model");
    expect(form.get("prompt")).toBe(
      [
        request.prompt,
        "Expected output resolution: 2000x2000. Upload reference size: 2000x2000.",
        `Visible copy: ${request.visibleCopy}`,
        `Avoid: ${request.negativePrompt}`,
      ].join("\n"),
    );
    expect(form.get("n")).toBe("1");
    expect(form.get("size")).toBe("2000x2000");
    expect(form.get("response_format")).toBe("b64_json");
    const images = form.getAll("image[]") as Array<Blob & { name?: string }>;
    expect(images).toHaveLength(2);
    expect(form.getAll("image")).toHaveLength(0);
    expect(images.map((image) => [image.name, image.type])).toEqual([
      ["front.png", "image/png"],
      ["detail.webp", "image/webp"],
    ]);
    expect(result.parameters).toMatchObject({ operation: "edit", referenceCount: 2 });
    expect(await result.blob.text()).toBe("edited-image");
  });

  it("posts an explicit source image and PNG mask to the edits endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ data: [{ b64_json: btoa("masked-edit") }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });
    const editRequest: ImageGenerationRequest = {
      ...request,
      prompt: "Replace only the selected background area.",
      edit: {
        target: {
          name: "PT01-version-01.png",
          mimeType: "image/png",
          blob: new Blob(["source"], { type: "image/png" }),
        },
        mask: {
          name: "PT01-mask.png",
          mimeType: "image/png",
          blob: new Blob(["mask"], { type: "image/png" }),
        },
      },
    };

    const result = await generator.generate(editRequest, new AbortController().signal);

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://provider.example/v1/images/edits");
    const form = init?.body as FormData;
    expect((form.get("image") as File).name).toBe("PT01-version-01.png");
    expect((form.get("mask") as File).name).toBe("PT01-mask.png");
    expect(await (form.get("mask") as Blob).text()).toBe("mask");
    expect(result.parameters).toMatchObject({ operation: "edit", masked: true });
  });

  it("downloads URL output without forwarding the API authorization header", async () => {
    const outputUrl = "https://cdn.example/generated.webp?signature=temporary";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === outputUrl) {
        return new Response(new Blob(["downloaded-image"], { type: "image/webp" }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ data: [{ url: outputUrl }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });

    const result = await generator.generate(request, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(outputUrl);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
    expect(result.mimeType).toBe("image/webp");
    expect(result.blob.type).toBe("image/webp");
    expect(await result.blob.text()).toBe("downloaded-image");
  });

  it("classifies a failed URL download as an HTTP error", async () => {
    const outputUrl = "https://cdn.example/missing.png";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === outputUrl) {
        return new Response("missing", { status: 404 });
      }
      return new Response(JSON.stringify({ data: [{ url: outputUrl }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(
      expect.objectContaining({
        name: "OpenAIImageGeneratorError",
        code: "path",
        status: 404,
      }),
    );
  });

  it.each([
    {
      label: "empty downloaded image",
      blob: new Blob([], { type: "image/png" }),
    },
    {
      label: "non-image downloaded content",
      blob: new Blob(["provider error page"], { type: "text/html" }),
    },
  ])("classifies $label as a format error", async ({ blob }) => {
    const outputUrl = "https://cdn.example/output";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === outputUrl) {
        return new Response(blob, { status: 200 });
      }
      return new Response(JSON.stringify({ data: [{ url: outputUrl }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(
      expect.objectContaining({
        name: "OpenAIImageGeneratorError",
        code: "format",
      }),
    );
  });

  it.each([
    { status: 401, code: "auth", message: "密钥" },
    { status: 403, code: "auth", message: "权限" },
    { status: 404, code: "path", message: "地址" },
    { status: 429, code: "quota", message: "额度" },
    { status: 500, code: "http", message: "500" },
  ] as const)("maps HTTP $status to a safe $code error", async ({ status, code, message }) => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { message: `provider echoed ${apiKey}` } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey,
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAIImageGeneratorError);
    expect(error).toEqual(
      expect.objectContaining({
        name: "OpenAIImageGeneratorError",
        code,
        status,
        userMessage: expect.stringContaining(message),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("surfaces a bounded provider detail for actionable HTTP 400 errors", async () => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        error: { message: `unsupported image parameter for this model ${apiKey}` },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey,
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(expect.objectContaining({
      code: "http",
      status: 400,
      userMessage: expect.stringContaining("unsupported image parameter"),
      message: expect.not.stringContaining(apiKey),
    }));
  });

  it.each([
    {
      label: "malformed JSON",
      response(apiKey: string): Response {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error(`invalid payload containing ${apiKey}`);
          },
        } as unknown as Response;
      },
    },
    {
      label: "missing image output",
      response(): Response {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
    {
      label: "invalid base64",
      response(): Response {
        return new Response(JSON.stringify({ data: [{ b64_json: "%%%not-base64%%%" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  ])("classifies $label as a redacted format error", async ({ response }) => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(apiKey),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey,
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAIImageGeneratorError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "format",
        userMessage: expect.stringContaining("格式"),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it.each([
    {
      label: "transport failure",
      failure(apiKey: string): Error {
        return new Error(`network failed while using ${apiKey}`);
      },
    },
    {
      label: "injected service error",
      failure(apiKey: string): Error {
        return new OpenAIImageGeneratorError("http", `provider leaked ${apiKey}`);
      },
    },
  ])("redacts the API key from $label", async ({ failure }) => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw failure(apiKey);
    });
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey,
      model: "image-model",
      fetch: fetchMock,
    });

    const error = await generator
      .generate(request, new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAIImageGeneratorError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "http",
        message: expect.not.stringContaining(apiKey),
        userMessage: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("rejects a pre-canceled request with the caller reason before fetching", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [{ b64_json: btoa("unused") }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });
    const controller = new AbortController();
    const reason = new DOMException("用户取消生成", "AbortError");
    controller.abort(reason);

    await expect(generator.generate(request, controller.signal)).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects promptly when the caller cancels an in-flight request", async () => {
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>(() => undefined);
    });
    const generator = new OpenAIImageGenerator({
      baseUrl: "https://provider.example/v1",
      apiKey: "test-secret-key",
      model: "image-model",
      fetch: fetchMock,
    });
    const controller = new AbortController();
    const reason = new DOMException("用户取消生成", "AbortError");

    const generation = generator.generate(request, controller.signal);
    controller.abort(reason);
    const result = await Promise.race([
      generation.then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve("still-pending"), 30)),
    ]);

    expect(result).toBe(reason);
    expect(requestSignal?.aborted).toBe(true);
  });

  it.each(["request", "response body", "URL download"] as const)(
    "applies one timeout to the full flow during $stage",
    async (stage) => {
      vi.useFakeTimers();
      try {
        const requestSignals: AbortSignal[] = [];
        const outputUrl = "https://cdn.example/generated.png";
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.signal) {
            requestSignals.push(init.signal);
          }
          if (stage === "request") {
            return new Promise<Response>(() => undefined);
          }
          if (stage === "response body") {
            return {
              ok: true,
              status: 200,
              json: async () => new Promise<unknown>(() => undefined),
            } as Response;
          }
          if (String(input) === outputUrl) {
            return new Promise<Response>(() => undefined);
          }
          return new Response(JSON.stringify({ data: [{ url: outputUrl }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });
        const generator = new OpenAIImageGenerator({
          baseUrl: "https://provider.example/v1",
          apiKey: "test-secret-key",
          model: "image-model",
          fetch: fetchMock,
          timeoutMs: 100,
        });
        let result: unknown = "still-pending";

        void generator
          .generate(request, new AbortController().signal)
          .catch((error: unknown) => {
            result = error;
          });
        await vi.advanceTimersByTimeAsync(100);

        expect(result).toEqual(
          expect.objectContaining({
            name: "OpenAIImageGeneratorError",
            code: "timeout",
            userMessage: expect.stringContaining("超时"),
          }),
        );
        expect(requestSignals.length).toBeGreaterThan(0);
        expect(requestSignals.every((requestSignal) => requestSignal.aborted)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
