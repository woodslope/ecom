import { describe, expect, it, vi } from "vitest";

import type { CopilotContext } from "../src/domain/copilot";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { OpenAICopilot, OpenAICopilotError } from "../src/services/openai-copilot";

const context: CopilotContext = {
  project: {
    id: "project_01",
    name: "旅行颈枕项目",
    facts: {
      productName: "云感旅行颈枕",
      category: "旅行用品",
      brand: "Northwind",
      model: "NW-P01",
      sku: "P01-GRAY",
      targetAudience: "经常乘坐飞机和高铁的通勤人群",
      description: "可折叠记忆棉颈枕，带可拆洗外套。",
      sellingPoints: ["慢回弹记忆棉", "可折叠收纳"],
      forbiddenClaims: ["医疗功效"],
      specifications: { 材质: "记忆棉、聚酯纤维" },
    },
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  },
  rulePack: taobaoRulePack,
  slot: {
    slotKey: "TB-HERO-02",
    visibleCopy: "慢回弹记忆棉带来轻盈贴合的旅途支撑体验",
    strategy: "突出核心卖点",
    evidence: ["卖点：慢回弹记忆棉"],
    prompt: "为旅行颈枕制作卖点图，突出慢回弹记忆棉。",
    negativePrompt: "不要虚构商品事实",
  },
};

describe("OpenAICopilot", () => {
  it("posts the selected slot command and returns a structured scoped patch", async () => {
    const candidate = {
      visibleCopy: "慢回弹，更轻盈",
      prompt: "为旅行颈枕制作卖点图，依据慢回弹记忆棉事实表现支撑感。",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
      timeoutMs: 1_000,
    });

    const patch = await copilot.adjust(
      context,
      "shorten-copy",
      new AbortController().signal,
    );

    expect(patch).toEqual(candidate);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://provider.example/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret-key",
        "Content-Type": "application/json",
      },
    });
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format: unknown;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("planning-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("visibleCopy");
    expect(body.messages[0].content).toContain("prompt");
    expect(body.messages[0].content).toContain("TB-HERO-02");
    expect(body.messages[1].content).toContain("shorten-copy");
    expect(body.messages[1].content).toContain("云感旅行颈枕");
    expect(body.messages[1].content).not.toContain("TB-HERO-03");
  });

  it("declares the Amazon English model-prompt contract while keeping planning context Chinese", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  visibleCopy: "Core benefit",
                  prompt: "Create an Amazon core benefit image using the verified product facts.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await copilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...context.slot,
          slotKey: "PT01",
          visibleCopy: "Core benefit",
          prompt: "Create an Amazon core benefit image.",
        },
      },
      "strengthen-evidence",
      new AbortController().signal,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0].content).toContain("prompt uses natural-English model instructions and evidence labels");
    expect(body.messages[0].content).toContain("strategy and evidence are Chinese planning context");
    expect(body.messages[0].content).toContain("Do not copy their Chinese labels into prompt");
    expect(body.messages[1].content).toContain('"promptLanguage":"en"');
  });

  it("rejects legacy Chinese planning-template scaffolding in an Amazon patch", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  visibleCopy: "Core benefit",
                  prompt: "为 Amazon 制作卖点图。",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      copilot.adjust(
        {
          ...context,
          rulePack: amazonRulePack,
          slot: {
            ...context.slot,
            slotKey: "PT01",
            visibleCopy: "Core benefit",
            prompt: "Create an Amazon core benefit image.",
          },
        },
        "strengthen-evidence",
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "format",
        userMessage: expect.stringContaining("中文策划模板"),
      }),
    );
  });

  it("returns scoped read-only advice for compliance and next-step commands", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "Prompt 未发现明显文字风险，生成后仍需人工复核。",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const result = await copilot.adjust(
      context,
      "check-compliance",
      new AbortController().signal,
    );

    expect(result).toEqual({
      message: "Prompt 未发现明显文字风险，生成后仍需人工复核。",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0].content).toContain("exactly one string field: message");
  });

  it("rejects model output that tries to patch fields outside the selected copy and prompt", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  visibleCopy: "慢回弹，更轻盈",
                  prompt: "依据慢回弹记忆棉事实表现支撑感。",
                  strategy: "replace the whole strategy",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const error = await copilot
      .adjust(context, "strengthen-evidence", new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAICopilotError);
    expect(error).toEqual(
      expect.objectContaining({
        name: "OpenAICopilotError",
        code: "format",
        userMessage: expect.stringContaining("格式"),
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
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: `provider echoed ${apiKey}` } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey,
      model: "planning-model",
      fetch: fetchMock,
    });

    const error = await copilot
      .adjust(context, "shorten-copy", new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAICopilotError);
    expect(error).toEqual(
      expect.objectContaining({
        code,
        status,
        userMessage: expect.stringContaining(message),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("redacts a key echoed by a network error and classifies it as HTTP", async () => {
    const apiKey = "sensitive-api-key";
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey,
      model: "planning-model",
      fetch: vi.fn(async () => {
        throw new Error(`network rejected ${apiKey}`);
      }),
    });

    const error = await copilot
      .adjust(context, "shorten-copy", new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenAICopilotError);
    expect(error).toEqual(
      expect.objectContaining({
        code: "http",
        userMessage: expect.stringContaining("连接"),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("preserves an already-aborted caller reason without sending a request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  visibleCopy: "短文案",
                  prompt: "提示词",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });
    const controller = new AbortController();
    const reason = new DOMException("用户取消 Copilot", "AbortError");
    controller.abort(reason);

    await expect(
      copilot.adjust(context, "shorten-copy", controller.signal),
    ).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a slow provider at the configured timeout", async () => {
    const copilot = new OpenAICopilot({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      timeoutMs: 5,
      fetch: vi.fn(
        async () =>
          new Promise<Response>((resolve) => {
            setTimeout(
              () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      choices: [
                        {
                          message: {
                            content: JSON.stringify({
                              visibleCopy: "短文案",
                              prompt: "提示词",
                            }),
                          },
                        },
                      ],
                    }),
                    { status: 200 },
                  ),
                ),
              25,
            );
          }),
      ),
    });

    await expect(
      copilot.adjust(context, "shorten-copy", new AbortController().signal),
    ).rejects.toMatchObject({
      name: "OpenAICopilotError",
      code: "timeout",
      userMessage: expect.stringContaining("超时"),
    });
  });
});
