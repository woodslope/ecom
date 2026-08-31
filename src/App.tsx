import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { History, LoaderCircle, RefreshCw, Square } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { AmazonWorkspace } from "./components/AmazonWorkspace";
import { ExecutionJobPanel } from "./components/ExecutionJobPanel";
import { CopilotTaskStatus, GenerationTaskStatus } from "./components/GenerationActions";
import { ConfirmLeaveDialog } from "./components/ConfirmLeaveDialog";
import { PlatformWorkspace } from "./components/PlatformWorkspace";
import { TaobaoWorkspace } from "./components/TaobaoWorkspace";
import { Button, Dialog, StatusMessage, Toast, ToastRegion } from "./components/ui";
import { browserStorage } from "./application/browser-storage";
import type { NavigationItemId, PlatformId } from "./domain/platforms/types";
import type { ExecutionJob } from "./domain/jobs/types";
import type { HistoryQueryService } from "./domain/history/query";
import { productionHistoryRevision } from "./domain/history/revision";
import { getPlatformRulePack } from "./domain/platforms/registry";
import type { ProductProject, UpdateProductProjectInput } from "./domain/projects/types";
import { runtimeSupportsImageEditing } from "./domain/settings";
import type { ProductionRunRecord } from "./domain/tasks";
import {
  readLastPlatformOrDefault,
  writeLastPlatform,
} from "./domain/workspace/preferences";
import { useWorkbenchStore, type WorkbenchAsset } from "./store/workbench-store";

const TaskHistoryArchive = lazy(async () => {
  const module = await import("./components/TaskHistory");
  return { default: module.TaskHistoryArchive };
});

function initialNavigationItem(): NavigationItemId {
  if (typeof window === "undefined") return "amazon";
  return readLastPlatformOrDefault(browserStorage);
}

function PlatformHistoryPane({
  id,
  open,
  onClose,
  platform,
  projects,
  historyProjects,
  activeProjectId,
  activeRunIds,
  jobs,
  onResumeJob,
  onRetryJob,
  onCancelJob,
  onResumeRun,
  onForkRun,
  onExportRun,
  onDeleteRun,
  historyQueryService,
  historyRefreshKey,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
  platform: PlatformId;
  projects: ProductProject[];
  historyProjects: ProductProject[];
  activeProjectId?: string | null;
  activeRunIds: string[];
  jobs: ExecutionJob[];
  onResumeJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onResumeRun: (record: ProductionRunRecord) => void;
  onForkRun: (record: ProductionRunRecord) => void;
  onExportRun: (record: ProductionRunRecord) => void;
  onDeleteRun: (record: ProductionRunRecord) => Promise<boolean>;
  historyQueryService: HistoryQueryService | null;
  historyRefreshKey: string;
}) {
  const platformJobs = jobs.filter((job) =>
    job.items.some((item) => item.target.platformId === platform),
  );
  const activeJobCount = platformJobs.filter((job) =>
    job.status === "queued" || job.status === "running" || job.status === "paused"
  ).length;

  return (
    <Dialog
      id={id}
      open={open}
      title="历史记录"
      ariaLabel={`${getPlatformRulePack(platform).label}历史记录`}
      closeLabel="关闭历史记录"
      variant="sidebar"
      className="platform-history-pane"
      onClose={onClose}
    >
      {activeJobCount > 0 ? (
        <section className="platform-history-pane__active" aria-label="进行中任务">
          <h3>进行中 <span>{activeJobCount}</span></h3>
          <ExecutionJobPanel
            jobs={platformJobs.filter((job) => job.status === "queued" || job.status === "running" || job.status === "paused")}
            onResume={onResumeJob}
            onRetry={onRetryJob}
            onCancel={onCancelJob}
          />
        </section>
      ) : null}
      <section className="platform-history-pane__records" aria-label="生产记录">
        <Suspense fallback={<StatusMessage live="polite">正在载入历史记录...</StatusMessage>}>
          <TaskHistoryArchive
            projects={projects}
            historyProjects={historyProjects}
            activeProjectId={activeProjectId}
            activeRunIds={activeRunIds}
            platformId={platform}
            onResumeRun={onResumeRun}
            onForkRun={onForkRun}
            onExportRun={onExportRun}
            onDeleteRun={onDeleteRun}
            historyQueryService={historyQueryService}
            refreshKey={historyRefreshKey}
            compact
          />
        </Suspense>
      </section>
    </Dialog>
  );
}

export function App() {
  const [activeItem, setActiveItem] = useState<NavigationItemId>(initialNavigationItem);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setHistoryOpen(false);
  }, [activeItem]);

  const [newTaskTokens, setNewTaskTokens] = useState<Record<"taobao" | "amazon", number>>({
    taobao: 1,
    amazon: 1,
  });
  const [workspaceDirtyReason, setWorkspaceDirtyReason] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [warningVisible, setWarningVisible] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<
    | { kind: "nav"; item: NavigationItemId }
    | null
  >(null);
  const {
    initialized,
    loading,
    error,
    warning,
    resourceRestoreError,
    projects,
    allProjects,
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
    textConnectionTestStatus,
    textConnectionTestMessage,
    imageConnectionTestStatus,
    imageConnectionTestMessage,
    copilotTarget,
    initialize,
    startAmazonSession,
    startTaobaoSession,
    analyzeTaobaoProduct,
    reopenTaobaoAnalysis,
    confirmLocalizedFacts,
    updateActiveProject,
    uploadReferenceFiles,
    removeAsset,
    planPlatform,
    selectAmazonPlannerMode,
    cancelPlanning,
    cancelGeneration,
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
    activateSlotVersion,
    resumeRun,
    forkRun,
    removeRun,
    reuseGeneratedImageAsReference,
    exportPlatform,
    exportRun,
    clearExportError,
    saveRuntimeSettings,
    testRuntimeConnection,
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

  useEffect(() => {
    if (!uploadFeedback) return;
    const timer = window.setTimeout(() => setUploadFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [uploadFeedback]);

  useEffect(() => {
    if (!exportFeedback) return;
    const timer = window.setTimeout(() => setExportFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [exportFeedback]);

  useEffect(() => {
    setWarningVisible(Boolean(warning));
    if (!warning) return;
    const timer = window.setTimeout(() => setWarningVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [warning]);

  const handleWorkspaceDirtyChange = useCallback((reason: string | null) => {
    setWorkspaceDirtyReason(reason);
  }, []);

  const blockUnsavedNavigation = (item: NavigationItemId = activeItem) => {
    if (!workspaceDirtyReason) return false;
    setPendingLeave({ kind: "nav", item });
    return true;
  };
  const requestNavigation = (item: NavigationItemId) => {
    if (item === activeItem) return;
    if (workspaceDirtyReason) {
      setPendingLeave({ kind: "nav", item });
      return;
    }
    changeActiveItem(item);
  };
  const discardPendingLeave = () => {
    const pending = pendingLeave;
    setPendingLeave(null);
    handleWorkspaceDirtyChange(null);
    if (!pending) return;
    setActiveItem(pending.item);
    clearPlanningError();
    if (pending.item === "taobao" || pending.item === "amazon") {
      writeLastPlatform(browserStorage, pending.item);
    }
  };
  const save = async (input: UpdateProductProjectInput) => Boolean(await updateActiveProject(input));
  const upload = async (files: File[]) => {
    const beforeIds = new Set(assets.map((asset) => asset.metadata.id));
    const result = await uploadReferenceFiles(files);
    const addedCount = result.filter((asset) => !beforeIds.has(asset.metadata.id)).length;
    if (addedCount > 0) {
      setUploadFeedback(`已上传 ${addedCount} 张参考图`);
    }
  };
  const exportLocalBackup = useCallback(async () => {
    const {
      createLocalBackup,
      localBackupFileName,
      summarizeLocalBackup,
    } = await import("./application/local-backup");
    const backup = await createLocalBackup({
      storage: browserStorage,
      indexedDB: window.indexedDB,
    });
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = localBackupFileName(backup.exportedAt);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    const summary = summarizeLocalBackup(backup);
    return `备份已导出：${summary.projectCount} 个商品、${summary.assetCount} 个素材、${summary.runCount} 条生产记录。`;
  }, []);

  const importLocalBackup = useCallback(async (file: File) => {
    const {
      parseLocalBackup,
      restoreLocalBackup,
    } = await import("./application/local-backup");
    const backup = parseLocalBackup(await file.text());
    const summary = await restoreLocalBackup(backup, {
      storage: browserStorage,
      indexedDB: window.indexedDB,
    });
    window.setTimeout(() => window.location.reload(), 600);
    return `备份恢复成功：${summary.projectCount} 个商品、${summary.assetCount} 个素材。正在重新加载应用...`;
  }, []);
  const remove = async (id: string) => {
    await removeAsset(id);
  };
  const startNewTask = (platform: PlatformId) => {
    if (platform !== "taobao" && platform !== "amazon") return;
    if (blockUnsavedNavigation(platform)) return;
    setNewTaskTokens((current) => ({ ...current, [platform]: current[platform] + 1 }));
    setActiveItem(platform);
    clearPlanningError();
    writeLastPlatform(browserStorage, platform);
  };
  const clearNewTask = (platform: "taobao" | "amazon") => {
    setNewTaskTokens((current) => ({ ...current, [platform]: 0 }));
  };
  const changeActiveItem = (item: NavigationItemId) => {
    if (item !== activeItem && blockUnsavedNavigation(item)) return;
    setActiveItem(item);
    clearPlanningError();
    if (item === "taobao" || item === "amazon") {
      writeLastPlatform(browserStorage, item);
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
  const historyAction = (
    <Button
      variant="secondary"
      size="normal"
      className="platform-history-trigger"
      aria-expanded={historyOpen}
      aria-controls="platform-history-pane"
      onClick={() => setHistoryOpen(true)}
    >
      <History size={14} aria-hidden="true" />
      历史记录
    </Button>
  );
  const activeRunIds = Object.values(
    sessions.reduce<Record<string, (typeof sessions)[number]>>((latest, session) => {
      const current = latest[session.workflowId];
      if (!current || session.updatedAt > current.updatedAt) latest[session.workflowId] = session;
      return latest;
    }, {}),
  ).flatMap((session) => session.activeRunId ? [session.activeRunId] : []);
  const isBlankTask = activeItem === "amazon" || activeItem === "taobao"
    ? newTaskTokens[activeItem] > 0
    : false;
  const currentAmazonSession = isBlankTask ? undefined : activeAmazonSession;
  const currentTaobaoSession = isBlankTask ? undefined : activeTaobaoSession;
  const hasCurrentPlatformSession = activeItem === "amazon"
    ? Boolean(currentAmazonSession)
    : activeItem === "taobao" ? Boolean(currentTaobaoSession) : false;
  const currentProject = hasCurrentPlatformSession ? activeProject : null;
  const currentAssets = hasCurrentPlatformSession ? assets : [];
  const currentPlan = isBlankTask
    ? undefined
    : activeItem === "amazon"
      ? currentAmazonSession ? plans.amazon : undefined
      : activeItem === "taobao"
        ? currentTaobaoSession ? plans.taobao : undefined
        : undefined;
  const activeRunStatusFor = (session: (typeof sessions)[number] | undefined) =>
    session?.activeRunId
      ? runs.find((run) => run.id === session.activeRunId)?.status
      : undefined;

  const activeView = (
    <>
      {activeItem === "taobao" || activeItem === "amazon" ? (
        <div className="platform-page-layout">
          <section className="platform-production-pane" aria-label={`${getPlatformRulePack(activeItem).label}制作区`}>
          {activeItem === "amazon" ? (
          <AmazonWorkspace
            key={`amazon-${newTaskTokens.amazon > 0 ? newTaskTokens.amazon : "current"}`}
            activeProject={currentProject}
            assets={currentAssets}
            session={currentAmazonSession}
            plannerMode={amazonPlannerMode}
            loading={loading}
            planning={planningPlatformId === "amazon"}
            error={planningError}
            onStartSession={async (input) => {
              const session = await startAmazonSession(input);
              if (session) clearNewTask("amazon");
              return session;
            }}
            onStartNewTask={() => startNewTask("amazon")}
            historyAction={historyAction}
            onConfirmLocalizedFacts={async (sessionId, facts) => {
              const currentSession = sessions.find((candidate) => candidate.id === sessionId);
              if (currentSession?.options.platformId !== "amazon") return;
              const confirmed = await confirmLocalizedFacts(sessionId, facts);
              if (!confirmed) return;
              await planPlatform("amazon", currentSession.options);
            }}
            onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
          >
            {(_contextBar) => <PlatformWorkspace
              platform="amazon"
              activeProject={currentProject}
              assets={currentAssets}
              amazonPlannerMode={amazonPlannerMode}
              productionSession={currentAmazonSession}
              loading={loading}
              plan={currentPlan}
              batchJob={isBlankTask ? undefined : activeAmazonBatchJob}
              activeRunStatus={activeRunStatusFor(currentAmazonSession)}
              planInputSignature={isBlankTask ? undefined : planInputSignatures.amazon}
              selectedSlotKey={isBlankTask ? undefined : selectedSlotKeys.amazon}
              planning={planningPlatformId === "amazon"}
              planningPlatformId={planningPlatformId}
              planningError={planningError}
              slotVersionStates={isBlankTask ? undefined : slotVersions.amazon}
              generatingSlot={generatingSlot}
              generationRecoveryRequired={generationRecoveryRequired}
              generationErrorTarget={generationErrorTarget}
              generationError={generationError}
              copilotTarget={copilotTarget}
              exporting={exportingPlatform === "amazon"}
              exportError={exportErrorPlatform === "amazon" ? exportError : null}
              onPlan={(amazonOptions) => planPlatform("amazon", amazonOptions)}
              onAmazonPlannerModeChange={selectAmazonPlannerMode}
              onCancelPlanning={cancelPlanning}
              onClearPlanningError={clearPlanningError}
              onStartNewTask={() => startNewTask("amazon")}
              onSelectSlot={(slotKey) =>
                currentAmazonSession
                  ? selectSessionSlot(currentAmazonSession.id, slotKey)
                  : selectPlannedSlot("amazon", slotKey)
              }
              onUpdateSlot={(slotKey, patch) => updatePlannedSlot("amazon", slotKey, patch)}
              onGenerateSlot={(slotKey) =>
                void (currentAmazonSession
                  ? generateSessionSlot(currentAmazonSession.id, slotKey)
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
              onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
              historyAction={historyAction}
            />}
          </AmazonWorkspace>
        ) : (
          <TaobaoWorkspace
            key={`taobao-${newTaskTokens.taobao > 0 ? newTaskTokens.taobao : "current"}`}
            activeProject={currentProject}
            assets={currentAssets}
            session={currentTaobaoSession}
            loading={loading || planningPlatformId === "taobao"}
            analysisLockedReason={
              planningPlatformId && planningPlatformId !== "taobao"
                ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请完成或取消后再分析淘宝商品。`
                : undefined
            }
            onCancelPlanning={cancelPlanning}
            error={planningError}
            onAnalyze={async (input) => {
              const session = await analyzeTaobaoProduct(input);
              if (session) clearNewTask("taobao");
              return session;
            }}
            onStartNewTask={() => startNewTask("taobao")}
            historyAction={historyAction}
            onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
            onReanalyze={() => void reopenTaobaoAnalysis(currentTaobaoSession?.id)}
            reanalyzeDisabled={Boolean(
              loading ||
                planningPlatformId ||
                generatingSlot ||
                exportingPlatform ||
                workspaceDirtyReason,
            )}
            reanalyzeDisabledReason={
              planningPlatformId || generatingSlot || exportingPlatform
                ? "当前有进行中的任务，请完成后再重新分析。"
                : undefined
            }
          >
            {(_contextBar) => <PlatformWorkspace
              platform="taobao"
              activeProject={currentProject}
              assets={currentAssets}
              productionSession={currentTaobaoSession}
              loading={loading}
              plan={currentPlan}
              batchJob={isBlankTask ? undefined : activeTaobaoBatchJob}
              activeRunStatus={activeRunStatusFor(currentTaobaoSession)}
              planInputSignature={isBlankTask ? undefined : planInputSignatures.taobao}
              selectedSlotKey={isBlankTask ? undefined : selectedSlotKeys.taobao}
              planning={planningPlatformId === "taobao"}
              planningPlatformId={planningPlatformId}
              planningError={planningError}
              slotVersionStates={isBlankTask ? undefined : slotVersions.taobao}
              generatingSlot={generatingSlot}
              generationRecoveryRequired={generationRecoveryRequired}
              generationErrorTarget={generationErrorTarget}
              generationError={generationError}
              copilotTarget={copilotTarget}
              exporting={exportingPlatform === "taobao"}
              exportError={exportErrorPlatform === "taobao" ? exportError : null}
              onPlan={() => planPlatform("taobao")}
              onAmazonPlannerModeChange={selectAmazonPlannerMode}
              onCancelPlanning={cancelPlanning}
              onClearPlanningError={clearPlanningError}
              onStartNewTask={() => startNewTask("taobao")}
              onSelectSlot={(slotKey) =>
                currentTaobaoSession
                  ? selectSessionSlot(currentTaobaoSession.id, slotKey)
                  : selectPlannedSlot("taobao", slotKey)
              }
              onUpdateSlot={(slotKey, patch) => updatePlannedSlot("taobao", slotKey, patch)}
              onGenerateSlot={(slotKey) =>
                void (currentTaobaoSession
                  ? generateSessionSlot(currentTaobaoSession.id, slotKey)
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
              onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
              historyAction={historyAction}
            />}
          </TaobaoWorkspace>
        )}
          </section>
          <PlatformHistoryPane
          id="platform-history-pane"
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          platform={activeItem}
          projects={projects}
          historyProjects={allProjects}
          activeProjectId={activeProject?.id}
          activeRunIds={activeRunIds}
          jobs={jobs}
          onResumeJob={(jobId) => void resumeExecutionJob(jobId)}
          onRetryJob={(jobId) => void retryExecutionJob(jobId)}
          onCancelJob={(jobId) => void cancelExecutionJob(jobId)}
          onResumeRun={(record) => {
            setHistoryOpen(false);
            void resumeRun(record.run.id).then((resumed) => {
            if (resumed) {
              if (activeItem === "taobao" || activeItem === "amazon") clearNewTask(activeItem);
              changeActiveItem(activeItem);
            }
            });
          }}
          onForkRun={(record) => {
            setHistoryOpen(false);
            void forkRun(record.run.id).then((session) => {
            if (session) {
              if (activeItem === "taobao" || activeItem === "amazon") clearNewTask(activeItem);
              changeActiveItem(activeItem);
            }
            });
          }}
          onExportRun={(record) => void exportHistoryRun(record.run.id)}
          onDeleteRun={(record) => removeRun(record.run.id)}
          historyQueryService={historyQueryService}
          historyRefreshKey={productionHistoryRevision(runs)}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <AppShell
      activeItem={activeItem}
      onActiveItemChange={requestNavigation}
      runtimeSettings={runtimeSettings}
      settingsLoading={settingsLoading}
      settingsError={settingsError}
      connectionTestStatus={connectionTestStatus}
      textConnectionTestStatus={textConnectionTestStatus}
      textConnectionTestMessage={textConnectionTestMessage}
      imageConnectionTestStatus={imageConnectionTestStatus}
      imageConnectionTestMessage={imageConnectionTestMessage}
      settingsLockReason={settingsLockReason}
      onSaveRuntimeSettings={saveRuntimeSettings}
      onTestRuntimeConnection={testRuntimeConnection}
      onTestTextConnection={(settings) => testRuntimeConnection(settings, "text")}
      onTestImageConnection={(settings) => testRuntimeConnection(settings, "image")}
      onExportLocalBackup={exportLocalBackup}
      onImportLocalBackup={importLocalBackup}
    >
      <ToastRegion>
        {!initialized && loading ? (
          <Toast live="polite" loading>
            正在恢复本地商品资料与图片...
          </Toast>
        ) : null}
        {planningPlatformId ? (
          <Toast
            live="polite"
            loading
            className="operation-status"
            id="planning-task-status"
            data-testid="planning-toast"
            actions={(
              <Button variant="secondary" size="compact" onClick={cancelPlanning}>
                <Square size={13} />
                取消策划
              </Button>
            )}
          >
            <span className="operation-status__copy">
              <span className="operation-status__icon">
                <LoaderCircle className="spin" size={16} />
              </span>
              <span className="operation-status__text">
                <strong className="operation-status__title">
                  {getPlatformRulePack(planningPlatformId).label} 正在生成平台策划
                </strong>
                <span className="operation-status__description">
                  其他平台的策划入口已锁定；可等待完成或取消当前任务。
                </span>
              </span>
            </span>
          </Toast>
        ) : null}
        {warning && warningVisible ? (
          <Toast tone="warning" live="polite">
            {warning}
          </Toast>
        ) : null}
        {uploadFeedback ? (
          <Toast
            tone="success"
            live="polite"
            onDismiss={() => setUploadFeedback(null)}
            dismissLabel="关闭上传反馈"
          >
            <span>{uploadFeedback}</span>
          </Toast>
        ) : null}
        {exportFeedback ? (
          <Toast
            tone="success"
            live="polite"
            onDismiss={() => setExportFeedback(null)}
            dismissLabel="关闭导出反馈"
            data-testid="export-feedback"
          >
            <span>{exportFeedback}</span>
          </Toast>
        ) : null}
        {resourceRestoreError ? (
          <Toast
            tone="danger"
            live="assertive"
            actions={(
              <Button
                variant="secondary"
                size="compact"
                disabled={loading}
                onClick={() => void retryActiveProjectResources()}
              >
                <RefreshCw size={14} />
                {loading ? "正在重试" : "重试恢复"}
              </Button>
            )}
            onDismiss={!generationRecoveryRequired ? clearResourceRestoreError : undefined}
            dismissLabel="关闭恢复提示"
          >
            <span>{resourceRestoreError}</span>
          </Toast>
        ) : null}
        {error ? (
          <Toast
            tone="danger"
            live="assertive"
            onDismiss={clearError}
            dismissLabel="关闭错误提示"
          >
            <span>{error}</span>
          </Toast>
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
      </ToastRegion>
      <div className="workspace-content-stack">
        {activeView}
      </div>
      <ConfirmLeaveDialog
        open={pendingLeave !== null}
        description={
          workspaceDirtyReason
            ? `${workspaceDirtyReason} 离开后内容会丢失，请取消或放弃并离开。`
            : "当前有未保存内容，离开后会丢失，请取消或放弃并离开。"
        }
        onDiscard={discardPendingLeave}
        onCancel={() => {
          setPendingLeave(null);
        }}
      />
    </AppShell>
  );
}
