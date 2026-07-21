import type { PlatformRulePack } from "../platforms/types";
import type {
  AmazonPlanSessionMeta,
  PlannedSlot,
  PlatformPlan,
  PlatformPlanCandidate,
  PlanningSource,
} from "./types";
import {
  isAmazonMarketplaceId,
  type AmazonMarketplaceId,
} from "../platforms/amazon-marketplaces";
import type { APlusContentType, AmazonPlannerMode, SizeTier } from "../platforms/amazon-catalog";
import { isAPlusExternalTextSlotRule } from "../platforms/amazon-catalog";
import { createAmazonSessionRulePack, amazonSessionFromMeta } from "../platforms/resolve-rule-pack";

export class PlanningNormalizationError extends Error {
  readonly name = "PlanningNormalizationError";

  constructor(
    readonly code: "duplicate_slot" | "unknown_slot" | "missing_slot" | "invalid_payload",
    readonly userMessage: string,
    readonly slotKeys: readonly string[],
  ) {
    super(userMessage);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidPayload(detail: string): never {
  throw new PlanningNormalizationError(
    "invalid_payload",
    `AI 策划结果格式不正确：${detail}。请重试或检查模型返回。`,
    [],
  );
}

function readString(record: Record<string, unknown>, field: string, slotKey?: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    invalidPayload(`${slotKey ? `槽位 ${slotKey} 的` : ""}${field} 必须是文本`);
  }
  return value;
}

function parsePlannerMode(value: unknown): AmazonPlannerMode | null {
  if (value === "listing" || value === "aplus" || value === "legacy-combined") return value;
  return null;
}

function parseAPlusType(value: unknown): APlusContentType | undefined {
  if (
    value === "standard" ||
    value === "standard-large" ||
    value === "premium" ||
    value === "mobile"
  ) {
    return value;
  }
  return undefined;
}

function parseSizeTier(value: unknown): SizeTier | undefined {
  if (value === "1K" || value === "2K" || value === "4K") return value;
  return undefined;
}

function parseAPlusModuleSpecs(raw: unknown): AmazonPlanSessionMeta["aPlusModuleSpecs"] {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    invalidPayload("amazonSession.aPlusModuleSpecs 必须是数组");
  }
  return raw.map((item, index) => {
    if (!isRecord(item)) {
      invalidPayload(`amazonSession.aPlusModuleSpecs[${index}] 必须是对象`);
    }
    const contentType = item.contentType;
    if (
      contentType !== "standard" &&
      contentType !== "standard-large" &&
      contentType !== "premium" &&
      contentType !== "mobile" &&
      contentType !== "optional"
    ) {
      invalidPayload(`amazonSession.aPlusModuleSpecs[${index}].contentType 无效`);
    }
    const moduleType = item.moduleType;
    if (typeof moduleType !== "string" || !moduleType) {
      invalidPayload(`amazonSession.aPlusModuleSpecs[${index}].moduleType 无效`);
    }
    for (const field of ["slot", "label", "displayLabel", "objective"] as const) {
      if (typeof item[field] !== "string") {
        invalidPayload(`amazonSession.aPlusModuleSpecs[${index}].${field} 必须是文本`);
      }
    }
    if (typeof item.uploadWidth !== "number" || typeof item.uploadHeight !== "number") {
      invalidPayload(`amazonSession.aPlusModuleSpecs[${index}] 尺寸必须是数字`);
    }
    return {
      contentType,
      slot: item.slot as string,
      label: item.label as string,
      displayLabel: item.displayLabel as string,
      moduleType: moduleType as import("../platforms/amazon-catalog").APlusModuleKind,
      uploadWidth: item.uploadWidth,
      uploadHeight: item.uploadHeight,
      objective: item.objective as string,
    };
  });
}


function parseAmazonSession(raw: unknown): AmazonPlanSessionMeta | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    invalidPayload("amazonSession 必须是对象");
  }
  const marketplaceId: AmazonMarketplaceId = isAmazonMarketplaceId(raw.marketplaceId)
    ? raw.marketplaceId
    : "us";
  const plannerMode = parsePlannerMode(raw.plannerMode);
  if (!plannerMode) {
    invalidPayload("amazonSession.plannerMode 无效");
  }
  if (!Array.isArray(raw.slotKeys) || !raw.slotKeys.every((item) => typeof item === "string")) {
    invalidPayload("amazonSession.slotKeys 必须是字符串数组");
  }
  return {
    marketplaceId,
    plannerMode,
    listingImageCount:
      typeof raw.listingImageCount === "number" ? raw.listingImageCount : undefined,
    aPlusType: parseAPlusType(raw.aPlusType),
    aPlusModuleSpecs: parseAPlusModuleSpecs(raw.aPlusModuleSpecs),
    sizeTier: parseSizeTier(raw.sizeTier),
    stylePresetId:
      typeof raw.stylePresetId === "string"
        ? raw.stylePresetId
        : raw.stylePresetId === null
          ? null
          : undefined,
    slotKeys: [...raw.slotKeys],
  };
}

function parseCandidate(candidate: unknown, rulePack: PlatformRulePack): PlatformPlanCandidate {
  if (!isRecord(candidate)) {
    invalidPayload("返回内容必须是对象");
  }
  if (candidate.platformId !== rulePack.platformId) {
    invalidPayload(`platformId 必须是 ${rulePack.platformId}`);
  }
  if (candidate.source !== "demo" && candidate.source !== "api") {
    invalidPayload("source 必须是 demo 或 api");
  }
  if (!Array.isArray(candidate.slots)) {
    invalidPayload("slots 必须是数组");
  }

  const slots = candidate.slots.map((rawSlot, index): PlannedSlot => {
    if (!isRecord(rawSlot)) {
      invalidPayload(`第 ${index + 1} 个槽位必须是对象`);
    }
    const slotKey = readString(rawSlot, "slotKey");
    const rawEvidence = rawSlot.evidence;
    if (!Array.isArray(rawEvidence) || !rawEvidence.every((item) => typeof item === "string")) {
      invalidPayload(`槽位 ${slotKey} 的 evidence 必须是文本数组`);
    }

    let externalText: PlannedSlot["externalText"];
    if (rawSlot.externalText !== undefined) {
      if (!isRecord(rawSlot.externalText)) {
        invalidPayload(`槽位 ${slotKey} 的 externalText 必须是对象`);
      }
      const title = rawSlot.externalText.title;
      const body = rawSlot.externalText.body;
      if (title !== undefined && typeof title !== "string") {
        invalidPayload(`槽位 ${slotKey} 的 externalText.title 必须是文本`);
      }
      if (body !== undefined && typeof body !== "string") {
        invalidPayload(`槽位 ${slotKey} 的 externalText.body 必须是文本`);
      }
      externalText = {
        ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
        ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
      };
    }

    return {
      slotKey,
      visibleCopy: readString(rawSlot, "visibleCopy", slotKey),
      ...(externalText ? { externalText } : {}),
      strategy: readString(rawSlot, "strategy", slotKey),
      evidence: [...rawEvidence],
      prompt: readString(rawSlot, "prompt", slotKey),
      negativePrompt: readString(rawSlot, "negativePrompt", slotKey),
    };
  });

  const amazonSession = parseAmazonSession(candidate.amazonSession);

  return {
    platformId: rulePack.platformId,
    source: candidate.source as PlanningSource,
    slots,
    ...(amazonSession ? { amazonSession } : {}),
  };
}

function normalizeSlot(slot: PlannedSlot): PlannedSlot {
  return {
    slotKey: slot.slotKey,
    visibleCopy: slot.visibleCopy,
    ...(slot.externalText ? { externalText: { ...slot.externalText } } : {}),
    strategy: slot.strategy,
    evidence: [...slot.evidence],
    prompt: slot.prompt,
    negativePrompt: slot.negativePrompt,
  };
}

function validateRequiredText(slot: PlannedSlot, rule: PlatformRulePack["slots"][number]): void {
  const supportsExternalText = isAPlusExternalTextSlotRule(rule);
  if (slot.slotKey !== "MAIN" && !supportsExternalText && slot.visibleCopy.trim().length === 0) {
    invalidPayload(`槽位 ${slot.slotKey} 的 visibleCopy 不能为空`);
  }

  if (supportsExternalText) {
    if (!slot.externalText?.title?.trim() || !slot.externalText.body?.trim()) {
      invalidPayload(`槽位 ${slot.slotKey} 的 externalText 必须包含非空 title 和 body`);
    }
    const prompt = slot.prompt.toLocaleLowerCase();
    if (
      prompt.includes(slot.externalText.title.toLocaleLowerCase()) ||
      prompt.includes(slot.externalText.body.toLocaleLowerCase())
    ) {
      invalidPayload(`槽位 ${slot.slotKey} 的 externalText 不得写入图片 prompt`);
    }
  } else if (slot.externalText) {
    invalidPayload(`槽位 ${slot.slotKey} 不支持 externalText`);
  }

  for (const field of ["strategy", "prompt", "negativePrompt"] as const) {
    if (slot[field].trim().length === 0) {
      invalidPayload(`槽位 ${slot.slotKey} 的 ${field} 不能为空`);
    }
  }

  if (slot.evidence.length === 0 || slot.evidence.some((item) => item.trim().length === 0)) {
    invalidPayload(`槽位 ${slot.slotKey} 的 evidence 必须包含非空文本`);
  }
}

function effectiveRulePack(
  rulePack: PlatformRulePack,
  amazonSession: AmazonPlanSessionMeta | undefined,
): PlatformRulePack {
  if (rulePack.platformId !== "amazon" || !amazonSession) {
    return rulePack;
  }
  return createAmazonSessionRulePack(amazonSessionFromMeta(amazonSession));
}

export function normalizePlatformPlan(
  rawCandidate: unknown,
  rulePack: PlatformRulePack,
): PlatformPlan {
  const candidate = parseCandidate(rawCandidate, rulePack);
  const pack = effectiveRulePack(rulePack, candidate.amazonSession);
  const seenSlotKeys = new Set<string>();
  const duplicateSlotKeys = new Set<string>();

  for (const slot of candidate.slots) {
    if (seenSlotKeys.has(slot.slotKey)) {
      duplicateSlotKeys.add(slot.slotKey);
    }
    seenSlotKeys.add(slot.slotKey);
  }

  if (duplicateSlotKeys.size > 0) {
    const slotKeys = [...duplicateSlotKeys];
    throw new PlanningNormalizationError(
      "duplicate_slot",
      `AI 策划结果包含重复槽位：${slotKeys.join("、")}。请重试或检查返回内容。`,
      slotKeys,
    );
  }

  const allowedSlotKeys = new Set(pack.slots.map((slot) => slot.key));
  const unknownSlotKeys = [...seenSlotKeys].filter((slotKey) => !allowedSlotKeys.has(slotKey));

  if (unknownSlotKeys.length > 0) {
    throw new PlanningNormalizationError(
      "unknown_slot",
      `AI 策划结果包含当前平台不支持的槽位：${unknownSlotKeys.join("、")}。请重试或检查返回内容。`,
      unknownSlotKeys,
    );
  }

  const missingSlotKeys = pack.slots
    .filter((slot) => !seenSlotKeys.has(slot.key))
    .map((slot) => slot.key);

  if (missingSlotKeys.length > 0) {
    throw new PlanningNormalizationError(
      "missing_slot",
      `AI 策划结果缺少必需槽位：${missingSlotKeys.join("、")}。请重试生成完整计划。`,
      missingSlotKeys,
    );
  }

  for (const slot of candidate.slots) {
    validateRequiredText(slot, pack.slots.find((rule) => rule.key === slot.slotKey)!);
  }

  const slotsByKey = new Map(candidate.slots.map((slot) => [slot.slotKey, slot]));

  return {
    platformId: pack.platformId,
    source: candidate.source,
    slots: pack.slots.map((rule) => normalizeSlot(slotsByKey.get(rule.key)!)),
    ...(candidate.amazonSession ? { amazonSession: candidate.amazonSession } : {}),
  };
}
