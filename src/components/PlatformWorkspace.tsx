import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LoaderCircle,
  PackageOpen,
  RotateCcw,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

import type { ExecutionJob } from "../domain/jobs/types";
import { runCompliance } from "../domain/compliance";
import { currentSlotVersion } from "../domain/generation/current-version";
import { getPlanningInputFreshness } from "../domain/planning/input-signature";
import type { PlatformPlan, PlannedSlot } from "../domain/planning/types";
import type { MaskDraft } from "../domain/generation/mask";
import type { SlotVersion, SlotVersionState } from "../domain/generation/types";
import { getPlatformRulePack } from "../domain/platforms/registry";
import { resolveRulePackForPlan } from "../domain/platforms/resolve-rule-pack";
import type { PlatformId } from "../domain/platforms/types";
import type { ProductProject, UpdateProductProjectInput } from "../domain/projects/types";
import type { PlatformSession, ProductionRun } from "../domain/workspace/project-workspace";
import { resolveSessionEffectiveProject } from "../domain/workspace/effective-facts";
import {
  getAmazonCompletedSlotKeys,
  getAmazonPrimaryAction,
  getAmazonStage,
} from "../domain/workspace/amazon-stage";
import {
  getPlatformPrimaryAction,
  getPlatformStage,
} from "../domain/workspace/platform-stage";
import type { WorkbenchAsset } from "../store/workbench-store";
import {
  amazonOptionsFromControls,
  amazonControlsMatchPlan,
  useAmazonSessionControls,
} from "./AmazonSessionControls";
import { AmazonIntake } from "./AmazonIntake";
import { AmazonMobilePreview } from "./AmazonMobilePreview";
import { ExportPanel } from "./ExportPanel";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
import type { WorkflowStage } from "./WorkflowStepper";
import { SlotBoard } from "./SlotBoard";
import { SlotInspector } from "./SlotInspector";
import { TaobaoMobilePreview } from "./TaobaoMobilePreview";
import { TaobaoIntake } from "./TaobaoIntake";
import type { GenerationTarget } from "./GenerationActions";
import { Button, ConfirmDialog, EmptyState, IconButton, Panel, StatusChip, StatusMessage } from "./ui";

export function workspaceDraftReason(sourceDirty: boolean, slotDirty: boolean): string | null {
  if (sourceDirty) return "商品资料有未保存修改，请先保存资料。";
  if (slotDirty) return "当前槽位有未保存修改，请先保存文案与提示词。";
  return null;
}

export function shouldDefaultCollapseSource(viewportWidth: number, hasPlan: boolean): boolean {
  void viewportWidth;
  return hasPlan;
}

export function PlatformWorkspace({
  platform,
  activeProject,
  assets,
  amazonPlannerMode = "listing",
  loading,
  plan,
  productionSession,
  planInputSignature,
  selectedSlotKey,
  planning,
  planningPlatformId = null,
  planningError,
  slotVersionStates,
  generatingSlot = null,
  generationRecoveryRequired = false,
  generationErrorTarget = null,
  generationError = null,
  exporting = false,
  exportError = null,
  onPlan,
  onCancelPlanning,
  onClearPlanningError,
  onStartNewTask,
  onSelectSlot,
  onUpdateSlot,
  onGenerateSlot = () => undefined,
  onActivateVersion = () => undefined,
  imageEditingSupported = true,
  imageEditingDisabledReason,
  onDownloadVersion,
  onUseAsReference,
  onMaskEdit,
  onExport,
  onClearExportError,
  onWorkspaceDirtyChange = () => undefined,
  onStartBatch,
  historyAction,
  batchJob,
  activeRunStatus,
}: {
  platform: PlatformId;
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  amazonPlannerMode?: "listing" | "aplus";
  loading: boolean;
  plan?: PlatformPlan;
  productionSession?: PlatformSession;
  planInputSignature?: string;
  selectedSlotKey?: string;
  planning: boolean;
  planningPlatformId?: PlatformId | null;
  planningError: string | null;
  slotVersionStates?: Record<string, SlotVersionState>;
  generatingSlot?: GenerationTarget | null;
  generationRecoveryRequired?: boolean;
  generationErrorTarget?: GenerationTarget | null;
  generationError?: string | null;
  exporting?: boolean;
  exportError?: string | null;
  /** Compatibility callbacks retained for existing consumers; production task input is read-only here. */
  onSave?: (input: UpdateProductProjectInput) => Promise<boolean>;
  onUpload?: (files: File[]) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  onPlan: (amazonOptions?: import("../domain/planning/types").AmazonPlanningRequestOptions) => Promise<unknown> | void;
  onAmazonPlannerModeChange?: (mode: "listing" | "aplus") => Promise<boolean>;
  onCancelPlanning: () => void;
  onStartNewTask?: () => void;
  onClearPlanningError: () => void;
  onSelectSlot: (slotKey: string) => void;
  onUpdateSlot: (
    slotKey: string,
    patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> &
      Partial<Pick<PlannedSlot, "externalText">>,
  ) => Promise<boolean>;
  onGenerateSlot?: (slotKey: string) => void;
  onActivateVersion?: (slotKey: string, versionId: string) => void;
  imageEditingSupported?: boolean;
  imageEditingDisabledReason?: string;
  onDownloadVersion?: (version: SlotVersion, asset: WorkbenchAsset) => void;
  onUseAsReference?: (asset: WorkbenchAsset) => void;
  onMaskEdit?: (
    sessionId: string,
    slotKey: string,
    versionId: string,
    mask: MaskDraft,
    prompt: string,
  ) => Promise<boolean>;
  onExport?: () => void;
  onClearExportError?: () => void;
  onWorkspaceDirtyChange?: (reason: string | null) => void;
  onStartBatch?: () => void;
  historyAction?: ReactNode;
  batchJob?: ExecutionJob;
  activeRunStatus?: ProductionRun["status"];
}) {
  const rulePack = resolveRulePackForPlan(platform, plan);
  const isAmazon = platform === "amazon";
  const [amazonSession] = useAmazonSessionControls(
    isAmazon ? plan : null,
    isAmazon ? amazonPlannerMode : undefined,
  );
  const runAmazonPlan = () =>
    void onPlan(isAmazon ? amazonOptionsFromControls(amazonSession) : undefined);
  const referenceAssets = assets.filter((asset) => asset.metadata.kind === "reference");
  const planningLocked = Boolean(planningPlatformId);
  const effectiveProject = activeProject
    ? resolveSessionEffectiveProject(activeProject, productionSession)
    : null;
  const planningFacts = effectiveProject?.facts ?? null;
  const planInputFreshness =
    plan && planningFacts
      ? getPlanningInputFreshness(
          planInputSignature,
          planningFacts,
          referenceAssets.map((asset) => asset.metadata),
          productionSession?.selectedReferenceAssetIds,
          productionSession
            ? {
                workflowId: productionSession.workflowId,
                industryTemplate: productionSession.industryTemplate,
                sessionOptions: productionSession.options,
              }
            : undefined,
        )
      : null;
  const canPlan = Boolean(activeProject && planningFacts && (
    planningFacts.productName.trim() ||
    planningFacts.category.trim() ||
    planningFacts.description.trim() ||
    planningFacts.sellingPoints.some((item) => item.trim()) ||
    Object.values(planningFacts.specifications).some((item) => item.trim()) ||
    referenceAssets.length > 0
  ));
  const amazonControlsStale = isAmazon && Boolean(plan) && !amazonControlsMatchPlan(amazonSession, plan);
  const planRefreshReason =
    amazonControlsStale
      ? "Amazon 站点、尺寸或模块编排已变化，当前策划仍基于旧参数。请重新策划后再编辑槽位、生成或导出。"
      : planInputFreshness === "stale"
      ? "商品资料或参考素材已更新，当前策划仍基于旧输入。请重新策划后再编辑槽位、生成或导出。"
      : planInputFreshness === "unknown"
        ? "当前策划缺少输入版本记录，请重新策划一次后再编辑槽位、生成或导出。"
        : undefined;
  const planNeedsRefresh = Boolean(planRefreshReason);
  const currentPlanInputSignature =
    planInputFreshness === "fresh" ? planInputSignature : undefined;
  const liveProductionSession =
    isAmazon && productionSession && plan
      ? {
          ...productionSession,
          plan,
          planInputSignature: currentPlanInputSignature,
          selectedSlotKey: selectedSlotKey ?? productionSession.selectedSlotKey,
          slotVersions: slotVersionStates ?? productionSession.slotVersions,
        }
      : undefined;
  const amazonStage = liveProductionSession
    ? getAmazonStage(liveProductionSession)
    : undefined;
  const amazonPrimaryAction = liveProductionSession && !planNeedsRefresh
    ? getAmazonPrimaryAction(liveProductionSession)
    : undefined;
  const platformStage = getPlatformStage({
    platform,
    session: productionSession,
    plan,
    hasTaobaoAnalysis: Boolean(productionSession?.taobaoAnalysis),
    slotVersions: slotVersionStates,
    planInputSignature: currentPlanInputSignature,
    selectedSlotKey,
  });
  const platformPrimaryAction =
    !planNeedsRefresh
      ? getPlatformPrimaryAction({
          platform,
          session: productionSession,
          plan,
          hasTaobaoAnalysis: Boolean(productionSession?.taobaoAnalysis),
          slotVersions: slotVersionStates,
          planInputSignature: currentPlanInputSignature,
          selectedSlotKey,
        })
      : undefined;
  const selectedSlot = plan?.slots.find((slot) => slot.slotKey === selectedSlotKey);
  const selectedRule = rulePack.slots.find((slot) => slot.key === selectedSlot?.slotKey);
  const completedSlots = liveProductionSession
    ? getAmazonCompletedSlotKeys(liveProductionSession).length
    : rulePack.slots.filter((rule) => {
    if (planNeedsRefresh) return false;
    const plannedSlot = plan?.slots.find((slot) => slot.slotKey === rule.key);
    const versionState = slotVersionStates?.[rule.key];
    const activeVersion = plannedSlot
      ? currentSlotVersion(plannedSlot, versionState, currentPlanInputSignature)
      : undefined;
    return Boolean(
      activeVersion && assets.some((asset) => asset.metadata.id === activeVersion.assetId),
    );
      }).length;
  const selectedSlotIsGenerating = Boolean(
    selectedSlot &&
      generatingSlot?.platformId === platform &&
      generatingSlot.slotKey === selectedSlot.slotKey,
  );
  const selectedSlotGenerationError = selectedSlot && generationErrorTarget &&
    generationErrorTarget.platformId === platform &&
    generationErrorTarget.slotKey === selectedSlot.slotKey
    ? generationError ?? undefined
    : undefined;
  const selectedSlotCompliance = selectedSlot && effectiveProject
    ? runCompliance(effectiveProject, rulePack, selectedSlot)
    : undefined;
  const generationLocked = Boolean(
    loading ||
      generationRecoveryRequired ||
      (generatingSlot && !selectedSlotIsGenerating),
  );
  const generationLockReason = loading
    ? "工作台正在加载或保存项目与素材，请完成后再生成图片。"
    : generationRecoveryRequired
    ? "上次图片生成状态需要恢复，请先点击“重试恢复”。"
    : generatingSlot
      ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请先等待或取消。`
      : undefined;
  const [slotDirty, setSlotDirty] = useState(false);
  const [amazonPreviewOpen, setAmazonPreviewOpen] = useState(false);
  const [taobaoPreviewOpen, setTaobaoPreviewOpen] = useState(false);
  const [replanConfirmOpen, setReplanConfirmOpen] = useState(false);
  const draftReason = workspaceDraftReason(false, slotDirty);

  useEffect(() => {
    setSlotDirty(false);
  }, [activeProject?.id]);
  useEffect(() => {
    onWorkspaceDirtyChange(draftReason);
    return () => onWorkspaceDirtyChange(null);
  }, [draftReason, onWorkspaceDirtyChange]);
  const planDisabledReason = draftReason ?? (!activeProject
    ? "请先填写商品资料"
    : loading
      ? "工作台正在加载或保存项目与素材"
    : planningPlatformId
        ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请先等待或取消。`
      : generationRecoveryRequired
        ? "请先重试恢复图片版本与素材"
        : generatingSlot?.platformId === platform
          ? `${generationLockReason}`
          : undefined);
  const planActionDisabled = Boolean(
    !canPlan ||
      draftReason ||
      loading ||
      planningLocked ||
      generationRecoveryRequired ||
      generatingSlot?.platformId === platform
  );
  const planDescriptionId = planningLocked
    ? "planning-task-status"
    : planNeedsRefresh
        ? "plan-freshness-status"
        : !draftReason && planActionDisabled && planDisabledReason
          ? "plan-disabled-status"
          : undefined;
  const pendingSlotCount = plan
    ? rulePack.slots.filter((rule) => {
        const plannedSlot = plan.slots.find((slot) => slot.slotKey === rule.key);
        const versionState = slotVersionStates?.[rule.key];
        return !plannedSlot || !currentSlotVersion(plannedSlot, versionState, currentPlanInputSignature);
      }).length
    : 0;
  const batchActionDisabled = Boolean(
    !onStartBatch ||
      !plan ||
      pendingSlotCount === 0 ||
      loading ||
      planning ||
      generatingSlot ||
      generationRecoveryRequired ||
      planNeedsRefresh ||
      batchJob?.status === "running" ||
      batchJob?.status === "queued" ||
      batchJob?.status === "paused",
  );
  const displayedStage = planNeedsRefresh ? "review" : platformStage;
  const [selectedWorkflowStage, setSelectedWorkflowStage] = useState<WorkflowStage>(displayedStage);
  const workflowContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSelectedWorkflowStage(displayedStage);
  }, [displayedStage, platform, productionSession?.id]);
  const selectableStages: WorkflowStage[] = plan
    ? [...(productionSession ? ["prepare" as const] : []), "review", "produce", ...(completedSlots > 0 ? ["deliver" as const] : [])]
    : ["prepare"];
  const preparationAssets = productionSession
    ? referenceAssets.filter((asset) => productionSession.selectedReferenceAssetIds.includes(asset.metadata.id))
    : referenceAssets;
  const selectWorkflowStage = (nextStage: WorkflowStage) => {
    setSelectedWorkflowStage(nextStage);
    if (nextStage === "prepare") return;
    window.requestAnimationFrame(() => {
      const selector: Record<Exclude<WorkflowStage, "prepare">, string> = {
        review: ".workbench-panel--slots",
        produce: ".workbench-panel--inspector",
        deliver: ".workbench-panel--slots",
      };
      workflowContentRef.current
        ?.querySelector<HTMLElement>(selector[nextStage])
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };
  const confirmReplan = () => {
    setReplanConfirmOpen(false);
    runAmazonPlan();
  };
  const inspectorPrimaryAction = isAmazon ? amazonPrimaryAction : platformPrimaryAction;
  const taskName = effectiveProject?.facts.productName.trim() || effectiveProject?.name || "未命名任务";
  const taskMode = productionSession?.options.platformId === "amazon"
    ? productionSession.options.plannerMode === "listing"
      ? `Listing ${productionSession.options.listingImageCount ?? plan?.slots.length ?? 7} 张`
      : `A+ ${productionSession.options.aPlusModuleSpecs?.length ?? plan?.slots.length ?? 0} 个模块`
    : "淘宝商品生产包";
  const runStatusLabels: Record<ProductionRun["status"], string> = {
    planned: "已策划",
    producing: "生产中",
    ready: "已完整",
    partial: "部分交付",
    failed: "失败",
    canceled: "已取消",
  };
  const taskContext = {
    name: taskName,
    mode: taskMode,
    status: activeRunStatus ? runStatusLabels[activeRunStatus] : plan ? "已策划" : "准备中",
  };
  const shellActions = (
    <>
      {onStartNewTask ? (
        <Button variant="secondary" size="normal" onClick={onStartNewTask}>
          <Sparkles size={15} />新任务
        </Button>
      ) : null}
    </>
  );
  return (
    <PlatformWorkflowShell
      platform={platform}
      title={isAmazon ? "Amazon" : "淘宝 / 天猫"}
      stage={selectedWorkflowStage}
      completedSlots={completedSlots}
      totalSlots={plan?.slots.length ?? 0}
      historyAction={historyAction}
      actions={shellActions}
      selectableStages={selectableStages}
      onStageSelect={selectWorkflowStage}
    >
      <div ref={workflowContentRef} className="platform-workspace-view platform-workspace-view--production-shell">
      {selectedWorkflowStage === "prepare" && plan && productionSession ? (
        isAmazon ? (
          <AmazonIntake
            activeProject={effectiveProject}
            assets={preparationAssets}
            session={productionSession}
            plannerMode={amazonPlannerMode}
            loading={false}
            planning={false}
            error={null}
            embedded
            readOnly
            onSubmit={async () => null}
          />
        ) : (
          <TaobaoIntake
            activeProject={effectiveProject}
            assets={preparationAssets}
            session={productionSession}
            loading={false}
            error={null}
            embedded
            readOnly
            onAnalyze={async () => undefined}
          />
        )
      ) : (
        <>
      {planRefreshReason ? (
        <StatusMessage id="plan-freshness-status" tone="warning" live="polite">
          {planRefreshReason}
        </StatusMessage>
      ) : null}

      {planDescriptionId === "plan-disabled-status" && !generatingSlot && !draftReason ? (
        <StatusMessage id="plan-disabled-status" tone="warning">
          {planDisabledReason}
        </StatusMessage>
      ) : null}

      {planningError && !slotDirty ? (
        <StatusMessage
          tone="danger"
          live="assertive"
          actions={(
            <>
              {canPlan && !planning ? (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={planActionDisabled}
                  title={planDisabledReason}
                  aria-describedby={planDescriptionId}
                  onClick={runAmazonPlan}
                >
                  <RotateCcw size={14} />
                  重试策划
                </Button>
              ) : null}
              <IconButton label="关闭策划提示" onClick={onClearPlanningError}>
                <X size={15} />
              </IconButton>
            </>
          )}
        >
          <span>{planningError}</span>
        </StatusMessage>
      ) : null}

      {plan ? (
        <div className="production-task-tools">
          <div className="task-secondary-actions">
            <Button
              variant="secondary"
              size="compact"
              disabled={planActionDisabled}
              loading={planning}
              loadingLabel="策划中..."
              title={planDisabledReason}
              aria-describedby={planDescriptionId}
              onClick={() => setReplanConfirmOpen(true)}
            >
              <RotateCcw size={14} />重新策划
            </Button>
            <Button variant="secondary" size="compact" onClick={() => isAmazon ? setAmazonPreviewOpen(true) : setTaobaoPreviewOpen(true)}>
              <Smartphone size={15} />手机预览
            </Button>
            <Button variant="secondary" size="compact" disabled={batchActionDisabled} onClick={onStartBatch}>
              <Sparkles size={15} />批量生成（{pendingSlotCount}）
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={`workbench-grid workbench-grid--source-collapsed${isAmazon ? " workbench-grid--shell" : ""}`}
      >
        <Panel
          title="平台交付槽位"
          action={plan ? <span className="slot-board__progress">{completedSlots}/{plan.slots.length}</span> : undefined}
          className="workbench-panel workbench-panel--slots"
        >
          {plan ? (
            <SlotBoard
              rulePack={rulePack}
              plan={plan}
              assets={assets}
              selectedSlotKey={selectedSlotKey}
              versionStates={slotVersionStates}
              planningInputSignature={currentPlanInputSignature}
              disabled={planning || loading}
              onSelect={(slotKey) => {
                if (slotDirty) return;
                onSelectSlot(slotKey);
              }}
            />
          ) : planning ? (
            <EmptyState
              variant="loading"
              eyebrow="正在处理"
              icon={<LoaderCircle className="spin" size={24} />}
              title="正在分析商品并编排槽位"
              description="当前会保留商品资料；完成后会一次显示当前平台的全部必需槽位。"
            />
          ) : (
            <EmptyState
              variant={canPlan ? "setup" : "dependency"}
              eyebrow={canPlan ? "资料已具备" : "等待上游资料"}
              icon={<PackageOpen size={24} />}
              title={canPlan ? "商品资料已就绪" : "等待平台策划"}
                description={
                  canPlan
                  ? isAmazon
                    ? "将按上方 Listing / A+ 模式生成对应槽位、策划依据和可编辑提示词。"
                    : "将按固定的 5 张主图和 7 张详情图生成策划依据与可编辑提示词。"
                  : "填写商品资料并至少上传一张参考图后，这里才会出现当前平台的交付槽位。"
              }
              action={
                canPlan ? (
                  <Button
                    variant="secondary"
                    disabled={planActionDisabled}
                    title={planDisabledReason}
                    aria-describedby={planDescriptionId}
                    onClick={runAmazonPlan}
                  >
                    <Sparkles size={15} />
                    生成平台策划
                  </Button>
                ) : undefined
              }
            />
          )}
        </Panel>

        {selectedSlot ? (
          /* Same Panel shell as empty state; hideHeader because SlotInspector owns top/middle/bottom bands. */
          <Panel
            title={`槽位检查器 · ${selectedRule?.label ?? selectedSlot.slotKey}`}
            hideHeader
            className="workbench-panel workbench-panel--inspector workbench-panel--inspector-filled"
          >
            <SlotInspector
              rulePack={rulePack}
              slot={selectedSlot}
              industryTemplate={productionSession?.industryTemplate}
              saving={planning || loading}
              versionState={slotVersionStates?.[selectedSlot.slotKey]}
              assets={assets}
              generating={selectedSlotIsGenerating}
              planNeedsRefresh={planNeedsRefresh}
              planningInputSignature={currentPlanInputSignature}
              generationLocked={generationLocked}
              generationLockReason={generationLockReason}
              generationError={selectedSlotGenerationError}
              complianceResult={selectedSlotCompliance}
              taskContext={taskContext}
              onDirtyChange={setSlotDirty}
              onSave={(patch) => onUpdateSlot(selectedSlot.slotKey, patch)}
              onGenerate={() => onGenerateSlot(selectedSlot.slotKey)}
              onActivateVersion={(versionId) =>
                onActivateVersion(selectedSlot.slotKey, versionId)
              }
              imageEditingSupported={imageEditingSupported}
              imageEditingDisabledReason={imageEditingDisabledReason}
              onDownloadVersion={onDownloadVersion}
              onUseAsReference={onUseAsReference}
              onMaskEdit={
                productionSession && onMaskEdit
                  ? (versionId, mask, prompt) =>
                      onMaskEdit(
                        productionSession.id,
                        selectedSlot.slotKey,
                        versionId,
                        mask,
                        prompt,
                      )
                  : undefined
              }
              nextSlotAction={
                inspectorPrimaryAction?.kind === "select"
                  ? {
                      label: inspectorPrimaryAction.label,
                      onSelect: () => onSelectSlot(inspectorPrimaryAction.slotKey),
                    }
                  : undefined
              }
              generationActionVariant={
                (isAmazon ? amazonStage : platformStage) === "deliver" ? "secondary" : "primary"
              }
            />
          </Panel>
        ) : (
          <Panel
            title="槽位检查器"
            className="workbench-panel workbench-panel--inspector workbench-panel--inspector-empty"
          >
            <EmptyState
              variant={plan ? "selection" : "dependency"}
              eyebrow={plan ? "开始检查" : "等待平台策划"}
              icon={<Sparkles size={24} />}
              title={plan ? "选择一个交付槽位" : "等待策划结果"}
              description={
                plan
                  ? "从中间列表选择槽位，在这里检查依据并编辑草稿。"
                  : "策划完成后，这里会显示当前槽位的依据、文案、Prompt 和约束。"
              }
            />
          </Panel>
        )}
      </div>

      {/* Delivery is available after the first usable output or when an export failed. */}
      {onExport && (completedSlots > 0 || Boolean(exportError)) ? (
        <ExportPanel
          platformLabel={rulePack.label}
          completedSlots={completedSlots}
          totalSlots={plan?.slots.length ?? 0}
          exporting={exporting}
          error={exportError}
          disabled={Boolean(
            loading ||
              planning ||
              generatingSlot ||
              generationRecoveryRequired ||
              planNeedsRefresh,
          )}
          disabledReason={
            loading
              ? "工作台正在加载或保存项目。"
              : generationRecoveryRequired
                ? "请先恢复图片版本与素材。"
                : planning || generatingSlot
                  ? "请等待当前策划或图片生成任务完成。"
                  : planRefreshReason
                    ? planRefreshReason
                    : !plan
                      ? "请先完成平台策划。"
                      : undefined
          }
          onExport={onExport}
          onClearError={onClearExportError ?? (() => undefined)}
          compact
        />
      ) : null}

        </>
      )}
      {!isAmazon && plan && productionSession ? (
        <TaobaoMobilePreview
          open={taobaoPreviewOpen}
          title={productionSession.taobaoAnalysis?.suggestedProductName || activeProject?.facts.productName || "淘宝商品"}
          source="session"
          sourceId={productionSession.id}
          plan={plan}
          planningInputSignature={currentPlanInputSignature}
          slotVersions={slotVersionStates}
          assetUrls={Object.fromEntries(assets.map((asset) => [asset.metadata.id, asset.objectUrl]))}
          exporting={exporting}
          onExport={onExport}
          onClose={() => setTaobaoPreviewOpen(false)}
        />
      ) : null}
      {isAmazon && plan ? (
        <AmazonMobilePreview
          open={amazonPreviewOpen}
          title={activeProject?.facts.productName || "Amazon 商品"}
          source="session"
          sourceId={productionSession?.id ?? `amazon-${activeProject?.id ?? "current"}`}
          plan={plan}
          planningInputSignature={planInputSignature}
          slotVersions={slotVersionStates ?? productionSession?.slotVersions}
          assetUrls={Object.fromEntries(assets.map((asset) => [asset.metadata.id, asset.objectUrl]))}
          exporting={exporting}
          onExport={onExport}
          onClose={() => setAmazonPreviewOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={replanConfirmOpen}
        title="重新策划当前任务？"
        description="重新策划将创建一条新记录，并替换当前槽位策划和提示词。已有图片不会删除，可在历史记录中重新载入。"
        confirmLabel="确认重新策划"
        onConfirm={confirmReplan}
        onCancel={() => setReplanConfirmOpen(false)}
      />
    </div>
    </PlatformWorkflowShell>
  );
}
