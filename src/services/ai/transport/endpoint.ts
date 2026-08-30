export type TextTransportProtocol = "chat-completions" | "responses";
export type ImageTransportProtocol = "images-api" | "chat-completions";

export function trimBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isResponsesEndpoint(value: string): boolean {
  return /\/responses(?:[/?#]|$)/i.test(value.trim());
}

export function resolveEndpoint(
  value: string,
  kind: "text" | "image",
): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    const complete = kind === "text"
      ? /\/(?:chat\/completions|responses)$/i.test(pathname)
      : /\/images\/(?:generations|edits)$/i.test(pathname);
    if (complete) return raw;
    if (/\/v\d+(?:\.\d+)?$/i.test(pathname)) {
      url.pathname = `${pathname}${kind === "image" ? "/images/generations" : "/chat/completions"}`;
      return url.toString();
    }
  } catch {
    return raw;
  }
  return raw;
}

export function deriveModelsEndpoint(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const url = new URL(raw);
  const pathname = url.pathname.replace(/\/+$/, "");
  const suffixes = ["/chat/completions", "/images/generations", "/images/edits", "/responses"];
  const suffix = suffixes.find((candidate) => pathname.endsWith(candidate));
  url.pathname = `${suffix ? pathname.slice(0, -suffix.length) : pathname}/models`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function inferTextProtocol(endpoint: string): TextTransportProtocol {
  return isResponsesEndpoint(endpoint) ? "responses" : "chat-completions";
}

export function resolveTextEndpoint(value: string, protocol: TextTransportProtocol): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    if (/\/(?:chat\/completions|responses)$/i.test(pathname)) return raw;
    if (/\/v\d+(?:\.\d+)?$/i.test(pathname)) {
      url.pathname = `${pathname}/${protocol === "responses" ? "responses" : "chat/completions"}`;
      return url.toString();
    }
  } catch {
    return raw;
  }
  return raw;
}
