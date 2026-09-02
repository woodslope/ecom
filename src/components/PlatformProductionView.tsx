import type { ReactNode } from "react";

import { History } from "lucide-react";
import type { ExecutionJob } from "../domain/jobs/types";
import { productionHistoryRevision } from "../domain/history/revision";
import type { MaskDraft } from "../domain/generation/mask";
import type { AmazonPlanningRequestOptions, PlannedSlot } from "../domain/planning/types";
import type { ProductProject } from "../domain/projects/types";
import type { PlatformId } from "../domain/platforms/types";
import { getPlatformRulePack } from "../domain/platforms/registry";
import type { PlatformSession, ProductionRun } from "../domain/workspace/project-workspace";
import type { WorkbenchAsset, WorkbenchState } from "../store/workbench-store";
import { AmazonWorkspace } from "./AmazonWorkspace";
import { PlatformHistoryPane } from "./PlatformHistoryPane";
import { PlatformWorkspace } from "./PlatformWorkspace";
import { TaobaoWorkspace } from "./TaobaoWorkspace";
import { Button } from "./ui";

export interface PlatformProductionViewProps {
  activeItem: PlatformId;
  newTaskTokens: Record<"taobao" | "amazon", number>;
  loading: boolean;
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  sessions: PlatformSession[];
  runs: ProductionRun[];
  jobs: ExecutionJob[];
  projects: ProductProject[];
  allProjects: ProductProject[];
  plans: WorkbenchState["plans"];
  planInputSignatures: WorkbenchState["planInputSignatures"];
  selectedSlotKeys: WorkbenchState["selectedSlotKeys"];
  amazonPlannerMode: WorkbenchState["amazonPlannerMode"];
  slotVersions: WorkbenchState["slotVersions"];
  planningPlatformId: PlatformId | null;
  planningError: string | null;
  generatingSlot: WorkbenchState["generatingSlot"];
  generationRecoveryRequired: boolean;
  generationError: string | null;
  generationErrorTarget: WorkbenchState["generationErrorTarget"];
  exportingPlatform: PlatformId | null;
  exportError: string | null;
  exportErrorPlatform: PlatformId | null;
  historyOpen: boolean;
  historyQueryService: WorkbenchState["historyQueryService"];
  imageEditingSupported: boolean;
  imageEditingDisabledReason?: string;
  workspaceDirtyReason: string | null;
  onSetHistoryOpen: (open: boolean) => void;
  onClearNewTask: (platform: "taobao" | "amazon") => void;
  onStartNewTask: (platform: PlatformId) => void;
  onStartAmazonSession: (input: Parameters<NonNullable<React.ComponentProps<typeof AmazonWorkspace>["onStartSession"]>>[0]) => ReturnType<NonNullable<React.ComponentProps<typeof AmazonWorkspace>["onStartSession"]>>;
  onConfirmLocalizedFacts: (sessionId: string, facts: Parameters<NonNullable<React.ComponentProps<typeof AmazonWorkspace>["onConfirmLocalizedFacts"]>>[1]) => Promise<void>;
  onAnalyzeTaobao: (input: Parameters<React.ComponentProps<typeof TaobaoWorkspace>["onAnalyze"]>[0]) => ReturnType<React.ComponentProps<typeof TaobaoWorkspace>["onAnalyze"]>;
  onReopenTaobaoAnalysis: (sessionId?: string) => void;
  onPlan: (platformId: PlatformId, options?: AmazonPlanningRequestOptions) => Promise<unknown> | void;
  onSelectAmazonPlannerMode: (mode: "listing" | "aplus") => Promise<boolean>;
  onCancelPlanning: () => void;
  onClearPlanningError: () => void;
  onSelectSessionSlot: (sessionId: string, slotKey: string) => Promise<boolean>;
  onSelectPlannedSlot: (platformId: PlatformId, slotKey: string) => Promise<boolean>;
  onUpdatePlannedSlot: (platformId: PlatformId, slotKey: string, patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> & Partial<Pick<PlannedSlot, "externalText">>) => Promise<boolean>;
  onGenerateSessionSlot: (sessionId: string, slotKey: string) => Promise<unknown>;
  onGenerateSlot: (platformId: PlatformId, slotKey: string) => Promise<unknown>;
  onStartBatchGeneration: (platformId: PlatformId) => void;
  onActivateSlotVersion: (platformId: PlatformId, slotKey: string, versionId: string) => Promise<boolean>;
  onReuseGeneratedImage: (asset: WorkbenchAsset) => void;
  onMaskEdit: (sessionId: string, slotKey: string, versionId: string, mask: MaskDraft, prompt: string) => Promise<boolean>;
  onExportPlatform: (platformId: PlatformId) => void;
  onClearExportError: () => void;
  onWorkspaceDirtyChange: (reason: string | null) => void;
  onResumeJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onResumeRun: (runId: string) => Promise<boolean>;
  onForkRun: (runId: string) => Promise<PlatformSession | null>;
  onExportRun: (runId: string) => void;
  onDeleteRun: (runId: string) => Promise<boolean>;
  onHistorySessionRestored: () => void;
  historyAction?: ReactNode;
  downloadGeneratedImage: (asset: WorkbenchAsset) => void;
}

function latestSession(sessions: PlatformSession[], predicate: (session: PlatformSession) => boolean) {
  return [...sessions].filter(predicate).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function activeBatchJob(jobs: ExecutionJob[], platformId: PlatformId, projectId: string | undefined) {
  return jobs.filter((job) => job.kind === "batch-generate" && job.items.some((item) => item.target.platformId === platformId && item.target.projectId === projectId)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function PlatformProductionView(props: PlatformProductionViewProps) {
  const { activeItem, newTaskTokens, loading, activeProject, assets, sessions, runs, jobs, projects, allProjects, plans, planInputSignatures, selectedSlotKeys, amazonPlannerMode, slotVersions, planningPlatformId, planningError, generatingSlot, generationRecoveryRequired, generationError, generationErrorTarget, exportingPlatform, exportError, exportErrorPlatform, historyOpen, historyQueryService, imageEditingSupported, imageEditingDisabledReason, workspaceDirtyReason, onSetHistoryOpen, onClearNewTask, onStartNewTask, onStartAmazonSession, onConfirmLocalizedFacts, onAnalyzeTaobao, onReopenTaobaoAnalysis, onPlan, onSelectAmazonPlannerMode, onCancelPlanning, onClearPlanningError, onSelectSessionSlot, onSelectPlannedSlot, onUpdatePlannedSlot, onGenerateSessionSlot, onGenerateSlot, onStartBatchGeneration, onActivateSlotVersion, onReuseGeneratedImage, onMaskEdit, onExportPlatform, onClearExportError, onWorkspaceDirtyChange, onResumeJob, onRetryJob, onCancelJob, onResumeRun, onForkRun, onExportRun, onDeleteRun, onHistorySessionRestored, historyAction, downloadGeneratedImage } = props;
  const amazonWorkflowId = amazonPlannerMode === "aplus" ? "amazon-aplus" : "amazon-listing";
  const amazonSession = latestSession(sessions, (session) => session.platformId === "amazon" && session.workflowId === amazonWorkflowId);
  const taobaoSession = latestSession(sessions, (session) => session.platformId === "taobao" && session.workflowId === "taobao-product");
  const isBlankTask = newTaskTokens[activeItem] > 0;
  const currentAmazonSession = isBlankTask ? undefined : amazonSession;
  const currentTaobaoSession = isBlankTask ? undefined : taobaoSession;
  const currentProject = activeItem === "amazon" ? (currentAmazonSession ? activeProject : null) : currentTaobaoSession ? activeProject : null;
  const currentAssets = currentProject ? assets : [];
  const currentPlan = isBlankTask ? undefined : activeItem === "amazon" ? currentAmazonSession ? plans.amazon : undefined : currentTaobaoSession ? plans.taobao : undefined;
  const activeRunStatusFor = (session: PlatformSession | undefined) => session?.activeRunId ? runs.find((run) => run.id === session.activeRunId)?.status : undefined;
  const historyActionNode = historyAction ?? <Button variant="secondary" size="normal" className="platform-history-trigger" aria-expanded={historyOpen} aria-controls="platform-history-pane" onClick={() => onSetHistoryOpen(true)}><History size={14} aria-hidden="true" />历史记录</Button>;
  const renderPlatformWorkspace = (platform: PlatformId, session: PlatformSession | undefined) => (
    <PlatformWorkspace
      platform={platform}
      activeProject={currentProject}
      assets={currentAssets}
      {...(platform === "amazon" ? { amazonPlannerMode } : {})}
      productionSession={session}
      loading={loading}
      plan={currentPlan}
      batchJob={isBlankTask ? undefined : activeBatchJob(jobs, platform, activeProject?.id)}
      activeRunStatus={activeRunStatusFor(session)}
      planInputSignature={isBlankTask ? undefined : planInputSignatures[platform]}
      selectedSlotKey={isBlankTask ? undefined : selectedSlotKeys[platform]}
      planning={planningPlatformId === platform}
      planningPlatformId={planningPlatformId}
      planningError={planningError}
      slotVersionStates={isBlankTask ? undefined : slotVersions[platform]}
      generatingSlot={generatingSlot}
      generationRecoveryRequired={generationRecoveryRequired}
      generationErrorTarget={generationErrorTarget}
      generationError={generationError}
      exporting={exportingPlatform === platform}
      exportError={exportErrorPlatform === platform ? exportError : null}
      onPlan={(options) => onPlan(platform, options)}
      onAmazonPlannerModeChange={onSelectAmazonPlannerMode}
      onCancelPlanning={onCancelPlanning}
      onClearPlanningError={onClearPlanningError}
      onStartNewTask={() => onStartNewTask(platform)}
      onSelectSlot={(slotKey) => session ? onSelectSessionSlot(session.id, slotKey) : onSelectPlannedSlot(platform, slotKey)}
      onUpdateSlot={(slotKey, patch) => onUpdatePlannedSlot(platform, slotKey, patch)}
      onGenerateSlot={(slotKey) => void (session ? onGenerateSessionSlot(session.id, slotKey) : onGenerateSlot(platform, slotKey))}
      onStartBatch={() => onStartBatchGeneration(platform)}
      onActivateVersion={(slotKey, versionId) => void onActivateSlotVersion(platform, slotKey, versionId)}
      imageEditingSupported={imageEditingSupported}
      imageEditingDisabledReason={imageEditingDisabledReason}
      onDownloadVersion={(_version, asset) => downloadGeneratedImage(asset)}
      onUseAsReference={onReuseGeneratedImage}
      onMaskEdit={onMaskEdit}
      onExport={() => onExportPlatform(platform)}
      onClearExportError={onClearExportError}
      onWorkspaceDirtyChange={onWorkspaceDirtyChange}
      historyAction={historyActionNode}
    />
  );

  return (
    <div className="platform-page-layout">
      <section className="platform-production-pane" aria-label={`${getPlatformRulePack(activeItem).label}制作区`}>
        {activeItem === "amazon" ? (
          <AmazonWorkspace key={`amazon-${newTaskTokens.amazon > 0 ? newTaskTokens.amazon : "current"}`} activeProject={currentProject} assets={currentAssets} session={currentAmazonSession} plannerMode={amazonPlannerMode} loading={loading} planning={planningPlatformId === "amazon"} error={planningError} onStartSession={(input) => onStartAmazonSession({ ...input, createNewTask: isBlankTask })} onStartNewTask={() => onStartNewTask("amazon")} historyAction={historyActionNode} onConfirmLocalizedFacts={onConfirmLocalizedFacts} onWorkspaceDirtyChange={onWorkspaceDirtyChange}>{() => renderPlatformWorkspace("amazon", currentAmazonSession)}</AmazonWorkspace>
        ) : (
          <TaobaoWorkspace key={`taobao-${newTaskTokens.taobao > 0 ? newTaskTokens.taobao : "current"}`} activeProject={currentProject} assets={currentAssets} session={currentTaobaoSession} loading={loading || planningPlatformId === "taobao"} analysisLockedReason={planningPlatformId && planningPlatformId !== "taobao" ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请完成或取消后再分析淘宝商品。` : undefined} onCancelPlanning={onCancelPlanning} error={planningError} onAnalyze={(input) => onAnalyzeTaobao({ ...input, createNewTask: isBlankTask })} onStartNewTask={() => onStartNewTask("taobao")} historyAction={historyActionNode} onWorkspaceDirtyChange={onWorkspaceDirtyChange} onReanalyze={() => onReopenTaobaoAnalysis(currentTaobaoSession?.id)} reanalyzeDisabled={Boolean(loading || planningPlatformId || generatingSlot || exportingPlatform || workspaceDirtyReason)} reanalyzeDisabledReason={planningPlatformId || generatingSlot || exportingPlatform ? "当前有进行中的任务，请完成后再重新分析。" : undefined}>{() => renderPlatformWorkspace("taobao", currentTaobaoSession)}</TaobaoWorkspace>
        )}
      </section>
      <PlatformHistoryPane id="platform-history-pane" open={historyOpen} onClose={() => onSetHistoryOpen(false)} platform={activeItem} projects={projects} historyProjects={allProjects} activeProjectId={activeProject?.id} activeRunIds={Object.values(sessions.reduce<Record<string, PlatformSession>>((latest, session) => { const key = `${session.platformId}:${session.workflowId}`; const current = latest[key]; if (!current || session.updatedAt > current.updatedAt) latest[key] = session; return latest; }, {})).flatMap((session) => session.activeRunId ? [session.activeRunId] : [])} jobs={jobs} onResumeJob={onResumeJob} onRetryJob={onRetryJob} onCancelJob={onCancelJob} onResumeRun={(record) => { onSetHistoryOpen(false); void onResumeRun(record.run.id).then((resumed) => { if (resumed) { onClearNewTask(activeItem); onHistorySessionRestored(); } }); }} onForkRun={(record) => { onSetHistoryOpen(false); void onForkRun(record.run.id).then((session) => { if (session) { onClearNewTask(activeItem); onHistorySessionRestored(); } }); }} onExportRun={(record) => onExportRun(record.run.id)} onDeleteRun={(record) => onDeleteRun(record.run.id)} historyQueryService={historyQueryService} historyRefreshKey={productionHistoryRevision(runs)} />
    </div>
  );
}
