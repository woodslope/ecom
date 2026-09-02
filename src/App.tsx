import { useCallback, useEffect } from "react";
import { LoaderCircle, RefreshCw, Square } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { GenerationTaskStatus } from "./components/GenerationActions";
import { ConfirmLeaveDialog } from "./components/ConfirmLeaveDialog";
import { PlatformProductionView } from "./components/PlatformProductionView";
import { Button, Toast, ToastRegion } from "./components/ui";
import { browserStorage } from "./application/browser-storage";
import { getPlatformRulePack } from "./domain/platforms/registry";
import { runtimeSupportsImageEditing } from "./domain/settings";
import { useWorkbenchStore } from "./store/workbench-store";
import { usePlatformSessionController } from "./usePlatformSessionController";
import { useWorkbenchFeedback } from "./useWorkbenchFeedback";

export function App() {
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
    initialize,
    startAmazonSession,
    analyzeTaobaoProduct,
    reopenTaobaoAnalysis,
    confirmLocalizedFacts,
    uploadReferenceFiles,
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
    retryActiveProjectResources,
    clearResourceRestoreError,
    clearError,
    dispose,
  } = useWorkbenchStore();
  const {
    uploadFeedback,
    exportFeedback,
    warningVisible,
    downloadGeneratedImage,
    exportCurrentPlatform,
    exportHistoryRun,
    dismissUploadFeedback,
    dismissExportFeedback,
  } = useWorkbenchFeedback({
    warning,
    assets,
    uploadReferenceFiles,
    exportPlatform,
    exportRun,
  });

  const {
    activeItem,
    historyOpen,
    setHistoryOpen,
    newTaskTokens,
    workspaceDirtyReason,
    pendingLeave,
    handleWorkspaceDirtyChange,
    requestNavigation,
    changeActiveItem,
    discardPendingLeave,
    cancelPendingLeave,
    startNewTask,
    clearNewTask,
  } = usePlatformSessionController(clearPlanningError);

  useEffect(() => {
    void initialize();
    return dispose;
  }, [dispose, initialize]);
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
    return `备份已导出：${summary.projectCount} 个平台任务、${summary.assetCount} 个素材、${summary.runCount} 条生产记录。`;
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
    return `备份恢复成功：${summary.projectCount} 个平台任务、${summary.assetCount} 个素材。正在重新加载应用...`;
  }, []);
  const settingsLockReason = loading
    ? "工作台正在加载或保存项目与素材，请完成后再修改运行设置。"
    : generatingSlot
      ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请完成或取消后再修改运行设置。`
      : planningPlatformId
        ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请完成或取消后再修改运行设置。`
      : null;
  const imageEditingSupported = runtimeSupportsImageEditing(runtimeSettings);
  const imageEditingDisabledReason = imageEditingSupported
    ? undefined
    : "当前图片服务不支持显式遮罩编辑，请改用兼容 Images API 的图片服务。";
  const activeView = activeItem === "amazon" || activeItem === "taobao" ? (
    <PlatformProductionView
      activeItem={activeItem}
      newTaskTokens={newTaskTokens}
      loading={loading}
      activeProject={activeProject}
      assets={assets}
      sessions={sessions}
      runs={runs}
      jobs={jobs}
      projects={projects}
      allProjects={allProjects}
      plans={plans}
      planInputSignatures={planInputSignatures}
      selectedSlotKeys={selectedSlotKeys}
      amazonPlannerMode={amazonPlannerMode}
      slotVersions={slotVersions}
      planningPlatformId={planningPlatformId}
      planningError={planningError}
      generatingSlot={generatingSlot}
      generationRecoveryRequired={generationRecoveryRequired}
      generationError={generationError}
      generationErrorTarget={generationErrorTarget}
      exportingPlatform={exportingPlatform}
      exportError={exportError}
      exportErrorPlatform={exportErrorPlatform}
      historyOpen={historyOpen}
      historyQueryService={historyQueryService}
      imageEditingSupported={imageEditingSupported}
      imageEditingDisabledReason={imageEditingDisabledReason}
      workspaceDirtyReason={workspaceDirtyReason}
      onSetHistoryOpen={setHistoryOpen}
      onClearNewTask={clearNewTask}
      onStartNewTask={startNewTask}
      onStartAmazonSession={async (input) => {
        const session = await startAmazonSession(input);
        if (session) clearNewTask("amazon");
        return session;
      }}
      onConfirmLocalizedFacts={async (sessionId, facts) => {
        const session = sessions.find((candidate) => candidate.id === sessionId);
        if (session?.options.platformId !== "amazon") return;
        if (await confirmLocalizedFacts(sessionId, facts)) await planPlatform("amazon", session.options);
      }}
      onAnalyzeTaobao={async (input) => {
        const session = await analyzeTaobaoProduct(input);
        if (session) clearNewTask("taobao");
        return session;
      }}
      onReopenTaobaoAnalysis={(sessionId) => void reopenTaobaoAnalysis(sessionId)}
      onPlan={planPlatform}
      onSelectAmazonPlannerMode={selectAmazonPlannerMode}
      onCancelPlanning={cancelPlanning}
      onClearPlanningError={clearPlanningError}
      onSelectSessionSlot={selectSessionSlot}
      onSelectPlannedSlot={selectPlannedSlot}
      onUpdatePlannedSlot={updatePlannedSlot}
      onGenerateSessionSlot={generateSessionSlot}
      onGenerateSlot={generateSlot}
      onStartBatchGeneration={(platformId) => void startBatchGeneration(platformId)}
      onActivateSlotVersion={activateSlotVersion}
      onReuseGeneratedImage={(asset) => void reuseGeneratedImageAsReference(asset.metadata.id)}
      onMaskEdit={async (sessionId, slotKey, versionId, mask, prompt) =>
        Boolean(await generateMaskedVersion(sessionId, slotKey, versionId, mask, prompt))
      }
      onExportPlatform={(platformId) => void exportCurrentPlatform(platformId)}
      onClearExportError={clearExportError}
      onWorkspaceDirtyChange={handleWorkspaceDirtyChange}
      onResumeJob={(jobId) => void resumeExecutionJob(jobId)}
      onRetryJob={(jobId) => void retryExecutionJob(jobId)}
      onCancelJob={(jobId) => void cancelExecutionJob(jobId)}
      onResumeRun={resumeRun}
      onForkRun={forkRun}
      onExportRun={(runId) => void exportHistoryRun(runId)}
      onDeleteRun={removeRun}
      onHistorySessionRestored={() => changeActiveItem(activeItem)}
      downloadGeneratedImage={downloadGeneratedImage}
    />
  ) : null;

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
            正在恢复本地平台任务资料与图片...
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
            onDismiss={dismissUploadFeedback}
            dismissLabel="关闭上传反馈"
          >
            <span>{uploadFeedback}</span>
          </Toast>
        ) : null}
        {exportFeedback ? (
          <Toast
            tone="success"
            live="polite"
            onDismiss={dismissExportFeedback}
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
        onCancel={cancelPendingLeave}
      />
    </AppShell>
  );
}
