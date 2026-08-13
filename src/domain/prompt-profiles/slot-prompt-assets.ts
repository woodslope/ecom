import type { PlatformId, PlatformWorkflowId } from "../platforms/types";

export interface SlotPromptScope {
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  slotKey: string;
}

export interface SlotPromptRevision {
  version: number;
  prompt: string;
  createdAt: string;
}

export interface SlotPromptAsset {
  id: string;
  label: string;
  description: string;
  scope: SlotPromptScope;
  revisions: SlotPromptRevision[];
  createdAt: string;
  updatedAt: string;
}

interface SlotPromptAssetState {
  assets: SlotPromptAsset[];
  defaults: Record<string, string>;
}

interface PromptAssetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SLOT_PROMPT_ASSETS_STORAGE_KEY = "ecom-slot-prompt-assets-v1";

export function slotPromptScopeKey(scope: SlotPromptScope): string {
  return `${scope.platformId}:${scope.workflowId}:${scope.slotKey}`;
}

function emptyState(): SlotPromptAssetState {
  return { assets: [], defaults: {} };
}

function isScope(value: unknown): value is SlotPromptScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  return (
    (scope.platformId === "amazon" || scope.platformId === "taobao") &&
    typeof scope.workflowId === "string" &&
    typeof scope.slotKey === "string"
  );
}

function isRevision(value: unknown): value is SlotPromptRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as Record<string, unknown>;
  return (
    typeof revision.version === "number" &&
    typeof revision.prompt === "string" &&
    typeof revision.createdAt === "string"
  );
}

function isAsset(value: unknown): value is SlotPromptAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.id === "string" &&
    typeof asset.label === "string" &&
    typeof asset.description === "string" &&
    isScope(asset.scope) &&
    Array.isArray(asset.revisions) &&
    asset.revisions.length > 0 &&
    asset.revisions.every(isRevision) &&
    typeof asset.createdAt === "string" &&
    typeof asset.updatedAt === "string"
  );
}

function readState(storage: PromptAssetStorage): SlotPromptAssetState {
  try {
    const raw = storage.getItem(SLOT_PROMPT_ASSETS_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<SlotPromptAssetState>;
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets.filter(isAsset) : [],
      defaults:
        parsed.defaults && typeof parsed.defaults === "object" && !Array.isArray(parsed.defaults)
          ? Object.fromEntries(
              Object.entries(parsed.defaults).filter(
                ([key, value]) => typeof key === "string" && typeof value === "string",
              ),
            )
          : {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(storage: PromptAssetStorage, state: SlotPromptAssetState): void {
  storage.setItem(SLOT_PROMPT_ASSETS_STORAGE_KEY, JSON.stringify(state));
}

export function listSlotPromptAssets(
  storage: PromptAssetStorage,
  scope: SlotPromptScope,
): SlotPromptAsset[] {
  const key = slotPromptScopeKey(scope);
  return readState(storage).assets
    .filter((asset) => slotPromptScopeKey(asset.scope) === key)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function saveSlotPromptAsset(
  storage: PromptAssetStorage,
  input: {
    id?: string;
    label: string;
    description?: string;
    scope: SlotPromptScope;
    prompt: string;
  },
): SlotPromptAsset {
  const state = readState(storage);
  const existing = input.id
    ? state.assets.find((asset) => asset.id === input.id)
    : undefined;
  const now = new Date().toISOString();
  const nextVersion = existing
    ? Math.max(...existing.revisions.map((revision) => revision.version)) + 1
    : 1;
  const asset: SlotPromptAsset = {
    id: existing?.id ?? `slot-prompt-${Date.now().toString(36)}`,
    label: input.label.trim(),
    description: input.description?.trim() ?? existing?.description ?? "",
    scope: input.scope,
    revisions: [
      ...(existing?.revisions ?? []),
      { version: nextVersion, prompt: input.prompt.trim(), createdAt: now },
    ],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeState(storage, {
    ...state,
    assets: [...state.assets.filter((candidate) => candidate.id !== asset.id), asset],
  });
  return asset;
}

export function deleteSlotPromptAsset(storage: PromptAssetStorage, id: string): void {
  const state = readState(storage);
  const defaults = Object.fromEntries(
    Object.entries(state.defaults).filter(([, assetId]) => assetId !== id),
  );
  writeState(storage, {
    assets: state.assets.filter((asset) => asset.id !== id),
    defaults,
  });
}

export function getDefaultSlotPromptAssetId(
  storage: PromptAssetStorage,
  scope: SlotPromptScope,
): string | null {
  return readState(storage).defaults[slotPromptScopeKey(scope)] ?? null;
}

export function setDefaultSlotPromptAssetId(
  storage: PromptAssetStorage,
  scope: SlotPromptScope,
  assetId: string | null,
): void {
  const state = readState(storage);
  const key = slotPromptScopeKey(scope);
  const defaults = { ...state.defaults };
  if (assetId) defaults[key] = assetId;
  else delete defaults[key];
  writeState(storage, { ...state, defaults });
}
