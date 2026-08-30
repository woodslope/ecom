export type AiTransportErrorCode =
  | "timeout"
  | "http"
  | "auth"
  | "path"
  | "quota"
  | "network"
  | "format"
  | "capability";

export class AiTransportError extends Error {
  readonly name = "AiTransportError";

  constructor(
    readonly code: AiTransportErrorCode,
    readonly userMessage: string,
    readonly status?: number,
  ) {
    super(userMessage);
  }
}

export function redactSecret(value: string, secret: string): string {
  return secret.length > 0 ? value.split(secret).join("[REDACTED]") : value;
}

export function safeTransportError(error: AiTransportError, apiKey: string): AiTransportError {
  return new AiTransportError(
    error.code,
    redactSecret(error.userMessage, apiKey),
    error.status,
  );
}

export async function providerErrorDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;
    const nested = typeof record.error === "object" && record.error !== null
      ? record.error as Record<string, unknown>
      : null;
    const candidate = nested?.message ?? nested?.detail ?? record.message ?? record.detail;
    if (typeof candidate !== "string") return null;
    const detail = candidate.replace(/\s+/g, " ").trim();
    return detail.length > 0 ? detail.slice(0, 240) : null;
  } catch {
    return null;
  }
}

export async function httpTransportError(
  response: Response,
  subject = "API",
): Promise<AiTransportError> {
  if (response.status === 401) {
    return new AiTransportError("auth", `${subject}密钥校验失败，请检查密钥是否正确且仍然有效。`, response.status);
  }
  if (response.status === 403) {
    return new AiTransportError("auth", `${subject}权限不足，请检查密钥与所选模型的访问权限。`, response.status);
  }
  if (response.status === 404) {
    return new AiTransportError("path", `${subject}地址或模型不存在，请检查根地址、协议和模型名称。`, response.status);
  }
  if (response.status === 429) {
    return new AiTransportError("quota", `${subject}额度或速率限制已触发，请检查余额、配额或稍后重试。`, response.status);
  }
  const detail = await providerErrorDetail(response);
  return new AiTransportError(
    "http",
    detail
      ? `${subject}请求失败（HTTP ${response.status}）：${detail}`
      : `${subject}请求失败（HTTP ${response.status}），请稍后重试或检查服务商状态。`,
    response.status,
  );
}

export function abortTransportReason(signal: AbortSignal, apiKey: string, fallback: string): Error {
  if (!(signal.reason instanceof Error)) return new DOMException(fallback, "AbortError");
  const safeMessage = redactSecret(signal.reason.message, apiKey);
  if (safeMessage === signal.reason.message) return signal.reason;
  if (signal.reason instanceof DOMException) return new DOMException(safeMessage, signal.reason.name);
  const safeReason = new Error(safeMessage);
  safeReason.name = signal.reason.name;
  return safeReason;
}
