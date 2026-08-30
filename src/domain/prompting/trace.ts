import type { PromptBundle, PromptTrace } from "./types";

export function traceForBundle(bundle: PromptBundle, extra: Omit<PromptTrace, "source" | "version"> = {}): PromptTrace {
  return {
    ...extra,
    source: bundle.source,
    version: bundle.promptVersion,
  };
}

export type { PromptTrace } from "./types";
