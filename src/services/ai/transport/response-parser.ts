export interface ParsedTextResponse {
  text: string;
  finishReason?: string;
  transport: "chat-completions" | "responses";
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block !== "object" || block === null || !("text" in block)) return "";
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") return text;
      if (typeof text === "object" && text !== null && "value" in text) {
        const value = (text as { value?: unknown }).value;
        return typeof value === "string" ? value : "";
      }
      return "";
    }).join("");
  }
  return "";
}

function responseText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const response = typeof data.response === "object" && data.response !== null
    ? data.response as Record<string, unknown>
    : null;
  if (typeof response?.output_text === "string") return response.output_text;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const message = typeof choice?.message === "object" && choice.message !== null
    ? choice.message as Record<string, unknown>
    : null;
  const delta = typeof choice?.delta === "object" && choice.delta !== null
    ? choice.delta as Record<string, unknown>
    : null;
  const choiceContent = message?.content ?? delta?.content;
  const direct = contentText(choiceContent);
  if (direct) return direct;
  const output = Array.isArray(response?.output)
    ? response.output
    : Array.isArray(data.output) ? data.output : [];
  return output.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const content = (item as { content?: unknown }).content;
    return Array.isArray(content) ? content : [];
  }).map((item) => contentText(item)).join("");
}

function finishReason(data: Record<string, unknown>): string | undefined {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  if (typeof choice?.finish_reason === "string") return choice.finish_reason;
  const response = typeof data.response === "object" && data.response !== null
    ? data.response as Record<string, unknown>
    : data;
  if (typeof response.incomplete_details === "object" && response.incomplete_details !== null) {
    const reason = (response.incomplete_details as { reason?: unknown }).reason;
    if (typeof reason === "string") return reason;
  }
  return response.status === "incomplete" ? "max_output_tokens" : undefined;
}

function streamDelta(data: Record<string, unknown>): string {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const delta = typeof choice?.delta === "object" && choice.delta !== null
    ? (choice.delta as Record<string, unknown>).content
    : undefined;
  const chat = contentText(delta);
  if (chat) return chat;
  return data.type === "response.output_text.delta" && typeof data.delta === "string"
    ? data.delta
    : "";
}

async function parseSse(response: Response, transport: ParsedTextResponse["transport"]): Promise<ParsedTextResponse> {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("接口返回了不可读取的流，请检查接口或更换模型。");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let text = "";
  let finish: string | undefined;
  let completed = false;
  let malformed = false;
  const consume = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") {
      completed = true;
      return;
    }
    try {
      const data = JSON.parse(payload) as Record<string, unknown>;
      text += streamDelta(data);
      finish = finishReason(data) ?? finish;
      if (finish || ["response.completed", "response.incomplete", "response.failed"].includes(String(data.type))) completed = true;
    } catch {
      malformed = true;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  if (!completed) throw new Error("流式响应在收到完成标记前中断，上游可能已计费，请先核对用量再重试。");
  if (malformed) throw new Error("流式响应包含无法解析的事件，已停止使用不完整内容。");
  if (!text.trim()) throw new Error("大模型未返回任何有效内容，请检查接口配置或稍后重试。");
  return { text, finishReason: finish, transport };
}

export async function parseTextResponse(
  response: Response,
  transport: ParsedTextResponse["transport"],
): Promise<ParsedTextResponse> {
  const contentType = String(response.headers?.get?.("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/event-stream")) return parseSse(response, transport);
  // A few OpenAI-compatible mocks/providers expose only `json()`. Keep the
  // parser tolerant of that shape while the transport timeout still guards
  // an unresolved body read.
  const raw = typeof response.text === "function"
    ? await response.text()
    : typeof response.json === "function"
      ? JSON.stringify(await response.json())
      : "";
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    if (!raw.trim()) throw new Error("大模型未返回任何有效内容，请检查接口配置或稍后重试。");
    return { text: raw, transport };
  }
  const text = responseText(data);
  if (!text.trim()) throw new Error("大模型未返回任何有效内容，请检查接口配置或稍后重试。");
  return { text, finishReason: finishReason(data), transport };
}

export function unwrapStructuredJson(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}
