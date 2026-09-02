import type { AssetMetadata } from "../../domain/assets/types";
import type { AssetRepository } from "../../domain/assets/repository";
import type { ExecutionJobCoordinator } from "../../domain/jobs/execution-coordinator";
import type { ExecutionJobRepository } from "../../domain/jobs/repository";
import type { ExecutionJob } from "../../domain/jobs/types";
import type { ExportPackage } from "../../domain/export";
import type { SlotVersion, SlotVersionState, ImageGenerator } from "../../domain/generation/types";
import type { MaskDraft } from "../../domain/generation/mask";
import type { HistoryQueryService } from "../../domain/history/query";
import type { PlatformFactsDraft, ProductLocalizer } from "../../domain/localization/product-localizer";
import type {
  AmazonPlanningRequestOptions,
  PlannedSlot,
  PlannerEngine,
  PlanningReferenceImage,
  PlatformPlan,
} from "../../domain/planning/types";
import type { PlanningInputSnapshot, PlanningInputSourceMode } from "../../domain/planning/input-assessment";
import type { PlatformId } from "../../domain/platforms/types";
import type { IndustryTemplateSnapshot } from "../../domain/prompt-templates/industry-template-packs";
import type {
  IndustryTemplateTransformer,
  IndustryTemplateTransformRequest,
  IndustryTemplateTransformResult,
} from "../../domain/prompt-templates/industry-template-transformer";
import type {
  CreateProductProjectInput,
  ProductFacts,
  ProductProject,
  UpdateProductProjectInput,
} from "../../domain/projects/types";
import type { ProjectRepository } from "../../domain/projects/repository";
import type { RunRepository } from "../../domain/runs/repository";
import type { ConnectionTestResult, RuntimeSettings, SettingsRepository } from "../../domain/settings";
import type {
  AmazonModeWorkspaceSnapshot,
  AmazonWorkspaceMode,
  PlatformSession,
  PlatformWorkflowId,
  ProductionRun,
  ProjectWorkspaceRepository,
} from "../../domain/workspace/project-workspace";
import type { AiRuntimeFactory } from "../../services/ai/runtime-factory";

export interface WorkbenchAsset {
  metadata: AssetMetadata;
  objectUrl: string;
}

export interface StartAmazonSessionInput {
  projectId?: string;
  sourceMode?: PlanningInputSourceMode;
  createNewTask?: boolean;
  workflowId: Extract<PlatformWorkflowId, "amazon-listing" | "amazon-aplus">;
  listingText: string;
  facts?: ProductFacts;
  files: File[];
  selectedReferenceAssetIds: string[];
  selectedStyleReferenceId?: string | null;
  industryTemplate?: IndustryTemplateSnapshot;
  options: AmazonPlanningRequestOptions;
  autoPlan?: boolean;
}

export interface StartTaobaoSessionInput {
  projectId?: string;
  sourceMode?: PlanningInputSourceMode;
  createNewTask?: boolean;
  productText?: string;
  facts?: ProductFacts;
  selectedReferenceAssetIds: string[];
  planningInput?: PlanningInputSnapshot;
  stylePresetId?: string | null;
  industryTemplate?: IndustryTemplateSnapshot;
}

export interface AnalyzeTaobaoProductInput {
  projectId?: string;
  sourceMode?: PlanningInputSourceMode;
  createNewTask?: boolean;
  productText: string;
  facts?: ProductFacts;
  files: File[];
  selectedReferenceAssetIds: string[];
  stylePresetId?: string | null;
  industryTemplate?: IndustryTemplateSnapshot;
}

export interface WorkbenchStoreDependencies {
  projectRepository: ProjectRepository;
  assetRepository: AssetRepository;
  workspaceRepository?: ProjectWorkspaceRepository;
  runRepository?: RunRepository;
  executionJobRepository?: ExecutionJobRepository;
  executionJobCoordinator?: ExecutionJobCoordinator;
  historyQueryService?: HistoryQueryService;
  settingsRepository?: SettingsRepository;
  aiRuntimeFactory?: AiRuntimeFactory;
  plannerEngine?: PlannerEngine;
  createPlannerEngine?: (settings: RuntimeSettings) => PlannerEngine;
  productLocalizer?: ProductLocalizer;
  createProductLocalizer?: (settings: RuntimeSettings) => ProductLocalizer;
  planningTimeoutMs?: number;
  imageGenerator?: ImageGenerator;
  createImageGenerator?: (settings: RuntimeSettings) => ImageGenerator;
  industryTemplateTransformer?: IndustryTemplateTransformer;
  createIndustryTemplateTransformer?: (settings: RuntimeSettings) => IndustryTemplateTransformer;
  testConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  testTextConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  testImageConnection?: (settings: RuntimeSettings) => Promise<ConnectionTestResult>;
  generationTimeoutMs?: number;
  createVersionId?: () => string;
  now?: () => string;
  compressImageFile: (file: File) => Promise<File>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  warning?: string | null;
  prepareStorage?: () => Promise<string | null>;
}

export interface WorkbenchState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  warning: string | null;
  projects: ProductProject[];
  allProjects: ProductProject[];
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
  industryTemplateTransforming: boolean;
  industryTemplateTransformError: string | null;
  initialize(): Promise<void>;
  startAmazonSession(input: StartAmazonSessionInput): Promise<PlatformSession | null>;
  startTaobaoSession(input: StartTaobaoSessionInput): Promise<PlatformSession | null>;
  analyzeTaobaoProduct(input: AnalyzeTaobaoProductInput): Promise<PlatformSession | null>;
  reopenTaobaoAnalysis(sessionId?: string): Promise<boolean>;
  syncAmazonListingFacts(listingText: string): Promise<boolean>;
  syncAmazonSessionFacts(sessionId: string): Promise<boolean>;
  confirmLocalizedFacts(sessionId: string, facts: ProductFacts): Promise<boolean>;
  createProject(input: CreateProductProjectInput): Promise<ProductProject | null>;
  updateActiveProject(input: UpdateProductProjectInput): Promise<ProductProject | null>;
  removeProject(id: string): Promise<boolean>;
  selectProject(id: string): Promise<void>;
  uploadReferenceFiles(files: File[]): Promise<WorkbenchAsset[]>;
  removeAsset(id: string): Promise<void>;
  refreshAssets(): Promise<void>;
  planPlatform(platformId: PlatformId, amazonOptions?: AmazonPlanningRequestOptions): Promise<PlatformPlan | null>;
  selectAmazonPlannerMode(mode: AmazonWorkspaceMode): Promise<boolean>;
  cancelPlanning(): void;
  selectSessionSlot(sessionId: string, slotKey: string): Promise<boolean>;
  selectPlannedSlot(platformId: PlatformId, slotKey: string): Promise<boolean>;
  updatePlannedSlot(platformId: PlatformId, slotKey: string, patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> & Partial<Pick<PlannedSlot, "externalText">>): Promise<boolean>;
  generateSessionSlot(sessionId: string, slotKey: string): Promise<SlotVersion | null>;
  generateSlot(platformId: PlatformId, slotKey: string): Promise<SlotVersion | null>;
  generateMaskedVersion(sessionId: string, slotKey: string, versionId: string, mask: MaskDraft, prompt: string): Promise<SlotVersion | null>;
  cancelGeneration(): void;
  activateSlotVersion(platformId: PlatformId, slotKey: string, versionId: string): Promise<boolean>;
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
  removeRun(runId: string): Promise<boolean>;
  reuseRunImageAsReference(runId: string, eventId: string): Promise<WorkbenchAsset | null>;
  reuseGeneratedImageAsReference(assetId: string): Promise<WorkbenchAsset | null>;
  clearExportError(): void;
  saveRuntimeSettings(settings: RuntimeSettings): Promise<boolean>;
  testRuntimeConnection(settings?: RuntimeSettings, service?: "text" | "image" | "all"): Promise<ConnectionTestResult>;
  clearSettingsFeedback(): void;
  transformIndustryTemplate(request: IndustryTemplateTransformRequest): Promise<IndustryTemplateTransformResult | null>;
  cancelIndustryTemplateTransform(): void;
  retryActiveProjectResources(): Promise<void>;
  clearResourceRestoreError(): void;
  clearPlanningError(): void;
  clearError(): void;
  dispose(): void;
}
