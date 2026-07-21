import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import { compressImageFile } from "../domain/assets/compress";
import {
  GenerationReferencePayloadError,
  GENERATION_REFERENCE_MAX_COUNT,
  GENERATION_REFERENCE_MAX_PAYLOAD_BYTES,
  prepareGenerationReferencePayload,
} from "../domain/assets/reference-payload";
import {
  createIndexedDbAssetRepository,
  createMemoryAssetRepository,
  type AssetRepository,
} from "../domain/assets/repository";
import {
  createIndexedDbRunRepository,
  createMemoryRunRepository,
  type RunRepository,
} from "../domain/runs/repository";
import {
  createIndexedDbExecutionJobRepository,
  createMemoryExecutionJobRepository,
  type ExecutionJobRepository,
} from "../domain/jobs/repository";
import {
  cancelExecutionJob,
  claimNextExecutionJobItem,
  completeExecutionJobItem,
  createExecutionJob,
  failExecutionJobItem,
  recoverInterruptedExecutionJob,
  retryExecutionJob,
} from "../domain/jobs/state";
import type { ExecutionJob, ExecutionJobKind } from "../domain/jobs/types";
import { createV3WorkspacePersistence } from "../application/workspace-persistence";
import {
  activateVersion,
  appendRunEvent,
  commitAnalysis,
  commitPlan,
  commitVersion,
  forkRun as forkProductionRun,
  startSession,
  updateSlot as updateSessionSlot,
} from "../application/production-mutations";
import {
  createHistoryQueryService,
  type HistoryQueryService,
} from "../domain/history/query";
import type { AssetMetadata } from "../domain/assets/types";
import {
  createStyleReferenceBoardBitmap,
  type StyleReferenceDraft,
} from "../domain/assets/style-reference";
import type {
  ImageGenerator,
  SlotVersion,
  SlotVersionState,
} from "../domain/generation/types";
import type { MaskDraft } from "../domain/generation/mask";
import { prepareMaskTarget } from "../domain/generation/mask-preprocess";
import { buildRunExportPackage, type ExportPackage } from "../domain/export";
import type { CopilotCommand, CopilotEngine } from "../domain/copilot";
import { normalizePlatformPlan } from "../domain/planning/normalizer";
import {
  listingParseToFactsPatch,
  parseAmazonListingText,
} from "../domain/planning/listing-parse";
import { resolvePlanningRulePack } from "../domain/planning/resolve-planning-pack";
import {
  createPlanningInputSignature,
  isPlanningInputCurrent,
} from "../domain/planning/input-signature";
import type {
  PlannedSlot,
  PlannerEngine,
  PlanningReferenceImage,
  PlatformPlan,
  AmazonPlanningRequestOptions,
} from "../domain/planning/types";
import { getPlatformRulePack } from "../domain/platforms/registry";
import {
  analyzeTaobaoProduct,
} from "../domain/platforms/taobao-analysis";
import { resolveRulePackForPlan } from "../domain/platforms/resolve-rule-pack";
import { generationDimensionsForUpload } from "../domain/platforms/generation-size";
import { resolveAmazonPlanningSession } from "../domain/platforms/amazon-catalog";
import {
  appendStyleGuidanceToPrompt,
  appendStyleReferenceGuidance,
  getAmazonStylePreset,
  shouldApplyStyleToSlot,
} from "../domain/platforms/amazon-style-presets";
import type { PlatformId } from "../domain/platforms/types";
import type {
  CreateProductProjectInput,
  ProductProject,
  UpdateProductProjectInput,
} from "../domain/projects/types";
import {
  createLocalStorageProjectRepository,
  createMemoryProjectRepository,
  type ProjectRepository,
} from "../domain/projects/repository";
import { createStableId } from "../domain/shared/id";
import {
  createLocalStorageSettingsRepository,
  createMemorySettingsRepository,
  defaultRuntimeSettings,
  normalizeRuntimeSettings,
  runtimeImageApiKey,
  runtimeImageBaseUrl,
  runtimeTextApiKey,
  runtimeTextBaseUrl,
  runtimeSupportsImageEditing,
  detectProviderCapabilities,
  testApiConnection,
  testImageApiConnection,
  testTextApiConnection,
  validateRuntimeSettings,
  type ConnectionTestResult,
  type RuntimeSettings,
  type SettingsRepository,
} from "../domain/settings";
import type { TaskRecord } from "../domain/tasks";
import {
  createLocalStorageWorkspaceRepository,
  createMemoryWorkspaceRepository,
  type AmazonModeWorkspaceSnapshot,
  type AmazonWorkspaceMode,
  type AmazonSessionOptions,
  type PlatformSession,
  type PlatformWorkflowId,
  type ProductionRun,
  type ProjectWorkspaceDocument,
  type ProjectWorkspaceRepository,
} from "../domain/workspace/project-workspace";
import { resolveSessionEffectiveFacts, resolveSessionEffectiveProject } from "../domain/workspace/effective-facts";
import {
  createLocalStorageWorkspaceV3Repository,
  createMemoryWorkspaceV3Repository,
  type ProjectWorkspaceV3Repository,
} from "../domain/workspace/workspace-v3";
import { demoPlanner, slowInteractiveDemoPlanner } from "../services/demo-planner";
import {
  demoCopilot,
  interactiveDemoCopilot,
  slowInteractiveDemoCopilot,
} from "../services/demo-copilot";
import { OpenAICopilot } from "../services/openai-copilot";
import { OpenAIPlanner } from "../services/openai-planner";
import { OpenAIImageGenerator } from "../services/openai-image-generator";
import {
  createFailOnceImageGenerator,
  demoImageGenerator,
  interactiveDemoImageGenerator,
} from "../services/demo-image-generator";

export interface WorkbenchAsset {
  metadata: AssetMetadata;
  objectUrl: string;
}

export interface StartAmazonSessionInput {
  projectId?: string;
  workflowId: Extract<PlatformWorkflowId, "amazon-listing" | "amazon-aplus">;
  listingText: string;
  files: File[];
  selectedReferenceAssetIds: string[];
  selectedStyleReferenceId?: string | null;
  options: AmazonPlanningRequestOptions;
}

export interface StartTaobaoSessionInput {
  projectId?: string;
  selectedReferenceAssetIds: string[];
}

export interface AnalyzeTaobaoProductInput {
  projectId?: string;
  productText: string;
  files: File[];
  selectedReferenceAssetIds: string[];
}

export interface WorkbenchStoreDependencies {
  projectRepository: ProjectRepository;
  assetRepository: AssetRepository;
  workspaceRepository?: ProjectWorkspaceRepository;
  runRepository?: RunRepository;
  executionJobRepository?: ExecutionJobRepository;
  historyQueryService?: HistoryQueryService;
  settingsRepository?: SettingsRepository;
  plannerEngine?: PlannerEngine;
  createPlannerEngine?: (settings: RuntimeSettings) => PlannerEngine;
  planningTimeoutMs?: number;
  imageGenerator?: ImageGenerator;
  createImageGenerator?: (settings: RuntimeSettings) => ImageGenerator;
  copilotEngine?: CopilotEngine;
  createCopilotEngine?: (settings: RuntimeSettings) => CopilotEngine;
  testConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  testTextConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  testImageConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  generationTimeoutMs?: number;
  createVersionId?: () => string;
  createTaskId?: () => string;
  now?: () => string;
  compressImageFile: (file: File) => Promise<File>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  warning?: string | null;
}

export interface WorkbenchState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  warning: string | null;
  projects: ProductProject[];
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  sessions: PlatformSession[];
  runs: ProductionRun[];
  jobs: ExecutionJob[];
  plans: Partial<Record<PlatformId, PlatformPlan>>;
  planInputSignatures: Partial<Record<PlatformId, string>>;
  selectedSlotKeys: Partial<Record<PlatformId, string>>;
  amazonPlannerMode: AmazonWorkspaceMode;
  amazonWorkspaces: Partial<Record<AmazonWorkspaceMode, AmazonModeWorkspaceSnapshot>>;
  slotVersions: Partial<Record<PlatformId, Record<string, SlotVersionState>>>;
  taskHistory: TaskRecord[];
  historyQueryService: HistoryQueryService | null;
  planningPlatformId: PlatformId | null;
  planningError: string | null;
  generatingSlot: { platformId: PlatformId; slotKey: string } | null;
  generationCanceling: boolean;
  generationRecoveryRequired: boolean;
  generationError: string | null;
  generationErrorTarget: { platformId: PlatformId; slotKey: string } | null;
  resourceRestoreError: string | null;
  exportingPlatform: PlatformId | null;
  exportError: string | null;
  exportErrorPlatform: PlatformId | null;
  runtimeSettings: RuntimeSettings;
  settingsLoading: boolean;
  settingsError: string | null;
  connectionTestStatus: "idle" | "testing" | "success" | "error";
  connectionTestMessage: string | null;
  textConnectionTestStatus: "idle" | "testing" | "success" | "error";
  textConnectionTestMessage: string | null;
  imageConnectionTestStatus: "idle" | "testing" | "success" | "error";
  imageConnectionTestMessage: string | null;
  copilotTarget: { platformId: PlatformId; slotKey: string } | null;
  copilotFeedbackTarget: { platformId: PlatformId; slotKey: string } | null;
  copilotError: string | null;
  copilotMessage: string | null;
  initialize(): Promise<void>;
  startAmazonSession(input: StartAmazonSessionInput): Promise<PlatformSession | null>;
  startTaobaoSession(input: StartTaobaoSessionInput): Promise<PlatformSession | null>;
  analyzeTaobaoProduct(input: AnalyzeTaobaoProductInput): Promise<PlatformSession | null>;
  syncAmazonListingFacts(listingText: string): Promise<boolean>;
  syncAmazonSessionFacts(sessionId: string): Promise<boolean>;
  createProject(input: CreateProductProjectInput): Promise<ProductProject | null>;
  updateActiveProject(input: UpdateProductProjectInput): Promise<ProductProject | null>;
  removeProject(id: string): Promise<boolean>;
  selectProject(id: string): Promise<void>;
  uploadReferenceFiles(files: File[]): Promise<WorkbenchAsset[]>;
  createStyleReference(
    presetId: string,
    draft?: Partial<StyleReferenceDraft>,
  ): Promise<WorkbenchAsset | null>;
  removeAsset(id: string): Promise<void>;
  refreshAssets(): Promise<void>;
  planPlatform(
    platformId: PlatformId,
    amazonOptions?: AmazonPlanningRequestOptions,
  ): Promise<PlatformPlan | null>;
  selectAmazonPlannerMode(mode: AmazonWorkspaceMode): Promise<boolean>;
  cancelPlanning(): void;
  selectSessionSlot(sessionId: string, slotKey: string): Promise<boolean>;
  selectPlannedSlot(platformId: PlatformId, slotKey: string): Promise<boolean>;
  updatePlannedSlot(
    platformId: PlatformId,
    slotKey: string,
    patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> &
      Partial<Pick<PlannedSlot, "externalText">>,
  ): Promise<boolean>;
  generateSessionSlot(sessionId: string, slotKey: string): Promise<SlotVersion | null>;
  generateSlot(platformId: PlatformId, slotKey: string): Promise<SlotVersion | null>;
  generateMaskedVersion(
    sessionId: string,
    slotKey: string,
    versionId: string,
    mask: MaskDraft,
    prompt: string,
  ): Promise<SlotVersion | null>;
  cancelGeneration(): void;
  activateSlotVersion(
    platformId: PlatformId,
    slotKey: string,
    versionId: string,
  ): Promise<boolean>;
  clearGenerationError(): void;
  exportPlatform(platformId: PlatformId): Promise<ExportPackage | null>;
  exportRun(runId: string): Promise<ExportPackage | null>;
  startBatchGeneration(platformId: PlatformId): Promise<ExecutionJob | null>;
  resumeExecutionJob(jobId: string): Promise<ExecutionJob | null>;
  retryExecutionJob(jobId: string): Promise<ExecutionJob | null>;
  cancelExecutionJob(jobId: string): Promise<boolean>;
  refreshExecutionJobs(): Promise<void>;
  resumeRun(runId: string): Promise<boolean>;
  forkRun(runId: string): Promise<PlatformSession | null>;
  reuseRunImageAsReference(runId: string, eventId: string): Promise<WorkbenchAsset | null>;
  reuseGeneratedImageAsReference(assetId: string): Promise<WorkbenchAsset | null>;
  clearExportError(): void;
  saveRuntimeSettings(settings: RuntimeSettings): Promise<boolean>;
  testRuntimeConnection(
    settings?: RuntimeSettings,
    service?: "text" | "image" | "all",
  ): Promise<ConnectionTestResult>;
  clearSettingsFeedback(): void;
  runCopilotCommand(
    platformId: PlatformId,
    slotKey: string,
    command: CopilotCommand,
  ): Promise<boolean>;
  cancelCopilot(): void;
  clearCopilotFeedback(): void;
  retryActiveProjectResources(): Promise<void>;
  clearResourceRestoreError(): void;
  clearPlanningError(): void;
  clearError(): void;
  dispose(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "工作台操作失败";
}

function planningErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "AI 策划超时，请检查连接后重试。商品资料和已有结果未受影响。";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "本次策划已取消，商品资料和已有结果未受影响。";
  }
  return `AI 策划失败：${errorMessage(error)}。商品资料和已有结果未受影响。`;
}

function generationErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "图片生成超时，请检查连接后重试。已有版本未受影响。";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "本次图片生成已取消，已有版本未受影响。";
  }
  return `图片生成失败：${errorMessage(error)}。已有版本未受影响。`;
}

const CANCELED_GENERATION_MESSAGE = "已取消本次图片生成，已有版本未受影响。";
const STALE_PLAN_MESSAGE = "商品资料或参考素材已更新，请重新策划当前平台后再继续。";

function hasCurrentPlanningInputs(state: WorkbenchState, platformId: PlatformId): boolean {
  const planningSession = [...state.sessions]
    .filter((session) => session.platformId === platformId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const planningFacts = state.activeProject
    ? resolveSessionEffectiveFacts(state.activeProject, planningSession)
    : undefined;
  return Boolean(
    planningFacts &&
      isPlanningInputCurrent(
        state.planInputSignatures[platformId],
        planningFacts,
        state.assets.map((asset) => asset.metadata),
      ),
  );
}

function selectedKeysFor(document: ProjectWorkspaceDocument): Partial<Record<PlatformId, string>> {
  const selectedSlotKeys = { ...document.selectedSlotKeys };
  for (const [platformId, plan] of Object.entries(document.plans) as [
    PlatformId,
    PlatformPlan | undefined,
  ][]) {
    if (!plan) continue;
    const selected = selectedSlotKeys[platformId];
    if (!selected || !plan.slots.some((slot) => slot.slotKey === selected)) {
      selectedSlotKeys[platformId] = plan.slots[0]?.slotKey;
    }
  }
  return selectedSlotKeys;
}

function amazonModeForPlan(plan?: PlatformPlan): AmazonWorkspaceMode | null {
  const mode = plan?.amazonSession?.plannerMode;
  return mode === "listing" || mode === "aplus" ? mode : null;
}

function workflowForPlan(platformId: PlatformId, plan: PlatformPlan): PlatformWorkflowId {
  if (platformId === "taobao") return "taobao-product";
  return plan.amazonSession?.plannerMode === "aplus" ? "amazon-aplus" : "amazon-listing";
}

function optionsForPlan(platformId: PlatformId, plan: PlatformPlan): AmazonSessionOptions | { platformId: "taobao" } {
  if (platformId === "taobao") return { platformId: "taobao" };
  const resolved = resolveAmazonPlanningSession({
    plannerMode: plan.amazonSession?.plannerMode === "aplus" ? "aplus" : "listing",
    marketplaceId: plan.amazonSession?.marketplaceId,
    listingImageCount: plan.amazonSession?.listingImageCount,
    aPlusType: plan.amazonSession?.aPlusType,
    aPlusModuleSpecs: plan.amazonSession?.aPlusModuleSpecs,
    sizeTier: plan.amazonSession?.sizeTier,
    stylePresetId: plan.amazonSession?.stylePresetId,
  });
  return {
    platformId: "amazon",
    marketplaceId: resolved.marketplaceId,
    plannerMode: resolved.plannerMode === "aplus" ? "aplus" : "listing",
    listingImageCount: resolved.listingImageCount,
    aPlusType: resolved.aPlusType,
    aPlusModuleSpecs: resolved.aPlusModuleSpecs.map((spec) => ({ ...spec })),
    sizeTier: resolved.sizeTier,
    stylePresetId: resolved.stylePresetId,
  };
}

function withAmazonSnapshot(
  document: ProjectWorkspaceDocument,
  plan: PlatformPlan,
  planInputSignature?: string,
  selectedSlotKey?: string,
): ProjectWorkspaceDocument {
  const mode = amazonModeForPlan(plan);
  if (!mode) return document;
  return {
    ...document,
    amazonPlannerMode: mode,
    amazonWorkspaces: {
      ...document.amazonWorkspaces,
      [mode]: {
        plan,
        ...(planInputSignature ? { planInputSignature } : {}),
        ...(selectedSlotKey ? { selectedSlotKey } : {}),
      },
    },
  };
}

function amazonWorkspacesWithSnapshot(
  workspaces: Partial<Record<AmazonWorkspaceMode, AmazonModeWorkspaceSnapshot>>,
  plan: PlatformPlan,
  planInputSignature?: string,
  selectedSlotKey?: string,
): Partial<Record<AmazonWorkspaceMode, AmazonModeWorkspaceSnapshot>> {
  const mode = amazonModeForPlan(plan);
  if (!mode) return workspaces;
  return {
    ...workspaces,
    [mode]: {
      plan,
      ...(planInputSignature ? { planInputSignature } : {}),
      ...(selectedSlotKey ? { selectedSlotKey } : {}),
    },
  };
}

function withoutRecordKey<T extends string, V>(
  record: Partial<Record<T, V>>,
  key: T,
): Partial<Record<T, V>> {
  const next = { ...record };
  delete next[key];
  return next;
}

function revokeAssets(
  assets: WorkbenchAsset[],
  dependencies: WorkbenchStoreDependencies,
): void {
  for (const asset of assets) {
    dependencies.revokeObjectURL(asset.objectUrl);
  }
}

const PENDING_GENERATED_CLEANUP_TAG = "system:pending-cleanup";

interface LoadedAssetViews {
  assets: WorkbenchAsset[];
  cleanupWarnings: string[];
}

async function loadAssetViews(
  projectId: string,
  dependencies: WorkbenchStoreDependencies,
): Promise<LoadedAssetViews> {
  const metadata = await dependencies.assetRepository.list(projectId);
  const visibleMetadata: AssetMetadata[] = [];
  const cleanupWarnings: string[] = [];

  for (const item of metadata) {
    if (item.kind === "generated" && item.tags.includes(PENDING_GENERATED_CLEANUP_TAG)) {
      try {
        await dependencies.assetRepository.remove(item.id);
      } catch (error) {
        cleanupWarnings.push(`${item.name}：${errorMessage(error)}`);
      }
      continue;
    }
    visibleMetadata.push(item);
  }

  const views: WorkbenchAsset[] = [];

  try {
    for (const item of visibleMetadata) {
      const stored = await dependencies.assetRepository.get(item.id);
      if (!stored) {
        continue;
      }
      views.push({
        metadata: {
          ...stored.metadata,
          tags: [...stored.metadata.tags],
        },
        objectUrl: dependencies.createObjectURL(stored.blob),
      });
    }
    return { assets: views, cleanupWarnings };
  } catch (error) {
    revokeAssets(views, dependencies);
    throw error;
  }
}

function factsFromAmazonListing(base: ProductProject["facts"], listingText: string) {
  const parsed = parseAmazonListingText(listingText);
  const patch = listingParseToFactsPatch(parsed);
  return {
    ...base,
    ...(patch.productName === undefined ? {} : { productName: patch.productName }),
    ...(patch.description === undefined ? {} : { description: patch.description }),
    ...(patch.sellingPoints === undefined ? {} : { sellingPoints: patch.sellingPoints }),
  };
}

function emptyFactsFromAmazonListing(listingText: string): ProductProject["facts"] {
  return factsFromAmazonListing(
    {
      productName: "",
      category: "",
      brand: "",
      model: "",
      sku: "",
      targetAudience: "",
      description: "",
      sellingPoints: [],
      forbiddenClaims: [],
      specifications: {},
    },
    listingText,
  );
}

export function createWorkbenchStore(
  dependencies: WorkbenchStoreDependencies,
): StoreApi<WorkbenchState> {
  const workspaceRepository =
    dependencies.workspaceRepository ?? createMemoryWorkspaceRepository();
  const executionJobRepository =
    dependencies.executionJobRepository ?? createMemoryExecutionJobRepository();
  const settingsRepository =
    dependencies.settingsRepository ?? createMemorySettingsRepository();
  const historyQueryService = dependencies.historyQueryService ?? (
    dependencies.runRepository
      ? createHistoryQueryService({
          runRepository: dependencies.runRepository,
          getProject: (projectId) => dependencies.projectRepository.get(projectId),
          prepare: async () => {
            const projects = await dependencies.projectRepository.list();
            await Promise.all(projects.map((project) => workspaceRepository.load(project.id)));
          },
        })
      : null
  );
  const plannerEngine = dependencies.plannerEngine ?? demoPlanner;
  // Keep the operation guard slightly longer than the API planner's own request timeout.
  const planningTimeoutMs = dependencies.planningTimeoutMs ?? 135_000;
  const imageGenerator = dependencies.imageGenerator ?? demoImageGenerator;
  const copilotEngine = dependencies.copilotEngine ?? demoCopilot;
  const generationTimeoutMs = dependencies.generationTimeoutMs ?? 60_000;
  const createVersionId = dependencies.createVersionId ?? (() => createStableId("version"));
  const now = dependencies.now ?? (() => new Date().toISOString());
  let lifecycleVersion = 0;
  let planningRequestId = 0;
  let activePlanningController: AbortController | null = null;
  let generationRequestId = 0;
  let activeGenerationController: AbortController | null = null;
  let exportRequestId = 0;
  let copilotRequestId = 0;
  let activeCopilotController: AbortController | null = null;
  const canceledExecutionJobIds = new Set<string>();
  let workspaceWriteQueue: Promise<void> = Promise.resolve();
  const isCurrentLifecycle = (version: number) => version === lifecycleVersion;

  const restoreExecutionJobs = async (): Promise<ExecutionJob[]> => {
    const page = await executionJobRepository.list();
    const restored: ExecutionJob[] = [];
    for (const job of page.items) {
      const next = recoverInterruptedExecutionJob(job, now());
      if (next.updatedAt !== job.updatedAt || next.status !== job.status) {
        await executionJobRepository.put(next);
      }
      restored.push(next);
    }
    return restored;
  };

  const enqueueWorkspaceMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = workspaceWriteQueue.then(operation, operation);
    workspaceWriteQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const locateRun = async (runId: string, readState: () => WorkbenchState): Promise<{
    project: ProductProject;
    workspace: ProjectWorkspaceDocument;
    run: ProductionRun;
  } | null> => {
    const active = readState().activeProject;
    const projects = active
      ? [active, ...readState().projects.filter((project) => project.id !== active.id)]
      : readState().projects;
    for (const project of projects) {
      const workspace = await workspaceRepository.load(project.id);
      const run = workspace.runs.find((candidate) => candidate.id === runId);
      if (run) return { project, workspace, run };
    }
    return null;
  };

  const invalidatePlanning = () => {
    planningRequestId += 1;
    activePlanningController?.abort(new DOMException("策划上下文已变更", "AbortError"));
    activePlanningController = null;
  };

  const invalidateGeneration = () => {
    generationRequestId += 1;
    activeGenerationController?.abort(
      new DOMException("图片生成上下文已变更", "AbortError"),
    );
    activeGenerationController = null;
  };

  const invalidateExport = () => {
    exportRequestId += 1;
  };

  const invalidateCopilot = () => {
    copilotRequestId += 1;
    activeCopilotController?.abort(new DOMException("Copilot 上下文已变更", "AbortError"));
    activeCopilotController = null;
  };

  return createStore<WorkbenchState>((set, get) => {
    const persistJobs = async (jobs: readonly ExecutionJob[]) => {
      await Promise.all(jobs.map((job) => executionJobRepository.put(job)));
      const ids = new Set(jobs.map((job) => job.id));
      set((state) => ({
        jobs: [
          ...state.jobs.filter((job) => !ids.has(job.id)),
          ...jobs.map((job) => structuredClone(job)),
        ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      }));
    };

    const runExecutionJob = async (jobId: string): Promise<ExecutionJob | null> => {
      while (true) {
        const stored = await executionJobRepository.get(jobId);
        if (!stored || stored.status === "canceled" || stored.status === "completed") {
          return stored;
        }
        if (canceledExecutionJobIds.has(jobId)) {
          const canceled = cancelExecutionJob(stored, now());
          await persistJobs([canceled]);
          return canceled;
        }
        const claimed = claimNextExecutionJobItem(stored, now());
        await persistJobs([claimed.job]);
        if (!claimed.currentItem) return claimed.job;
        if (canceledExecutionJobIds.has(jobId)) {
          const canceled = cancelExecutionJob(claimed.job, now());
          await persistJobs([canceled]);
          return canceled;
        }

        const { target } = claimed.currentItem;
        const version = await get().generateSessionSlot(target.sessionId, target.slotKey);
        const latest = await executionJobRepository.get(jobId);
        if (!latest || latest.status === "canceled") return latest;
        if (canceledExecutionJobIds.has(jobId)) {
          const canceled = cancelExecutionJob(latest, now());
          await persistJobs([canceled]);
          return canceled;
        }
        const next = version
          ? completeExecutionJobItem(latest, claimed.currentItem.id, now())
          : failExecutionJobItem(
              latest,
              claimed.currentItem.id,
              get().generationError ?? "生成失败，请检查当前任务状态后重试。",
              now(),
            );
        await persistJobs([next]);
        if (next.status === "failed" || next.status === "canceled") return next;
      }
    };

    return ({
    initialized: false,
    loading: false,
    error: null,
    warning: dependencies.warning ?? null,
    projects: [],
    activeProject: null,
    assets: [],
    sessions: [],
    runs: [],
    jobs: [],
    plans: {},
    planInputSignatures: {},
    selectedSlotKeys: {},
    amazonPlannerMode: "listing",
    amazonWorkspaces: {},
    slotVersions: {},
    taskHistory: [],
    historyQueryService,
    planningPlatformId: null,
    planningError: null,
    generatingSlot: null,
    generationCanceling: false,
    generationRecoveryRequired: false,
    generationError: null,
    generationErrorTarget: null,
    resourceRestoreError: null,
    exportingPlatform: null,
    exportError: null,
    exportErrorPlatform: null,
    runtimeSettings: { ...defaultRuntimeSettings },
    settingsLoading: false,
    settingsError: null,
    connectionTestStatus: "idle",
    connectionTestMessage: null,
    textConnectionTestStatus: "idle",
    textConnectionTestMessage: null,
    imageConnectionTestStatus: "idle",
    imageConnectionTestMessage: null,
    copilotTarget: null,
    copilotFeedbackTarget: null,
    copilotError: null,
    copilotMessage: null,

    async initialize() {
      const operationLifecycle = lifecycleVersion;
      set({ loading: true, error: null, resourceRestoreError: null });
      try {
        const [projects, activeProject] = await Promise.all([
          dependencies.projectRepository.list(),
          dependencies.projectRepository.restoreActive(),
        ]);
        let runtimeSettings = { ...defaultRuntimeSettings };
        let settingsRestoreError: string | null = null;
        let jobs: ExecutionJob[] = [];
        let jobsRestoreError: string | null = null;
        try {
          runtimeSettings = await settingsRepository.load();
        } catch (settingsError) {
          settingsRestoreError = `运行设置恢复失败：${errorMessage(settingsError)}。已切换到本地演示引擎。`;
        }
        try {
          jobs = await restoreExecutionJobs();
        } catch (jobsError) {
          jobsRestoreError = `本地任务恢复失败：${errorMessage(jobsError)}。`;
        }
        if (!isCurrentLifecycle(operationLifecycle)) return;

        const previousProjectId = get().activeProject?.id;
        if (previousProjectId !== activeProject?.id) {
          revokeAssets(get().assets, dependencies);
        }
        set({
          projects,
          activeProject,
          jobs,
          warning: [dependencies.warning, jobsRestoreError].filter(Boolean).join(" ") || null,
          runtimeSettings,
          settingsLoading: false,
          settingsError: settingsRestoreError,
          connectionTestStatus: "idle",
          connectionTestMessage: null,
          textConnectionTestStatus: "idle",
          textConnectionTestMessage: null,
          imageConnectionTestStatus: "idle",
          imageConnectionTestMessage: null,
          copilotTarget: null,
          copilotFeedbackTarget: null,
          copilotError: null,
          copilotMessage: null,
          assets: previousProjectId === activeProject?.id ? get().assets : [],
          sessions: previousProjectId === activeProject?.id ? get().sessions : [],
          runs: previousProjectId === activeProject?.id ? get().runs : [],
          plans: previousProjectId === activeProject?.id ? get().plans : {},
          planInputSignatures:
            previousProjectId === activeProject?.id ? get().planInputSignatures : {},
          selectedSlotKeys:
            previousProjectId === activeProject?.id ? get().selectedSlotKeys : {},
          amazonPlannerMode:
            previousProjectId === activeProject?.id ? get().amazonPlannerMode : "listing",
          amazonWorkspaces:
            previousProjectId === activeProject?.id ? get().amazonWorkspaces : {},
          slotVersions:
            previousProjectId === activeProject?.id ? get().slotVersions : {},
          taskHistory: previousProjectId === activeProject?.id ? get().taskHistory : [],
          planningPlatformId: null,
          planningError: null,
          generatingSlot: null,
          generationCanceling: false,
          generationError: null,
          generationErrorTarget: null,
        });

        if (!activeProject) {
          set({ initialized: true, loading: false, resourceRestoreError: null });
          return;
        }

        let assets: WorkbenchAsset[] | null = null;
        let workspace: ProjectWorkspaceDocument | null = null;
        const restoreErrors: string[] = [];
        try {
          const loadedAssets = await loadAssetViews(activeProject.id, dependencies);
          assets = loadedAssets.assets;
          if (loadedAssets.cleanupWarnings.length > 0) {
            restoreErrors.push(
              `临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}`,
            );
          }
        } catch (error) {
          restoreErrors.push(`素材恢复失败：${errorMessage(error)}`);
        }
        try {
          workspace = await workspaceRepository.load(activeProject.id);
        } catch (error) {
          restoreErrors.push(`平台策划恢复失败：${errorMessage(error)}`);
        }

        if (!isCurrentLifecycle(operationLifecycle)) {
          if (assets) revokeAssets(assets, dependencies);
          return;
        }
        if (assets) {
          revokeAssets(get().assets, dependencies);
        }
        set({
          initialized: true,
          loading: false,
          ...(assets ? { assets } : {}),
          ...(workspace
            ? {
                plans: workspace.plans,
                sessions: workspace.sessions,
                runs: workspace.runs,
                planInputSignatures: workspace.planInputSignatures,
                selectedSlotKeys: selectedKeysFor(workspace),
                amazonPlannerMode: workspace.amazonPlannerMode ?? "listing",
                amazonWorkspaces: workspace.amazonWorkspaces ?? {},
                slotVersions: workspace.slotVersions,
                taskHistory: workspace.taskHistory,
              }
            : {}),
          ...(assets && workspace && restoreErrors.length === 0
            ? { generationRecoveryRequired: false }
            : {}),
          resourceRestoreError:
            restoreErrors.length > 0
              ? `项目已恢复，但${restoreErrors.join("；")}。可继续编辑商品资料，或重试恢复。`
              : null,
        });
      } catch (error) {
        if (!isCurrentLifecycle(operationLifecycle)) return;
        set({ initialized: true, loading: false, error: errorMessage(error) });
      }
    },

    async startAmazonSession(input) {
      const parsed = parseAmazonListingText(input.listingText);
      if (!parsed.title && parsed.bullets.length === 0 && !parsed.description) {
        set({ planningError: "请粘贴可识别的 Amazon Listing 标题、卖点或说明。" });
        return null;
      }
      const selectedMetadata = get().assets
        .filter(
          (asset) =>
            asset.metadata.kind === "reference" &&
            input.selectedReferenceAssetIds.includes(asset.metadata.id),
        )
        .map((asset) => asset.metadata);
      const referenceCount = selectedMetadata.length + input.files.length + (input.selectedStyleReferenceId ? 1 : 0);
      const referenceBytes =
        selectedMetadata.reduce((sum, asset) => sum + asset.size, 0) +
        input.files.reduce((sum, file) => sum + file.size, 0);
      if (referenceCount > GENERATION_REFERENCE_MAX_COUNT) {
        set({ planningError: `参考图最多 ${GENERATION_REFERENCE_MAX_COUNT} 张，当前为 ${referenceCount} 张。` });
        return null;
      }
      if (referenceBytes > GENERATION_REFERENCE_MAX_PAYLOAD_BYTES) {
        set({ planningError: "参考图总大小超过 8 MiB，请删除部分图片或换更小文件。" });
        return null;
      }
      const runtimeValidationError = validateRuntimeSettings(get().runtimeSettings);
      if (runtimeValidationError) {
        set({ planningError: `API 设置不可用：${runtimeValidationError}` });
        return null;
      }

      let createdProjectId: string | null = null;
      let project = input.projectId
        ? await dependencies.projectRepository.get(input.projectId)
        : null;
      try {
        if (project && get().activeProject?.id !== project.id) {
          await get().selectProject(project.id);
        }
        if (!project) {
          const facts = emptyFactsFromAmazonListing(input.listingText);
          project = await get().createProject({
            name: facts.productName || "Amazon 草稿商品",
            facts,
          });
          if (!project) throw new Error("草稿商品创建失败");
          createdProjectId = project.id;
        }

        const uploaded = input.files.length > 0
          ? await get().uploadReferenceFiles(input.files)
          : [];
        if (uploaded.length !== input.files.length) {
          throw new Error(get().error || "商品参考图保存失败");
        }
        if (uploaded.length !== input.files.length) {
          throw new Error(get().error || "参考图保存失败");
        }
        const selectedReferenceAssetIds = [
          ...new Set([
            ...selectedMetadata.map((asset) => asset.id),
            ...uploaded.map((asset) => asset.metadata.id),
          ]),
        ];
        let selectedStyleReferenceId: string | undefined;
        if (input.selectedStyleReferenceId?.startsWith("preset:")) {
          const presetId = input.selectedStyleReferenceId.slice("preset:".length);
          const existingStyle = get().assets.find(
            (asset) => asset.metadata.kind === "style-reference" &&
              asset.metadata.styleReference?.sourcePresetId === presetId &&
              asset.metadata.tags.includes("built-in"),
          );
          if (existingStyle) {
            selectedStyleReferenceId = existingStyle.metadata.id;
          } else {
            const preset = getAmazonStylePreset(presetId);
            if (preset) {
              const board = await createStyleReferenceBoardBitmap(preset);
              const storedStyle = await dependencies.assetRepository.put({
                projectId: project.id,
                blob: board.blob,
                metadata: {
                  name: `${preset.label}风格板`,
                  kind: "style-reference",
                  role: "amazon:style",
                  tags: ["style", "built-in", preset.id],
                  width: board.width,
                  height: board.height,
                  styleReference: board.definition,
                },
              });
              selectedStyleReferenceId = storedStyle.metadata.id;
              await get().refreshAssets();
            }
          }
        } else if (input.selectedStyleReferenceId) {
          const selected = await dependencies.assetRepository.get(input.selectedStyleReferenceId);
          if (selected?.metadata.kind === "style-reference" && selected.metadata.projectId === project.id) {
            selectedStyleReferenceId = selected.metadata.id;
          }
        }
        const plannerMode = input.workflowId === "amazon-aplus" ? "aplus" : "listing";
        const resolved = resolveAmazonPlanningSession({
          ...input.options,
          plannerMode,
        });
        const options: AmazonSessionOptions = {
          platformId: "amazon",
          marketplaceId: resolved.marketplaceId,
          plannerMode,
          listingImageCount: resolved.listingImageCount,
          aPlusType: resolved.aPlusType,
          aPlusModuleSpecs: resolved.aPlusModuleSpecs.map((spec) => ({ ...spec })),
          sizeTier: resolved.sizeTier,
          stylePresetId: resolved.stylePresetId,
        };
        const timestamp = now();
        let draftSession!: PlatformSession;
        await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(project!.id);
          const existing = [...workspace.sessions]
            .filter((session) => session.workflowId === input.workflowId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          draftSession = startSession({
            id: existing?.id ?? createStableId("session"),
            projectId: project!.id,
            platformId: "amazon",
            workflowId: input.workflowId,
            sourceInput: { listingText: input.listingText },
            options,
            selectedReferenceAssetIds,
            ...(selectedStyleReferenceId ? { selectedStyleReferenceId } : {}),
            slotVersions: {},
            ...(existing?.activeRunId ? { activeRunId: existing.activeRunId } : {}),
            createdAt: existing?.createdAt,
            now: timestamp,
          });
          const sessions = [
            ...workspace.sessions.filter((session) => session.id !== draftSession.id),
            draftSession,
          ];
          await workspaceRepository.save({ ...workspace, sessions, updatedAt: timestamp });
          set({ sessions });
        });

        const planningFacts = factsFromAmazonListing(project.facts, input.listingText);
        const referenceImages = (
          await Promise.all(
            selectedReferenceAssetIds.map(async (id) => {
              const stored = await dependencies.assetRepository.get(id);
              return stored
                ? { name: stored.metadata.name, mimeType: stored.metadata.mimeType, blob: stored.blob }
                : null;
            }),
          )
        ).filter((image): image is PlanningReferenceImage => image !== null);
        const activePlannerEngine =
          get().runtimeSettings.mode === "api" && dependencies.createPlannerEngine
            ? dependencies.createPlannerEngine(get().runtimeSettings)
            : plannerEngine;
        const controller = new AbortController();
        const requestId = ++planningRequestId;
        activePlanningController?.abort(new DOMException("已开始新的策划请求", "AbortError"));
        activePlanningController = controller;
        const timeout = setTimeout(
          () => controller.abort(new DOMException("AI 策划超时", "TimeoutError")),
          planningTimeoutMs,
        );
        set({ planningPlatformId: "amazon", planningError: null });
        try {
          const planningOptions: AmazonPlanningRequestOptions = {
            ...input.options,
            marketplaceId: resolved.marketplaceId,
            plannerMode,
            listingImageCount: resolved.listingImageCount,
            aPlusType: resolved.aPlusType,
            aPlusModuleSpecs: resolved.aPlusModuleSpecs,
            sizeTier: resolved.sizeTier,
            stylePresetId: resolved.stylePresetId,
          };
          const { rulePack } = resolvePlanningRulePack("amazon", planningOptions);
          const rawPlan = await activePlannerEngine.plan(
            planningFacts,
            rulePack,
            controller.signal,
            referenceImages,
            planningOptions,
          );
          const plan = normalizePlatformPlan(rawPlan, rulePack);
          const completedAt = now();
          const workspaceInputSignature = createPlanningInputSignature(
            project.facts,
            get().assets.map((asset) => asset.metadata),
          );
          const runId = createStableId("run");
          let savedSession!: PlatformSession;
          let savedRuns!: ProductionRun[];
          let taskHistory!: TaskRecord[];
          await enqueueWorkspaceMutation(async () => {
            const workspace = await workspaceRepository.load(project!.id);
            const committedPlan = commitPlan({
              projectId: project!.id,
              platformId: "amazon",
              workflowId: input.workflowId,
              source: plan.source,
              sourceInput: draftSession.sourceInput,
              options: draftSession.options,
              selectedReferenceAssetIds,
              ...(selectedStyleReferenceId ? { selectedStyleReferenceId } : {}),
              plan,
              planInputSignature: workspaceInputSignature,
              selectedSlotKey: plan.slots[0]?.slotKey,
              sessionId: draftSession.id,
              runId,
              eventId: createStableId("event"),
              now: completedAt,
              createdAt: draftSession.createdAt,
            });
            savedSession = committedPlan.session;
            const run = committedPlan.run;
            const sessions = [
              ...workspace.sessions.filter((session) => session.id !== savedSession.id),
              savedSession,
            ];
            savedRuns = [
              ...workspace.runs.map((item) =>
                draftSession.activeRunId === item.id
                  ? {
                      ...item,
                      planningInputSignatureSnapshot: item.planningInputSignatureSnapshot ?? draftSession.planInputSignature,
                      slotVersionsSnapshot: item.slotVersionsSnapshot ?? draftSession.slotVersions,
                    }
                  : item,
              ),
              run,
            ];
            taskHistory = workspace.taskHistory;
            let nextWorkspace: ProjectWorkspaceDocument = {
              ...workspace,
              sessions,
              runs: savedRuns,
              plans: { ...workspace.plans, amazon: plan },
              planInputSignatures: {
                ...workspace.planInputSignatures,
                amazon: workspaceInputSignature,
              },
              selectedSlotKeys: {
                ...workspace.selectedSlotKeys,
                amazon: plan.slots[0]?.slotKey,
              },
              slotVersions: { ...workspace.slotVersions, amazon: {} },
              taskHistory,
              updatedAt: completedAt,
            };
            nextWorkspace = withAmazonSnapshot(
              nextWorkspace,
              plan,
              workspaceInputSignature,
              plan.slots[0]?.slotKey,
            );
            await workspaceRepository.save(nextWorkspace);
          });
          if (requestId !== planningRequestId || get().activeProject?.id !== project.id) {
            return null;
          }
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === savedSession.id ? savedSession : session,
            ),
            runs: savedRuns,
            plans: { ...state.plans, amazon: plan },
            planInputSignatures: {
              ...state.planInputSignatures,
              amazon: workspaceInputSignature,
            },
            selectedSlotKeys: { ...state.selectedSlotKeys, amazon: plan.slots[0]?.slotKey },
            amazonPlannerMode: plannerMode,
            amazonWorkspaces: amazonWorkspacesWithSnapshot(
              state.amazonWorkspaces,
              plan,
              workspaceInputSignature,
              plan.slots[0]?.slotKey,
            ),
            slotVersions: { ...state.slotVersions, amazon: {} },
            taskHistory,
            planningPlatformId: null,
            planningError: null,
          }));
          return savedSession;
        } finally {
          clearTimeout(timeout);
          if (requestId === planningRequestId) activePlanningController = null;
        }
      } catch (error) {
        if (createdProjectId) {
          await dependencies.projectRepository.remove(createdProjectId);
          await dependencies.assetRepository.clearProject(createdProjectId);
          await workspaceRepository.remove?.(createdProjectId);
          revokeAssets(get().assets, dependencies);
          set({
            projects: await dependencies.projectRepository.list(),
            activeProject: null,
            assets: [],
            sessions: [],
            runs: [],
            plans: {},
            planInputSignatures: {},
            selectedSlotKeys: {},
            slotVersions: {},
            taskHistory: [],
          });
        }
        set({ planningPlatformId: null, planningError: planningErrorMessage(error) });
        return null;
      }
    },

    async startTaobaoSession(input) {
      const activeProject = input.projectId
        ? await dependencies.projectRepository.get(input.projectId)
        : get().activeProject;
      if (!activeProject) {
        set({ planningError: "请先创建或选择商品项目。" });
        return null;
      }
      if (get().activeProject?.id !== activeProject.id) {
        await get().selectProject(activeProject.id);
      }

      const referenceIds = [...new Set(input.selectedReferenceAssetIds)].filter((id) =>
        get().assets.some(
          (asset) => asset.metadata.id === id && asset.metadata.kind === "reference",
        ),
      );
      const timestamp = now();
      try {
        const session = await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(activeProject.id);
          const existing = [...workspace.sessions]
            .filter((candidate) => candidate.workflowId === "taobao-product")
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          const draft = startSession({
            id: existing?.id ?? createStableId("session"),
            projectId: activeProject.id,
            platformId: "taobao",
            workflowId: "taobao-product",
            sourceInput: existing?.sourceInput ?? { listingText: "" },
            options: { platformId: "taobao" },
            selectedReferenceAssetIds: referenceIds,
            ...(existing?.selectedStyleReferenceId
              ? { selectedStyleReferenceId: existing.selectedStyleReferenceId }
              : {}),
            ...(existing?.styleReferenceNotice
              ? { styleReferenceNotice: existing.styleReferenceNotice }
              : {}),
            ...(existing?.plan ? { plan: existing.plan } : {}),
            ...(existing?.planInputSignature
              ? { planInputSignature: existing.planInputSignature }
              : {}),
            ...(existing?.selectedSlotKey
              ? { selectedSlotKey: existing.selectedSlotKey }
              : {}),
            ...(existing?.activeRunId ? { activeRunId: existing.activeRunId } : {}),
            slotVersions: existing?.slotVersions ?? {},
            createdAt: existing?.createdAt,
            now: timestamp,
          });
          const sessions = [
            ...workspace.sessions.filter((candidate) => candidate.id !== draft.id),
            draft,
          ];
          await workspaceRepository.save({ ...workspace, sessions, updatedAt: timestamp });
          return draft;
        });
        if (get().activeProject?.id !== activeProject.id) return null;
        set({ sessions: [...get().sessions.filter((candidate) => candidate.id !== session.id), session], planningError: null });
        return session;
      } catch (error) {
        set({ planningError: `淘宝商品工作流启动失败：${errorMessage(error)}` });
        return null;
      }
    },

    async analyzeTaobaoProduct(input) {
      if (!input.productText.trim() && input.files.length === 0 && input.selectedReferenceAssetIds.length === 0) {
        set({ planningError: "请先补充商品资料或选择至少一张商品参考图。" });
        return null;
      }
      const project = input.projectId
        ? await dependencies.projectRepository.get(input.projectId)
        : get().activeProject;
      if (!project) {
        set({ planningError: "请先创建或选择商品项目。" });
        return null;
      }
      if (get().activeProject?.id !== project.id) {
        await get().selectProject(project.id);
      }

      try {
        const uploaded = input.files.length > 0
          ? await get().uploadReferenceFiles(input.files)
          : [];
        const selectedReferenceAssetIds = [
          ...new Set([
            ...input.selectedReferenceAssetIds,
            ...uploaded.map((asset) => asset.metadata.id),
          ]),
        ].filter((id) =>
          get().assets.some(
            (asset) => asset.metadata.id === id && asset.metadata.kind === "reference",
          ),
        );
        const session = await get().startTaobaoSession({
          projectId: project.id,
          selectedReferenceAssetIds,
        });
        if (!session) return null;
        const referenceAssets = selectedReferenceAssetIds.flatMap((id) => {
          const asset = get().assets.find((candidate) => candidate.metadata.id === id);
          return asset ? [{ id, name: asset.metadata.name }] : [];
        });
        const analysis = analyzeTaobaoProduct({
          facts: project.facts,
          productText: input.productText,
          referenceAssets,
        });
        const sourceInput = {
          ...session.sourceInput,
          taobaoProduct: {
            productText: input.productText,
            selectedReferenceAssetIds,
          },
        };
        const timestamp = now();
        const committedSession = await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(project.id);
          const currentSession = workspace.sessions.find((candidate) => candidate.id === session.id) ?? session;
          const nextSession = commitAnalysis(currentSession, sourceInput, analysis, timestamp);
          const sessions = [
            ...workspace.sessions.filter((candidate) => candidate.id !== nextSession.id),
            nextSession,
          ];
          await workspaceRepository.save({ ...workspace, sessions, updatedAt: timestamp });
          return nextSession;
        });
        if (get().activeProject?.id !== project.id) return null;
        set({
          sessions: [
            ...get().sessions.filter((candidate) => candidate.id !== committedSession.id),
            committedSession,
          ],
          planningError: null,
        });
        return committedSession;
      } catch (error) {
        set({ planningError: `淘宝商品分析失败：${errorMessage(error)}` });
        return null;
      }
    },

    async syncAmazonSessionFacts(sessionId) {
      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      const activeProject = get().activeProject;
      if (!session || !activeProject || session.projectId !== activeProject.id) return false;
      const patch = listingParseToFactsPatch(parseAmazonListingText(session.sourceInput.listingText));
      const updated = await get().updateActiveProject({ facts: patch });
      return Boolean(updated);
    },

    async syncAmazonListingFacts(listingText) {
      const activeProject = get().activeProject;
      if (!activeProject) return false;
      const patch = listingParseToFactsPatch(parseAmazonListingText(listingText));
      if (
        patch.productName === undefined &&
        patch.sellingPoints === undefined &&
        patch.description === undefined
      ) {
        return false;
      }
      return Boolean(await get().updateActiveProject({ facts: patch }));
    },

    async createProject(input) {
      const operationLifecycle = lifecycleVersion;
      invalidatePlanning();
      invalidateGeneration();
      invalidateExport();
      invalidateCopilot();
      set({
        loading: true,
        error: null,
        generatingSlot: null,
        generationCanceling: false,
        generationRecoveryRequired: false,
        generationError: null,
        generationErrorTarget: null,
        taskHistory: [],
        exportingPlatform: null,
        exportError: null,
        exportErrorPlatform: null,
        copilotTarget: null,
        copilotFeedbackTarget: null,
        copilotError: null,
        copilotMessage: null,
      });
      try {
        const project = await dependencies.projectRepository.create(input);
        const projects = await dependencies.projectRepository.list();
        if (!isCurrentLifecycle(operationLifecycle)) return project;
        revokeAssets(get().assets, dependencies);
        set({
          loading: false,
          projects,
          activeProject: project,
          assets: [],
          sessions: [],
          runs: [],
          plans: {},
          planInputSignatures: {},
          selectedSlotKeys: {},
          amazonPlannerMode: "listing",
          amazonWorkspaces: {},
          slotVersions: {},
          planningPlatformId: null,
          planningError: null,
          generatingSlot: null,
          generationCanceling: false,
          generationRecoveryRequired: false,
          generationError: null,
          generationErrorTarget: null,
        });
        return project;
      } catch (error) {
        if (!isCurrentLifecycle(operationLifecycle)) return null;
        set({ loading: false, error: errorMessage(error) });
        return null;
      }
    },

    async updateActiveProject(input) {
      const operationLifecycle = lifecycleVersion;
      const activeProject = get().activeProject;
      if (!activeProject) {
        set({ error: "请先选择商品项目" });
        return null;
      }
      if (get().planningPlatformId) {
        set({ error: "当前正在生成平台策划，请完成或取消后再保存商品资料。" });
        return null;
      }
      if (get().copilotTarget) {
        set({ error: "当前 Copilot 请求正在处理，请完成或取消后再保存商品资料。" });
        return null;
      }
      if (get().exportingPlatform) {
        set({ error: "当前正在导出交付包，请完成后再保存商品资料。" });
        return null;
      }
      if (get().generationRecoveryRequired) {
        set({ error: "当前图片版本与素材需要恢复，请完成恢复后再保存商品资料。" });
        return null;
      }
      if (get().generatingSlot) {
        set({ error: "当前正在生成图片，请完成或取消后再保存商品资料。" });
        return null;
      }

      set({ loading: true, error: null });
      try {
        const updated = await dependencies.projectRepository.update(activeProject.id, input);
        if (!updated) {
          throw new Error("当前商品项目不存在或已被删除");
        }
        if (!isCurrentLifecycle(operationLifecycle)) return updated;
        set((state) => ({
          loading: false,
          activeProject: updated,
          projects: state.projects.map((project) =>
            project.id === updated.id ? updated : project,
          ),
        }));
        return updated;
      } catch (error) {
        if (!isCurrentLifecycle(operationLifecycle)) return null;
        set({ loading: false, error: errorMessage(error) });
        return null;
      }
    },

    async removeProject(id) {
      const project =
        get().projects.find((candidate) => candidate.id === id) ??
        (await dependencies.projectRepository.get(id));
      if (!project) {
        set({ error: "要删除的商品项目不存在" });
        return false;
      }
      if (
        get().planningPlatformId ||
        get().generatingSlot ||
        get().copilotTarget ||
        get().exportingPlatform ||
        get().generationRecoveryRequired
      ) {
        set({ error: "当前有进行中的任务，请完成或取消后再删除商品项目。" });
        return false;
      }

      invalidatePlanning();
      invalidateGeneration();
      invalidateExport();
      invalidateCopilot();
      lifecycleVersion += 1;
      set({ loading: true, error: null });
      try {
        await dependencies.assetRepository.clearProject(id);
        await workspaceRepository.remove?.(id);
        await dependencies.projectRepository.remove(id);
        const projects = await dependencies.projectRepository.list();
        revokeAssets(get().assets, dependencies);
        const nextProject = projects
          .filter((candidate) => candidate.id !== id)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
        set({
          loading: false,
          projects,
          activeProject: null,
          assets: [],
          sessions: [],
          runs: [],
          plans: {},
          planInputSignatures: {},
          selectedSlotKeys: {},
          amazonPlannerMode: "listing",
          amazonWorkspaces: {},
          slotVersions: {},
          taskHistory: [],
          planningPlatformId: null,
          planningError: null,
          resourceRestoreError: null,
        });
        if (nextProject) {
          await get().selectProject(nextProject.id);
        }
        return true;
      } catch (error) {
        set({ loading: false, error: errorMessage(error) });
        return false;
      }
    },

    async selectProject(id) {
      const operationLifecycle = lifecycleVersion;
      invalidatePlanning();
      invalidateGeneration();
      invalidateExport();
      invalidateCopilot();
      set({
        loading: true,
        error: null,
        generatingSlot: null,
        generationCanceling: false,
        generationRecoveryRequired: false,
        generationError: null,
        generationErrorTarget: null,
        taskHistory: [],
        exportingPlatform: null,
        exportError: null,
        exportErrorPlatform: null,
        copilotTarget: null,
        copilotFeedbackTarget: null,
        copilotError: null,
        copilotMessage: null,
      });
      let nextAssets: WorkbenchAsset[] | null = null;
      try {
        const project =
          get().projects.find((candidate) => candidate.id === id) ??
          (await dependencies.projectRepository.get(id));
        if (!project) {
          throw new Error("要切换的商品项目不存在");
        }

        const [loadedAssets, workspace] = await Promise.all([
          loadAssetViews(project.id, dependencies),
          workspaceRepository.load(project.id),
        ]);
        nextAssets = loadedAssets.assets;
        if (!isCurrentLifecycle(operationLifecycle)) {
          revokeAssets(nextAssets, dependencies);
          return;
        }
        await dependencies.projectRepository.setActiveId(project.id);
        if (!isCurrentLifecycle(operationLifecycle)) {
          revokeAssets(nextAssets, dependencies);
          return;
        }
        revokeAssets(get().assets, dependencies);
        set((state) => ({
          loading: false,
          activeProject: project,
          assets: nextAssets ?? [],
          sessions: workspace.sessions,
          runs: workspace.runs,
          plans: workspace.plans,
          planInputSignatures: workspace.planInputSignatures,
          selectedSlotKeys: selectedKeysFor(workspace),
          amazonPlannerMode: workspace.amazonPlannerMode ?? "listing",
          amazonWorkspaces: workspace.amazonWorkspaces ?? {},
          slotVersions: workspace.slotVersions,
          taskHistory: workspace.taskHistory,
          planningPlatformId: null,
          planningError: null,
          generatingSlot: null,
          generationCanceling: false,
          generationRecoveryRequired: false,
          generationError: null,
          generationErrorTarget: null,
          resourceRestoreError:
            loadedAssets.cleanupWarnings.length > 0
              ? `项目已恢复，但临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}。可再次重试恢复。`
              : null,
          projects: state.projects.some((candidate) => candidate.id === project.id)
            ? state.projects
            : [...state.projects, project],
        }));
      } catch (error) {
        if (nextAssets) {
          revokeAssets(nextAssets, dependencies);
        }
        if (!isCurrentLifecycle(operationLifecycle)) return;
        set({ loading: false, error: errorMessage(error) });
      }
    },

    async uploadReferenceFiles(files) {
      const operationLifecycle = lifecycleVersion;
      const activeProject = get().activeProject;
      if (!activeProject) {
        set({ error: "请先选择商品项目" });
        return [];
      }
      if (
        get().planningPlatformId ||
        get().generatingSlot ||
        get().copilotTarget ||
        get().exportingPlatform ||
        get().generationRecoveryRequired
      ) {
        set({ error: "当前有策划、生成、Copilot、导出或恢复任务，请完成后再修改参考素材。" });
        return [];
      }

      set({ loading: true, error: null });
      const uploadedAssetIds: string[] = [];
      try {
        for (const file of files) {
          const compressed = await dependencies.compressImageFile(file);
          const stored = await dependencies.assetRepository.put({
            projectId: activeProject.id,
            blob: compressed,
            metadata: {
              name: compressed.name,
              kind: "reference",
              role: "reference",
            },
          });
          uploadedAssetIds.push(stored.metadata.id);
        }

        const loadedAssets = await loadAssetViews(activeProject.id, dependencies);
        const assets = loadedAssets.assets;
        if (!isCurrentLifecycle(operationLifecycle)) {
          revokeAssets(assets, dependencies);
          return [];
        }
        revokeAssets(get().assets, dependencies);
        set({
          loading: false,
          assets,
          resourceRestoreError:
            loadedAssets.cleanupWarnings.length > 0
              ? `临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}。可重试恢复。`
              : get().resourceRestoreError,
        });
        return assets;
      } catch (error) {
        const rollbackErrors: string[] = [];
        for (const id of uploadedAssetIds.reverse()) {
          try {
            await dependencies.assetRepository.remove(id);
          } catch (rollbackError) {
            rollbackErrors.push(errorMessage(rollbackError));
          }
        }

        const messages = [errorMessage(error)];
        if (rollbackErrors.length > 0) {
          messages.push(`素材回滚失败：${rollbackErrors.join("；")}`);
        }

        try {
          const loadedAssets = await loadAssetViews(activeProject.id, dependencies);
          const assets = loadedAssets.assets;
          if (!isCurrentLifecycle(operationLifecycle)) {
            revokeAssets(assets, dependencies);
          } else {
            revokeAssets(get().assets, dependencies);
            set({
              assets,
              resourceRestoreError:
                loadedAssets.cleanupWarnings.length > 0
                  ? `临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}。可重试恢复。`
                  : get().resourceRestoreError,
            });
          }
        } catch (refreshError) {
          messages.push(`素材状态刷新失败：${errorMessage(refreshError)}`);
        }

        if (!isCurrentLifecycle(operationLifecycle)) return [];
        set({ loading: false, error: messages.join("；") });
        return [];
      }
    },

    async createStyleReference(presetId, draft = {}) {
      const activeProject = get().activeProject;
      const preset = getAmazonStylePreset(presetId);
      if (!activeProject || !preset) {
        set({ error: !activeProject ? "请先选择商品项目" : "未找到可用的内置风格。" });
        return null;
      }
      try {
        const board = await createStyleReferenceBoardBitmap(preset, draft);
        const stored = await dependencies.assetRepository.put({
          projectId: activeProject.id,
          blob: board.blob,
          metadata: {
            name: `${board.definition.name}风格板`,
            kind: "style-reference",
            role: "amazon:style",
            tags: ["style", "custom", preset.id],
            width: board.width,
            height: board.height,
            styleReference: board.definition,
          },
        });
        const loaded = await loadAssetViews(activeProject.id, dependencies);
        revokeAssets(get().assets, dependencies);
        set({ assets: loaded.assets, error: null });
        return loaded.assets.find((asset) => asset.metadata.id === stored.metadata.id) ?? null;
      } catch (error) {
        set({ error: `风格板预览保存失败：${errorMessage(error)}。仍可使用文本 preset。` });
        return null;
      }
    },

    async removeAsset(id) {
      const operationLifecycle = lifecycleVersion;
      if (
        get().planningPlatformId ||
        get().generatingSlot ||
        get().copilotTarget ||
        get().exportingPlatform ||
        get().generationRecoveryRequired
      ) {
        set({ error: "当前有策划、生成、Copilot、导出或恢复任务，请完成后再修改参考素材。" });
        return;
      }
      set({ loading: true, error: null });
      try {
        const activeProject = get().activeProject;
        let nextSessions = get().sessions;
        if (activeProject && nextSessions.some((session) => session.selectedStyleReferenceId === id)) {
          const timestamp = now();
          await enqueueWorkspaceMutation(async () => {
            const workspace = await workspaceRepository.load(activeProject.id);
            nextSessions = workspace.sessions.map((session) =>
              session.selectedStyleReferenceId === id
                ? {
                    ...session,
                    selectedStyleReferenceId: undefined,
                    styleReferenceNotice: "原风格板已删除，已降级为文本风格。",
                    updatedAt: timestamp,
                  }
                : session,
            );
            await workspaceRepository.save({ ...workspace, sessions: nextSessions, updatedAt: timestamp });
          });
        }
        await dependencies.assetRepository.remove(id);
        if (!isCurrentLifecycle(operationLifecycle)) return;
        const removed = get().assets.find((asset) => asset.metadata.id === id);
        if (removed) {
          dependencies.revokeObjectURL(removed.objectUrl);
        }
        set((state) => ({
          loading: false,
          assets: state.assets.filter((asset) => asset.metadata.id !== id),
          sessions: nextSessions,
          planningError: nextSessions.some((session) => session.styleReferenceNotice)
            ? "正在使用的风格板已删除，相关 session 已降级为文本风格。"
            : state.planningError,
        }));
      } catch (error) {
        if (!isCurrentLifecycle(operationLifecycle)) return;
        set({ loading: false, error: errorMessage(error) });
      }
    },

    async refreshAssets() {
      const operationLifecycle = lifecycleVersion;
      const activeProject = get().activeProject;
      if (!activeProject) {
        revokeAssets(get().assets, dependencies);
        set({ assets: [], error: null });
        return;
      }

      set({ loading: true, error: null });
      try {
        const loadedAssets = await loadAssetViews(activeProject.id, dependencies);
        const assets = loadedAssets.assets;
        if (!isCurrentLifecycle(operationLifecycle)) {
          revokeAssets(assets, dependencies);
          return;
        }
        revokeAssets(get().assets, dependencies);
        set({
          loading: false,
          assets,
          resourceRestoreError:
            loadedAssets.cleanupWarnings.length > 0
              ? `临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}。可重试恢复。`
              : get().resourceRestoreError,
        });
      } catch (error) {
        if (!isCurrentLifecycle(operationLifecycle)) return;
        set({ loading: false, error: errorMessage(error) });
      }
    },

    async selectAmazonPlannerMode(mode) {
      const activeProject = get().activeProject;
      if (!activeProject) return false;
      if (
        get().planningPlatformId ||
        get().generatingSlot ||
        get().copilotTarget ||
        get().exportingPlatform ||
        get().generationRecoveryRequired
      ) {
        return false;
      }

      try {
        const workspace = await workspaceRepository.load(activeProject.id);
        const snapshot = workspace.amazonWorkspaces?.[mode] ?? get().amazonWorkspaces[mode];
        const keepLegacy =
          !snapshot && workspace.plans.amazon?.amazonSession?.plannerMode === "legacy-combined";
        const plans = snapshot
          ? { ...workspace.plans, amazon: snapshot.plan }
          : keepLegacy
            ? workspace.plans
            : withoutRecordKey(workspace.plans, "amazon");
        const planInputSignatures = snapshot?.planInputSignature
          ? { ...workspace.planInputSignatures, amazon: snapshot.planInputSignature }
          : keepLegacy
            ? workspace.planInputSignatures
            : withoutRecordKey(workspace.planInputSignatures, "amazon");
        const selectedSlotKeys = snapshot?.selectedSlotKey
          ? { ...workspace.selectedSlotKeys, amazon: snapshot.selectedSlotKey }
          : keepLegacy
            ? workspace.selectedSlotKeys
            : withoutRecordKey(workspace.selectedSlotKeys, "amazon");
        await workspaceRepository.save({
          ...workspace,
          plans,
          planInputSignatures,
          selectedSlotKeys,
          amazonPlannerMode: mode,
          updatedAt: now(),
        });
        if (get().activeProject?.id !== activeProject.id) return false;
        set({
          plans,
          planInputSignatures,
          selectedSlotKeys,
          amazonPlannerMode: mode,
          amazonWorkspaces: workspace.amazonWorkspaces ?? get().amazonWorkspaces,
          planningError: null,
        });
        return true;
      } catch (error) {
        if (get().activeProject?.id === activeProject.id) {
          set({ planningError: `Amazon 模式切换未能保存：${errorMessage(error)}` });
        }
        return false;
      }
    },

    async planPlatform(platformId, amazonOptions) {
      const activeProject = get().activeProject;
      if (!activeProject) {
        set({ planningError: "请先创建或选择商品项目。" });
        return null;
      }
      if (get().loading) {
        set({ planningError: "工作台正在加载或保存项目与素材，请完成后再生成平台策划。" });
        return null;
      }
      const activePlanningPlatformId = get().planningPlatformId;
      if (activePlanningPlatformId) {
        set({
          planningError: `${getPlatformRulePack(activePlanningPlatformId).label} 正在生成平台策划，请完成或取消后再发起新的策划。`,
        });
        return null;
      }
      if (get().generationCanceling || get().generationRecoveryRequired) {
        set({ planningError: "图片生成正在取消或等待恢复，请完成恢复后再重新策划。" });
        return null;
      }
      if (get().generatingSlot?.platformId === platformId) {
        set({ planningError: "当前平台正在生成图片，请完成或取消后再重新策划。" });
        return null;
      }
      if (get().copilotTarget) {
        set({ planningError: "当前有 Copilot 请求正在处理，请完成或取消后再重新策划。" });
        return null;
      }
      const runtimeValidationError = validateRuntimeSettings(get().runtimeSettings);
      if (runtimeValidationError) {
        set({ planningError: `API 设置不可用：${runtimeValidationError}` });
        return null;
      }

      const operationLifecycle = lifecycleVersion;
      const requestId = ++planningRequestId;
      activePlanningController?.abort(new DOMException("已开始新的策划请求", "AbortError"));
      const controller = new AbortController();
      activePlanningController = controller;
      const projectId = activeProject.id;
      const baseRulePack = getPlatformRulePack(platformId);
      const planningSession = platformId === "taobao"
        ? [...get().sessions]
            .filter((session) => session.workflowId === "taobao-product")
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
        : undefined;
      const planningFacts = resolveSessionEffectiveFacts(activeProject, planningSession);
      // Amazon UI passes split-session options. Missing options remain a compatibility path
      // for callers restoring a pre-session combined plan; planners still stamp the session.
      const inputSignature = createPlanningInputSignature(
        planningFacts,
        get().assets.map((asset) => asset.metadata),
      );
      const timeout = setTimeout(() => {
        controller.abort(new DOMException("AI 策划超时", "TimeoutError"));
      }, planningTimeoutMs);
      let workspaceRollbackError: unknown = null;
      const isPlanningOwnerCurrent = () =>
        !controller.signal.aborted &&
        isCurrentLifecycle(operationLifecycle) &&
        requestId === planningRequestId &&
        get().activeProject?.id === projectId;
      const ensureCurrentPlanning = () => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException("策划已取消", "AbortError");
        }
        if (!isPlanningOwnerCurrent()) {
          throw new DOMException("策划结果已过期", "AbortError");
        }
      };

      set({ planningPlatformId: platformId, planningError: null });

      try {
        const referenceImages = (
          await Promise.all(
            get()
              .assets.filter((asset) => asset.metadata.kind === "reference")
              .map(async (asset) => {
                const stored = await dependencies.assetRepository.get(asset.metadata.id);
                return stored
                  ? {
                      name: stored.metadata.name,
                      mimeType: stored.metadata.mimeType,
                      blob: stored.blob,
                    }
                  : null;
              }),
          )
        ).filter((image): image is PlanningReferenceImage => image !== null);
        ensureCurrentPlanning();
        const activePlannerEngine =
          get().runtimeSettings.mode === "api" && dependencies.createPlannerEngine
            ? dependencies.createPlannerEngine(get().runtimeSettings)
            : plannerEngine;
        const rawPlan = await activePlannerEngine.plan(
          planningFacts,
          baseRulePack,
          controller.signal,
          referenceImages,
          platformId === "amazon" ? amazonOptions : undefined,
        );
        ensureCurrentPlanning();
        const plan = normalizePlatformPlan(rawPlan, baseRulePack);
        ensureCurrentPlanning();

        const { selectedSlotKey, taskHistory, sessions, runs } = await enqueueWorkspaceMutation(async () => {
          ensureCurrentPlanning();
          const workspace = await workspaceRepository.load(projectId);
          ensureCurrentPlanning();
          const planMode = platformId === "amazon" ? amazonModeForPlan(plan) : null;
          const currentSelected =
            planMode && workspace.amazonWorkspaces?.[planMode]?.selectedSlotKey
              ? workspace.amazonWorkspaces[planMode]?.selectedSlotKey
              : workspace.selectedSlotKeys[platformId];
          const selectedSlotKey = plan.slots.some((slot) => slot.slotKey === currentSelected)
            ? currentSelected
            : plan.slots[0]?.slotKey;
          const taskHistory = workspace.taskHistory;
          const completedAt = now();
          const workflowId = workflowForPlan(platformId, plan);
          const existingSession = [...workspace.sessions]
            .filter((session) => session.workflowId === workflowId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          const runId = createStableId("run");
          const { session, run } = commitPlan({
            projectId,
            platformId,
            workflowId,
            source: plan.source,
            sourceInput: existingSession?.sourceInput ?? { listingText: "" },
            options: optionsForPlan(platformId, plan),
            selectedReferenceAssetIds: existingSession?.selectedReferenceAssetIds ??
              get().assets.filter((asset) => asset.metadata.kind === "reference").map((asset) => asset.metadata.id),
            ...(existingSession?.selectedStyleReferenceId
              ? { selectedStyleReferenceId: existingSession.selectedStyleReferenceId }
              : {}),
            ...(existingSession?.taobaoAnalysis
              ? { taobaoAnalysis: existingSession.taobaoAnalysis }
              : {}),
            plan,
            planInputSignature: inputSignature,
            selectedSlotKey,
            sessionId: existingSession?.id ?? createStableId("session"),
            runId,
            eventId: createStableId("event"),
            now: completedAt,
            createdAt: existingSession?.createdAt,
          });
          const sessions = [
            ...workspace.sessions.filter((item) => item.id !== session.id),
            session,
          ];
          const runs = [
            ...workspace.runs.map((run) =>
              existingSession?.activeRunId === run.id
                ? {
                    ...run,
                    planningInputSignatureSnapshot: run.planningInputSignatureSnapshot ?? existingSession.planInputSignature,
                    slotVersionsSnapshot: run.slotVersionsSnapshot ?? existingSession.slotVersions,
                  }
                : run,
            ),
            run,
          ];
          let nextWorkspace: ProjectWorkspaceDocument = {
            ...workspace,
            sessions,
            runs,
            plans: { ...workspace.plans, [platformId]: plan },
            planInputSignatures: {
              ...workspace.planInputSignatures,
              [platformId]: inputSignature,
            },
            selectedSlotKeys: {
              ...workspace.selectedSlotKeys,
              [platformId]: selectedSlotKey,
            },
            slotVersions: { ...workspace.slotVersions, [platformId]: {} },
            taskHistory,
            updatedAt: now(),
          };
          if (platformId === "amazon") {
            nextWorkspace = withAmazonSnapshot(
              nextWorkspace,
              plan,
              inputSignature,
              selectedSlotKey,
            );
          }
          await workspaceRepository.save(nextWorkspace);
          try {
            ensureCurrentPlanning();
          } catch (staleError) {
            try {
              await workspaceRepository.save(workspace);
            } catch (rollbackError) {
              workspaceRollbackError = rollbackError;
            }
            throw staleError;
          }
          return { selectedSlotKey, taskHistory, sessions, runs };
        });
        ensureCurrentPlanning();

        set((state) => ({
          plans: { ...state.plans, [platformId]: plan },
          planInputSignatures: {
            ...state.planInputSignatures,
            [platformId]: inputSignature,
          },
          selectedSlotKeys: {
            ...state.selectedSlotKeys,
            [platformId]: selectedSlotKey,
          },
          ...(platformId === "amazon" && amazonModeForPlan(plan)
            ? {
                amazonPlannerMode: amazonModeForPlan(plan)!,
                amazonWorkspaces: amazonWorkspacesWithSnapshot(
                  state.amazonWorkspaces,
                  plan,
                  inputSignature,
                  selectedSlotKey,
                ),
              }
            : {}),
          taskHistory,
          sessions,
          runs,
          slotVersions: { ...state.slotVersions, [platformId]: {} },
          planningPlatformId: null,
          planningError: null,
        }));
        return plan;
      } catch (error) {
        if (workspaceRollbackError) {
          if (isCurrentLifecycle(operationLifecycle) && get().activeProject?.id === projectId) {
            set({
              planningPlatformId: null,
              generationRecoveryRequired: true,
              planningError: `策划未能完成，且保存后的工作区回滚失败：${errorMessage(workspaceRollbackError)}。请点击“重试恢复”确认策划与历史状态。`,
              resourceRestoreError:
                "策划保存后的工作区回滚失败，策划与历史状态可能已经变化。请点击“重试恢复”。",
            });
          }
          return null;
        }
        if (
          !isCurrentLifecycle(operationLifecycle) ||
          requestId !== planningRequestId ||
          get().activeProject?.id !== projectId
        ) {
          return null;
        }
        set({ planningPlatformId: null, planningError: planningErrorMessage(error) });
        return null;
      } finally {
        clearTimeout(timeout);
        if (requestId === planningRequestId) {
          activePlanningController = null;
        }
      }
    },

    cancelPlanning() {
      if (!activePlanningController) return;
      invalidatePlanning();
      set({
        planningPlatformId: null,
        planningError: "已取消本次策划，商品资料和已有结果未受影响。",
      });
    },

    async selectSessionSlot(sessionId, slotKey) {
      const session = get().sessions.find((item) => item.id === sessionId);
      if (
        !session ||
        !session.plan?.slots.some((slot) => slot.slotKey === slotKey)
      ) {
        return false;
      }
      if (session.projectId !== get().activeProject?.id) return false;
      if (
        session.platformId === "amazon" &&
        get().plans.amazon?.amazonSession?.plannerMode !== session.plan.amazonSession?.plannerMode
      ) return false;
      return get().selectPlannedSlot(session.platformId, slotKey);
    },

    async selectPlannedSlot(platformId, slotKey) {
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      if (!activeProject || !plan?.slots.some((slot) => slot.slotKey === slotKey)) return false;
      if (get().planningPlatformId === platformId) return false;
      if (get().generationCanceling || get().generationRecoveryRequired) return false;
      const requestId = planningRequestId;
      let nextSessions = get().sessions;
      set((state) => ({
        selectedSlotKeys: { ...state.selectedSlotKeys, [platformId]: slotKey },
      }));
      try {
        await enqueueWorkspaceMutation(async () => {
          if (
            requestId !== planningRequestId ||
            get().activeProject?.id !== activeProject.id ||
            get().planningPlatformId === platformId
          ) {
            throw new DOMException("槽位选择已过期", "AbortError");
          }
          const workspace = await workspaceRepository.load(activeProject.id);
          const workflowId = workflowForPlan(platformId, plan);
          const sessionToUpdate = [...workspace.sessions]
            .filter((session) => session.workflowId === workflowId && Boolean(session.plan))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          nextSessions = sessionToUpdate
            ? workspace.sessions.map((session) =>
                session.id === sessionToUpdate.id
                  ? { ...session, selectedSlotKey: slotKey, updatedAt: new Date().toISOString() }
                  : session,
              )
            : workspace.sessions;
          await workspaceRepository.save({
            ...workspace,
            sessions: nextSessions,
            selectedSlotKeys: { ...workspace.selectedSlotKeys, [platformId]: slotKey },
            ...(platformId === "amazon" && amazonModeForPlan(plan)
              ? {
                  amazonWorkspaces: amazonWorkspacesWithSnapshot(
                    workspace.amazonWorkspaces ?? {},
                    plan,
                    workspace.planInputSignatures.amazon,
                    slotKey,
                  ),
                }
              : {}),
            updatedAt: new Date().toISOString(),
          });
        });
        set({ sessions: nextSessions });
        return true;
      } catch (error) {
        if (requestId !== planningRequestId || get().activeProject?.id !== activeProject.id) {
          return false;
        }
        set({ planningError: `槽位选择未能保存：${errorMessage(error)}` });
        return false;
      }
    },

    async updatePlannedSlot(platformId, slotKey, patch) {
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      if (!activeProject || !plan) {
        set({ planningError: "当前平台还没有可编辑的策划结果。" });
        return false;
      }
      if (!hasCurrentPlanningInputs(get(), platformId)) {
        set({ planningError: STALE_PLAN_MESSAGE });
        return false;
      }
      if (get().generationCanceling || get().generationRecoveryRequired) {
        set({ planningError: "图片生成正在取消或等待恢复，请完成恢复后再保存文案与提示词。" });
        return false;
      }
      if (get().planningPlatformId === platformId) {
        set({ planningError: "当前平台正在重新策划，请完成或取消后再保存文案与提示词。" });
        return false;
      }
      if (
        get().generatingSlot?.platformId === platformId &&
        get().generatingSlot?.slotKey === slotKey
      ) {
        set({ planningError: "当前槽位正在生成图片，请完成或取消后再保存文案与提示词。" });
        return false;
      }
      if (
        get().copilotTarget?.platformId === platformId &&
        get().copilotTarget?.slotKey === slotKey
      ) {
        set({ planningError: "当前槽位的 Copilot 请求正在处理，请完成或取消后再保存文案与提示词。" });
        return false;
      }
      const requestId = planningRequestId;

      try {
        const { nextPlan, nextSessions, nextRuns } = await enqueueWorkspaceMutation(async () => {
          if (
            requestId !== planningRequestId ||
            get().activeProject?.id !== activeProject.id ||
            get().planningPlatformId === platformId
          ) {
            throw new DOMException("槽位草稿已过期", "AbortError");
          }
          const workspace = await workspaceRepository.load(activeProject.id);
          const currentPlan = workspace.plans[platformId] ?? plan;
          const workflowId = workflowForPlan(platformId, currentPlan);
          const sessionToUpdate = [...workspace.sessions]
            .filter((session) => session.workflowId === workflowId && Boolean(session.plan))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          const timestamp = now();
          const updatedSession = sessionToUpdate
            ? updateSessionSlot(
                { ...sessionToUpdate, plan: currentPlan },
                slotKey,
                patch,
                timestamp,
              )
            : null;
          const nextPlan = normalizePlatformPlan(
            updatedSession?.plan ?? {
              ...currentPlan,
              slots: currentPlan.slots.map((slot) =>
                slot.slotKey === slotKey ? { ...slot, ...patch } : slot,
              ),
            },
            resolveRulePackForPlan(platformId, get().plans[platformId]),
          );
          const nextSessions = sessionToUpdate
            ? workspace.sessions.map((session) =>
                session.id === sessionToUpdate.id
                  ? { ...updatedSession!, plan: nextPlan }
                  : session,
              )
            : workspace.sessions;
          const nextRuns = sessionToUpdate?.activeRunId
            ? workspace.runs.map((run) => run.id === sessionToUpdate.activeRunId
                ? { ...run, planSnapshot: nextPlan, updatedAt: now() }
                : run)
            : workspace.runs;
          let nextWorkspace: ProjectWorkspaceDocument = {
            ...workspace,
            sessions: nextSessions,
            runs: nextRuns,
            plans: { ...workspace.plans, [platformId]: nextPlan },
            selectedSlotKeys: {
              ...workspace.selectedSlotKeys,
              [platformId]: slotKey,
            },
            updatedAt: timestamp,
          };
          if (platformId === "amazon") {
            nextWorkspace = withAmazonSnapshot(
              nextWorkspace,
              nextPlan,
              workspace.planInputSignatures.amazon,
              slotKey,
            );
          }
          await workspaceRepository.save(nextWorkspace);
          return { nextPlan, nextSessions, nextRuns };
        });
        if (
          requestId !== planningRequestId ||
          get().activeProject?.id !== activeProject.id ||
          get().planningPlatformId === platformId
        ) {
          return false;
        }
        set((state) => ({
          plans: { ...state.plans, [platformId]: nextPlan },
          sessions: nextSessions,
          runs: nextRuns,
          selectedSlotKeys: { ...state.selectedSlotKeys, [platformId]: slotKey },
          ...(platformId === "amazon" && amazonModeForPlan(nextPlan)
            ? {
                amazonWorkspaces: amazonWorkspacesWithSnapshot(
                  state.amazonWorkspaces,
                  nextPlan,
                  state.planInputSignatures.amazon,
                  slotKey,
                ),
              }
            : {}),
          planningError: null,
        }));
        return true;
      } catch (error) {
        if (requestId !== planningRequestId || get().activeProject?.id !== activeProject.id) {
          return false;
        }
        set({ planningError: errorMessage(error) });
        return false;
      }
    },

    async generateSessionSlot(sessionId, slotKey) {
      const session = get().sessions.find((item) => item.id === sessionId);
      const targetPlatform = session?.platformId ?? "amazon";
      if (!session || !session.plan) {
        set({
          generationError: "当前平台 session 不存在或尚未完成策划。",
          generationErrorTarget: { platformId: targetPlatform, slotKey },
        });
        return null;
      }
      if (session.projectId !== get().activeProject?.id) {
        set({
          generationError: "当前平台 session 不属于已选择的商品。",
          generationErrorTarget: { platformId: session.platformId, slotKey },
        });
        return null;
      }
      if (
        session.platformId === "amazon" &&
        get().plans.amazon?.amazonSession?.plannerMode !== session.plan.amazonSession?.plannerMode
      ) {
        set({
          generationError: "当前 Amazon session 不是正在查看的工作流，请先切换后再生成。",
          generationErrorTarget: { platformId: "amazon", slotKey },
        });
        return null;
      }
      return get().generateSlot(session.platformId, slotKey);
    },

    async generateSlot(platformId, slotKey) {
      if (get().loading) {
        set({
          generationError: "工作台正在加载或保存项目与素材，请完成后再生成图片。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      const planningInputSignature = get().planInputSignatures[platformId]!;
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      const slot = plan?.slots.find((candidate) => candidate.slotKey === slotKey);
      const rulePackForSlot = resolveRulePackForPlan(platformId, plan);
      const rule = rulePackForSlot.slots.find((candidate) => candidate.key === slotKey);
      if (!activeProject || !slot || !rule) {
        set({
          generationError: "请先完成平台策划并选择有效槽位。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      const sizeTier = plan?.amazonSession?.sizeTier ?? "2K";
      const uploadDimensions = rule.dimensions;
      const generationDimensions =
        platformId === "amazon"
          ? generationDimensionsForUpload(uploadDimensions, sizeTier)
          : uploadDimensions;
      if (!hasCurrentPlanningInputs(get(), platformId)) {
        set({
          generationError: STALE_PLAN_MESSAGE,
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      if (get().generationRecoveryRequired) {
        set({
          generationError:
            "上次图片生成的保存状态需要恢复，请先点击“重试恢复”确认版本与素材后再生成。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      const currentGeneration = get().generatingSlot;
      if (currentGeneration) {
        set({
          generationError: `正在生成 ${currentGeneration.platformId} · ${currentGeneration.slotKey}，请先等待或取消。`,
          generationErrorTarget: currentGeneration,
        });
        return null;
      }
      if (get().planningPlatformId === platformId) {
        set({
          generationError: "当前平台正在重新策划，请完成或取消后再生成图片。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      if (get().copilotTarget) {
        set({
          generationError: "Copilot 请求正在处理，请完成或取消后再生成图片。",
          generationErrorTarget: get().copilotTarget,
        });
        return null;
      }
      const runtimeValidationError = validateRuntimeSettings(get().runtimeSettings);
      if (runtimeValidationError) {
        set({
          generationError: `API 设置不可用：${runtimeValidationError}`,
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }

      const operationLifecycle = lifecycleVersion;
      const requestId = ++generationRequestId;
      activeGenerationController?.abort(
        new DOMException("已开始新的图片生成请求", "AbortError"),
      );
      const controller = new AbortController();
      activeGenerationController = controller;
      const projectId = activeProject.id;
      const timeout = setTimeout(() => {
        controller.abort(new DOMException("图片生成超时", "TimeoutError"));
      }, generationTimeoutMs);
      let storedAssetId: string | null = null;
      let pendingObjectUrl: string | null = null;
      let workspacePersisted = false;
      let workspaceRollbackError: unknown = null;

      const isGenerationOwnerCurrent = () =>
        isCurrentLifecycle(operationLifecycle) &&
        requestId === generationRequestId &&
        get().activeProject?.id === projectId;
      const ensureCurrentGeneration = () => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException("图片生成已取消", "AbortError");
        }
        if (!isGenerationOwnerCurrent()) {
          throw new DOMException("图片生成结果已过期", "AbortError");
        }
      };

      set({
        generatingSlot: { platformId, slotKey },
        generationCanceling: false,
        generationError: null,
        generationErrorTarget: null,
      });

      try {
        const activeSession = [...get().sessions]
          .filter((session) =>
            platformId === "amazon"
              ? session.platformId === "amazon" &&
                session.plan?.amazonSession?.plannerMode === plan?.amazonSession?.plannerMode
              : session.workflowId === "taobao-product" && Boolean(session.plan),
          )
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
        const productAssetIds = activeSession?.selectedReferenceAssetIds ??
          get().assets.filter((asset) => asset.metadata.kind === "reference").map((asset) => asset.metadata.id);
        const applyStyleReference = platformId === "amazon" && shouldApplyStyleToSlot(slotKey);
        const referenceAssetIds = [
          ...productAssetIds,
          ...(applyStyleReference && activeSession?.selectedStyleReferenceId
            ? [activeSession.selectedStyleReferenceId]
            : []),
        ];
        const rawReferenceImages = (
          await Promise.all(
            referenceAssetIds.map(async (assetId) => {
                const stored = await dependencies.assetRepository.get(assetId);
                return stored
                  ? {
                      name: stored.metadata.name,
                      mimeType: stored.metadata.mimeType,
                      blob: stored.blob,
                      kind: stored.metadata.kind === "style-reference" ? "style" as const : "product" as const,
                    }
                  : null;
              }),
          )
        ).filter((image): image is NonNullable<typeof image> => image !== null);
        ensureCurrentGeneration();

        let referencePayloadNotice: string | null = null;
        let referenceImages = rawReferenceImages;
        try {
          const prepared = await prepareGenerationReferencePayload(rawReferenceImages);
          referenceImages = prepared.images.map((image, index) => ({
            ...image,
            kind: rawReferenceImages[index]!.kind,
          }));
          referencePayloadNotice = prepared.notice;
        } catch (payloadError) {
          if (payloadError instanceof GenerationReferencePayloadError) {
            throw payloadError;
          }
          throw payloadError;
        }
        ensureCurrentGeneration();

        const activeImageGenerator =
          get().runtimeSettings.mode === "api" && dependencies.createImageGenerator
            ? dependencies.createImageGenerator(get().runtimeSettings)
            : imageGenerator;
        const stylePresetId =
          platformId === "amazon" ? plan?.amazonSession?.stylePresetId : undefined;
        const selectedStyle = applyStyleReference && activeSession?.selectedStyleReferenceId
          ? await dependencies.assetRepository.get(activeSession.selectedStyleReferenceId)
          : null;
        const styledPrompt = selectedStyle?.metadata.styleReference
          ? appendStyleReferenceGuidance(
              slot.prompt,
              selectedStyle.metadata.styleReference.promptGuidance,
              true,
            )
          : platformId === "amazon"
            ? appendStyleGuidanceToPrompt(slot.prompt, stylePresetId, {
                apply: shouldApplyStyleToSlot(slotKey),
              })
            : slot.prompt;
        const generated = await activeImageGenerator.generate(
          {
            projectId,
            productName: resolveSessionEffectiveFacts(activeProject, activeSession).productName,
            platformId,
            slotKey,
            prompt: styledPrompt,
            negativePrompt: slot.negativePrompt,
            visibleCopy: slot.visibleCopy,
            uploadDimensions,
            dimensions: generationDimensions,
            sizeTier: platformId === "amazon" ? sizeTier : undefined,
            referenceImages,
          },
          controller.signal,
        );
        void referencePayloadNotice;
        ensureCurrentGeneration();

        const versionId = createVersionId();
        const extension = generated.mimeType === "image/svg+xml" ? "svg" : "png";
        const stored = await dependencies.assetRepository.put({
          projectId,
          blob: generated.blob,
          metadata: {
            name: `${platformId}-${slotKey}-${versionId}.${extension}`,
            kind: "generated",
            role: `${platformId}:${slotKey}`,
            tags: [platformId, slotKey, generated.source],
            width: generated.width,
            height: generated.height,
          },
        });
        storedAssetId = stored.metadata.id;
        ensureCurrentGeneration();
        pendingObjectUrl = dependencies.createObjectURL(stored.blob);
        ensureCurrentGeneration();

        const version: SlotVersion = {
          id: versionId,
          slotKey,
          assetId: stored.metadata.id,
          createdAt: now(),
          source: generated.source,
          promptSnapshot: slot.prompt,
          visibleCopySnapshot: slot.visibleCopy,
          planningInputSignature,
          width: generated.width,
          height: generated.height,
          mimeType: generated.mimeType,
          parameters: { ...generated.parameters },
        };

        const { nextVersionState, taskHistory, nextSessions, nextRuns } =
          await enqueueWorkspaceMutation(async () => {
          ensureCurrentGeneration();
          const workspace = await workspaceRepository.load(projectId);
          ensureCurrentGeneration();
          const current = workspace.slotVersions[platformId]?.[slotKey] ?? {
            versions: [],
            activeVersionId: null,
          };
          let nextVersionState: SlotVersionState = {
            versions: [...current.versions, version],
            activeVersionId: version.id,
          };
          const taskHistory = workspace.taskHistory;
          let nextSessions = workspace.sessions;
          let nextRuns = workspace.runs;
          const currentPlan = plan!;
          const workflowId = workflowForPlan(platformId, currentPlan);
          const currentSession = [...workspace.sessions]
            .filter((session) => session.workflowId === workflowId && Boolean(session.plan))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          if (currentSession) {
            const timestamp = now();
            const currentRun = currentSession.activeRunId
              ? workspace.runs.find((run) => run.id === currentSession.activeRunId)
              : undefined;
            if (currentRun) {
              const committed = commitVersion({
                session: {
                  ...currentSession,
                  plan: currentPlan,
                  planInputSignature: planningInputSignature,
                },
                run: currentRun,
                version,
                eventId: createStableId("event"),
                now: timestamp,
              });
              nextVersionState = committed.versionState;
              nextSessions = workspace.sessions.map((session) =>
                session.id === committed.session.id ? committed.session : session,
              );
              nextRuns = workspace.runs.map((run) =>
                run.id === committed.run.id ? committed.run : run,
              );
            }
          }
          await workspaceRepository.save({
            ...workspace,
            sessions: nextSessions,
            runs: nextRuns,
            slotVersions: {
              ...workspace.slotVersions,
              [platformId]: {
                ...workspace.slotVersions[platformId],
                [slotKey]: nextVersionState,
              },
            },
            taskHistory,
            updatedAt: now(),
          });
          try {
            ensureCurrentGeneration();
          } catch (staleError) {
            try {
              await workspaceRepository.save(workspace);
            } catch (rollbackError) {
              workspacePersisted = true;
              workspaceRollbackError = rollbackError;
            }
            throw staleError;
          }
          workspacePersisted = true;
          return { nextVersionState, taskHistory, nextSessions, nextRuns };
        });

        ensureCurrentGeneration();
        if (!pendingObjectUrl) {
          throw new Error("图片预览 URL 尚未准备完成");
        }
        const objectUrl = pendingObjectUrl;
        set((state) => ({
          slotVersions: {
            ...state.slotVersions,
            [platformId]: {
              ...state.slotVersions[platformId],
              [slotKey]: nextVersionState,
            },
          },
          assets: [
            ...state.assets.filter((asset) => asset.metadata.id !== stored.metadata.id),
            { metadata: stored.metadata, objectUrl },
          ],
          taskHistory,
          sessions: nextSessions,
          runs: nextRuns,
          generatingSlot: null,
          generationCanceling: false,
          generationError: null,
          generationErrorTarget: null,
        }));
        pendingObjectUrl = null;
        return version;
      } catch (error) {
        let previewCleanupError: unknown = null;
        let assetCleanupError: unknown = null;
        let cleanupMarkerError: unknown = null;
        if (pendingObjectUrl) {
          try {
            dependencies.revokeObjectURL(pendingObjectUrl);
          } catch (cleanupError) {
            previewCleanupError = cleanupError;
          }
          pendingObjectUrl = null;
        }
        if (storedAssetId && !workspacePersisted) {
          try {
            await dependencies.assetRepository.remove(storedAssetId);
          } catch (cleanupError) {
            assetCleanupError = cleanupError;
            try {
              const stored = await dependencies.assetRepository.get(storedAssetId);
              if (stored && !stored.metadata.tags.includes(PENDING_GENERATED_CLEANUP_TAG)) {
                await dependencies.assetRepository.put({
                  id: storedAssetId,
                  metadata: {
                    tags: [...stored.metadata.tags, PENDING_GENERATED_CLEANUP_TAG],
                  },
                });
              }
            } catch (markerError) {
              cleanupMarkerError = markerError;
            }
          }
        }

        const messages = [generationErrorMessage(error)];
        if (workspaceRollbackError) {
          messages.push(
            `工作区回滚失败：${errorMessage(workspaceRollbackError)}。请刷新项目确认版本状态。`,
          );
        }
        if (assetCleanupError) {
          messages.push(
            `临时图片清理失败：${errorMessage(assetCleanupError)}。恢复项目时会再次定点清理。`,
          );
        }
        if (cleanupMarkerError) {
          messages.push(
            `下次清理标记保存失败：${errorMessage(cleanupMarkerError)}。请检查浏览器本地存储。`,
          );
        }
        if (previewCleanupError) {
          messages.push(`预览 URL 释放失败：${errorMessage(previewCleanupError)}。`);
        }

        const hasCleanupFailure = Boolean(
          workspaceRollbackError || assetCleanupError || cleanupMarkerError || previewCleanupError,
        );
        let failureTaskHistory: TaskRecord[] | null = null;
        let failureRuns: ProductionRun[] | null = null;
        if (
          !workspaceRollbackError &&
          isCurrentLifecycle(operationLifecycle) &&
          get().activeProject?.id === projectId
        ) {
          try {
            const status =
              error instanceof DOMException && error.name === "AbortError"
                ? "canceled"
                : "failed";
            const failureResult = await enqueueWorkspaceMutation(async () => {
              const workspace = await workspaceRepository.load(projectId);
              const taskHistory = workspace.taskHistory;
              const workflowId = plan ? workflowForPlan(platformId, plan) : null;
              const currentSession = workflowId
                ? [...workspace.sessions]
                    .filter((session) => session.workflowId === workflowId && Boolean(session.activeRunId))
                    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
                : undefined;
              const runs = currentSession?.activeRunId
                ? workspace.runs.map((run) => run.id === currentSession.activeRunId
                    ? {
                        ...run,
                        status: status === "canceled" ? "canceled" as const : "failed" as const,
                        events: [...run.events, {
                          id: createStableId("event"), runId: run.id, kind: "generate" as const,
                          status: status as "failed" | "canceled", slotKey, createdAt: now(),
                        }],
                        updatedAt: now(),
                      }
                    : run)
                : workspace.runs;
              await workspaceRepository.save({ ...workspace, runs, taskHistory, updatedAt: now() });
              return { taskHistory, runs };
            });
            failureTaskHistory = failureResult.taskHistory;
            failureRuns = failureResult.runs;
          } catch (historyError) {
            messages.push(`生产记录事件保存失败：${errorMessage(historyError)}。`);
          }
        }
        if (!isGenerationOwnerCurrent()) {
          const cancellationStillOwned =
            isCurrentLifecycle(operationLifecycle) &&
            get().activeProject?.id === projectId &&
            generationRequestId === requestId + 1 &&
            get().generationCanceling &&
            get().generatingSlot?.platformId === platformId &&
            get().generatingSlot?.slotKey === slotKey;
          if (!cancellationStillOwned) return null;
          set({
            generatingSlot: null,
            generationCanceling: false,
            generationRecoveryRequired: Boolean(workspaceRollbackError),
            generationError: hasCleanupFailure ? messages.join(" ") : CANCELED_GENERATION_MESSAGE,
            generationErrorTarget: { platformId, slotKey },
            ...(failureTaskHistory ? { taskHistory: failureTaskHistory } : {}),
            ...(failureRuns ? { runs: failureRuns } : {}),
            ...(workspaceRollbackError
              ? {
                  resourceRestoreError:
                    "上次图片生成的工作区回滚失败，版本状态可能已经变化。请点击“重试恢复”重新读取版本与素材。",
                }
              : {}),
          });
          return null;
        }
        set({
          generatingSlot: null,
          generationCanceling: false,
          generationRecoveryRequired: Boolean(workspaceRollbackError),
          generationError: messages.join(" "),
          generationErrorTarget: { platformId, slotKey },
          ...(failureTaskHistory ? { taskHistory: failureTaskHistory } : {}),
          ...(failureRuns ? { runs: failureRuns } : {}),
          ...(workspaceRollbackError
            ? {
                resourceRestoreError:
                  "上次图片生成的工作区回滚失败，版本状态可能已经变化。请点击“重试恢复”重新读取版本与素材。",
              }
            : {}),
        });
        return null;
      } finally {
        clearTimeout(timeout);
        if (requestId === generationRequestId) {
          activeGenerationController = null;
        }
      }
    },

    async generateMaskedVersion(sessionId, slotKey, versionId, mask, editPrompt) {
      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      const platformId = session?.platformId ?? "amazon";
      const activeProject = get().activeProject;
      const slot = session?.plan?.slots.find((candidate) => candidate.slotKey === slotKey);
      const versionState = session?.slotVersions[slotKey];
      const sourceVersion = versionState?.versions.find((version) => version.id === versionId);
      if (!session || !activeProject || session.projectId !== activeProject.id || !slot || !sourceVersion) {
        set({
          generationError: "当前 session、槽位或图片版本不存在，无法进行局部编辑。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      if (!editPrompt.trim()) {
        set({
          generationError: "请填写本次局部编辑要求。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      if (!runtimeSupportsImageEditing(get().runtimeSettings)) {
        set({
          generationError:
            "当前图片服务不支持显式遮罩编辑，请改用兼容 Images API 的图片服务。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      const runtimeValidationError = validateRuntimeSettings(get().runtimeSettings);
      if (runtimeValidationError) {
        set({
          generationError: `API 设置不可用：${runtimeValidationError}`,
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }
      if (get().loading || get().generatingSlot || get().planningPlatformId || get().copilotTarget) {
        set({
          generationError: "当前有其他任务正在处理，请完成或取消后再进行局部编辑。",
          generationErrorTarget: get().generatingSlot ?? { platformId, slotKey },
        });
        return null;
      }

      const rulePack = resolveRulePackForPlan(platformId, session.plan);
      const rule = rulePack.slots.find((candidate) => candidate.key === slotKey);
      if (!rule) {
        set({
          generationError: "当前槽位缺少图片尺寸规则，无法进行局部编辑。",
          generationErrorTarget: { platformId, slotKey },
        });
        return null;
      }

      const operationLifecycle = lifecycleVersion;
      const requestId = ++generationRequestId;
      const controller = new AbortController();
      activeGenerationController?.abort(new DOMException("已开始新的图片编辑请求", "AbortError"));
      activeGenerationController = controller;
      const timeout = setTimeout(() => {
        controller.abort(new DOMException("图片编辑超时", "TimeoutError"));
      }, generationTimeoutMs);
      const projectId = activeProject.id;
      let storedAssetId: string | null = null;
      let pendingObjectUrl: string | null = null;
      let workspacePersisted = false;
      let workspaceRollbackError: unknown = null;

      const ensureCurrentEdit = () => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException("图片编辑已取消", "AbortError");
        }
        if (
          !isCurrentLifecycle(operationLifecycle) ||
          requestId !== generationRequestId ||
          get().activeProject?.id !== projectId
        ) {
          throw new DOMException("图片编辑结果已过期", "AbortError");
        }
      };

      set({
        generatingSlot: { platformId, slotKey },
        generationCanceling: false,
        generationError: null,
        generationErrorTarget: null,
      });

      try {
        const sourceAsset = await dependencies.assetRepository.get(sourceVersion.assetId);
        const prepared = await prepareMaskTarget(
          sourceAsset
            ? {
                name: sourceAsset.metadata.name,
                blob: sourceAsset.blob,
                mimeType: sourceAsset.metadata.mimeType,
                width: sourceVersion.width,
                height: sourceVersion.height,
              }
            : null,
          mask,
        );
        ensureCurrentEdit();

        const activeImageGenerator =
          get().runtimeSettings.mode === "api" && dependencies.createImageGenerator
            ? dependencies.createImageGenerator(get().runtimeSettings)
            : imageGenerator;
        const sizeTier = session.options.platformId === "amazon" ? session.options.sizeTier : undefined;
        const dimensions = platformId === "amazon"
          ? generationDimensionsForUpload(rule.dimensions, sizeTier ?? "2K")
          : rule.dimensions;
        const generated = await activeImageGenerator.generate(
          {
            projectId,
            productName: resolveSessionEffectiveFacts(activeProject, session).productName,
            platformId,
            slotKey,
            prompt: editPrompt.trim(),
            negativePrompt: slot.negativePrompt,
            visibleCopy: slot.visibleCopy,
            uploadDimensions: rule.dimensions,
            dimensions,
            sizeTier,
            referenceImages: [],
            edit: {
              target: {
                name: prepared.target.name,
                mimeType: prepared.target.mimeType,
                blob: prepared.target.blob,
              },
              mask: {
                name: `${platformId}-${slotKey}-mask.png`,
                mimeType: "image/png",
                blob: prepared.mask.blob,
              },
            },
          },
          controller.signal,
        );
        ensureCurrentEdit();

        const nextVersionId = createVersionId();
        const extension = generated.mimeType === "image/svg+xml" ? "svg" : "png";
        const stored = await dependencies.assetRepository.put({
          projectId,
          blob: generated.blob,
          metadata: {
            name: `${platformId}-${slotKey}-${nextVersionId}-edit.${extension}`,
            kind: "generated",
            role: `${platformId}:${slotKey}`,
            tags: [platformId, slotKey, generated.source, "masked-edit"],
            width: generated.width,
            height: generated.height,
          },
        });
        storedAssetId = stored.metadata.id;
        ensureCurrentEdit();
        pendingObjectUrl = dependencies.createObjectURL(stored.blob);
        ensureCurrentEdit();

        const version: SlotVersion = {
          id: nextVersionId,
          slotKey,
          assetId: stored.metadata.id,
          createdAt: now(),
          source: generated.source,
          promptSnapshot: slot.prompt,
          visibleCopySnapshot: slot.visibleCopy,
          planningInputSignature: session.planInputSignature,
          width: generated.width,
          height: generated.height,
          mimeType: generated.mimeType,
          parameters: {
            ...generated.parameters,
            operation: "edit",
            editPrompt: editPrompt.trim(),
          },
        };

        const committed = await enqueueWorkspaceMutation(async () => {
          ensureCurrentEdit();
          const workspace = await workspaceRepository.load(projectId);
          const persistedSession = workspace.sessions.find((candidate) => candidate.id === sessionId);
          const persistedState = persistedSession?.slotVersions[slotKey];
          if (!persistedSession || !persistedState?.versions.some((item) => item.id === versionId)) {
            throw new Error("要编辑的图片版本已不存在");
          }
          const timestamp = now();
          const persistedRun = persistedSession.activeRunId
            ? workspace.runs.find((run) => run.id === persistedSession.activeRunId)
            : undefined;
          if (!persistedRun) throw new Error("当前生产 Run 不存在");
          const versionCommit = commitVersion({
            session: persistedSession,
            run: persistedRun,
            version,
            eventId: createStableId("event"),
            eventKind: "edit",
            now: timestamp,
          });
          const nextVersionState = versionCommit.versionState;
          const nextSession = versionCommit.session;
          const nextSessions = workspace.sessions.map((candidate) =>
            candidate.id === sessionId ? nextSession : candidate,
          );
          const nextRuns = workspace.runs.map((run) =>
            run.id === versionCommit.run.id ? versionCommit.run : run,
          );
          const nextTaskHistory = workspace.taskHistory;
          const nextSlotVersions = {
            ...workspace.slotVersions,
            [platformId]: {
              ...workspace.slotVersions[platformId],
              [slotKey]: nextVersionState,
            },
          };
          await workspaceRepository.save({
            ...workspace,
            sessions: nextSessions,
            runs: nextRuns,
            slotVersions: nextSlotVersions,
            taskHistory: nextTaskHistory,
            updatedAt: timestamp,
          });
          workspacePersisted = true;
          try {
            ensureCurrentEdit();
          } catch (staleError) {
            try {
              await workspaceRepository.save(workspace);
              workspacePersisted = false;
            } catch (rollbackError) {
              workspaceRollbackError = rollbackError;
            }
            throw staleError;
          }
          return { nextVersionState, nextSessions, nextRuns, nextTaskHistory };
        });
        ensureCurrentEdit();
        if (!pendingObjectUrl) throw new Error("图片预览 URL 尚未准备完成");
        const objectUrl = pendingObjectUrl;
        set((state) => ({
          slotVersions: {
            ...state.slotVersions,
            [platformId]: {
              ...state.slotVersions[platformId],
              [slotKey]: committed.nextVersionState,
            },
          },
          sessions: committed.nextSessions,
          runs: committed.nextRuns,
          taskHistory: committed.nextTaskHistory,
          assets: [
            ...state.assets.filter((asset) => asset.metadata.id !== stored.metadata.id),
            { metadata: stored.metadata, objectUrl },
          ],
          generatingSlot: null,
          generationCanceling: false,
          generationError: null,
          generationErrorTarget: null,
        }));
        pendingObjectUrl = null;
        return version;
      } catch (error) {
        if (pendingObjectUrl) dependencies.revokeObjectURL(pendingObjectUrl);
        if (storedAssetId && !workspacePersisted) {
          await dependencies.assetRepository.remove(storedAssetId).catch(() => undefined);
        }
        if (
          isCurrentLifecycle(operationLifecycle) &&
          get().activeProject?.id === projectId
        ) {
          let failureRuns: ProductionRun[] | null = null;
          try {
            failureRuns = await enqueueWorkspaceMutation(async () => {
              const workspace = await workspaceRepository.load(projectId);
              const timestamp = now();
              const runs = workspace.runs.map((run) =>
                run.id === session.activeRunId
                  ? {
                      ...run,
                      events: [
                        ...run.events,
                        {
                          id: createStableId("event"),
                          runId: run.id,
                          kind: "edit" as const,
                          status:
                            error instanceof DOMException && error.name === "AbortError"
                              ? "canceled" as const
                              : "failed" as const,
                          slotKey,
                          createdAt: timestamp,
                        },
                      ],
                      updatedAt: timestamp,
                    }
                  : run,
              );
              await workspaceRepository.save({ ...workspace, runs, updatedAt: timestamp });
              return runs;
            });
          } catch {
            failureRuns = null;
          }
          set({
            generatingSlot: null,
            generationCanceling: false,
            generationRecoveryRequired: Boolean(workspaceRollbackError),
            generationError: workspaceRollbackError
              ? `局部编辑失败：${errorMessage(error)}。工作区回滚失败：${errorMessage(workspaceRollbackError)}。请重试恢复。`
              : `局部编辑失败：${errorMessage(error)}。已有版本未受影响。`,
            generationErrorTarget: { platformId, slotKey },
            ...(failureRuns ? { runs: failureRuns } : {}),
            ...(workspaceRollbackError
              ? {
                  resourceRestoreError:
                    "上次图片编辑的工作区回滚失败，版本状态可能已经变化。请点击“重试恢复”重新读取版本与素材。",
                }
              : {}),
          });
        }
        return null;
      } finally {
        clearTimeout(timeout);
        if (requestId === generationRequestId) activeGenerationController = null;
      }
    },

    cancelGeneration() {
      if (!activeGenerationController) return;
      invalidateGeneration();
      set({
        generationCanceling: true,
        generationError: null,
        generationErrorTarget: null,
      });
    },

    async activateSlotVersion(platformId, slotKey, versionId) {
      const activeProject = get().activeProject;
      const current = get().slotVersions[platformId]?.[slotKey];
      if (!activeProject || !current?.versions.some((version) => version.id === versionId)) {
        set({
          generationError: "要切换的图片版本不存在。",
          generationErrorTarget: { platformId, slotKey },
        });
        return false;
      }
      if (get().generatingSlot || get().generationRecoveryRequired) {
        set({
          generationError: get().generationRecoveryRequired
            ? "上次图片生成状态需要恢复，请先重试恢复后再切换版本。"
            : "当前正在生成图片，请完成或取消后再切换版本。",
          generationErrorTarget: get().generatingSlot ?? { platformId, slotKey },
        });
        return false;
      }

      try {
        const { nextVersionState, nextSessions, nextRuns } = await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(activeProject.id);
          const persisted = workspace.slotVersions[platformId]?.[slotKey];
          if (!persisted?.versions.some((version) => version.id === versionId)) {
            throw new Error("要切换的图片版本不存在");
          }
          const timestamp = now();
          let nextVersionState: SlotVersionState = {
            versions: persisted.versions,
            activeVersionId: versionId,
          };
          let nextSessions = workspace.sessions;
          let nextRuns = workspace.runs;
          const plan = workspace.plans[platformId] ?? get().plans[platformId];
          const workflowId = plan ? workflowForPlan(platformId, plan) : null;
          const activeSession = workflowId
            ? [...workspace.sessions]
                .filter((session) => session.workflowId === workflowId && Boolean(session.plan))
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
            : undefined;
          const activeRun = activeSession?.activeRunId
            ? workspace.runs.find((run) => run.id === activeSession.activeRunId)
            : undefined;
          if (activeSession && activeRun) {
            const activated = activateVersion(
              activeSession,
              activeRun,
              slotKey,
              versionId,
              timestamp,
            );
            nextVersionState = activated.session.slotVersions[slotKey]!;
            nextSessions = workspace.sessions.map((session) =>
              session.id === activated.session.id ? activated.session : session,
            );
            nextRuns = workspace.runs.map((run) =>
              run.id === activated.run.id ? activated.run : run,
            );
          }
          await workspaceRepository.save({
            ...workspace,
            sessions: nextSessions,
            runs: nextRuns,
            slotVersions: {
              ...workspace.slotVersions,
              [platformId]: {
                ...workspace.slotVersions[platformId],
                [slotKey]: nextVersionState,
              },
            },
            updatedAt: timestamp,
          });
          return { nextVersionState, nextSessions, nextRuns };
        });
        if (get().activeProject?.id !== activeProject.id) return false;
        set((state) => ({
          sessions: nextSessions,
          runs: nextRuns,
          slotVersions: {
            ...state.slotVersions,
            [platformId]: {
              ...state.slotVersions[platformId],
              [slotKey]: nextVersionState,
            },
          },
          generationError: null,
          generationErrorTarget: null,
        }));
        return true;
      } catch (error) {
        set({
          generationError: errorMessage(error),
          generationErrorTarget: { platformId, slotKey },
        });
        return false;
      }
    },

    clearGenerationError() {
      set({ generationError: null, generationErrorTarget: null });
    },

    async resumeRun(runId) {
      const located = await locateRun(runId, get);
      if (!located) {
        set({ error: "要恢复的生产记录不存在。" });
        return false;
      }
      const session = [...located.workspace.sessions]
        .filter((candidate) => candidate.workflowId === located.run.workflowId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (!session?.plan || session.activeRunId !== runId) {
        set({ error: "该记录已被后续策划替代，请使用“基于此记录新建”继续。" });
        return false;
      }
      if (get().activeProject?.id !== located.project.id) {
        await get().selectProject(located.project.id);
      }
      const workspace = await workspaceRepository.load(located.project.id);
      const currentSession = [...workspace.sessions]
        .filter((candidate) => candidate.workflowId === located.run.workflowId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (!currentSession?.plan || currentSession.activeRunId !== runId) {
        set({ error: "该记录已不是当前任务，请使用“基于此记录新建”继续。" });
        return false;
      }
      const plan = currentSession.plan;
      const selectedSlotKey = currentSession.selectedSlotKey ?? plan.slots[0]?.slotKey;
      set((state) => ({
        sessions: workspace.sessions,
        runs: workspace.runs,
        plans: { ...state.plans, [located.run.platformId]: plan },
        planInputSignatures: {
          ...state.planInputSignatures,
          ...(currentSession.planInputSignature
            ? { [located.run.platformId]: currentSession.planInputSignature }
            : {}),
        },
        selectedSlotKeys: { ...state.selectedSlotKeys, [located.run.platformId]: selectedSlotKey },
        slotVersions: {
          ...state.slotVersions,
          [located.run.platformId]: currentSession.slotVersions,
        },
        ...(located.run.platformId === "amazon"
          ? {
              amazonPlannerMode: currentSession.workflowId === "amazon-aplus" ? "aplus" : "listing",
              amazonWorkspaces: amazonWorkspacesWithSnapshot(
                state.amazonWorkspaces,
                plan,
                currentSession.planInputSignature,
                selectedSlotKey,
              ),
            }
          : {}),
        error: null,
      }));
      return true;
    },

    async forkRun(runId) {
      const located = await locateRun(runId, get);
      if (!located) {
        set({ error: "要复用的生产记录不存在。" });
        return null;
      }
      if (get().activeProject?.id !== located.project.id) {
        await get().selectProject(located.project.id);
      }
      const project = get().activeProject;
      if (!project || project.id !== located.project.id) return null;
      const timestamp = now();
      const sessionId = createStableId("session");
      const forkRunId = createStableId("run");
      const forkFacts = resolveSessionEffectiveFacts(project, {
        projectId: project.id,
        workflowId: located.run.workflowId,
        taobaoAnalysis: located.run.contextSnapshot.taobaoAnalysis,
      });
      const inputSignature = createPlanningInputSignature(
        forkFacts,
        get().assets.map((asset) => asset.metadata),
      );
      const plan = normalizePlatformPlan(
        JSON.parse(JSON.stringify(located.run.planSnapshot)),
        resolveRulePackForPlan(located.run.platformId, located.run.planSnapshot),
      );
      const { session, run: forkedRun } = forkProductionRun(
        { ...located.run, planSnapshot: plan },
        {
          sessionId,
          runId: forkRunId,
          eventId: createStableId("event"),
          planInputSignature: inputSignature,
          now: timestamp,
        },
      );
      const nextWorkspace = await enqueueWorkspaceMutation(async () => {
        const workspace = await workspaceRepository.load(project.id);
        let next: ProjectWorkspaceDocument = {
          ...workspace,
          sessions: [
            ...workspace.sessions.map((item) => item.workflowId === session.workflowId
              ? { ...item, activeRunId: undefined, updatedAt: item.updatedAt }
              : item),
            session,
          ],
          runs: [...workspace.runs, forkedRun],
          plans: { ...workspace.plans, [located.run.platformId]: plan },
          planInputSignatures: {
            ...workspace.planInputSignatures,
            [located.run.platformId]: inputSignature,
          },
          selectedSlotKeys: {
            ...workspace.selectedSlotKeys,
            [located.run.platformId]: session.selectedSlotKey,
          },
          slotVersions: { ...workspace.slotVersions, [located.run.platformId]: {} },
          updatedAt: timestamp,
        };
        if (located.run.platformId === "amazon") {
          next = withAmazonSnapshot(next, plan, inputSignature, session.selectedSlotKey);
        }
        await workspaceRepository.save(next);
        return next;
      });
      set((state) => ({
        sessions: nextWorkspace.sessions,
        runs: nextWorkspace.runs,
        plans: nextWorkspace.plans,
        planInputSignatures: nextWorkspace.planInputSignatures,
        selectedSlotKeys: selectedKeysFor(nextWorkspace),
        slotVersions: nextWorkspace.slotVersions,
        ...(located.run.platformId === "amazon"
          ? {
              amazonPlannerMode: session.workflowId === "amazon-aplus" ? "aplus" : "listing",
              amazonWorkspaces: nextWorkspace.amazonWorkspaces ?? state.amazonWorkspaces,
            }
          : {}),
        error: null,
      }));
      return session;
    },

    async reuseRunImageAsReference(runId, eventId) {
      const located = await locateRun(runId, get);
      const event = located?.run.events.find(
        (candidate) => candidate.id === eventId && Boolean(candidate.assetId),
      );
      if (!located || !event?.assetId || !event.slotKey) {
        set({ error: "该生产事件没有可复用的图片。" });
        return null;
      }
      if (get().activeProject?.id !== located.project.id) {
        await get().selectProject(located.project.id);
      }
      const source = await dependencies.assetRepository.get(event.assetId);
      if (!source) {
        set({ error: "历史图片已不存在，无法复制为参考图。" });
        return null;
      }
      const stored = await dependencies.assetRepository.put({
        projectId: located.project.id,
        blob: source.blob,
        metadata: {
          name: `${located.run.platformId}-${event.slotKey}-历史参考.${source.metadata.mimeType.includes("svg") ? "svg" : "png"}`,
          kind: "reference",
          role: `source:${located.run.platformId}:${event.slotKey}`,
          tags: ["history-reuse", runId, event.slotKey],
          width: source.metadata.width,
          height: source.metadata.height,
        },
      });
      await get().refreshAssets();
      return get().assets.find((asset) => asset.metadata.id === stored.metadata.id) ?? null;
    },

    async reuseGeneratedImageAsReference(assetId) {
      const activeProject = get().activeProject;
      if (!activeProject) {
        set({ error: "请先选择商品资料，再复用生成图片。" });
        return null;
      }
      const source = await dependencies.assetRepository.get(assetId);
      if (
        !source ||
        source.metadata.kind !== "generated" ||
        source.metadata.projectId !== activeProject.id
      ) {
        set({ error: "当前生成图片不存在，无法复制为参考图。" });
        return null;
      }
      const role = source.metadata.role?.replace(/^([^:]+):(.+)$/, "source:$1:$2") ?? "source:generated";
      const stored = await dependencies.assetRepository.put({
        projectId: activeProject.id,
        blob: source.blob,
        metadata: {
          name: `${source.metadata.name.replace(/\.[^.]+$/, "")}-参考.${source.metadata.mimeType.includes("svg") ? "svg" : "png"}`,
          kind: "reference",
          role,
          tags: ["generated-reuse", assetId],
          width: source.metadata.width,
          height: source.metadata.height,
        },
      });
      await get().refreshAssets();
      return get().assets.find((asset) => asset.metadata.id === stored.metadata.id) ?? null;
    },

    async exportRun(runId) {
      if (get().exportingPlatform) {
        set({ exportError: "已有交付包正在导出，请稍候。", exportErrorPlatform: get().exportingPlatform });
        return null;
      }
      const located = await locateRun(runId, get);
      if (!located) {
        set({ exportError: "要导出的生产记录不存在。", exportErrorPlatform: null });
        return null;
      }
      const platformId = located.run.platformId;
      set({ exportingPlatform: platformId, exportError: null, exportErrorPlatform: null });
      try {
        const exported = await buildRunExportPackage({
          project: located.project,
          run: located.run,
          loadAsset: (id) => dependencies.assetRepository.get(id),
          now,
        });
        const timestamp = now();
        const nextRuns = await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(located.project.id);
          const runs = workspace.runs.map((run) => run.id === runId
            ? appendRunEvent({
                ...run,
                status: exported.manifest.ready ? "ready" as const : "partial" as const,
              }, {
                id: createStableId("event"), runId, kind: "export", status: "success",
                artifactFileName: exported.fileName,
                missingSlots: [...exported.manifest.missingSlots],
                createdAt: timestamp,
              })
            : run);
          await workspaceRepository.save({ ...workspace, runs, updatedAt: timestamp });
          return runs;
        });
        set({
          ...(get().activeProject?.id === located.project.id ? { runs: nextRuns } : {}),
          exportingPlatform: null,
          exportError: null,
          exportErrorPlatform: null,
        });
        return exported;
      } catch (error) {
        const message = `导出生产记录失败：${errorMessage(error)}。当前策划与版本未受影响。`;
        const timestamp = now();
        const nextRuns = await enqueueWorkspaceMutation(async () => {
          const workspace = await workspaceRepository.load(located.project.id);
          const runs = workspace.runs.map((run) => run.id === runId
            ? appendRunEvent(run, {
                id: createStableId("event"), runId, kind: "export", status: "failed",
                createdAt: timestamp,
              })
            : run);
          await workspaceRepository.save({ ...workspace, runs, updatedAt: timestamp });
          return runs;
        });
        set({
          ...(get().activeProject?.id === located.project.id ? { runs: nextRuns } : {}),
          exportingPlatform: null,
          exportError: message,
          exportErrorPlatform: platformId,
        });
        return null;
      }
    },

    async exportPlatform(platformId) {
      if (get().loading) {
        set({
          exportError: "工作台正在加载或保存项目与素材，请完成后再导出。",
          exportErrorPlatform: platformId,
        });
        return null;
      }
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      if (!activeProject || !plan) {
        set({
          exportError: "请先创建商品项目并完成当前平台策划。",
          exportErrorPlatform: platformId,
        });
        return null;
      }
      if (!hasCurrentPlanningInputs(get(), platformId)) {
        set({ exportError: STALE_PLAN_MESSAGE, exportErrorPlatform: platformId });
        return null;
      }
      if (get().exportingPlatform) {
        set({
          exportError: "已有交付包正在导出，请稍候。",
          exportErrorPlatform: get().exportingPlatform,
        });
        return null;
      }
      if (get().generatingSlot || get().planningPlatformId === platformId) {
        set({
          exportError: "当前平台仍有策划或图片生成任务，请完成后再导出。",
          exportErrorPlatform: platformId,
        });
        return null;
      }

      const workflowId = workflowForPlan(platformId, plan);
      const activeSession = [...get().sessions]
        .filter((session) => session.workflowId === workflowId && Boolean(session.activeRunId))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (!activeSession?.activeRunId) {
        set({ exportError: "当前工作流缺少可导出的生产 Run，请重新策划。", exportErrorPlatform: platformId });
        return null;
      }
      const exported = await get().exportRun(activeSession.activeRunId);
      return exported;
    },

    async startBatchGeneration(platformId) {
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      if (!activeProject || !plan) {
        set({ error: "请先选择商品并完成当前平台策划，再创建批量生成任务。" });
        return null;
      }
      if (
        get().loading ||
        get().planningPlatformId ||
        get().generatingSlot ||
        get().copilotTarget ||
        get().exportingPlatform
      ) {
        set({ error: "当前有任务正在执行，请完成或取消后再开始批量生成。" });
        return null;
      }
      const existingJob = get().jobs.find((job) =>
        (job.status === "queued" || job.status === "running" || job.status === "paused") &&
        job.items.some((item) => item.target.projectId === activeProject.id),
      );
      if (existingJob) {
        set({ error: "当前商品已有未完成的本地任务，请先继续或取消该任务。" });
        return null;
      }

      const workflowId = workflowForPlan(platformId, plan);
      const session = [...get().sessions]
        .filter((candidate) =>
          candidate.projectId === activeProject.id &&
          candidate.workflowId === workflowId &&
          Boolean(candidate.plan),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (!session?.plan || !session.activeRunId) {
        set({ error: "当前工作流缺少可执行的 Session 或 ProductionRun，请重新策划。" });
        return null;
      }
      const pendingSlots = session.plan.slots.filter((slot) => {
        const state = session.slotVersions[slot.slotKey];
        return !state?.activeVersionId || !state.versions.some((version) => version.id === state.activeVersionId);
      });
      if (pendingSlots.length === 0) {
        set({ error: "当前工作流的全部槽位都已生成，无需创建批量任务。" });
        return null;
      }

      const timestamp = now();
      const job = createExecutionJob({
        id: createStableId("job"),
        kind: "batch-generate",
        targets: pendingSlots.map((slot) => ({
          id: createStableId("job-item"),
          projectId: activeProject.id,
          sessionId: session.id,
          platformId,
          workflowId: session.workflowId,
          slotKey: slot.slotKey,
        })),
        now: timestamp,
      });
      await persistJobs([job]);
      set({ error: null });
      return runExecutionJob(job.id);
    },

    async resumeExecutionJob(jobId) {
      const job = await executionJobRepository.get(jobId);
      if (!job) {
        set({ error: "要继续的本地任务不存在。" });
        return null;
      }
      if (job.status !== "paused" && job.status !== "queued") {
        set({ error: "只有已暂停或排队中的任务可以继续。" });
        return null;
      }
      const activeProjectId = get().activeProject?.id;
      const projectId = job.items[0]?.target.projectId;
      if (projectId && activeProjectId !== projectId) {
        await get().selectProject(projectId);
      }
      const queued = { ...job, status: "queued" as const, error: undefined, updatedAt: now() };
      await persistJobs([queued]);
      return runExecutionJob(jobId);
    },

    async retryExecutionJob(jobId) {
      const job = await executionJobRepository.get(jobId);
      if (!job) {
        set({ error: "要重试的本地任务不存在。" });
        return null;
      }
      if (job.status !== "failed") {
        set({ error: "只有失败任务可以重试。" });
        return null;
      }
      const projectId = job.items[0]?.target.projectId;
      if (projectId && get().activeProject?.id !== projectId) {
        await get().selectProject(projectId);
      }
      const retried = retryExecutionJob(job, now());
      await persistJobs([retried]);
      return runExecutionJob(jobId);
    },

    async cancelExecutionJob(jobId) {
      const job = await executionJobRepository.get(jobId);
      if (!job) {
        set({ error: "要取消的本地任务不存在。" });
        return false;
      }
      canceledExecutionJobIds.add(jobId);
      if (job.currentItemId && get().generatingSlot) get().cancelGeneration();
      await persistJobs([cancelExecutionJob(job, now())]);
      return true;
    },

    async refreshExecutionJobs() {
      try {
        set({ jobs: await restoreExecutionJobs() });
      } catch (error) {
        set({ error: `本地任务恢复失败：${errorMessage(error)}` });
      }
    },

    clearExportError() {
      set({ exportError: null, exportErrorPlatform: null });
    },

    async saveRuntimeSettings(input) {
      if (get().loading) {
        set({ settingsError: "工作台正在加载或保存项目与素材，请完成后再保存运行设置。" });
        return false;
      }
      if (get().planningPlatformId || get().generatingSlot || get().copilotTarget) {
        set({
          settingsError: "当前有策划、图片生成或 Copilot 任务，请完成或取消后再保存运行设置。",
        });
        return false;
      }
      const settings = normalizeRuntimeSettings(input);
      const validationError = validateRuntimeSettings(settings);
      if (validationError) {
        set({ settingsError: validationError });
        return false;
      }
      set({ settingsLoading: true, settingsError: null });
      try {
        await settingsRepository.save(settings);
        set({
          runtimeSettings: settings,
          settingsLoading: false,
          settingsError: null,
          connectionTestStatus: "idle",
          connectionTestMessage: null,
          textConnectionTestStatus: "idle",
          textConnectionTestMessage: null,
          imageConnectionTestStatus: "idle",
          imageConnectionTestMessage: null,
        });
        return true;
      } catch {
        set({
          settingsLoading: false,
          settingsError: "运行设置未能保存，请检查浏览器本地存储权限。",
        });
        return false;
      }
    },

    async testRuntimeConnection(input, service = "all") {
      const settings = normalizeRuntimeSettings(input ?? get().runtimeSettings);
      const testingMessage =
        service === "image" ? "正在测试图片生成 API..." : "正在测试文本策划 API...";
      set((state) => ({
        connectionTestStatus: "testing",
        connectionTestMessage: testingMessage,
        settingsError: null,
        ...(service === "image" || service === "all"
          ? { imageConnectionTestStatus: service === "all" ? state.imageConnectionTestStatus : "testing", imageConnectionTestMessage: service === "all" ? state.imageConnectionTestMessage : testingMessage }
          : {}),
        ...(service === "text" || service === "all"
          ? { textConnectionTestStatus: service === "all" ? state.textConnectionTestStatus : "testing", textConnectionTestMessage: service === "all" ? state.textConnectionTestMessage : testingMessage }
          : {}),
      }));
      let result: ConnectionTestResult;
      try {
        if (service === "text") {
          result = await (dependencies.testTextConnection ?? testTextApiConnection)(settings);
        } else if (service === "image") {
          result = await (dependencies.testImageConnection ?? testImageApiConnection)(settings);
        } else {
          result = await (dependencies.testConnection ?? testApiConnection)(settings);
        }
      } catch {
        result = {
          ok: false,
          message:
            service === "all"
              ? "API 连接测试未能完成，请检查网络、代理或服务配置后重试。"
              : `${service === "image" ? "图片" : "文本"} API 连接测试未能完成，请检查网络、代理或服务配置后重试。`,
        };
      }
      set({
        connectionTestStatus: result.ok ? "success" : "error",
        connectionTestMessage: result.message,
        ...(service === "text"
          ? {
              textConnectionTestStatus: result.ok ? "success" : "error",
              textConnectionTestMessage: result.message,
            }
          : {}),
        ...(service === "image"
          ? {
              imageConnectionTestStatus: result.ok ? "success" : "error",
              imageConnectionTestMessage: result.message,
            }
          : {}),
      });
      return result;
    },

    clearSettingsFeedback() {
      set({
        settingsError: null,
        connectionTestStatus: "idle",
        connectionTestMessage: null,
        textConnectionTestStatus: "idle",
        textConnectionTestMessage: null,
        imageConnectionTestStatus: "idle",
        imageConnectionTestMessage: null,
      });
    },

    async runCopilotCommand(platformId, slotKey, command) {
      if (get().loading) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: "工作台正在加载或保存项目与素材，请完成后再使用 Copilot。",
        });
        return false;
      }
      const activeProject = get().activeProject;
      const plan = get().plans[platformId];
      const slot = plan?.slots.find((candidate) => candidate.slotKey === slotKey);
      if (!activeProject || !plan || !slot) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: "请先完成平台策划并选择有效槽位。",
        });
        return false;
      }
      if (!hasCurrentPlanningInputs(get(), platformId)) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: STALE_PLAN_MESSAGE,
        });
        return false;
      }
      if (get().copilotTarget) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: "已有 Copilot 任务正在处理，请先等待或取消。",
        });
        return false;
      }
      if (get().planningPlatformId || get().generatingSlot || get().generationRecoveryRequired) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: "当前有策划、生成或恢复任务，请完成后再使用 Copilot。",
        });
        return false;
      }
      const runtimeValidationError = validateRuntimeSettings(get().runtimeSettings);
      if (runtimeValidationError) {
        set({
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: `API 设置不可用：${runtimeValidationError}`,
        });
        return false;
      }

      const operationLifecycle = lifecycleVersion;
      const requestId = ++copilotRequestId;
      const projectId = activeProject.id;
      const controller = new AbortController();
      activeCopilotController = controller;
      let copilotRollbackError: unknown = null;
      const isCurrentCopilot = () =>
        !controller.signal.aborted &&
        isCurrentLifecycle(operationLifecycle) &&
        requestId === copilotRequestId &&
        get().activeProject?.id === projectId;
      const ensureCurrentCopilot = () => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new DOMException("Copilot 已取消", "AbortError");
        }
        if (!isCurrentCopilot()) {
          throw new DOMException("Copilot 结果已过期", "AbortError");
        }
      };
      set({
        copilotTarget: { platformId, slotKey },
        copilotFeedbackTarget: { platformId, slotKey },
        copilotError: null,
        copilotMessage: null,
      });

      try {
        const activeCopilot =
          get().runtimeSettings.mode === "api" && dependencies.createCopilotEngine
            ? dependencies.createCopilotEngine(get().runtimeSettings)
            : copilotEngine;
        const copilotSession = [...get().sessions]
          .filter((session) => session.platformId === platformId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
        const result = await activeCopilot.adjust(
          {
            project: resolveSessionEffectiveProject(activeProject, copilotSession),
            rulePack: resolveRulePackForPlan(platformId, get().plans[platformId]),
            slot,
          },
          command,
          controller.signal,
        );
        ensureCurrentCopilot();

        if (!("prompt" in result)) {
          set({
            copilotTarget: null,
            copilotFeedbackTarget: { platformId, slotKey },
            copilotError: null,
            copilotMessage: `AI 建议：${result.message}`,
          });
          return true;
        }

        const patch = result;

        const nextPlan = await enqueueWorkspaceMutation(async () => {
          ensureCurrentCopilot();
          const workspace = await workspaceRepository.load(projectId);
          ensureCurrentCopilot();
          const currentPlan = workspace.plans[platformId] ?? plan;
          const nextPlan = normalizePlatformPlan(
            {
              ...currentPlan,
              slots: currentPlan.slots.map((candidate) =>
                candidate.slotKey === slotKey ? { ...candidate, ...patch } : candidate,
              ),
            },
            resolveRulePackForPlan(platformId, get().plans[platformId]),
          );
          let nextWorkspace: ProjectWorkspaceDocument = {
            ...workspace,
            plans: { ...workspace.plans, [platformId]: nextPlan },
            updatedAt: now(),
          };
          if (platformId === "amazon") {
            nextWorkspace = withAmazonSnapshot(
              nextWorkspace,
              nextPlan,
              workspace.planInputSignatures.amazon,
              workspace.selectedSlotKeys.amazon,
            );
          }
          await workspaceRepository.save(nextWorkspace);
          try {
            ensureCurrentCopilot();
          } catch (staleError) {
            try {
              await workspaceRepository.save(workspace);
            } catch (rollbackError) {
              copilotRollbackError = rollbackError;
            }
            throw staleError;
          }
          return nextPlan;
        });
        ensureCurrentCopilot();
        set((state) => ({
          plans: { ...state.plans, [platformId]: nextPlan },
          ...(platformId === "amazon" && amazonModeForPlan(nextPlan)
            ? {
                amazonWorkspaces: amazonWorkspacesWithSnapshot(
                  state.amazonWorkspaces,
                  nextPlan,
                  state.planInputSignatures.amazon,
                  state.selectedSlotKeys.amazon,
                ),
              }
            : {}),
          copilotTarget: null,
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: null,
          copilotMessage: `AI 建议：${
            "message" in result && result.message.trim()
              ? result.message
              : `${slotKey} 已更新并保存。`
          }`,
        }));
        return true;
      } catch (error) {
        if (
          !isCurrentLifecycle(operationLifecycle) ||
          requestId !== copilotRequestId ||
          get().activeProject?.id !== projectId
        ) {
          return false;
        }
        const canceled =
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        const failureMessage = copilotRollbackError
          ? `已取消 Copilot 请求，但保存后的工作区回滚失败：${errorMessage(copilotRollbackError)}。槽位状态可能已经变化，请点击“重试恢复”重新读取槽位。`
          : canceled
            ? "已取消 Copilot 请求，当前槽位草稿未受影响。"
            : `Copilot 请求失败：${errorMessage(error)}。当前槽位草稿未受影响。`;
        set({
          copilotTarget: null,
          copilotFeedbackTarget: { platformId, slotKey },
          copilotError: failureMessage,
          copilotMessage: null,
          ...(copilotRollbackError
            ? {
                generationRecoveryRequired: true,
                resourceRestoreError:
                  "Copilot 保存后的工作区回滚失败，槽位状态可能已经变化。请点击“重试恢复”。",
              }
            : {}),
        });
        return false;
      } finally {
        if (requestId === copilotRequestId) activeCopilotController = null;
      }
    },

    cancelCopilot() {
      activeCopilotController?.abort(new DOMException("用户取消 Copilot", "AbortError"));
    },

    clearCopilotFeedback() {
      set({ copilotFeedbackTarget: null, copilotError: null, copilotMessage: null });
    },

    async retryActiveProjectResources() {
      const operationLifecycle = lifecycleVersion;
      const activeProject = get().activeProject;
      if (!activeProject) {
        set({ resourceRestoreError: "当前没有可恢复的商品项目。" });
        return;
      }

      set({ loading: true, resourceRestoreError: null });
      let assets: WorkbenchAsset[] | null = null;
      let workspace: ProjectWorkspaceDocument | null = null;
      const restoreErrors: string[] = [];
      try {
        const loadedAssets = await loadAssetViews(activeProject.id, dependencies);
        assets = loadedAssets.assets;
        if (loadedAssets.cleanupWarnings.length > 0) {
          restoreErrors.push(
            `临时生成图片仍未清理：${loadedAssets.cleanupWarnings.join("；")}`,
          );
        }
      } catch (error) {
        restoreErrors.push(`素材恢复失败：${errorMessage(error)}`);
      }
      try {
        workspace = await workspaceRepository.load(activeProject.id);
      } catch (error) {
        restoreErrors.push(`平台策划恢复失败：${errorMessage(error)}`);
      }

      if (!isCurrentLifecycle(operationLifecycle) || get().activeProject?.id !== activeProject.id) {
        if (assets) revokeAssets(assets, dependencies);
        return;
      }
      if (assets) {
        revokeAssets(get().assets, dependencies);
      }
      const recoveryResolved = Boolean(assets && workspace && restoreErrors.length === 0);
      set({
        loading: false,
        ...(assets ? { assets } : {}),
        ...(workspace
          ? {
              plans: workspace.plans,
              planInputSignatures: workspace.planInputSignatures,
              selectedSlotKeys: selectedKeysFor(workspace),
              amazonPlannerMode: workspace.amazonPlannerMode ?? "listing",
              amazonWorkspaces: workspace.amazonWorkspaces ?? {},
              slotVersions: workspace.slotVersions,
              taskHistory: workspace.taskHistory,
            }
          : {}),
        ...(recoveryResolved
          ? {
              generationRecoveryRequired: false,
              generationError: null,
              generationErrorTarget: null,
            }
          : {}),
        resourceRestoreError:
          restoreErrors.length > 0
            ? `${restoreErrors.join("；")}。可继续编辑商品资料，或再次重试。`
            : null,
      });
    },

    clearResourceRestoreError() {
      if (get().generationRecoveryRequired) return;
      set({ resourceRestoreError: null });
    },

    clearPlanningError() {
      set({ planningError: null });
    },

    clearError() {
      set({ error: null });
    },

    dispose() {
      lifecycleVersion += 1;
      invalidatePlanning();
      invalidateGeneration();
      invalidateExport();
      invalidateCopilot();
      const assets = get().assets;
      if (assets.length > 0) {
        revokeAssets(assets, dependencies);
      }
      set({
        assets: [],
        loading: false,
        planningPlatformId: null,
        generatingSlot: null,
        generationCanceling: false,
        exportingPlatform: null,
        copilotTarget: null,
        copilotFeedbackTarget: null,
      });
    },
    });
  });
}

export function createDefaultWorkbenchDependencies(): WorkbenchStoreDependencies {
  const warnings: string[] = [];
  let projectRepository: ProjectRepository;
  let assetRepository: AssetRepository;
  let workspaceRepository: ProjectWorkspaceRepository;
  let legacyWorkspaceRepository: ProjectWorkspaceRepository;
  let workspaceV3Repository: ProjectWorkspaceV3Repository;
  let runRepository: RunRepository;
  let executionJobRepository: ExecutionJobRepository;
  let settingsRepository: SettingsRepository;
  let defaultPlannerEngine: PlannerEngine = demoPlanner;
  let defaultImageGenerator: ImageGenerator = demoImageGenerator;
  let defaultCopilotEngine: CopilotEngine = demoCopilot;

  if (typeof window === "undefined") {
    projectRepository = createMemoryProjectRepository();
    assetRepository = createMemoryAssetRepository();
    legacyWorkspaceRepository = createMemoryWorkspaceRepository();
    workspaceV3Repository = createMemoryWorkspaceV3Repository();
    runRepository = createMemoryRunRepository();
    executionJobRepository = createMemoryExecutionJobRepository();
    workspaceRepository = createV3WorkspacePersistence({
      legacyRepository: legacyWorkspaceRepository,
      v3Repository: workspaceV3Repository,
      runRepository,
    });
    settingsRepository = createMemorySettingsRepository();
    warnings.push("当前为非浏览器环境，项目与素材仅保存在内存中。");
  } else {
    const fixture = new URLSearchParams(window.location.search).get("fixture");
    defaultPlannerEngine =
      fixture === "planning-slow" ? slowInteractiveDemoPlanner : demoPlanner;
    defaultImageGenerator =
      fixture === "image-fail-once"
        ? createFailOnceImageGenerator(interactiveDemoImageGenerator)
        : interactiveDemoImageGenerator;
    defaultCopilotEngine =
      fixture === "copilot-slow" ? slowInteractiveDemoCopilot : interactiveDemoCopilot;
    try {
      projectRepository = createLocalStorageProjectRepository({ storage: window.localStorage });
    } catch {
      projectRepository = createMemoryProjectRepository();
      warnings.push("localStorage 不可用，项目仅在当前会话保存在内存中。");
    }

    try {
      assetRepository = createIndexedDbAssetRepository({ indexedDB: window.indexedDB });
    } catch {
      assetRepository = createMemoryAssetRepository();
      warnings.push("IndexedDB 不可用，素材仅在当前会话保存在内存中。");
    }

    try {
      legacyWorkspaceRepository = createLocalStorageWorkspaceRepository({
        storage: window.localStorage,
      });
      workspaceV3Repository = createLocalStorageWorkspaceV3Repository({
        storage: window.localStorage,
      });
    } catch {
      legacyWorkspaceRepository = createMemoryWorkspaceRepository();
      workspaceV3Repository = createMemoryWorkspaceV3Repository();
      warnings.push("localStorage 不可用，平台会话仅在当前会话保存在内存中。");
    }

    try {
      runRepository = createIndexedDbRunRepository({ indexedDB: window.indexedDB });
    } catch {
      runRepository = createMemoryRunRepository();
      warnings.push("IndexedDB 不可用，生产记录仅在当前会话保存在内存中。");
    }
    try {
      executionJobRepository = createIndexedDbExecutionJobRepository({ indexedDB: window.indexedDB });
    } catch {
      executionJobRepository = createMemoryExecutionJobRepository();
      warnings.push("IndexedDB 不可用，本地任务仅在当前会话保存在内存中。");
    }
    workspaceRepository = createV3WorkspacePersistence({
      legacyRepository: legacyWorkspaceRepository,
      v3Repository: workspaceV3Repository,
      runRepository,
    });

    try {
      settingsRepository = createLocalStorageSettingsRepository(window.localStorage);
    } catch {
      settingsRepository = createMemorySettingsRepository();
      warnings.push("localStorage 不可用，运行设置仅在当前会话保存在内存中。");
    }
  }

  return {
    projectRepository,
    assetRepository,
    workspaceRepository,
    runRepository,
    executionJobRepository,
    settingsRepository,
    plannerEngine: defaultPlannerEngine,
    imageGenerator: defaultImageGenerator,
    copilotEngine: defaultCopilotEngine,
    createPlannerEngine(settings) {
      const capabilities = detectProviderCapabilities(runtimeTextBaseUrl(settings));
      return new OpenAIPlanner({
        endpoint: `${runtimeTextBaseUrl(settings)}/chat/completions`,
        apiKey: runtimeTextApiKey(settings),
        model: settings.planningModel,
        plannerReferenceImages: capabilities.plannerReferenceImages,
      });
    },
    createImageGenerator(settings) {
      const imageBaseUrl = runtimeImageBaseUrl(settings);
      const capabilities = detectProviderCapabilities(imageBaseUrl);
      return new OpenAIImageGenerator({
        baseUrl: imageBaseUrl,
        apiKey: runtimeImageApiKey(settings),
        model: settings.imageModel,
        transport: capabilities.imageTransport,
      });
    },
    createCopilotEngine(settings) {
      return new OpenAICopilot({
        endpoint: `${runtimeTextBaseUrl(settings)}/chat/completions`,
        apiKey: runtimeTextApiKey(settings),
        model: settings.planningModel,
      });
    },
    testConnection: testApiConnection,
    compressImageFile,
    createObjectURL(blob) {
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        throw new Error("当前环境无法创建素材预览 URL");
      }
      return URL.createObjectURL(blob);
    },
    revokeObjectURL(url) {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    },
    warning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}

export const workbenchStore = createWorkbenchStore(createDefaultWorkbenchDependencies());

export function useWorkbenchStore(): WorkbenchState;
export function useWorkbenchStore<T>(selector: (state: WorkbenchState) => T): T;
export function useWorkbenchStore<T>(
  selector?: (state: WorkbenchState) => T,
): WorkbenchState | T {
  if (selector) {
    return useStore(workbenchStore, selector);
  }
  return useStore(workbenchStore);
}
