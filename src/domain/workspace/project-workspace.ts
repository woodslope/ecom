import type { SlotVersion, SlotVersionState } from "../generation/types";
import { normalizePlatformPlan } from "../planning/normalizer";
import type { PlatformPlan } from "../planning/types";
import type { PlanningInputSnapshot } from "../planning/input-assessment";
import {
  normalizeAPlusContentType,
  resolveAmazonPlanningSession,
  type AmazonAPlusModuleSpec,
  type AmazonPlannerMode,
  type APlusContentType,
  type SizeTier,
} from "../platforms/amazon-catalog";
import {
  normalizeAmazonMarketplaceId,
  type AmazonMarketplaceId,
} from "../platforms/amazon-marketplaces";
import {
  getPlatformRulePack,
  normalizePlatformWorkflowId,
  supportedPlatformIds,
} from "../platforms/registry";
import type { TaobaoProductAnalysis } from "../platforms/taobao-analysis";
import { resolveRulePackForPlan } from "../platforms/resolve-rule-pack";
import type { PlatformId, PlatformWorkflowId } from "../platforms/types";
export type { PlatformWorkflowId } from "../platforms/types";
import type { TaskRecord } from "../tasks";

export const PROJECT_WORKSPACE_STORAGE_PREFIX = "ecom-workbench.workspace.v2.";

export type AmazonWorkspaceMode = Exclude<AmazonPlannerMode, "legacy-combined">;
export interface PlatformSourceInput {
  listingText: string;
  taobaoProduct?: {
    productText: string;
    selectedReferenceAssetIds: string[];
  };
}

export interface AmazonSessionOptions {
  platformId: "amazon";
  marketplaceId: AmazonMarketplaceId;
  plannerMode: AmazonWorkspaceMode;
  listingImageCount?: number;
  aPlusType?: APlusContentType;
  aPlusModuleSpecs?: AmazonAPlusModuleSpec[];
  sizeTier: SizeTier;
  stylePresetId?: string | null;
}

export interface TaobaoSessionOptions {
  platformId: "taobao";
}

export type PlatformSessionOptions = AmazonSessionOptions | TaobaoSessionOptions;

export interface PlatformSession {
  id: string;
  projectId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  sourceInput: PlatformSourceInput;
  options: PlatformSessionOptions;
  selectedReferenceAssetIds: string[];
  planningInput?: PlanningInputSnapshot;
  selectedStyleReferenceId?: string;
  styleReferenceNotice?: string;
  taobaoAnalysis?: TaobaoProductAnalysis;
  plan?: PlatformPlan;
  planInputSignature?: string;
  selectedSlotKey?: string;
  slotVersions: Record<string, SlotVersionState>;
  activeRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionEvent {
  id: string;
  runId: string;
  kind: "plan" | "generate" | "regenerate" | "edit" | "export";
  status: "success" | "failed" | "canceled";
  slotKey?: string;
  assetId?: string;
  versionId?: string;
  artifactFileName?: string;
  missingSlots?: string[];
  createdAt: string;
}

export interface PlatformRunContext {
  sourceInput: PlatformSourceInput;
  options: PlatformSessionOptions;
  selectedReferenceAssetIds: string[];
  planningInput?: PlanningInputSnapshot;
  selectedStyleReferenceId?: string;
  taobaoAnalysis?: TaobaoProductAnalysis;
}

export interface ProductionRun {
  id: string;
  projectId: string;
  sessionId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  source: "demo" | "api";
  status: "planned" | "producing" | "ready" | "partial" | "failed" | "canceled";
  contextSnapshot: PlatformRunContext;
  planSnapshot: PlatformPlan;
  planningInputSignatureSnapshot?: string;
  slotVersionsSnapshot?: Record<string, SlotVersionState>;
  events: ProductionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AmazonModeWorkspaceSnapshot {
  plan: PlatformPlan;
  planInputSignature?: string;
  selectedSlotKey?: string;
}

export interface ProjectWorkspaceDocument {
  projectId: string;
  sessions: PlatformSession[];
  runs: ProductionRun[];
  plans: Partial<Record<PlatformId, PlatformPlan>>;
  planInputSignatures: Partial<Record<PlatformId, string>>;
  selectedSlotKeys: Partial<Record<PlatformId, string>>;
  amazonPlannerMode?: AmazonWorkspaceMode;
  amazonWorkspaces?: Partial<Record<AmazonWorkspaceMode, AmazonModeWorkspaceSnapshot>>;
  slotVersions: Partial<Record<PlatformId, Record<string, SlotVersionState>>>;
  taskHistory: TaskRecord[];
  updatedAt: string;
}

export interface ProjectWorkspaceRepository {
  load(projectId: string): Promise<ProjectWorkspaceDocument>;
  save(document: ProjectWorkspaceDocument): Promise<void>;
  remove?(projectId: string): Promise<void>;
}

interface WorkspaceRepositoryOptions {
  now?: () => string;
}

interface LocalStorageWorkspaceRepositoryOptions extends WorkspaceRepositoryOptions {
  storage: Pick<Storage, "getItem" | "setItem"> & {
    removeItem?: Storage["removeItem"];
  };
}

function defaultNow(): string {
  return new Date().toISOString();
}

function emptyDocument(projectId: string, now: () => string): ProjectWorkspaceDocument {
  return {
    projectId,
    sessions: [],
    runs: [],
    plans: {},
    planInputSignatures: {},
    selectedSlotKeys: {},
    amazonPlannerMode: "listing",
    amazonWorkspaces: {},
    slotVersions: {},
    taskHistory: [],
    updatedAt: now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeParameters(value: unknown): Record<string, string | number | boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  );
}

function normalizeVersion(value: unknown, slotKey: string): SlotVersion | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.slotKey !== slotKey ||
    typeof value.assetId !== "string" ||
    typeof value.createdAt !== "string" ||
    (value.source !== "demo" && value.source !== "api") ||
    typeof value.promptSnapshot !== "string" ||
    typeof value.visibleCopySnapshot !== "string" ||
    typeof value.width !== "number" ||
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    typeof value.height !== "number" ||
    !Number.isFinite(value.height) ||
    value.height <= 0 ||
    typeof value.mimeType !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    slotKey,
    assetId: value.assetId,
    createdAt: value.createdAt,
    source: value.source,
    promptSnapshot: value.promptSnapshot,
    visibleCopySnapshot: value.visibleCopySnapshot,
    ...(typeof value.planningInputSignature === "string"
      ? { planningInputSignature: value.planningInputSignature }
      : {}),
    width: value.width,
    height: value.height,
    mimeType: value.mimeType,
    parameters: normalizeParameters(value.parameters),
  };
}

function normalizeVersionState(value: unknown, slotKey: string): SlotVersionState | null {
  if (!isRecord(value) || !Array.isArray(value.versions)) return null;
  const versions = value.versions
    .map((version) => normalizeVersion(version, slotKey))
    .filter((version): version is SlotVersion => version !== null);
  if (versions.length === 0) return null;
  const activeVersionId =
    typeof value.activeVersionId === "string" &&
    versions.some((version) => version.id === value.activeVersionId)
      ? value.activeVersionId
      : versions[versions.length - 1].id;
  return { versions, activeVersionId };
}

function normalizeWorkflowId(value: unknown, platformId: PlatformId): PlatformWorkflowId | null {
  const workflowId = normalizePlatformWorkflowId(value);
  if (!workflowId) return null;
  if (platformId === "amazon") {
    return workflowId === "amazon-listing" || workflowId === "amazon-aplus" ? workflowId : null;
  }
  return workflowId === "taobao-product" ? workflowId : null;
}

function normalizeSourceInput(value: unknown): PlatformSourceInput {
  const sourceInput: PlatformSourceInput = {
    listingText: isRecord(value) && typeof value.listingText === "string"
      ? value.listingText
      : "",
  };
  if (isRecord(value) && isRecord(value.taobaoProduct)) {
    sourceInput.taobaoProduct = {
      productText:
        typeof value.taobaoProduct.productText === "string"
          ? value.taobaoProduct.productText
          : "",
      selectedReferenceAssetIds: normalizeStringArray(
        value.taobaoProduct.selectedReferenceAssetIds,
      ),
    };
  }
  return sourceInput;
}

function normalizeTaobaoAnalysis(value: unknown): TaobaoProductAnalysis | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.suggestedProductName !== "string" ||
    !Array.isArray(value.sellingPoints) ||
    !isRecord(value.specifications) ||
    !Array.isArray(value.forbiddenClaims) ||
    !Array.isArray(value.referenceAssets) ||
    !Array.isArray(value.citations) ||
    !Array.isArray(value.missingFacts) ||
    !Array.isArray(value.warnings)
  ) return null;
  const referenceAssets = value.referenceAssets.flatMap((asset) => {
    if (!isRecord(asset) || typeof asset.id !== "string" || typeof asset.name !== "string") return [];
    return [{ id: asset.id, name: asset.name }];
  });
  const citations = value.citations.flatMap((citation) => {
    if (
      !isRecord(citation) ||
      typeof citation.field !== "string" ||
      typeof citation.value !== "string" ||
      !["shared-product", "analysis-input", "reference-asset"].includes(String(citation.source))
    ) return [];
    return [{
      field: citation.field,
      value: citation.value,
      source: citation.source as TaobaoProductAnalysis["citations"][number]["source"],
    }];
  });
  return {
    suggestedProductName: value.suggestedProductName,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    sellingPoints: normalizeStringArray(value.sellingPoints),
    specifications: Object.fromEntries(
      Object.entries(value.specifications).filter(
        ([key, item]) => typeof key === "string" && typeof item === "string",
      ),
    ) as Record<string, string>,
    forbiddenClaims: normalizeStringArray(value.forbiddenClaims),
    referenceAssets,
    citations,
    missingFacts: normalizeStringArray(value.missingFacts),
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizeAPlusModuleSpec(value: unknown): AmazonAPlusModuleSpec | null {
  if (
    !isRecord(value) ||
    typeof value.slot !== "string" ||
    typeof value.label !== "string" ||
    typeof value.displayLabel !== "string" ||
    typeof value.moduleType !== "string" ||
    typeof value.uploadWidth !== "number" ||
    typeof value.uploadHeight !== "number" ||
    typeof value.objective !== "string"
  ) {
    return null;
  }
  const contentType = normalizeAPlusContentType(value.contentType);
  return {
    contentType,
    slot: value.slot,
    label: value.label,
    displayLabel: value.displayLabel,
    moduleType: value.moduleType as AmazonAPlusModuleSpec["moduleType"],
    uploadWidth: value.uploadWidth,
    uploadHeight: value.uploadHeight,
    objective: value.objective,
  };
}

function normalizeSessionOptions(
  value: unknown,
  platformId: PlatformId,
  workflowId: PlatformWorkflowId,
): PlatformSessionOptions | null {
  if (!isRecord(value) || value.platformId !== platformId) return null;
  if (platformId === "taobao") return { platformId: "taobao" };

  const plannerMode: AmazonWorkspaceMode =
    workflowId === "amazon-aplus" ? "aplus" : "listing";
  const rawSpecs = Array.isArray(value.aPlusModuleSpecs)
    ? value.aPlusModuleSpecs
        .map(normalizeAPlusModuleSpec)
        .filter((spec): spec is AmazonAPlusModuleSpec => spec !== null)
    : undefined;
  const resolved = resolveAmazonPlanningSession({
    marketplaceId: normalizeAmazonMarketplaceId(value.marketplaceId),
    plannerMode,
    listingImageCount: value.listingImageCount as number | undefined,
    aPlusType: normalizeAPlusContentType(value.aPlusType),
    aPlusModuleSpecs: rawSpecs,
    sizeTier: value.sizeTier as SizeTier | undefined,
    stylePresetId:
      typeof value.stylePresetId === "string" || value.stylePresetId === null
        ? value.stylePresetId
        : undefined,
  });
  return {
    platformId: "amazon",
    marketplaceId: resolved.marketplaceId,
    plannerMode,
    listingImageCount: resolved.listingImageCount,
    aPlusType: resolved.aPlusType,
    aPlusModuleSpecs: resolved.aPlusModuleSpecs.map((spec) => ({ ...spec })),
    sizeTier: resolved.sizeTier,
    stylePresetId: resolved.stylePresetId,
  };
}

function normalizeSlotVersions(value: unknown): Record<string, SlotVersionState> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([slotKey, state]) => {
      const normalized = normalizeVersionState(state, slotKey);
      return normalized ? [[slotKey, normalized]] : [];
    }),
  );
}

function normalizeSession(value: unknown, projectId: string): PlatformSession | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.projectId !== projectId ||
    (value.platformId !== "amazon" && value.platformId !== "taobao") ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const platformId = value.platformId;
  const workflowId = normalizeWorkflowId(value.workflowId, platformId);
  if (!workflowId) return null;
  const options = normalizeSessionOptions(value.options, platformId, workflowId);
  if (!options) return null;

  let plan: PlatformPlan | undefined;
  if (value.plan !== undefined) {
    try {
      plan = normalizePlatformPlan(value.plan, getPlatformRulePack(platformId));
    } catch {
      return null;
    }
  }

  return {
    id: value.id,
    projectId,
    platformId,
    workflowId,
    sourceInput: normalizeSourceInput(value.sourceInput),
    options,
    selectedReferenceAssetIds: normalizeStringArray(value.selectedReferenceAssetIds),
    ...(normalizePlanningInput(value.planningInput)
      ? { planningInput: normalizePlanningInput(value.planningInput)! }
      : {}),
    ...(typeof value.selectedStyleReferenceId === "string"
      ? { selectedStyleReferenceId: value.selectedStyleReferenceId }
      : {}),
    ...(typeof value.styleReferenceNotice === "string"
      ? { styleReferenceNotice: value.styleReferenceNotice }
      : {}),
    ...(normalizeTaobaoAnalysis(value.taobaoAnalysis)
      ? { taobaoAnalysis: normalizeTaobaoAnalysis(value.taobaoAnalysis)! }
      : {}),
    ...(plan ? { plan } : {}),
    ...(typeof value.planInputSignature === "string"
      ? { planInputSignature: value.planInputSignature }
      : {}),
    ...(typeof value.selectedSlotKey === "string"
      ? { selectedSlotKey: value.selectedSlotKey }
      : {}),
    slotVersions: normalizeSlotVersions(value.slotVersions),
    ...(typeof value.activeRunId === "string" ? { activeRunId: value.activeRunId } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizePlanningInput(value: unknown): PlanningInputSnapshot | null {
  if (
    !isRecord(value) ||
    (value.sourceMode !== "library" && value.sourceMode !== "manual") ||
    !["standard", "image-only", "facts-only", "empty"].includes(String(value.quality)) ||
    typeof value.productText !== "string"
  ) {
    return null;
  }
  return {
    sourceMode: value.sourceMode,
    quality: value.quality as PlanningInputSnapshot["quality"],
    missingFacts: normalizeStringArray(value.missingFacts),
    productText: value.productText,
    selectedReferenceAssetIds: normalizeStringArray(value.selectedReferenceAssetIds),
    ...(typeof value.sourceProjectId === "string"
      ? { sourceProjectId: value.sourceProjectId }
      : {}),
    ...(typeof value.sourceProjectUpdatedAt === "string"
      ? { sourceProjectUpdatedAt: value.sourceProjectUpdatedAt }
      : {}),
  };
}

function normalizeProductionEvent(value: unknown, runId: string): ProductionEvent | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.runId !== runId ||
    !["plan", "generate", "regenerate", "edit", "export"].includes(String(value.kind)) ||
    !["success", "failed", "canceled"].includes(String(value.status)) ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    runId,
    kind: value.kind as ProductionEvent["kind"],
    status: value.status as ProductionEvent["status"],
    ...(typeof value.slotKey === "string" ? { slotKey: value.slotKey } : {}),
    ...(typeof value.assetId === "string" ? { assetId: value.assetId } : {}),
    ...(typeof value.versionId === "string" ? { versionId: value.versionId } : {}),
    ...(typeof value.artifactFileName === "string"
      ? { artifactFileName: value.artifactFileName }
      : {}),
    ...(Array.isArray(value.missingSlots)
      ? { missingSlots: normalizeStringArray(value.missingSlots) }
      : {}),
    createdAt: value.createdAt,
  };
}

function normalizeRun(value: unknown, projectId: string): ProductionRun | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.projectId !== projectId ||
    typeof value.sessionId !== "string" ||
    (value.platformId !== "amazon" && value.platformId !== "taobao") ||
    (value.source !== "demo" && value.source !== "api") ||
    !["planned", "producing", "ready", "partial", "failed", "canceled"].includes(
      String(value.status),
    ) ||
    !isRecord(value.contextSnapshot) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const platformId = value.platformId;
  const workflowId = normalizeWorkflowId(value.workflowId, platformId);
  if (!workflowId) return null;
  const options = normalizeSessionOptions(
    value.contextSnapshot.options,
    platformId,
    workflowId,
  );
  if (!options) return null;
  const runId = value.id;

  let planSnapshot: PlatformPlan;
  try {
    planSnapshot = normalizePlatformPlan(value.planSnapshot, getPlatformRulePack(platformId));
  } catch {
    return null;
  }
  const events = (Array.isArray(value.events) ? value.events : [])
    .map((event) => normalizeProductionEvent(event, runId))
    .filter((event): event is ProductionEvent => event !== null);
  return {
    id: runId,
    projectId,
    sessionId: value.sessionId,
    platformId,
    workflowId,
    source: value.source,
    status: value.status as ProductionRun["status"],
    contextSnapshot: {
      sourceInput: normalizeSourceInput(value.contextSnapshot.sourceInput),
      options,
      selectedReferenceAssetIds: normalizeStringArray(
        value.contextSnapshot.selectedReferenceAssetIds,
      ),
      ...(normalizePlanningInput(value.contextSnapshot.planningInput)
        ? { planningInput: normalizePlanningInput(value.contextSnapshot.planningInput)! }
        : {}),
      ...(typeof value.contextSnapshot.selectedStyleReferenceId === "string"
        ? { selectedStyleReferenceId: value.contextSnapshot.selectedStyleReferenceId }
        : {}),
      ...(normalizeTaobaoAnalysis(value.contextSnapshot.taobaoAnalysis)
        ? { taobaoAnalysis: normalizeTaobaoAnalysis(value.contextSnapshot.taobaoAnalysis)! }
        : {}),
    },
    planSnapshot,
    ...(typeof value.planningInputSignatureSnapshot === "string"
      ? { planningInputSignatureSnapshot: value.planningInputSignatureSnapshot }
      : {}),
    ...(isRecord(value.slotVersionsSnapshot)
      ? { slotVersionsSnapshot: normalizeSlotVersions(value.slotVersionsSnapshot) }
      : {}),
    events,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeTaskRecord(value: unknown): TaskRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.batchId !== "string" ||
    (value.kind !== "plan" && value.kind !== "generate" && value.kind !== "export") ||
    (value.platformId !== "taobao" && value.platformId !== "amazon") ||
    (value.status !== "success" && value.status !== "failed" && value.status !== "canceled") ||
    typeof value.startedAt !== "string" ||
    typeof value.completedAt !== "string" ||
    typeof value.summary !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    batchId: value.batchId,
    kind: value.kind,
    platformId: value.platformId,
    status: value.status,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    summary: value.summary,
    ...(typeof value.slotKey === "string" ? { slotKey: value.slotKey } : {}),
    ...(typeof value.artifactFileName === "string"
      ? { artifactFileName: value.artifactFileName }
      : {}),
    ...(Array.isArray(value.missingSlots)
      ? { missingSlots: value.missingSlots.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

function normalizeDocument(
  value: unknown,
  projectId: string,
  now: () => string,
): ProjectWorkspaceDocument {
  if (!isRecord(value) || value.projectId !== projectId) {
    return emptyDocument(projectId, now);
  }

  const rawPlans = isRecord(value.plans) ? value.plans : {};
  const rawPlanInputSignatures = isRecord(value.planInputSignatures)
    ? value.planInputSignatures
    : {};
  const rawSelected = isRecord(value.selectedSlotKeys) ? value.selectedSlotKeys : {};
  const rawSlotVersions = isRecord(value.slotVersions) ? value.slotVersions : {};
  const rawAmazonWorkspaces = isRecord(value.amazonWorkspaces) ? value.amazonWorkspaces : {};
  const sessions = (Array.isArray(value.sessions) ? value.sessions : [])
    .map((session) => normalizeSession(session, projectId))
    .filter((session): session is PlatformSession => session !== null);
  const runs = (Array.isArray(value.runs) ? value.runs : [])
    .map((run) => normalizeRun(run, projectId))
    .filter((run): run is ProductionRun => run !== null);
  const savedAmazonPlannerMode =
    value.amazonPlannerMode === "aplus" ? "aplus" : "listing";
  const plans: Partial<Record<PlatformId, PlatformPlan>> = {};
  const planInputSignatures: Partial<Record<PlatformId, string>> = {};
  const selectedSlotKeys: Partial<Record<PlatformId, string>> = {};
  const slotVersions: Partial<Record<PlatformId, Record<string, SlotVersionState>>> = {};
  const amazonWorkspaces: Partial<Record<AmazonWorkspaceMode, AmazonModeWorkspaceSnapshot>> = {};
  const taskHistory = (Array.isArray(value.taskHistory) ? value.taskHistory : [])
    .map(normalizeTaskRecord)
    .filter((record): record is TaskRecord => record !== null)
    .slice(-100);

  for (const platformId of supportedPlatformIds) {
    const inputSignature = rawPlanInputSignatures[platformId];
    if (typeof inputSignature === "string" && inputSignature.length > 0) {
      planInputSignatures[platformId] = inputSignature;
    }

    const rawPlan = rawPlans[platformId];
    if (rawPlan !== undefined) {
      try {
        const plan = normalizePlatformPlan(rawPlan, getPlatformRulePack(platformId));
        plans[platformId] = plan;
        const selectedSlotKey = rawSelected[platformId];
        if (
          typeof selectedSlotKey === "string" &&
          plan.slots.some((slot) => slot.slotKey === selectedSlotKey)
        ) {
          selectedSlotKeys[platformId] = selectedSlotKey;
        }
      } catch {
        // A damaged platform plan must not make the project's other plan unreadable.
      }
    }

    if (platformId === "amazon") {
      for (const mode of ["listing", "aplus"] as const) {
        const rawSnapshot = rawAmazonWorkspaces[mode];
        if (!isRecord(rawSnapshot) || rawSnapshot.plan === undefined) continue;
        try {
          const snapshotPlan = normalizePlatformPlan(
            rawSnapshot.plan,
            getPlatformRulePack("amazon"),
          );
          if (snapshotPlan.amazonSession?.plannerMode !== mode) continue;
          const selectedSlotKey =
            typeof rawSnapshot.selectedSlotKey === "string" &&
            snapshotPlan.slots.some((slot) => slot.slotKey === rawSnapshot.selectedSlotKey)
              ? rawSnapshot.selectedSlotKey
              : snapshotPlan.slots[0]?.slotKey;
          amazonWorkspaces[mode] = {
            plan: snapshotPlan,
            ...(typeof rawSnapshot.planInputSignature === "string" &&
            rawSnapshot.planInputSignature.length > 0
              ? { planInputSignature: rawSnapshot.planInputSignature }
              : {}),
            ...(selectedSlotKey ? { selectedSlotKey } : {}),
          };
        } catch {
          // A damaged mode snapshot must not hide the other Amazon mode.
        }
      }

      const activeAmazonPlan = plans.amazon;
      const activeMode = activeAmazonPlan?.amazonSession?.plannerMode;
      if (
        activeAmazonPlan &&
        (activeMode === "listing" || activeMode === "aplus") &&
        !amazonWorkspaces[activeMode]
      ) {
        amazonWorkspaces[activeMode] = {
          plan: activeAmazonPlan,
          ...(planInputSignatures.amazon
            ? { planInputSignature: planInputSignatures.amazon }
            : {}),
          ...(selectedSlotKeys.amazon
            ? { selectedSlotKey: selectedSlotKeys.amazon }
            : {}),
        };
      }
    }

    const platformVersions = rawSlotVersions[platformId];
    if (isRecord(platformVersions)) {
      const allowedSlotKeys = new Set(
        platformId === "amazon"
          ? [
              ...resolveRulePackForPlan(platformId, plans[platformId]).slots.map(
                (slot) => slot.key,
              ),
              ...Object.values(amazonWorkspaces).flatMap((snapshot) =>
                snapshot
                  ? resolveRulePackForPlan("amazon", snapshot.plan).slots.map(
                      (slot) => slot.key,
                    )
                  : [],
              ),
            ]
          : resolveRulePackForPlan(platformId, plans[platformId]).slots.map(
              (slot) => slot.key,
            ),
      );
      const normalizedStates = Object.fromEntries(
        Object.entries(platformVersions).flatMap(([slotKey, state]) => {
          if (!allowedSlotKeys.has(slotKey)) return [];
          const normalized = normalizeVersionState(state, slotKey);
          return normalized ? [[slotKey, normalized]] : [];
        }),
      );
      if (Object.keys(normalizedStates).length > 0) {
        slotVersions[platformId] = normalizedStates;
      }
    }
  }

  return {
    projectId,
    sessions,
    runs,
    plans,
    planInputSignatures,
    selectedSlotKeys,
    amazonPlannerMode:
      plans.amazon?.amazonSession?.plannerMode === "aplus"
        ? "aplus"
        : plans.amazon?.amazonSession?.plannerMode === "listing"
          ? "listing"
          : savedAmazonPlannerMode,
    amazonWorkspaces,
    slotVersions,
    taskHistory,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now(),
  };
}

function cloneDocument(
  document: ProjectWorkspaceDocument,
  now: () => string,
): ProjectWorkspaceDocument {
  return normalizeDocument(JSON.parse(JSON.stringify(document)), document.projectId, now);
}

export function createMemoryWorkspaceRepository(
  options: WorkspaceRepositoryOptions = {},
): ProjectWorkspaceRepository {
  const now = options.now ?? defaultNow;
  const documents = new Map<string, ProjectWorkspaceDocument>();

  return {
    async load(projectId) {
      const document = documents.get(projectId);
      return document ? cloneDocument(document, now) : emptyDocument(projectId, now);
    },
    async save(document) {
      documents.set(document.projectId, cloneDocument(document, now));
    },
    async remove(projectId) {
      documents.delete(projectId);
    },
  };
}

export function createLocalStorageWorkspaceRepository(
  options: LocalStorageWorkspaceRepositoryOptions,
): ProjectWorkspaceRepository {
  const now = options.now ?? defaultNow;

  return {
    async load(projectId) {
      const value = options.storage.getItem(`${PROJECT_WORKSPACE_STORAGE_PREFIX}${projectId}`);
      if (!value) return emptyDocument(projectId, now);

      try {
        return normalizeDocument(JSON.parse(value), projectId, now);
      } catch {
        return emptyDocument(projectId, now);
      }
    },
    async save(document) {
      const normalized = cloneDocument(document, now);
      options.storage.setItem(
        `${PROJECT_WORKSPACE_STORAGE_PREFIX}${document.projectId}`,
        JSON.stringify(normalized),
      );
    },
    async remove(projectId) {
      options.storage.removeItem?.(`${PROJECT_WORKSPACE_STORAGE_PREFIX}${projectId}`);
    },
  };
}
