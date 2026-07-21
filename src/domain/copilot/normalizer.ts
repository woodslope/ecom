import type { CopilotContext, CopilotPatch } from "./types";
import { hasAmazonChinesePromptTemplate } from "../platforms/prompt-language";

export class CopilotPatchNormalizationError extends Error {
  readonly name = "CopilotPatchNormalizationError";

  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export function normalizeCopilotPatch(
  candidate: unknown,
  context: CopilotContext,
): CopilotPatch {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new CopilotPatchNormalizationError("Copilot 返回格式不正确，请重试。");
  }

  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || keys[0] !== "prompt" || keys[1] !== "visibleCopy") {
    throw new CopilotPatchNormalizationError(
      "Copilot 返回格式不正确，只能更新当前槽位的 visibleCopy 和 prompt。",
    );
  }

  const { visibleCopy, prompt } = candidate as Record<string, unknown>;
  if (typeof visibleCopy !== "string" || typeof prompt !== "string" || !prompt.trim()) {
    throw new CopilotPatchNormalizationError("Copilot 返回格式不正确，请重试。");
  }

  const normalizedCopy = visibleCopy.trim();
  if (
    context.rulePack.platformId === "amazon" &&
    context.rulePack.promptLanguage === "en" &&
    hasAmazonChinesePromptTemplate(prompt)
  ) {
    throw new CopilotPatchNormalizationError(
      "Amazon 模型提示词包含中文策划模板，请保留英文模型指令后重试。",
    );
  }

  return {
    visibleCopy:
      context.rulePack.platformId === "amazon" && context.slot.slotKey === "MAIN"
        ? ""
        : normalizedCopy,
    prompt: prompt.trim(),
  };
}
