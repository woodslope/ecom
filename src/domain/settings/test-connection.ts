import {
  runtimeImageApiKey,
  runtimeImageBaseUrl,
  runtimeTextApiKey,
  runtimeTextBaseUrl,
  validateRuntimeSettings,
} from "./runtime-settings";
import type { ConnectionTestResult, RuntimeSettings } from "./types";

interface TestConnectionOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function httpFailure(status: number, service: "text" | "image"): string {
  if (service === "text") {
    if (status === 401) return "API 密钥校验失败，请检查密钥是否正确且仍然有效。";
    if (status === 403) return "API 权限不足，请检查密钥与所选模型的访问权限。";
    if (status === 404) return "API 地址或模型不存在，请检查 endpoint 和模型名称。";
    if (status === 429) return "API 额度或速率限制已触发，请检查余额、配额或稍后重试。";
    if (status >= 500) return "API 服务暂时不可用，请稍后重试。";
    return `API 连接测试失败（HTTP ${status}），请检查配置。`;
  }
  const subject = "图片 API";
  if (status === 401) return `${subject}密钥校验失败，请检查密钥是否正确且仍然有效。`;
  if (status === 403) return `${subject}权限不足，请检查密钥与所选模型的访问权限。`;
  if (status === 404) return `${subject}地址或模型不存在，请检查根地址和模型名称。`;
  if (status === 429) return `${subject}额度或速率限制已触发，请检查余额、配额或稍后重试。`;
  if (status >= 500) return `${subject}服务暂时不可用，请稍后重试。`;
  return `${subject}连接测试失败（HTTP ${status}），请检查配置。`;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

function serviceValidation(settings: RuntimeSettings, service: "text" | "image"): string | null {
  if (settings.mode !== "api") return null;
  if (service === "text") {
    if (!runtimeTextApiKey(settings)) return "请填写文本策划 API Key。";
    if (!settings.planningModel) return "请填写文本策划模型。";
    if (!runtimeTextBaseUrl(settings)) return "请填写文本 API 根地址。";
  } else {
    if (!runtimeImageApiKey(settings)) return "请填写图片生成 API Key。";
    if (!settings.imageModel) return "请填写图片生成模型。";
    if (!runtimeImageBaseUrl(settings)) return "请填写图片 API 根地址。";
  }
  return null;
}

async function testService(
  settings: RuntimeSettings,
  service: "text" | "image",
  options: TestConnectionOptions,
): Promise<ConnectionTestResult> {
  if (settings.mode !== "api") {
    return { ok: true, message: "当前使用本地演示引擎，无需连接外部 API。" };
  }
  const validationError = serviceValidation(settings, service);
  if (validationError) return { ok: false, message: validationError };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("连接测试超时", "TimeoutError")),
    options.timeoutMs ?? 15_000,
  );
  const fetcher = options.fetch ?? fetch;
  try {
    const response =
      service === "text"
        ? await fetcher(endpoint(runtimeTextBaseUrl(settings), "chat/completions"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${runtimeTextApiKey(settings)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: settings.planningModel,
              messages: [{ role: "user", content: "Reply with OK." }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          })
        : await fetcher(endpoint(runtimeImageBaseUrl(settings), "models"), {
            method: "GET",
            headers: { Authorization: `Bearer ${runtimeImageApiKey(settings)}` },
            signal: controller.signal,
          });
    if (!response.ok) return { ok: false, message: httpFailure(response.status, service) };
    return {
      ok: true,
      message:
        service === "text"
          ? "文本策划 API 连接成功。"
          : "图片生成 API 连接成功（仅验证连接与权限，未消耗生图额度）。",
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
    return {
      ok: false,
      message:
        service === "text"
          ? "API 连接测试超时，请检查网络、代理或服务商状态。"
          : "图片 API 连接测试超时，请检查网络、代理或服务商状态。",
      };
    }
    return {
      ok: false,
      message:
        service === "text"
          ? "无法连接 API，请检查网络、浏览器 CORS、代理和根地址。"
          : "无法连接图片 API，请检查网络、浏览器 CORS、代理和根地址。",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function testTextApiConnection(
  settings: RuntimeSettings,
  options: TestConnectionOptions = {},
): Promise<ConnectionTestResult> {
  return testService(settings, "text", options);
}

export function testImageApiConnection(
  settings: RuntimeSettings,
  options: TestConnectionOptions = {},
): Promise<ConnectionTestResult> {
  return testService(settings, "image", options);
}

/** Legacy aggregate entry point: keep its text-first behavior for existing callers. */
export function testApiConnection(
  settings: RuntimeSettings,
  options: TestConnectionOptions = {},
): Promise<ConnectionTestResult> {
  const validationError = validateRuntimeSettings(settings);
  if (settings.mode !== "api") {
    return Promise.resolve({ ok: true, message: "当前使用本地演示引擎，无需连接外部 API。" });
  }
  if (validationError) return Promise.resolve({ ok: false, message: validationError });
  return testTextApiConnection(settings, options).then((result) =>
    result.ok
      ? { ...result, message: "文本策划 API 连接成功。图片模型将在首次生成时单独验证。" }
      : result,
  );
}
