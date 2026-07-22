import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Check, FolderOpen, PackageOpen, RefreshCw, X } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { AmazonWorkspace } from "./components/AmazonWorkspace";
import { ExecutionJobPanel } from "./components/ExecutionJobPanel";
import {
  CopilotTaskStatus,
  GenerationFailureStatus,
  GenerationTaskStatus,
} from "./components/GenerationActions";
import { GlobalAssetUpload } from "./components/GlobalAssetUpload";
import { ConfirmLeaveDialog } from "./components/ConfirmLeaveDialog";
import { LibraryView } from "./components/LibraryView";
import { platformIdForWorkflow } from "./components/PlatformProgress";
import { PlatformWorkspace } from "./components/PlatformWorkspace";
import { ProjectDialog } from "./components/ProjectDialog";
import {
  PlatformProductPickerDialog,
  type PlatformProductPickerChoice,
} from "./components/PlatformProductPickerDialog";
import { TaskHistoryArchive } from "./components/TaskHistory";
import { TaobaoWorkspace } from "./components/TaobaoWorkspace";
import { Button, Dialog, EmptyState, IconButton, StatusChip, StatusMessage } from "./components/ui";
import type { NavigationItemId } from "./domain/platforms/types";
import type { ExecutionJob } from "./domain/jobs/types";
import type { HistoryQueryService } from "./domain/history/query";
import { getPlatformRulePack } from "./domain/platforms/registry";
import type { ProductProject, UpdateProductProjectInput } from "./domain/projects/types";
import { runtimeSupportsImageEditing, type RuntimeMode } from "./domain/settings";
import type { PlatformWorkflowId } from "./domain/workspace/project-workspace";
import type { ProductionRunRecord } from "./domain/tasks";
import {
  OVERVIEW_EMPTY_STATUS,
  resolveOverviewNextAction,
} from "./domain/workspace/overview-guidance";
import {
  readDemoModeBannerDismissed,
  readLastPlatformOrDefault,
  writeDemoModeBannerDismissed,
  writeLastPlatform,
} from "./domain/workspace/preferences";
import { useWorkbenchStore, type WorkbenchAsset } from "./store/workbench-store";

function initialNavigationItem(): NavigationItemId {
  if (typeof window === "undefined") return "amazon";
  return readLastPlatformOrDefault(window.localStorage);
}

function Overview({
  projects,
  activeProject,
  assetCount,
  generatedCount,
  runtimeMode,
  preferredPlatform,
  onOpenPlatform,
}: {
  projects: ProductProject[];
  activeProject: ProductProject | null;
  assetCount: number;
  generatedCount: number;
  runtimeMode: RuntimeMode;
  preferredPlatform: "taobao" | "amazon";
  onOpenPlatform: (platformId: "taobao" | "amazon" | "library") => void;
}) {
  const nextAction = resolveOverviewNextAction({
    hasActiveProject: Boolean(activeProject),
    assetCount,
    preferredPlatform,
  });

  return (
    <div className="overview-view">
      <div className="overview-command">
        <div className="overview-command__main">
          <div>
            <h1>{activeProject ? activeProject.name : "电商工作台"}</h1>
            <p className="overview-command__status">
              {activeProject
                ? `资料 ${projects.length} · 参考图 ${assetCount} · 生成图 ${generatedCount} · ${
                    runtimeMode === "api" ? "API" : "演示"
                  }`
                : OVERVIEW_EMPTY_STATUS}
              {runtimeMode === "api" ? (
                <span className="visually-hidden">当前浏览器保存的 API 配置</span>
              ) : null}
            </p>
          </div>
          <div className="overview-next-action overview-next-action--compact">
            <strong>{nextAction.title}</strong>
            <Button onClick={() => onOpenPlatform(nextAction.destination)}>
              {nextAction.actionLabel}
            </Button>
          </div>
        </div>
        <div className="overview-top-grid overview-platform-entry">
          <button
            type="button"
            className="overview-platform-card"
            aria-label="进入淘宝 / 天猫工作区"
            onClick={() => onOpenPlatform("taobao")}
          >
            <Box size={20} />
            <span>
              <strong>淘宝 / 天猫</strong>
              <em>头图 + 详情</em>
            </span>
          </button>
          <button
            type="button"
            className="overview-platform-card"
            aria-label="进入 Amazon 工作区"
            onClick={() => onOpenPlatform("amazon")}
          >
            <PackageOpen size={20} />
            <span>
              <strong>Amazon</strong>
              <em>Listing | A+ 分模式</em>
            </span>
          </button>
        </div>

        {activeProject ? (
          <div className="overview-metrics" aria-label="工作台摘要">
            <div className="metric metric--blue">
              <span>商品档案</span>
              <strong className="metric__text-value">{projects.length}</strong>
              <p>共享商品事实</p>
            </div>
            <div className="metric metric--neutral">
              <span>参考图</span>
              <strong>{assetCount}</strong>
              <p>可用于平台策划</p>
            </div>
            <div className="metric metric--green">
              <span>已生成</span>
              <strong>{generatedCount}</strong>
              <p>当前浏览器中的结果</p>
            </div>
            <div className="metric metric--yellow">
              <span>运行模式</span>
              <strong className="metric__text-value">
                {runtimeMode === "api" ? "API" : "演示"}
              </strong>
              <p>
                {runtimeMode === "api" ? "当前浏览器保存的 API 配置" : "不会调用外部模型"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          variant="setup"
          eyebrow="从商品信息开始"
          icon={<FolderOpen size={24} />}
          title="工作台还没有商品档案"
          description="资料库是整个流程的起点。先维护真实商品事实和参考素材，再进入不同平台制作图组。"
          details={
            <ul className="empty-state__checklist empty-state__checklist--horizontal">
              <li><Check size={15} />建立商品档案</li>
              <li><Check size={15} />上传参考素材</li>
              {preferredPlatform === "taobao" ? (
                <li><Check size={15} />生成淘宝图片策划</li>
              ) : (
                <li><Check size={15} />进入 Amazon 策划出图</li>
              )}
            </ul>
          }
          action={<Button onClick={() => onOpenPlatform("library")}>进入资料库</Button>}
        />
      ) : null}
    </div>
  );
}

function HistoryView({
  projects,
  activeProjectId,
  activeRunIds,
  jobs,
  onOpenLibrary,
  onResumeJob,
  onRetryJob,
  onCancelJob,
  onResumeRun,
  onForkRun,
  onReuseImage,
  onExportRun,
  historyQueryService,
}: {
  projects: ProductProject[];
  activeProjectId?: string | null;
  activeRunIds: string[];
  jobs: ExecutionJob[];
  onOpenLibrary?: () => void;
  onResumeJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onResumeRun: (record: ProductionRunRecord) => void;
  onForkRun: (record: ProductionRunRecord) => void;
  onReuseImage: (record: ProductionRunRecord, eventId: string) => void;
  onExportRun: (record: ProductionRunRecord) => void;
  historyQueryService: HistoryQueryService | null;
}) {
  const activeJobCount = jobs.filter((job) =>
    job.status === "queued" || job.status === "running" || job.status === "paused",
  ).length;

  return (
    <div className="simple-view">
      <div className="workbench-toolbar">
        <div className="workbench-toolbar__title-block">
          <h1>生产记录</h1>
          <span>查看批量任务、历史 Run 与交付结果</span>
        </div>
        <div className="workbench-toolbar__actions">
          <StatusChip tone={activeJobCount > 0 ? "info" : "neutral"}>
            {activeJobCount > 0 ? `${activeJobCount} 个进行中` : "当前无进行中任务"}
          </StatusChip>
        </div>
      </div>
      <ExecutionJobPanel
        jobs={jobs}
        onResume={onResumeJob}
        onRetry={onRetryJob}
        onCancel={onCancelJob}
      />
      <TaskHistoryArchive
        projects={projects}
        activeProjectId={activeProjectId}
        activeRunIds={activeRunIds}
        onOpenLibrary={onOpenLibrary}
        onResumeRun={onResumeRun}
        onForkRun={onForkRun}
        onReuseImage={onReuseImage}
        onExportRun={onExportRun}
        historyQueryService={historyQueryService}
      />
    </div>
  );
}

export function App() {
  const [activeItem, setActiveItem] = useState<NavigationItemId>(initialNavigationItem);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProductProject | null>(null);
  const [productPickerPlatform, setProductPickerPlatform] = useState<"taobao" | "amazon" | null>(
    null,
  );
  /** Pending seed that needs user confirmation before overwriting an existing draft/plan. */
  const [pendingIntakeSeed, setPendingIntakeSeed] = useState<{
    projectId: string;
    platform: "taobao" | "amazon";
  } | null>(null);
  const [workspaceDirtyReason, setWorkspaceDirtyReason] = useState<string | null>(null);
  const [navigationWarning, setNavigationWarning] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<
    | { kind: "nav"; item: NavigationItemId }
    | { kind: "project"; projectId: string; seedPlatform?: "taobao" | "amazon" }
    | null
  >(null);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return readDemoModeBannerDismissed(window.localStorage);
  });
  const openGlobalFilePickerRef = useRef<(() => void) | null>(null);
  const {
    initialized,
    loading,
    error,
    warning,
    resourceRestoreError,
    projects,
    activeProject,
    assets,
    sessions,
    runs,
    jobs,
    historyQueryService,
    plans,
    planInputSignatures,
    selectedSlotKeys,
    amazonPlannerMode,
    slotVersions,
    planningPlatformId,
    planningError,
    generatingSlot,
    generationCanceling,
    generationRecoveryRequired,
    generationError,
    generationErrorTarget,
    exportingPlatform,
    exportError,
    exportErrorPlatform,
    runtimeSettings,
    settingsLoading,
    settingsError,
    connectionTestStatus,
    connectionTestMessage,
    textConnectionTestStatus,
    textConnectionTestMessage,
    imageConnectionTestStatus,
    imageConnectionTestMessage,
    copilotTarget,
    copilotFeedbackTarget,
    copilotError,
    copilotMessage,
    initialize,
    startAmazonSession,
    analyzeTaobaoProduct,
    reopenTaobaoAnalysis,
    seedPlatformIntakeFromProject,
    syncAmazonListingFacts,
    createProject,
    updateActiveProject,
    removeProject,
    selectProject,
    uploadReferenceFiles,
    createStyleReference,
    removeAsset,
    planPlatform,
    selectAmazonPlannerMode,
    cancelPlanning,
    selectSessionSlot,
    selectPlannedSlot,
    updatePlannedSlot,
    clearPlanningError,
    generateSessionSlot,
    generateSlot,
    startBatchGeneration,
    resumeExecutionJob,
    retryExecutionJob,
    cancelExecutionJob,
    generateMaskedVersion,
    cancelGeneration,
    activateSlotVersion,
    resumeRun,
    forkRun,
    reuseRunImageAsReference,
    reuseGeneratedImageAsReference,
    clearGenerationError,
    exportPlatform,
    exportRun,
    clearExportError,
    saveRuntimeSettings,
    testRuntimeConnection,
    runCopilotCommand,
    cancelCopilot,
    retryActiveProjectResources,
    clearResourceRestoreError,
    clearError,
    dispose,
  } = useWorkbenchStore();

  useEffect(() => {
    void initialize();
    return dispose;
  }, [dispose, initialize]);
  useEffect(() => {
    if (!workspaceDirtyReason) return;
    const preventUnsavedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedExit);
    return () => window.removeEventListener("beforeunload", preventUnsavedExit);
  }, [workspaceDirtyReason]);

  const handleWorkspaceDirtyChange = useCallback((reason: string | null) => {
    setWorkspaceDirtyReason(reason);
    if (!reason) setNavigationWarning(null);
  }, []);

  const blockUnsavedNavigation = () => {
    if (!workspaceDirtyReason) return false;
    setNavigationWarning(`${workspaceDirtyReason} 可保存、丢弃后再继续，或取消。`);
    return true;
  };
  const requestNavigation = (item: NavigationItemId) => {
    if (item === activeItem) return;
    if (workspaceDirtyReason) {
      setPendingLeave({ kind: "nav", item });
      setNavigationWarning(`${workspaceDirtyReason} 可保存、丢弃后再继续，或取消。`);
      return;
    }
    changeActiveItem(item);
  };
  const requestProjectChange = (id: string) => {
    if (id === activeProject?.id) return;
    if (workspaceDirtyReason) {
      setPendingLeave({ kind: "project", projectId: id });
      setNavigationWarning(`${workspaceDirtyReason} 可保存、丢弃后再继续，或取消。`);
      return;
    }
    void selectProject(id);
  };
  const discardPendingLeave = () => {
    const pending = pendingLeave;
    setPendingLeave(null);
    setNavigationWarning(null);
    handleWorkspaceDirtyChange(null);
    if (!pending) return;
    if (pending.kind === "nav") {
      setActiveItem(pending.item);
      clearPlanningError();
      if (pending.item === "taobao" || pending.item === "amazon") {
        writeLastPlatform(window.localStorage, pending.item);
      }
      return;
    }
    void (async () => {
      await selectProject(pending.projectId);
      if (!pending.seedPlatform) return;
      const seedResult = await seedPlatformIntakeFromProject(
        pending.projectId,
        pending.seedPlatform,
      );
      if (seedResult === "needs-confirm") {
        setPendingIntakeSeed({
          projectId: pending.projectId,
          platform: pending.seedPlatform,
        });
      }
    })();
  };
  const savePendingLeave = async () => {
    // ProductSourcePanel owns the draft, so return to the panel without implying
    // that the dialog itself has saved anything.
    setNavigationWarning(
      `${workspaceDirtyReason ?? "有未保存修改"} 请先在资料面板点击「保存」，再切换。`,
    );
    setPendingLeave(null);
  };

  const create = async (input: Parameters<typeof createProject>[0]) => {
    const created = await createProject(input);
    if (created) setActiveItem("library");
    return Boolean(created);
  };
  const save = async (input: UpdateProductProjectInput) => Boolean(await updateActiveProject(input));
  const removeCurrentProject = async (id: string) => {
    const project = projects.find((candidate) => candidate.id === id);
    if (!project) return false;
    clearError();
    setProjectPendingDelete(project);
    return false;
  };
  const confirmProjectDelete = async () => {
    if (!projectPendingDelete) return;
    const projectId = projectPendingDelete.id;
    const removed = await removeProject(projectId);
    if (removed) setProjectPendingDelete(null);
  };
  const upload = async (files: File[]) => {
    const beforeIds = new Set(assets.map((asset) => asset.metadata.id));
    const result = await uploadReferenceFiles(files);
    const addedCount = result.filter((asset) => !beforeIds.has(asset.metadata.id)).length;
    if (addedCount > 0) {
      setUploadFeedback(`已上传 ${addedCount} 张参考图`);
    }
  };
  const requestGlobalUpload = () => {
    openGlobalFilePickerRef.current?.();
  };
  const dismissDemoBanner = () => {
    setDemoBannerDismissed(true);
    if (typeof window !== "undefined") {
      writeDemoModeBannerDismissed(window.localStorage, true);
    }
  };
  const openSettingsFromBanner = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ecom:open-settings", { detail: { open: true } }));
    }
  };
  const remove = async (id: string) => {
    await removeAsset(id);
  };
  const openProjectDialog = () => {
    if (blockUnsavedNavigation()) return;
    clearError();
    setProjectDialogOpen(true);
  };
  const closeProjectDialog = () => {
    setProjectDialogOpen(false);
    clearError();
  };
  const changeActiveItem = (item: NavigationItemId) => {
    if (item !== activeItem && blockUnsavedNavigation()) return;
    setActiveItem(item);
    clearPlanningError();
    if (item === "taobao" || item === "amazon") {
      writeLastPlatform(window.localStorage, item);
    }
  };
  const applyPlatformIntakeSeed = async (
    projectId: string,
    platform: "taobao" | "amazon",
    options?: { force?: boolean },
  ): Promise<"seeded" | "needs-confirm" | "skipped" | "failed"> => {
    return seedPlatformIntakeFromProject(projectId, platform, options);
  };
  const openLibraryWorkflow = async (
    projectId: string,
    workflowId: PlatformWorkflowId,
  ) => {
    if (blockUnsavedNavigation()) return;
    if (activeProject?.id !== projectId) {
      await selectProject(projectId);
    }
    if (workflowId === "amazon-listing" || workflowId === "amazon-aplus") {
      await selectAmazonPlannerMode(
        workflowId === "amazon-aplus" ? "aplus" : "listing",
      );
    }
    const platform = platformIdForWorkflow(workflowId);
    const seedResult = await applyPlatformIntakeSeed(projectId, platform);
    if (seedResult === "needs-confirm") {
      setPendingIntakeSeed({ projectId, platform });
    }
    changeActiveItem(platform);
  };
  const changeActiveProject = (id: string) => {
    if (id === activeProject?.id || blockUnsavedNavigation()) return;
    void selectProject(id);
  };
  const handleProductPickerChoice = async (choice: PlatformProductPickerChoice) => {
    const platform = productPickerPlatform;
    if (!platform) return;
    if (choice.kind === "create") {
      setProductPickerPlatform(null);
      openProjectDialog();
      return;
    }
    if (choice.kind === "library") {
      setProductPickerPlatform(null);
      changeActiveItem("library");
      return;
    }
    if (choice.kind === "manual") {
      setProductPickerPlatform(null);
      return;
    }
    setProductPickerPlatform(null);
    if (workspaceDirtyReason) {
      setPendingLeave({
        kind: "project",
        projectId: choice.projectId,
        seedPlatform: platform,
      });
      setNavigationWarning(`${workspaceDirtyReason} 可保存、丢弃后再切换商品，或取消。`);
      return;
    }
    const seedResult = await applyPlatformIntakeSeed(choice.projectId, platform);
    if (seedResult === "needs-confirm") {
      setPendingIntakeSeed({ projectId: choice.projectId, platform });
    }
  };
  const confirmPendingIntakeSeed = async () => {
    if (!pendingIntakeSeed) return;
    const { projectId, platform } = pendingIntakeSeed;
    setPendingIntakeSeed(null);
    await applyPlatformIntakeSeed(projectId, platform, { force: true });
  };
  const cancelPendingIntakeSeed = () => {
    setPendingIntakeSeed(null);
  };
  const openGenerationErrorTarget = () => {
    if (!generationErrorTarget) return;
    const target = generationErrorTarget;
    setActiveItem(target.platformId);
    clearPlanningError();
    writeLastPlatform(window.localStorage, target.platformId);
    if (plans[target.platformId]?.slots.some((slot) => slot.slotKey === target.slotKey)) {
      void selectPlannedSlot(target.platformId, target.slotKey);
    }
  };
  const downloadExport = (exported: NonNullable<Awaited<ReturnType<typeof exportPlatform>>>) => {
    if (!exported) return;
    const url = URL.createObjectURL(exported.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exported.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportFeedback(`已开始下载 ${exported.fileName}`);
  };
  const downloadGeneratedImage = (asset: WorkbenchAsset) => {
    const anchor = document.createElement("a");
    anchor.href = asset.objectUrl;
    anchor.download = asset.metadata.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };
  const exportCurrentPlatform = async (platformId: "taobao" | "amazon") => {
    const exported = await exportPlatform(platformId);
    if (exported) downloadExport(exported);
  };
  const exportHistoryRun = async (runId: string) => {
    const exported = await exportRun(runId);
    if (exported) downloadExport(exported);
  };
  const settingsLockReason = loading
    ? "工作台正在加载或保存项目与素材，请完成后再修改运行设置。"
    : generatingSlot
      ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请完成或取消后再修改运行设置。`
      : planningPlatformId
        ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请完成或取消后再修改运行设置。`
        : copilotTarget
          ? `${getPlatformRulePack(copilotTarget.platformId).label} · ${copilotTarget.slotKey} Copilot 请求处理中，请完成或取消后再修改运行设置。`
          : null;
  const activeAmazonWorkflowId =
    amazonPlannerMode === "aplus" ? "amazon-aplus" : "amazon-listing";
  const activeAmazonSession = [...sessions]
    .filter((session) => session.workflowId === activeAmazonWorkflowId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const activeTaobaoSession = [...sessions]
    .filter((session) => session.workflowId === "taobao-product")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const activeBatchJobFor = (platformId: "taobao" | "amazon") =>
    jobs
      .filter((job) =>
        job.kind === "batch-generate" &&
        job.items.some((item) =>
          item.target.platformId === platformId && item.target.projectId === activeProject?.id,
        ),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const activeAmazonBatchJob = activeBatchJobFor("amazon");
  const activeTaobaoBatchJob = activeBatchJobFor("taobao");
  const imageEditingSupported = runtimeSupportsImageEditing(runtimeSettings);
  const imageEditingDisabledReason = imageEditingSupported
    ? undefined
    : "当前图片服务不支持显式遮罩编辑，请改用兼容 Images API 的图片服务。";
  const activeRunIds = Object.values(
    sessions.reduce<Record<string, (typeof sessions)[number]>>((latest, session) => {
      const current = latest[session.workflowId];
      if (!current || session.updatedAt > current.updatedAt) latest[session.workflowId] = session;
      return latest;
    }, {}),
  ).flatMap((session) => session.activeRunId ? [session.activeRunId] : []);

  const activeView = (
    <>
      {activeItem === "overview" ? (
        <Overview
          projects={projects}
          activeProject={activeProject}
          assetCount={assets.filter((asset) => asset.metadata.kind === "reference").length}
          generatedCount={assets.filter((asset) => asset.metadata.kind === "generated").length}
          runtimeMode={runtimeSettings.mode}
          preferredPlatform={readLastPlatformOrDefault(
            typeof window === "undefined"
              ? { getItem: () => null, setItem: () => undefined }
              : window.localStorage,
          )}
          onOpenPlatform={(item) => changeActiveItem(item)}
        />
      ) : null}
      {activeItem === "library" ? (
        <LibraryView
          projects={projects}
          activeProject={activeProject}
          assets={assets}
          sessions={sessions}
          runs={runs}
          loading={loading}
          onCreate={openProjectDialog}
          onSelectProject={changeActiveProject}
          onOpenWorkflow={(projectId, workflowId) =>
            void openLibraryWorkflow(projectId, workflowId)
          }
          onSave={save}
          onRemoveProject={removeCurrentProject}
          onUpload={upload}
          onRemove={remove}
          onDirtyChange={(dirty) =>
            handleWorkspaceDirtyChange(dirty ? "商品资料有未保存修改，请先保存商品资料。" : null)
          }
        />
      ) : null}
      {activeItem === "taobao" || activeItem === "amazon" ? (
        activeItem === "amazon" ? (
          <AmazonWorkspace
            activeProject={activeProject}
            assets={assets}
            session={activeAmazonSession}
            plannerMode={amazonPlannerMode}
            loading={loading}
            planning={planningPlatformId === "amazon"}
            error={planningError}
            onStartSession={startAmazonSession}
            onSyncListingFacts={syncAmazonListingFacts}
            onOpenLibrary={() => changeActiveItem("library")}
            onOpenProductPicker={() => setProductPickerPlatform("amazon")}
            onCreateStyleReference={createStyleReference}
            onRemoveAsset={removeAsset}
            onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
          >
            <PlatformWorkspace
              platform="amazon"
              activeProject={activeProject}
              assets={assets}
              runtimeMode={runtimeSettings.mode}
              amazonPlannerMode={amazonPlannerMode}
              productionSession={activeAmazonSession}
              loading={loading}
              plan={plans.amazon}
              batchJob={activeAmazonBatchJob}
              planInputSignature={planInputSignatures.amazon}
              selectedSlotKey={selectedSlotKeys.amazon}
              planning={planningPlatformId === "amazon"}
              planningPlatformId={planningPlatformId}
              planningError={planningError}
              slotVersionStates={slotVersions.amazon}
              generatingSlot={generatingSlot}
              generationRecoveryRequired={generationRecoveryRequired}
              generationErrorTarget={generationErrorTarget}
              copilotTarget={copilotTarget}
              copilotFeedbackTarget={copilotFeedbackTarget}
              copilotError={copilotError}
              copilotMessage={copilotMessage}
              exporting={exportingPlatform === "amazon"}
              exportError={exportErrorPlatform === "amazon" ? exportError : null}
              onCreate={openProjectDialog}
              onOpenLibrary={() => changeActiveItem("library")}
              onOpenProductPicker={() => setProductPickerPlatform("amazon")}
              onRequestUpload={requestGlobalUpload}
              onSave={save}
              onUpload={upload}
              onRemove={remove}
              onPlan={(amazonOptions) => planPlatform("amazon", amazonOptions)}
              onAmazonPlannerModeChange={selectAmazonPlannerMode}
              onCancelPlanning={cancelPlanning}
              onClearPlanningError={clearPlanningError}
              onSelectSlot={(slotKey) =>
                activeAmazonSession
                  ? selectSessionSlot(activeAmazonSession.id, slotKey)
                  : selectPlannedSlot("amazon", slotKey)
              }
              onUpdateSlot={(slotKey, patch) => updatePlannedSlot("amazon", slotKey, patch)}
              onGenerateSlot={(slotKey) =>
                void (activeAmazonSession
                  ? generateSessionSlot(activeAmazonSession.id, slotKey)
                  : generateSlot("amazon", slotKey))
              }
              onStartBatch={() => void startBatchGeneration("amazon")}
              onOpenHistory={() => changeActiveItem("history")}
              onActivateVersion={(slotKey, versionId) =>
                void activateSlotVersion("amazon", slotKey, versionId)
              }
              imageEditingSupported={imageEditingSupported}
              imageEditingDisabledReason={imageEditingDisabledReason}
              onDownloadVersion={(_version, asset) => downloadGeneratedImage(asset)}
              onUseAsReference={(asset) => void reuseGeneratedImageAsReference(asset.metadata.id)}
              onMaskEdit={async (sessionId, slotKey, versionId, mask, prompt) =>
                Boolean(
                  await generateMaskedVersion(sessionId, slotKey, versionId, mask, prompt),
                )
              }
              onExport={() => void exportCurrentPlatform("amazon")}
              onClearExportError={clearExportError}
              onCopilotCommand={(slotKey, command) =>
                void runCopilotCommand("amazon", slotKey, command)
              }
              onCancelCopilot={cancelCopilot}
              onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
            />
          </AmazonWorkspace>
        ) : (
          <TaobaoWorkspace
            activeProject={activeProject}
            assets={assets}
            session={activeTaobaoSession}
            loading={loading || planningPlatformId === "taobao"}
            analysisLockedReason={
              planningPlatformId && planningPlatformId !== "taobao"
                ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请完成或取消后再分析淘宝商品。`
                : undefined
            }
            onCancelPlanning={cancelPlanning}
            error={planningError}
            onAnalyze={analyzeTaobaoProduct}
            onOpenLibrary={() => changeActiveItem("library")}
            onOpenProductPicker={() => setProductPickerPlatform("taobao")}
            onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
            onReanalyze={() => void reopenTaobaoAnalysis(activeTaobaoSession?.id)}
            reanalyzeDisabled={Boolean(
              loading ||
                planningPlatformId ||
                generatingSlot ||
                exportingPlatform ||
                workspaceDirtyReason,
            )}
            reanalyzeDisabledReason={
              workspaceDirtyReason
                ? `${workspaceDirtyReason} 保存后再重新分析。`
                : planningPlatformId || generatingSlot || exportingPlatform
                  ? "当前有进行中的任务，请完成后再重新分析。"
                  : undefined
            }
          >
            <PlatformWorkspace
              platform="taobao"
              activeProject={activeProject}
              assets={assets}
              runtimeMode={runtimeSettings.mode}
              productionSession={activeTaobaoSession}
              loading={loading}
              plan={plans.taobao}
              batchJob={activeTaobaoBatchJob}
              planInputSignature={planInputSignatures.taobao}
              selectedSlotKey={selectedSlotKeys.taobao}
              planning={planningPlatformId === "taobao"}
              planningPlatformId={planningPlatformId}
              planningError={planningError}
              slotVersionStates={slotVersions.taobao}
              generatingSlot={generatingSlot}
              generationRecoveryRequired={generationRecoveryRequired}
              generationErrorTarget={generationErrorTarget}
              copilotTarget={copilotTarget}
              copilotFeedbackTarget={copilotFeedbackTarget}
              copilotError={copilotError}
              copilotMessage={copilotMessage}
              exporting={exportingPlatform === "taobao"}
              exportError={exportErrorPlatform === "taobao" ? exportError : null}
              onCreate={openProjectDialog}
              onOpenLibrary={() => changeActiveItem("library")}
              onOpenProductPicker={() => setProductPickerPlatform("taobao")}
              onRequestUpload={requestGlobalUpload}
              onSave={save}
              onUpload={upload}
              onRemove={remove}
              onPlan={() => planPlatform("taobao")}
              onAmazonPlannerModeChange={selectAmazonPlannerMode}
              onCancelPlanning={cancelPlanning}
              onClearPlanningError={clearPlanningError}
              onSelectSlot={(slotKey) =>
                activeTaobaoSession
                  ? selectSessionSlot(activeTaobaoSession.id, slotKey)
                  : selectPlannedSlot("taobao", slotKey)
              }
              onUpdateSlot={(slotKey, patch) => updatePlannedSlot("taobao", slotKey, patch)}
              onGenerateSlot={(slotKey) =>
                void (activeTaobaoSession
                  ? generateSessionSlot(activeTaobaoSession.id, slotKey)
                  : generateSlot("taobao", slotKey))
              }
              onStartBatch={() => void startBatchGeneration("taobao")}
              onOpenHistory={() => changeActiveItem("history")}
              onActivateVersion={(slotKey, versionId) =>
                void activateSlotVersion("taobao", slotKey, versionId)
              }
              imageEditingSupported={imageEditingSupported}
              imageEditingDisabledReason={imageEditingDisabledReason}
              onDownloadVersion={(_version, asset) => downloadGeneratedImage(asset)}
              onUseAsReference={(asset) => void reuseGeneratedImageAsReference(asset.metadata.id)}
              onMaskEdit={async (sessionId, slotKey, versionId, mask, prompt) =>
                Boolean(
                  await generateMaskedVersion(sessionId, slotKey, versionId, mask, prompt),
                )
              }
              onExport={() => void exportCurrentPlatform("taobao")}
              onClearExportError={clearExportError}
              onCopilotCommand={(slotKey, command) =>
                void runCopilotCommand("taobao", slotKey, command)
              }
              onCancelCopilot={cancelCopilot}
              onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
            />
          </TaobaoWorkspace>
        )
      ) : null}
      {activeItem === "history" ? (
        <HistoryView
          projects={projects}
          activeProjectId={activeProject?.id}
          activeRunIds={activeRunIds}
          jobs={jobs}
          onOpenLibrary={() => changeActiveItem("library")}
          onResumeJob={(jobId) => void resumeExecutionJob(jobId)}
          onRetryJob={(jobId) => void retryExecutionJob(jobId)}
          onCancelJob={(jobId) => void cancelExecutionJob(jobId)}
          onResumeRun={(record) => void resumeRun(record.run.id).then((resumed) => {
            if (resumed) changeActiveItem(record.run.platformId);
          })}
          onForkRun={(record) => void forkRun(record.run.id).then((session) => {
            if (session) changeActiveItem(record.run.platformId);
          })}
          onReuseImage={(record, eventId) => void reuseRunImageAsReference(record.run.id, eventId)}
          onExportRun={(record) => void exportHistoryRun(record.run.id)}
          historyQueryService={historyQueryService}
        />
      ) : null}
    </>
  );

  return (
    <AppShell
      activeItem={activeItem}
      onActiveItemChange={requestNavigation}
      projects={projects}
      activeProject={activeProject}
      loading={loading}
      runtimeSettings={runtimeSettings}
      settingsLoading={settingsLoading}
      settingsError={settingsError}
      connectionTestStatus={connectionTestStatus}
      connectionTestMessage={connectionTestMessage}
      textConnectionTestStatus={textConnectionTestStatus}
      textConnectionTestMessage={textConnectionTestMessage}
      imageConnectionTestStatus={imageConnectionTestStatus}
      imageConnectionTestMessage={imageConnectionTestMessage}
      settingsLockReason={settingsLockReason}
      onSaveRuntimeSettings={saveRuntimeSettings}
      onTestRuntimeConnection={testRuntimeConnection}
      onTestTextConnection={(settings) => testRuntimeConnection(settings, "text")}
      onTestImageConnection={(settings) => testRuntimeConnection(settings, "image")}
      onCreateProject={openProjectDialog}
      onSelectProject={requestProjectChange}
    >
      <GlobalAssetUpload
        disabled={loading || !activeProject}
        onUpload={upload}
      >
        {({ openFilePicker }) => {
          openGlobalFilePickerRef.current = openFilePicker;
          return null;
        }}
      </GlobalAssetUpload>
      <div className="workspace-content-stack">
        {!initialized && loading ? <StatusMessage>正在恢复本地商品资料与图片...</StatusMessage> : null}
        {warning ? <StatusMessage tone="warning">{warning}</StatusMessage> : null}
        {navigationWarning ? (
          <StatusMessage tone="warning">{navigationWarning}</StatusMessage>
        ) : null}
        {uploadFeedback ? (
          <StatusMessage tone="success" className="upload-feedback-banner">
            <span>{uploadFeedback}</span>
            <IconButton
              label="关闭上传反馈"
              onClick={() => setUploadFeedback(null)}
            >
              <X size={15} />
            </IconButton>
          </StatusMessage>
        ) : null}
        {exportFeedback ? (
          <StatusMessage tone="success" className="export-feedback-banner" data-testid="export-feedback">
            <span>{exportFeedback}</span>
            <IconButton label="关闭导出反馈" onClick={() => setExportFeedback(null)}>
              <X size={15} />
            </IconButton>
          </StatusMessage>
        ) : null}
        {!demoBannerDismissed &&
        runtimeSettings.mode === "demo" &&
        (activeItem === "amazon" || activeItem === "taobao") ? (
          <StatusMessage tone="warning" className="demo-mode-banner" data-testid="demo-mode-banner">
            <span>
              当前为演示模式，不会调用外部模型。
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={openSettingsFromBanner}
              >
                打开设置
              </Button>
            </span>
            <IconButton label="关闭演示模式提示" onClick={dismissDemoBanner}>
              <X size={15} />
            </IconButton>
          </StatusMessage>
        ) : null}
        {resourceRestoreError ? (
          <StatusMessage tone="danger" className="workbench-error">
            <span>{resourceRestoreError}</span>
            <span className="status-message__actions">
              <Button
                variant="secondary"
                size="compact"
                disabled={loading}
                onClick={() => void retryActiveProjectResources()}
              >
                <RefreshCw size={14} />
                {loading ? "正在重试" : "重试恢复"}
              </Button>
              {!generationRecoveryRequired ? (
                <IconButton label="关闭恢复提示" onClick={clearResourceRestoreError}>
                  <X size={15} />
                </IconButton>
              ) : null}
            </span>
          </StatusMessage>
        ) : null}
        {error && !projectDialogOpen ? (
          <StatusMessage tone="danger" className="workbench-error">
            <span>{error}</span>
            <IconButton label="关闭错误提示" onClick={clearError}>
              <X size={15} />
            </IconButton>
          </StatusMessage>
        ) : null}
        {generatingSlot ? (
          <GenerationTaskStatus
            target={generatingSlot}
            canceling={generationCanceling}
            onCancel={cancelGeneration}
          />
        ) : null}
        {copilotTarget ? (
          <CopilotTaskStatus target={copilotTarget} onCancel={cancelCopilot} />
        ) : null}
        {!generatingSlot && generationError && generationErrorTarget ? (
          <GenerationFailureStatus
            target={generationErrorTarget}
            message={generationError}
            onOpen={openGenerationErrorTarget}
            onClear={clearGenerationError}
          />
        ) : null}
        {activeView}
      </div>
      <ProjectDialog
        open={projectDialogOpen}
        loading={loading}
        submissionError={projectDialogOpen ? error : null}
        onClose={closeProjectDialog}
        onCreate={create}
      />
      <PlatformProductPickerDialog
        open={productPickerPlatform !== null}
        platformLabel={
          productPickerPlatform === "taobao"
            ? "淘宝 / 天猫"
            : productPickerPlatform === "amazon"
              ? "Amazon"
              : "平台"
        }
        projects={projects}
        activeProjectId={activeProject?.id}
        allowManualWithoutProject={productPickerPlatform !== null}
        loading={loading}
        onClose={() => setProductPickerPlatform(null)}
        onChoose={(choice) => void handleProductPickerChoice(choice)}
      />
      <ConfirmLeaveDialog
        open={pendingLeave !== null}
        description={
          workspaceDirtyReason
            ? `${workspaceDirtyReason} 离开前请先在资料面板保存，或丢弃修改后继续。`
            : "当前有未保存修改。离开前请先保存或丢弃。"
        }
        onSave={() => void savePendingLeave()}
        onDiscard={discardPendingLeave}
        onCancel={() => {
          setPendingLeave(null);
          setNavigationWarning(null);
        }}
      />
      <Dialog
        open={projectPendingDelete !== null}
        title={`删除“${projectPendingDelete?.name ?? "商品"}”？`}
        eyebrow="删除商品档案"
        onClose={loading ? () => undefined : () => setProjectPendingDelete(null)}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => setProjectPendingDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={loading}
              loadingLabel="正在删除…"
              onClick={() => void confirmProjectDelete()}
            >
              删除商品
            </Button>
          </>
        }
      >
        <p>
          商品资料、参考素材、平台策划和生成记录都会从当前浏览器清理。此操作无法撤销。
        </p>
        {projectPendingDelete && error ? (
          <StatusMessage tone="danger">{error}</StatusMessage>
        ) : null}
      </Dialog>
      <Dialog
        open={pendingIntakeSeed !== null}
        title="覆盖当前草稿？"
        eyebrow="载入商品资料"
        onClose={loading ? () => undefined : cancelPendingIntakeSeed}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={cancelPendingIntakeSeed}
            >
              保留草稿
            </Button>
            <Button disabled={loading} onClick={() => void confirmPendingIntakeSeed()}>
              {loading ? "载入中…" : "覆盖并载入"}
            </Button>
          </>
        }
      >
        <p>
          当前{pendingIntakeSeed?.platform === "taobao" ? "淘宝" : "Amazon"}
          任务已有草稿或策划。载入资料库会用共享商品资料与参考图覆盖任务输入；已有策划将被清除，需重新生成。
        </p>
      </Dialog>
    </AppShell>
  );
}
