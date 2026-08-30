import { httpTransportError, type AiTransportError } from "./errors";

export interface OpenAICompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

/** Small protocol-neutral client for adapters that need a raw JSON request. */
export class OpenAICompatibleClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OpenAICompatibleClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async postJson<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw await httpTransportError(response, "AI API");
    return await response.json() as T;
  }
}

export type OpenAICompatibleClientError = AiTransportError;
