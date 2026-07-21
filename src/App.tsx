import { useCallback, useEffect, useState } from "react";
import { Box, Check, FolderOpen, PackageOpen, RefreshCw, X } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { AmazonWorkspace } from "./components/AmazonWorkspace";
import { ExecutionJobPanel } from "./components/ExecutionJobPanel";
import {
  CopilotTaskStatus,
  GenerationFailureStatus,
  GenerationTaskStatus,
} from "./components/GenerationActions";
import { LibraryView } from "./components/LibraryView";
import { platformIdForWorkflow } from "./components/PlatformProgress";
import { PlatformWorkspace } from "./components/PlatformWorkspace";
import { ProjectDialog } from "./components/ProjectDialog";
import { TaskHistoryArchive } from "./components/TaskHistory";
import { TaobaoWorkspace } from "./components/TaobaoWorkspace";
import { Badge, Button, EmptyState, IconButton, StatusMessage } from "./components/ui";
import type { NavigationItemId } from "./domain/platforms/types";
import type { ExecutionJob } from "./domain/jobs/types";
import type { HistoryQueryService } from "./domain/history/query";
import { getPlatformRulePack } from "./domain/platforms/registry";
import type { ProductProject, UpdateProductProjectInput } from "./domain/projects/types";
import { runtimeSupportsImageEditing, type RuntimeMode } from "./domain/settings";
import type { PlatformWorkflowId } from "./domain/workspace/project-workspace";
import type { ProductionRunRecord } from "./domain/tasks";
import { readLastPlatformOrDefault, writeLastPlatform } from "./domain/workspace/preferences";
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
  onOpenPlatform,
}: {
  projects: ProductProject[];
  activeProject: ProductProject | null;
  assetCount: number;
  generatedCount: number;
  runtimeMode: RuntimeMode;
  onOpenPlatform: (platformId: "taobao" | "amazon" | "library") => void;
}) {
  const nextAction = !activeProject
    ? {
        title: "从资料库建立商品档案",
        actionLabel: "进入资料库",
        onAction: () => onOpenPlatform("library"),
      }
    : assetCount === 0
      ? {
          title: "补参考图后进入 Amazon 出图",
          actionLabel: "进入 Amazon",
          onAction: () => onOpenPlatform("amazon"),
        }
      : {
          title: "Amazon：选 Listing 或 A+ 后策划出图",
          actionLabel: "进入 Amazon",
          onAction: () => onOpenPlatform("amazon"),
        };

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
                : "资料库建档 → Amazon 分模式策划 → 逐图生成 → 导出"}
              {runtimeMode === "api" ? (
                <span className="visually-hidden">当前浏览器保存的 API 配置</span>
              ) : null}
            </p>
            {/* keep metric hook for any residual tests */}
            <div className="metric metric--yellow visually-hidden" aria-hidden="true">
              <span>运行模式</span>
              <strong>{runtimeMode === "api" ? "API" : "演示"}</strong>
              <p>
                {runtimeMode === "api" ? "当前浏览器保存的 API 配置" : "不会调用外部模型"}
              </p>
            </div>
          </div>
          <div className="overview-next-action overview-next-action--compact">
            <strong>{nextAction.title}</strong>
            <Button onClick={nextAction.onAction}>{nextAction.actionLabel}</Button>
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
              <li><Check size={15} />进入平台制作</li>
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
  return (
    <div className="simple-view">
      <div className="workbench-toolbar">
        <h1>生产记录</h1>
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
  const [workspaceDirtyReason, setWorkspaceDirtyReason] = useState<string | null>(null);
  const [navigationWarning, setNavigationWarning] = useState<string | null>(null);
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
    startTaobaoSession,
    analyzeTaobaoProduct,
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
    setNavigationWarning(`${workspaceDirtyReason} 保存后再继续。`);
    return true;
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
    if (!window.confirm(`确定删除项目“${project.name}”吗？项目内素材、策划和生成记录都会被清理。`)) {
      return false;
    }
    return removeProject(id);
  };
  const upload = async (files: File[]) => {
    await uploadReferenceFiles(files);
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
    changeActiveItem(platformIdForWorkflow(workflowId));
  };
  const changeActiveProject = (id: string) => {
    if (id === activeProject?.id || blockUnsavedNavigation()) return;
    void selectProject(id);
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
  useEffect(() => {
    if (!initialized || activeItem !== "taobao" || !activeProject || activeTaobaoSession) return;
    void startTaobaoSession({
      projectId: activeProject.id,
      selectedReferenceAssetIds: assets
        .filter((asset) => asset.metadata.kind === "reference")
        .map((asset) => asset.metadata.id),
    });
  }, [activeItem, activeProject, activeTaobaoSession, assets, initialized, startTaobaoSession]);
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
            onCreateStyleReference={createStyleReference}
            onRemoveAsset={removeAsset}
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
              onRequestUpload={() => {
                document.querySelector<HTMLInputElement>('[data-testid="asset-upload"]')?.click();
              }}
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
            loading={loading}
            error={planningError}
            onAnalyze={analyzeTaobaoProduct}
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
              onRequestUpload={() => {
                document.querySelector<HTMLInputElement>('[data-testid="asset-upload"]')?.click();
              }}
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
      onActiveItemChange={changeActiveItem}
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
      onSelectProject={changeActiveProject}
    >
      <div className="workspace-content-stack">
        {!initialized && loading ? <StatusMessage>正在恢复本地商品资料与图片...</StatusMessage> : null}
        {warning ? <StatusMessage tone="warning">{warning}</StatusMessage> : null}
        {navigationWarning ? (
          <StatusMessage tone="warning">{navigationWarning}</StatusMessage>
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
    </AppShell>
  );
}
