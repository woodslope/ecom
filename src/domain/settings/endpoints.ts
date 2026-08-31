import type { ImageServiceProtocol, TextServiceProtocol } from "./types";

export function trimBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isResponsesEndpoint(value: string): boolean {
  return /\/responses(?:[/?#]|$)/i.test(value.trim());
}

export function resolveTextEndpoint(value: string, protocol: TextServiceProtocol): string {
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

export function resolveImageEndpoint(
  value: string,
  protocol: ImageServiceProtocol,
  operation: "generation" | "edit" = "generation",
): string {
  const raw = value.trim();
  if (!raw) return "";
  const target = protocol === "chat-completions"
    ? "chat/completions"
    : operation === "edit"
      ? "images/edits"
      : "images/generations";
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    const knownSuffix = /\/(?:chat\/completions|images\/(?:generations|edits))$/i;
    if (pathname.toLowerCase().endsWith(`/${target}`.toLowerCase())) return raw;
    url.pathname = knownSuffix.test(pathname)
      ? `${pathname.replace(knownSuffix, "")}/${target}`
      : `${pathname}/${target}`;
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, "")}/${target}`;
  }
}

export function resolveEndpoint(value: string, kind: "text" | "image"): string {
  return kind === "text"
    ? resolveTextEndpoint(value, isResponsesEndpoint(value) ? "responses" : "chat-completions")
    : resolveImageEndpoint(value, "images-api");
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

export function inferTextProtocol(endpoint: string): TextServiceProtocol {
  return isResponsesEndpoint(endpoint) ? "responses" : "chat-completions";
}
