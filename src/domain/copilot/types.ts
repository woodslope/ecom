import type { PlatformRulePack } from "../platforms/types";
import type { PlannedSlot } from "../planning/types";
import type { ProductProject } from "../projects/types";

export type CopilotCommand =
  | "shorten-copy"
  | "strengthen-evidence"
  | "adapt-platform"
  | "check-compliance"
  | "explain-next";

export interface CopilotContext {
  project: ProductProject;
  rulePack: PlatformRulePack;
  slot: PlannedSlot;
}

export interface CopilotPatch {
  visibleCopy: string;
  prompt: string;
}

export interface CopilotAdvice {
  message: string;
}

export type CopilotResult = CopilotPatch | CopilotAdvice | (CopilotPatch & CopilotAdvice);

export interface CopilotEngine {
  adjust(
    context: CopilotContext,
    command: CopilotCommand,
    signal: AbortSignal,
  ): Promise<CopilotResult>;
}
