import { createServer } from "node:http";
import { once } from "node:events";
import { deflateSync } from "node:zlib";

// A tiny OpenAI-compatible HTTP server for browser acceptance tests.
// It intentionally returns deterministic payloads and never belongs to src/.

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuffer, data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, payload, checksum]);
}

function mockPngBase64(width = 256, height = 256) {
  const scanline = Buffer.alloc(1 + width * 4);
  const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(scanline);
  const raw = Buffer.concat(rows);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
}

const MOCK_PNG_BASE64 = mockPngBase64();

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function extractPlannerPayload(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const user = messages.find((message) => message?.role === "user")?.content;
  const text = Array.isArray(user)
    ? user.find((part) => part?.type === "text")?.text
    : user;
  if (typeof text !== "string") return {};
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function plannerCandidate(payload) {
  const contract = payload?.platformContract ?? {};
  const slots = Array.isArray(contract.slots) ? contract.slots : [];
  const platformId = contract.platformId === "taobao" ? "taobao" : "amazon";
  const taskSettings = payload?.taskSettings ?? {};
  const marketplaceCopy = {
    us: "Core benefit",
    jp: "主な特長",
    de: "Hauptvorteil",
    fr: "Avantage principal",
    it: "Vantaggio principale",
    es: "Beneficio principal",
  };
  return {
    platformId,
    source: "api",
    slots: slots.map((slot, index) => {
      const isAmazonTile = platformId === "amazon" && slot?.group === "a-plus" && slot?.dimensions?.width === 220;
      return {
        slotKey: String(slot?.key ?? `SLOT-${index + 1}`),
        visibleCopy: slot?.key === "MAIN" || isAmazonTile
          ? ""
          : platformId === "amazon" && slot?.key === "PT01"
            ? marketplaceCopy[taskSettings.marketplaceId ?? "us"] ?? marketplaceCopy.us
            : `Mock ${slot?.label ?? "slot"}`,
        ...(isAmazonTile ? { externalText: { title: `Mock ${slot.label}`, body: "Mock supporting copy" } } : {}),
        strategy: "Mock 策划策略：基于商品事实、平台规则和当前行业指导组织画面。",
        evidence: ["Mock evidence: user supplied product facts"],
        prompt: `Professional product image for ${slot?.key ?? "the selected slot"} (${slot?.label ?? "selected slot"}), accurate product details, clean composition.`,
        negativePrompt: "Do not invent product facts, claims, dimensions, or accessories.",
      };
    }),
    ...(platformId === "amazon"
      ? {
          amazonSession: {
            marketplaceId: taskSettings.marketplaceId ?? "us",
            plannerMode: taskSettings.plannerMode ?? "listing",
            listingImageCount: taskSettings.listingImageCount,
            aPlusType: taskSettings.aPlusType,
            aPlusModuleSpecs: taskSettings.aPlusModuleSpecs,
            sizeTier: taskSettings.sizeTier,
            stylePresetId: taskSettings.stylePresetId,
            slotKeys: slots.map((slot) => String(slot?.key ?? "")),
          },
        }
      : {}),
  };
}

function copilotResult(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.find((message) => message?.role === "system")?.content ?? "";
  if (String(system).includes("one string field: message")) {
    return { message: "Mock Copilot 建议：请基于证据人工复核后再执行。" };
  }
  return { visibleCopy: "Mock localized copy", prompt: "Professional product image prompt, accurate facts only." };
}

function industryResult(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const user = messages.find((message) => message?.role === "user")?.content;
  try {
    const payload = JSON.parse(typeof user === "string" ? user : "{}");
    const base = Array.isArray(payload.baseTemplate) ? payload.baseTemplate : [];
    return {
      slots: base.map((slot) => ({
        slotKey: String(slot?.slotKey ?? slot?.key ?? ""),
        label: String(slot?.label ?? ""),
        guidance: "Mock 行业指导：保持商品事实准确，并用清晰构图突出当前槽位目标。",
        negativeGuidance: "不要虚构材质、尺寸、功效、认证或包装内容。",
      })),
    };
  } catch {
    return { slots: [] };
  }
}

function localizationResult(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const user = messages.find((message) => message?.role === "user")?.content;
  try {
    const payload = JSON.parse(typeof user === "string" ? user : "{}");
    return payload.facts ?? {};
  } catch {
    return {};
  }
}

function textResponse(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = String(messages.find((message) => message?.role === "system")?.content ?? "");
  let result;
  if (system.includes("one field: slots")) result = industryResult(body);
  else if (system.includes("Localize the supplied product facts")) result = localizationResult(body);
  else if (system.includes("Return exactly") && system.includes("visibleCopy")) result = copilotResult(body);
  else result = plannerCandidate(extractPlannerPayload(body));
  return { choices: [{ message: { content: JSON.stringify(result) } }] };
}

function pathMode(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return {
    failOnce: parts.includes("fail-once") || parts.includes("retry"),
    delay: parts.includes("delay"),
  };
}

export async function startMockAiServer(options = {}) {
  const counters = new Map();
  const defaultDelayMs = Number.isFinite(options.delayMs) ? options.delayMs : 1_200;
  const responseDelayMs = Number.isFinite(options.responseDelayMs) ? options.responseDelayMs : 350;
  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const mode = pathMode(url.pathname);
    const key = `${request.method}:${url.pathname}`;
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    if (mode.delay) await new Promise((resolve) => setTimeout(resolve, defaultDelayMs));
    else if (responseDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
    if (mode.failOnce && count === 1) {
      json(response, 503, { error: { message: "mock transient failure" } });
      return;
    }
    if (request.method === "GET" && url.pathname.endsWith("/models")) {
      json(response, 200, { data: [{ id: "mock-model" }] });
      return;
    }
    if (request.method !== "POST") {
      json(response, 200, { ok: true });
      return;
    }
    const bodyText = await readBody(request);
    let body = {};
    try { body = JSON.parse(bodyText); } catch { /* multipart image requests do not need parsing */ }
    if (url.pathname.endsWith("/chat/completions") || url.pathname.endsWith("/responses")) {
      json(response, 200, textResponse(body));
      return;
    }
    if (url.pathname.endsWith("/images/generations") || url.pathname.endsWith("/images/edits")) {
      json(response, 200, { data: [{ b64_json: MOCK_PNG_BASE64 }] });
      return;
    }
    json(response, 404, { error: { message: "mock endpoint not found" } });
  });
  server.listen(options.port ?? 0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    url(suffix = "") { return `${baseUrl}${suffix}`; },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

export function createApiRuntimeSettings(baseUrl, overrides = {}) {
  const root = `${String(baseUrl).replace(/\/+$/, "")}/v1`;
  return {
    version: 2,
    schemaVersion: 2,
    mode: "api",
    connectionMode: overrides.connectionMode ?? "dual",
    text: {
      name: "文本策划",
      baseUrl: overrides.textBaseUrl ?? root,
      apiKey: overrides.textApiKey ?? "mock-text-key",
      model: overrides.planningModel ?? "mock-planner",
      protocol: "chat-completions",
    },
    image: {
      name: "图片生成",
      baseUrl: overrides.imageBaseUrl ?? root,
      apiKey: overrides.imageApiKey ?? "mock-image-key",
      model: overrides.imageModel ?? "mock-image",
      generationMode: "sync",
      protocol: "images-api",
    },
  };
}

export async function installApiRuntimeSettings(context, server, overrides = {}) {
  const settings = createApiRuntimeSettings(server.baseUrl, overrides);
  await context.addInitScript(
    ({ key, value }) => {
      if (location.protocol !== "http:" && location.protocol !== "https:") return;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: "ecom-workbench.runtime-settings.api.v1", value: settings },
  );
  return settings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const instance = await startMockAiServer({ port: Number(process.env.MOCK_AI_PORT) || 0 });
  console.log(instance.baseUrl);
}
