import { describe, expect, it, vi } from "vitest";

import type {
  PlanningReferenceImage,
  PlatformPlanCandidate,
  PlanningProjectFacts,
} from "../src/domain/planning/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import { OpenAIPlanner, OpenAIPlannerError } from "../src/services/openai-planner";

const project: PlanningProjectFacts = {
  productName: "便携水杯",
  sellingPoints: ["500ml", "Tritan 材质"],
};

function completeTaobaoCandidate(source: "demo" | "api" = "api"): PlatformPlanCandidate {
  return {
    platformId: "taobao",
    source,
    slots: taobaoRulePack.slots.map((slot) => ({
      slotKey: slot.key,
      visibleCopy: `${slot.label}文案`,
      strategy: `${slot.label}策略`,
      evidence: [`${slot.label}证据`],
      prompt: `${slot.label}提示词`,
      negativePrompt: "不要虚构商品事实",
    })),
  };
}

function completeAmazonCandidate(): PlatformPlanCandidate {
  return {
    platformId: "amazon",
    source: "api",
    slots: amazonRulePack.slots.map((slot) => {
      const isExternalTextTile =
        slot.group === "a-plus" && slot.dimensions.width === 220 && slot.dimensions.height === 220;
      return {
        slotKey: slot.key,
        visibleCopy:
          slot.key === "MAIN"
            ? "Model-added headline"
            : isExternalTextTile
              ? ""
              : `${slot.label} copy`,
        ...(isExternalTextTile
          ? {
              externalText: {
                title: `${slot.label} title`,
                body: `${slot.label} supporting body`,
              },
            }
          : {}),
        strategy: `${slot.label} strategy`,
        evidence: [`${slot.label} evidence`],
        prompt: `${slot.label} prompt`,
        negativePrompt: "Do not invent product facts",
      };
    }),
  };
}

describe("OpenAIPlanner", () => {
  it("allows a full planning request to run beyond the former 30 second limit", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | null | undefined;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal;
        return new Promise<Response>(() => undefined);
      });
      const planner = new OpenAIPlanner({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-secret-key",
        model: "planning-model",
        fetch: fetchMock,
      });
      let result: unknown = "still-pending";

      void planner
        .plan(project, amazonRulePack, new AbortController().signal)
        .catch((error: unknown) => {
          result = error;
        });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(result).toBe("still-pending");
      expect(requestSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(90_000);
      expect(result).toEqual(
        expect.objectContaining({
          name: "OpenAIPlannerError",
          code: "timeout",
        }),
      );
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls a Chat Completions endpoint and returns a normalized API plan", async () => {
    const candidate = completeTaobaoCandidate("demo");
    candidate.slots.reverse();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
      timeoutMs: 1_000,
    });

    const plan = await planner.plan(project, taobaoRulePack, new AbortController().signal);

    expect(plan.source).toBe("api");
    expect(plan.slots.map((slot) => slot.slotKey)).toEqual(
      taobaoRulePack.slots.map((slot) => slot.key),
    );
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
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "planning-model",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: expect.any(String) },
        { role: "user", content: expect.stringContaining("便携水杯") },
      ],
    });
  });

  it("sends compressed reference images as multimodal Chat Completions content", async () => {
    const candidate = completeTaobaoCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });
    const referenceImages: PlanningReferenceImage[] = [
      {
        name: "front.png",
        mimeType: "image/png",
        blob: new Blob([Uint8Array.from([1, 2, 3])], { type: "image/png" }),
      },
    ];

    await planner.plan(
      project,
      taobaoRulePack,
      new AbortController().signal,
      referenceImages,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.messages[1]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: expect.stringContaining("front.png"),
        },
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,AQID",
            detail: "low",
          },
        },
      ],
    });
  });

  it("explicitly skips reference images for an official DeepSeek text-only planner", async () => {
    const candidate = completeTaobaoCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const planner = new OpenAIPlanner({
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "deepseek-chat",
      plannerReferenceImages: false,
      fetch: fetchMock,
    });
    await planner.plan(project, taobaoRulePack, new AbortController().signal, [{
      name: "front.png", mimeType: "image/png", blob: new Blob(["image"], { type: "image/png" }),
    }]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(typeof body.messages[1].content).toBe("string");
    expect(body.messages[1].content).toContain("referenceImagesSkipped");
    expect(body.messages[1].content).not.toContain("data:image");
  });

  it("accepts Chat Completions content returned as text blocks", async () => {
    const candidate = completeTaobaoCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [{ type: "text", text: JSON.stringify(candidate) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const plan = await planner.plan(project, taobaoRulePack, new AbortController().signal);

    expect(plan.slots).toHaveLength(taobaoRulePack.slots.length);
  });

  it("accepts a structured JSON object wrapped in a complete code fence", async () => {
    const candidate = completeTaobaoCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(candidate)}\n\`\`\``,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const plan = await planner.plan(project, taobaoRulePack, new AbortController().signal);

    expect(plan.slots).toHaveLength(taobaoRulePack.slots.length);
  });

  it("forces Amazon MAIN visible copy to be empty", async () => {
    const candidate = completeAmazonCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const plan = await planner.plan(project, amazonRulePack, new AbortController().signal);

    expect(plan.slots.find((slot) => slot.slotKey === "MAIN")?.visibleCopy).toBe("");
  });

  it("sends an explicit slot schema and Amazon copy constraints to the model", async () => {
    const candidate = completeAmazonCandidate();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await planner.plan(project, amazonRulePack, new AbortController().signal);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toContain("visibleCopy");
    expect(systemPrompt).toContain("negativePrompt");
    expect(systemPrompt).toContain("MAIN");
    expect(systemPrompt).toContain("A+S08");
    expect(systemPrompt).toContain("US English");
    expect(systemPrompt).toContain("Amazon.com");
    expect(systemPrompt).toContain("strategy and evidence are user-facing planning notes");
    expect(systemPrompt).toContain("prompt and negativePrompt must use natural-English model instructions and evidence labels");
    expect(systemPrompt).toContain("Do not put Chinese planning explanations");
  });

  it("accepts localized Unicode visible copy for the selected Amazon marketplace", async () => {
    const candidate = completeAmazonCandidate();
    candidate.slots = candidate.slots.filter((slot) =>
      ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06"].includes(slot.slotKey),
    );
    candidate.slots.find((slot) => slot.slotKey === "PT01")!.visibleCopy = "主な特長";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    const plan = await planner.plan(
      project,
      amazonRulePack,
      new AbortController().signal,
      [],
      { plannerMode: "listing", marketplaceId: "jp", listingImageCount: 7 },
    );

    expect(plan.amazonSession?.marketplaceId).toBe("jp");
    expect(plan.slots.find((slot) => slot.slotKey === "PT01")?.visibleCopy).toBe("主な特長");
  });

  it("rejects legacy Chinese planning-template scaffolding in Amazon model prompts", async () => {
    const candidate = completeAmazonCandidate();
    candidate.slots.find((slot) => slot.slotKey === "PT01")!.prompt = "为 Amazon 制作卖点图。";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      planner.plan(project, amazonRulePack, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "format",
        userMessage: expect.stringContaining("中文策划模板"),
      }),
    );
  });

  it("allows original Chinese product values inside an otherwise English Amazon prompt", async () => {
    const candidate = completeAmazonCandidate();
    candidate.slots.find((slot) => slot.slotKey === "PT01")!.prompt =
      "Create an Amazon benefit image for 云感旅行颈枕, model NW-P01, with the verified 28 x 25 x 12 cm dimensions.";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      planner.plan(project, amazonRulePack, new AbortController().signal),
    ).resolves.toMatchObject({ platformId: "amazon", source: "api" });
  });

  it("turns malformed model content into a displayable format error", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not valid JSON" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      planner.plan(project, taobaoRulePack, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OpenAIPlannerError",
        code: "format",
        userMessage: expect.stringContaining("格式"),
        message: expect.not.stringContaining("test-secret-key"),
      }),
    );
  });

  it.each([
    { status: 401, code: "auth", message: "密钥" },
    { status: 403, code: "auth", message: "权限" },
    { status: 404, code: "path", message: "地址" },
    { status: 429, code: "quota", message: "额度" },
    { status: 500, code: "http", message: "500" },
  ] as const)("maps HTTP $status to a $code error", async ({ status, code, message }) => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { message: `provider echoed ${apiKey}` } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey,
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      planner.plan(project, taobaoRulePack, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OpenAIPlannerError",
        code,
        status,
        userMessage: expect.stringContaining(message),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("redacts transport failures into a safe HTTP error", async () => {
    const apiKey = "sensitive-api-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error(`network failure while using ${apiKey}`);
    });
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey,
      model: "planning-model",
      fetch: fetchMock,
    });

    await expect(
      planner.plan(project, taobaoRulePack, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OpenAIPlannerError",
        code: "http",
        userMessage: expect.stringContaining("连接"),
        message: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it.each([
    {
      label: "normalizer validation",
      fetchFor(apiKey: string) {
        const candidate = completeTaobaoCandidate();
        candidate.slots[0].slotKey = apiKey;
        return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
    },
    {
      label: "injected planner",
      fetchFor(apiKey: string) {
        return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
          throw new OpenAIPlannerError("http", `provider leaked ${apiKey}`);
        });
      },
    },
  ])("redacts the configured key from $label errors", async ({ fetchFor }) => {
    const apiKey = "sensitive-api-key";
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey,
      model: "planning-model",
      fetch: fetchFor(apiKey),
    });

    await expect(
      planner.plan(project, taobaoRulePack, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "OpenAIPlannerError",
        message: expect.not.stringContaining(apiKey),
        userMessage: expect.not.stringContaining(apiKey),
      }),
    );
  });

  it("rejects promptly when the caller aborts an in-flight request", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>(() => undefined),
    );
    const planner = new OpenAIPlanner({
      endpoint: "https://provider.example/v1/chat/completions",
      apiKey: "test-secret-key",
      model: "planning-model",
      fetch: fetchMock,
    });
    const controller = new AbortController();
    const abortReason = new DOMException("用户取消", "AbortError");

    const planning = planner.plan(project, taobaoRulePack, controller.signal);
    controller.abort(abortReason);
    const result = await Promise.race([
      planning.then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve("still-pending"), 30)),
    ]);

    expect(result).toBe(abortReason);
  });

  it("aborts the request and returns a timeout error after the configured limit", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | null | undefined;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal;
        return new Promise<Response>(() => undefined);
      });
      const planner = new OpenAIPlanner({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-secret-key",
        model: "planning-model",
        fetch: fetchMock,
        timeoutMs: 100,
      });
      let result: unknown = "still-pending";

      void planner
        .plan(project, taobaoRulePack, new AbortController().signal)
        .catch((error: unknown) => {
          result = error;
        });
      await vi.advanceTimersByTimeAsync(100);

      expect(result).toEqual(
        expect.objectContaining({
          name: "OpenAIPlannerError",
          code: "timeout",
          userMessage: expect.stringContaining("超时"),
        }),
      );
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the timeout while reading the response body", async () => {
    vi.useFakeTimers();
    try {
      const response = {
        ok: true,
        status: 200,
        json: async () => new Promise<unknown>(() => undefined),
      } as Response;
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
      const planner = new OpenAIPlanner({
        endpoint: "https://provider.example/v1/chat/completions",
        apiKey: "test-secret-key",
        model: "planning-model",
        fetch: fetchMock,
        timeoutMs: 100,
      });
      let result: unknown = "still-pending";

      void planner
        .plan(project, taobaoRulePack, new AbortController().signal)
        .catch((error: unknown) => {
          result = error;
        });
      await vi.advanceTimersByTimeAsync(100);

      expect(result).toEqual(
        expect.objectContaining({
          name: "OpenAIPlannerError",
          code: "timeout",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
