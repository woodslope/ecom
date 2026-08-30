import { describe, expect, it, vi } from "vitest";

import { buildLocalizationPrompt } from "../src/domain/prompting";
import { OpenAICompatibleTextTransport } from "../src/services/ai/transport";

const prompt = buildLocalizationPrompt({
  facts: { productName: "Lamp" },
  targetLocale: "en-US",
  rules: {
    preserveBrand: true,
    preserveModel: true,
    preserveSku: true,
    preserveNumbers: true,
    preserveForbiddenClaims: true,
  },
});

describe("AI text transport", () => {
  it("builds a Responses request from a root endpoint", async () => {
    let body: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://provider.example/v1/responses");
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: "{\"ok\":true}" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await new OpenAICompatibleTextTransport({
      endpoint: "https://provider.example/v1",
      apiKey: "secret",
      protocol: "responses",
      fetch: fetcher,
    }).request({ service: "localizer", model: "gpt-5", prompt, signal: new AbortController().signal });
    expect(result).toMatchObject({ text: '{"ok":true}', transport: "responses" });
    expect(body).toMatchObject({ model: "gpt-5", max_output_tokens: 12000, stream: true });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("buffers Chat Completions SSE deltas", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"B"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    const result = await new OpenAICompatibleTextTransport({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "secret",
      fetch: fetcher,
    }).request({ service: "copilot", model: "planning", prompt, signal: new AbortController().signal });
    expect(result.text).toBe("AB");
    expect(result.transport).toBe("chat-completions");
  });
});
