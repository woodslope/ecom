import type { PlatformRulePack, PlatformWorkflowId } from "../platforms/types";
import type { PlatformId } from "../platforms/types";

export interface IndustryTemplateScope {
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
}

export interface IndustryTemplateBrief {
  industry: string;
  productTypes: string;
  targetAudience: string;
  stylePreference: string;
  extraRequirements: string;
  forbiddenContent: string;
}

export interface IndustryTemplateSlotGuidance {
  slotKey: string;
  label: string;
  guidance: string;
  negativeGuidance: string;
}

export interface IndustryTemplateRevision {
  version: number;
  brief: IndustryTemplateBrief;
  slots: IndustryTemplateSlotGuidance[];
  createdAt: string;
}

export interface IndustryTemplatePack {
  id: string;
  name: string;
  description: string;
  scope: IndustryTemplateScope;
  baseTemplateId: string;
  revisions: IndustryTemplateRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface IndustryTemplateSnapshot {
  id: string;
  name: string;
  description: string;
  source: "system" | "custom";
  scope: IndustryTemplateScope;
  baseTemplateId: string;
  version: number;
  brief: IndustryTemplateBrief;
  slots: IndustryTemplateSlotGuidance[];
  createdAt: string;
}

interface IndustryTemplateState {
  packs: IndustryTemplatePack[];
  defaults: Record<string, string>;
}

interface IndustryTemplateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY = "ecom-industry-template-packs-v1";
export const SYSTEM_GENERAL_TEMPLATE_ID = "system-general";

export const EMPTY_INDUSTRY_TEMPLATE_BRIEF: IndustryTemplateBrief = Object.freeze({
  industry: "",
  productTypes: "",
  targetAudience: "",
  stylePreference: "",
  extraRequirements: "",
  forbiddenContent: "",
});

export function industryTemplateScopeKey(scope: IndustryTemplateScope): string {
  return `${scope.platformId}:${scope.workflowId}`;
}

function emptyState(): IndustryTemplateState {
  return { packs: [], defaults: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is IndustryTemplateScope {
  if (!isRecord(value)) return false;
  return (
    (value.platformId === "amazon" || value.platformId === "taobao") &&
    typeof value.workflowId === "string"
  );
}

function normalizeBrief(value: unknown): IndustryTemplateBrief | null {
  if (!isRecord(value)) return null;
  const keys = [
    "industry",
    "productTypes",
    "targetAudience",
    "stylePreference",
    "extraRequirements",
    "forbiddenContent",
  ] as const;
  if (keys.some((key) => typeof value[key] !== "string")) return null;
  return Object.fromEntries(keys.map((key) => [key, String(value[key]).trim()])) as unknown as IndustryTemplateBrief;
}

function normalizeSlot(value: unknown): IndustryTemplateSlotGuidance | null {
  if (
    !isRecord(value) ||
    typeof value.slotKey !== "string" ||
    typeof value.label !== "string" ||
    typeof value.guidance !== "string" ||
    typeof value.negativeGuidance !== "string" ||
    !value.slotKey.trim() ||
    !value.guidance.trim()
  ) {
    return null;
  }
  return {
    slotKey: value.slotKey.trim(),
    label: value.label.trim(),
    guidance: value.guidance.trim(),
    negativeGuidance: value.negativeGuidance.trim(),
  };
}

function normalizeRevision(value: unknown): IndustryTemplateRevision | null {
  if (
    !isRecord(value) ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.slots)
  ) {
    return null;
  }
  const brief = normalizeBrief(value.brief);
  const slots = value.slots.map(normalizeSlot).filter((slot): slot is IndustryTemplateSlotGuidance => slot !== null);
  if (!brief || slots.length !== value.slots.length || slots.length === 0) return null;
  return { version: value.version, brief, slots, createdAt: value.createdAt };
}

function normalizePack(value: unknown): IndustryTemplatePack | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.baseTemplateId !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isScope(value.scope) ||
    !Array.isArray(value.revisions)
  ) {
    return null;
  }
  const revisions = value.revisions
    .map(normalizeRevision)
    .filter((revision): revision is IndustryTemplateRevision => revision !== null)
    .sort((left, right) => left.version - right.version);
  if (!value.id.trim() || !value.name.trim() || revisions.length !== value.revisions.length || revisions.length === 0) {
    return null;
  }
  return {
    id: value.id,
    name: value.name.trim(),
    description: value.description.trim(),
    scope: value.scope,
    baseTemplateId: value.baseTemplateId,
    revisions,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function normalizeIndustryTemplateSnapshot(value: unknown): IndustryTemplateSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    (value.source !== "system" && value.source !== "custom") ||
    !isScope(value.scope) ||
    typeof value.baseTemplateId !== "string" ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.slots)
  ) {
    return null;
  }
  const brief = normalizeBrief(value.brief);
  const slots = value.slots.map(normalizeSlot).filter((slot): slot is IndustryTemplateSlotGuidance => slot !== null);
  if (!brief || slots.length !== value.slots.length || slots.length === 0) return null;
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    source: value.source,
    scope: value.scope,
    baseTemplateId: value.baseTemplateId,
    version: value.version,
    brief,
    slots,
    createdAt: value.createdAt,
  };
}

function readState(storage: IndustryTemplateStorage): IndustryTemplateState {
  try {
    const raw = storage.getItem(INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return emptyState();
    return {
      packs: Array.isArray(parsed.packs)
        ? parsed.packs.map(normalizePack).filter((pack): pack is IndustryTemplatePack => pack !== null)
        : [],
      defaults: isRecord(parsed.defaults)
        ? Object.fromEntries(
            Object.entries(parsed.defaults).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(storage: IndustryTemplateStorage, state: IndustryTemplateState): void {
  storage.setItem(INDUSTRY_TEMPLATE_PACKS_STORAGE_KEY, JSON.stringify(state));
}

export function createGeneralIndustryTemplateSnapshot(
  scope: IndustryTemplateScope,
  rulePack: PlatformRulePack,
): IndustryTemplateSnapshot {
  return {
    id: SYSTEM_GENERAL_TEMPLATE_ID,
    name: "通用模板",
    description: `${rulePack.label} 系统通用槽位方向与平台约束。`,
    source: "system",
    scope,
    baseTemplateId: SYSTEM_GENERAL_TEMPLATE_ID,
    version: 1,
    brief: { ...EMPTY_INDUSTRY_TEMPLATE_BRIEF },
    slots: rulePack.slots.map((slot) => ({
      slotKey: slot.key,
      label: slot.label,
      guidance: [slot.purpose, ...slot.planningHints].join("；"),
      negativeGuidance: [...rulePack.promptGuardrails, ...slot.complianceReminders].join("；"),
    })),
    createdAt: "system",
  };
}

export function listIndustryTemplatePacks(
  storage: IndustryTemplateStorage,
  scope: IndustryTemplateScope,
): IndustryTemplatePack[] {
  const key = industryTemplateScopeKey(scope);
  return readState(storage).packs
    .filter((pack) => industryTemplateScopeKey(pack.scope) === key)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function latestIndustryTemplateRevision(pack: IndustryTemplatePack): IndustryTemplateRevision {
  return pack.revisions.reduce((latest, revision) =>
    revision.version > latest.version ? revision : latest,
  );
}

export function industryTemplateSnapshot(
  pack: IndustryTemplatePack,
  version?: number,
): IndustryTemplateSnapshot {
  const revision = version === undefined
    ? latestIndustryTemplateRevision(pack)
    : pack.revisions.find((candidate) => candidate.version === version);
  if (!revision) throw new Error(`找不到行业模板版本 v${version}`);
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    source: "custom",
    scope: { ...pack.scope },
    baseTemplateId: pack.baseTemplateId,
    version: revision.version,
    brief: { ...revision.brief },
    slots: revision.slots.map((slot) => ({ ...slot })),
    createdAt: revision.createdAt,
  };
}

export function saveIndustryTemplatePack(
  storage: IndustryTemplateStorage,
  input: {
    id?: string;
    name: string;
    description?: string;
    scope: IndustryTemplateScope;
    baseTemplateId?: string;
    brief: IndustryTemplateBrief;
    slots: IndustryTemplateSlotGuidance[];
  },
): IndustryTemplatePack {
  const state = readState(storage);
  const existing = input.id ? state.packs.find((pack) => pack.id === input.id) : undefined;
  if (existing && industryTemplateScopeKey(existing.scope) !== industryTemplateScopeKey(input.scope)) {
    throw new Error("行业模板不能跨平台或工作流保存新版本");
  }
  const name = input.name.trim();
  const slots = input.slots.map(normalizeSlot).filter((slot): slot is IndustryTemplateSlotGuidance => slot !== null);
  if (!name) throw new Error("请填写行业模板名称");
  if (slots.length !== input.slots.length || slots.length === 0) throw new Error("行业模板槽位不完整");
  const now = new Date().toISOString();
  const version = existing ? latestIndustryTemplateRevision(existing).version + 1 : 1;
  const pack: IndustryTemplatePack = {
    id: existing?.id ?? `industry-template-${Date.now().toString(36)}`,
    name,
    description: input.description?.trim() ?? existing?.description ?? "",
    scope: { ...input.scope },
    baseTemplateId: existing?.baseTemplateId ?? input.baseTemplateId ?? SYSTEM_GENERAL_TEMPLATE_ID,
    revisions: [
      ...(existing?.revisions ?? []),
      {
        version,
        brief: { ...input.brief },
        slots: slots.map((slot) => ({ ...slot })),
        createdAt: now,
      },
    ],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeState(storage, {
    ...state,
    packs: [...state.packs.filter((candidate) => candidate.id !== pack.id), pack],
  });
  return pack;
}

export function deleteIndustryTemplatePack(storage: IndustryTemplateStorage, id: string): void {
  const state = readState(storage);
  writeState(storage, {
    packs: state.packs.filter((pack) => pack.id !== id),
    defaults: Object.fromEntries(
      Object.entries(state.defaults).filter(([, packId]) => packId !== id),
    ),
  });
}

export function getDefaultIndustryTemplatePackId(
  storage: IndustryTemplateStorage,
  scope: IndustryTemplateScope,
): string | null {
  return readState(storage).defaults[industryTemplateScopeKey(scope)] ?? null;
}

export function setDefaultIndustryTemplatePackId(
  storage: IndustryTemplateStorage,
  scope: IndustryTemplateScope,
  id: string | null,
): void {
  const state = readState(storage);
  const key = industryTemplateScopeKey(scope);
  const defaults = { ...state.defaults };
  if (id) defaults[key] = id;
  else delete defaults[key];
  writeState(storage, { ...state, defaults });
}

export function templateSlotGuidance(
  template: IndustryTemplateSnapshot | undefined,
  slotKey: string,
): IndustryTemplateSlotGuidance | null {
  return template?.slots.find((slot) => slot.slotKey === slotKey) ?? null;
}
