import type {
  CopilotCommand,
  CopilotContext,
  CopilotEngine,
  CopilotResult,
} from "../domain/copilot";
import { runCompliance } from "../domain/compliance";
import { getAmazonMarketplaceByLocale } from "../domain/platforms/amazon-marketplaces";

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Copilot 已取消", "AbortError");
}

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function shortenCopy(copy: string, locale: string): string {
  const limit = locale === "en-US" ? 48 : 12;
  return Array.from(copy.trim()).slice(0, limit).join("");
}

function shortenCopyForContext(context: CopilotContext): string {
  return context.rulePack.platformId === "amazon"
    ? platformAdaptedCopy(context)
    : shortenCopy(context.slot.visibleCopy, context.rulePack.locale);
}

function promptWithVisibleCopy(
  prompt: string,
  previousCopy: string,
  visibleCopy: string,
  locale: string,
): string {
  if (previousCopy && prompt.includes(previousCopy)) {
    return prompt.replaceAll(previousCopy, visibleCopy);
  }

  const instruction = locale !== "zh-CN"
    ? `Visible copy: "${visibleCopy}".`
    : `可见文案：「${visibleCopy}」。`;
  return `${prompt.trim()} ${instruction}`.trim();
}

const amazonEvidenceLabels: Readonly<Record<string, string>> = Object.freeze({
  商品: "Product",
  品牌: "Brand",
  类目: "Category",
  型号: "Model",
  SKU: "SKU",
  卖点: "Selling point",
  目标人群: "Target audience",
  用户痛点或需求: "Customer pain point or need",
  材质: "Material",
  尺寸: "Dimensions",
  规格: "Specifications",
  功能: "Feature",
  场景: "Use scenario",
  使用场景: "Use scenario",
  包装: "Package contents",
  清单: "Package contents",
  配件: "Included accessories",
  服务: "Service",
  质保: "Warranty",
  保修: "Warranty",
  待补资料: "Missing information",
});

function amazonEvidenceItem(item: string): string {
  const separatorIndex = item.indexOf("：");
  if (separatorIndex < 0) return item;
  const sourceLabel = item.slice(0, separatorIndex).trim();
  const sourceValue = item.slice(separatorIndex + 1).trim();
  const bilingualLabel = sourceLabel
    .split(/\s*\/\s*/)
    .find((part) => /^[\x20-\x7e]+$/.test(part) && /[A-Za-z]/.test(part));
  const label = bilingualLabel ?? amazonEvidenceLabels[sourceLabel] ?? "Product fact";
  return `${label}: ${sourceValue}`;
}

function promptWithEvidence(context: CopilotContext): string {
  const evidence = context.slot.evidence
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !context.slot.prompt.includes(item));
  if (evidence.length === 0) return context.slot.prompt;

  if (context.rulePack.promptLanguage === "en") {
    return `${context.slot.prompt.trim()} Source evidence: ${evidence.map(amazonEvidenceItem).join("; ")}.`.trim();
  }
  return `${context.slot.prompt.trim()} 事实依据：${evidence.join("；")}。`.trim();
}

function platformAdaptedCopy(context: CopilotContext): string {
  if (context.rulePack.platformId === "amazon") {
    if (context.slot.slotKey === "MAIN") return "";
    if (context.slot.slotKey === "PT01") {
      return getAmazonMarketplaceByLocale(context.rulePack.locale).demoCopy.listing[0] ?? "Product benefit";
    }
    return Array.from(context.slot.visibleCopy.trim()).slice(0, 48).join("") || "Product benefit";
  }
  return Array.from(context.slot.visibleCopy.trim()).slice(0, 18).join("");
}

function platformAdaptedPrompt(context: CopilotContext, visibleCopy: string): string {
  const instruction = context.rulePack.promptLanguage === "en"
    ? `Platform adaptation: follow ${context.rulePack.label} rules for the ${context.rulePack.locale} context and selected slot.`
    : `平台适配：遵循 ${context.rulePack.label} 的 ${context.rulePack.locale} 语境与当前槽位规则。`;
  if (context.rulePack.platformId === "amazon" && context.slot.slotKey === "MAIN") {
    return `${context.slot.prompt.trim()} ${instruction}`.trim();
  }
  return promptWithVisibleCopy(
    `${context.slot.prompt.trim()} ${instruction}`,
    context.slot.visibleCopy,
    visibleCopy,
    context.rulePack.locale,
  );
}

export class DemoCopilot implements CopilotEngine {
  constructor(private readonly delayMs = 0) {}

  async adjust(
    context: CopilotContext,
    command: CopilotCommand,
    signal: AbortSignal,
  ): Promise<CopilotResult> {
    throwIfAborted(signal);
    await wait(this.delayMs, signal);
    throwIfAborted(signal);

    if (command === "shorten-copy") {
      const visibleCopy = shortenCopyForContext(context);
      return {
        visibleCopy,
        prompt:
          context.rulePack.platformId === "amazon" && context.slot.slotKey === "MAIN"
            ? context.slot.prompt
            : promptWithVisibleCopy(
                context.slot.prompt,
                context.slot.visibleCopy,
                visibleCopy,
                context.rulePack.locale,
              ),
      };
    }

    if (command === "adapt-platform") {
      const visibleCopy = platformAdaptedCopy(context);
      return {
        visibleCopy,
        prompt: platformAdaptedPrompt(context, visibleCopy),
        message: `已按 ${context.rulePack.label} 的平台语境调整当前槽位。`,
      };
    }

    if (command === "check-compliance") {
      const result = runCompliance(context.project, context.rulePack, context.slot);
      const findingSummary = result.findings
        .slice(0, 3)
        .map((finding) => finding.message)
        .join("；");
      return {
        message: result.findings.length > 0
          ? `自动检查发现 ${result.findings.length} 项文字风险：${findingSummary}。生成图片后仍需人工复核。`
          : "自动检查未发现可识别的文字风险；生成图片后仍需人工复核商品一致性与平台规则。",
      };
    }

    if (command === "explain-next") {
      const missingEvidence = context.slot.evidence.filter((item) => item.startsWith("待补资料"));
      return {
        message: missingEvidence.length > 0
          ? `下一步先补齐这些资料：${missingEvidence.join("；")}。确认事实后再更新 Prompt 并生成图片。`
          : "下一步生成或重新生成当前槽位，核对商品外观、文字与事实一致性，再按平台规则人工复核。",
      };
    }

    return {
      visibleCopy: context.slot.visibleCopy,
      prompt: promptWithEvidence(context),
    };
  }
}

export const demoCopilot: CopilotEngine = new DemoCopilot();
export const interactiveDemoCopilot: CopilotEngine = new DemoCopilot(450);
export const slowInteractiveDemoCopilot: CopilotEngine = new DemoCopilot(3_000);
