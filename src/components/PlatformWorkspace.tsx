import { useEffect, useState } from "react";
import {
  FileText,
  ImagePlus,
  LoaderCircle,
  PackageOpen,
  RotateCcw,
  Smartphone,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";

import { runCompliance } from "../domain/compliance";
import type { CopilotCommand } from "../domain/copilot";
import type { ExecutionJob } from "../domain/jobs/types";
import { currentSlotVersion } from "../domain/generation/current-version";
import { getPlanningInputFreshness } from "../domain/planning/input-signature";
import type { PlatformPlan, PlannedSlot } from "../domain/planning/types";
import type { MaskDraft } from "../domain/generation/mask";
import type { SlotVersion, SlotVersionState } from "../domain/generation/types";
import { getPlatformRulePack } from "../domain/platforms/registry";
import { resolveRulePackForPlan } from "../domain/platforms/resolve-rule-pack";
import type { PlatformId } from "../domain/platforms/types";
import type { ProductProject, UpdateProductProjectInput } from "../domain/projects/types";
import type { RuntimeMode } from "../domain/settings";
import type { PlatformSession } from "../domain/workspace/project-workspace";
import { resolveSessionEffectiveProject } from "../domain/workspace/effective-facts";
import {
  getAmazonCompletedSlotKeys,
  getAmazonPrimaryAction,
  getAmazonStage,
} from "../domain/workspace/amazon-stage";
import type { WorkbenchAsset } from "../store/workbench-store";
import {
  AmazonSessionControls,
  amazonOptionsFromControls,
  amazonControlsMatchPlan,
  expectedSlotCount,
  useAmazonSessionControls,
} from "./AmazonSessionControls";
import { ExportPanel } from "./ExportPanel";
import { ProductSourcePanel } from "./ProductSourcePanel";
import { SlotBoard } from "./SlotBoard";
import { SlotInspector } from "./SlotInspector";
import { TaobaoMobilePreview } from "./TaobaoMobilePreview";
import type { GenerationTarget } from "./GenerationActions";
import { Button, EmptyState, IconButton, Panel, StatusChip, StatusMessage } from "./ui";

export function workspaceDraftReason(sourceDirty: boolean, slotDirty: boolean): string | null {
  if (sourceDirty) return "商品资料有未保存修改，请先保存商品资料。";
  if (slotDirty) return "当前槽位有未保存修改，请先保存文案与提示词。";
  return null;
}

export function shouldDefaultCollapseSource(viewportWidth: number, hasPlan: boolean): boolean {
  return hasPlan && viewportWidth < 1100;
}

export function PlatformWorkspace({
  platform,
  activeProject,
  assets,
  runtimeMode = "demo",
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
  copilotTarget = null,
  copilotFeedbackTarget = null,
  copilotError = null,
  copilotMessage = null,
  exporting = false,
  exportError = null,
  onCreate,
  onOpenLibrary,
  onRequestUpload,
  onSave,
  onUpload,
  onRemove,
  onPlan,
  onAmazonPlannerModeChange = async () => true,
  onCancelPlanning,
  onClearPlanningError,
  onSelectSlot,
  onUpdateSlot,
  onGenerateSlot = () => undefined,
  onActivateVersion = () => undefined,
  imageEditingSupported = true,
  imageEditingDisabledReason,
  onDownloadVersion,
  onUseAsReference,
  onMaskEdit,
  onExport = () => undefined,
  onClearExportError = () => undefined,
  onCopilotCommand = () => undefined,
  onCancelCopilot = () => undefined,
  onWorkspaceDirtyChange = () => undefined,
  onStartBatch,
  batchJob,
}: {
  platform: PlatformId;
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  runtimeMode?: RuntimeMode;
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
  copilotTarget?: GenerationTarget | null;
  copilotFeedbackTarget?: GenerationTarget | null;
  copilotError?: string | null;
  copilotMessage?: string | null;
  exporting?: boolean;
  exportError?: string | null;
  onCreate: () => void;
  onOpenLibrary?: () => void;
  onRequestUpload?: () => void;
  onSave: (input: UpdateProductProjectInput) => Promise<boolean>;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onPlan: (amazonOptions?: import("../domain/planning/types").AmazonPlanningRequestOptions) => Promise<unknown> | void;
  onAmazonPlannerModeChange?: (mode: "listing" | "aplus") => Promise<boolean>;
  onCancelPlanning: () => void;
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
  onCopilotCommand?: (slotKey: string, command: CopilotCommand) => void;
  onCancelCopilot?: () => void;
  onWorkspaceDirtyChange?: (reason: string | null) => void;
  onStartBatch?: () => void;
  batchJob?: ExecutionJob;
}) {
  const rulePack = resolveRulePackForPlan(platform, plan);
  const isAmazon = platform === "amazon";
  const [amazonSession, setAmazonSession] = useAmazonSessionControls(
    isAmazon ? plan : null,
    isAmazon ? amazonPlannerMode : undefined,
  );
  const changeAmazonSession = async (next: typeof amazonSession) => {
    if (next.plannerMode !== amazonSession.plannerMode) {
      const switched = await onAmazonPlannerModeChange(next.plannerMode);
      if (!switched) return;
    }
    setAmazonSession(next);
  };
  const runAmazonPlan = () =>
    void onPlan(isAmazon ? amazonOptionsFromControls(amazonSession) : undefined);
  const plannedSlotCount = isAmazon ? expectedSlotCount(amazonSession) : rulePack.slots.length;

  const referenceAssets = assets.filter((asset) => asset.metadata.kind === "reference");
  const canPlan = Boolean(activeProject && (isAmazon || referenceAssets.length > 0));
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
        )
      : null;
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
  const selectedSlot = plan?.slots.find((slot) => slot.slotKey === selectedSlotKey);
  const selectedRule = rulePack.slots.find((slot) => slot.key === selectedSlot?.slotKey);
  const complianceResult =
    effectiveProject && selectedSlot
      ? runCompliance(effectiveProject, rulePack, selectedSlot)
      : undefined;
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
  const workflowStage = isAmazon
    ? planNeedsRefresh
      ? "plan"
      : amazonStage === "deliver"
        ? "deliver"
        : amazonStage === "review" || amazonStage === "produce"
          ? "generate"
          : "plan"
    : planNeedsRefresh
      ? "plan"
      : !plan
        ? "plan"
        : completedSlots === 0
          ? "generate"
          : completedSlots === rulePack.slots.length
            ? "deliver"
            : "generate";
  const selectedSlotIsGenerating = Boolean(
    selectedSlot &&
      generatingSlot?.platformId === platform &&
      generatingSlot.slotKey === selectedSlot.slotKey,
  );
  const selectedSlotCopilotRunning = Boolean(
    selectedSlot &&
      copilotTarget?.platformId === platform &&
      copilotTarget.slotKey === selectedSlot.slotKey,
  );
  const selectedSlotHasCopilotFeedback = Boolean(
    selectedSlot &&
      copilotFeedbackTarget?.platformId === platform &&
      copilotFeedbackTarget.slotKey === selectedSlot.slotKey,
  );
  const copilotLockReason = loading
    ? "工作台正在加载或保存项目与素材，请完成后再使用 Copilot。"
    : planRefreshReason
      ? "当前策划已过期，重新策划后可使用 Copilot。"
    : generationRecoveryRequired
      ? "上次图片生成状态需要恢复，请先点击“重试恢复”再使用 Copilot。"
      : planningPlatformId
        ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请先等待或取消。`
        : generatingSlot
          ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请先等待或取消。`
          : copilotTarget && !selectedSlotCopilotRunning
            ? `${getPlatformRulePack(copilotTarget.platformId).label} · ${copilotTarget.slotKey} Copilot 请求处理中，请先等待或取消。`
            : undefined;
  const copilotLocked = Boolean(copilotLockReason);
  const sourceLockReason = generationRecoveryRequired
    ? "图片版本与素材正在等待恢复，请完成恢复后再修改商品资料。"
    : planningPlatformId
      ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请先等待或取消。`
      : generatingSlot
        ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请先等待或取消。`
        : copilotTarget
          ? `${getPlatformRulePack(copilotTarget.platformId).label} · ${copilotTarget.slotKey} 正在处理 Copilot 请求，请先等待或取消。`
          : exporting
            ? "当前交付包正在导出，请完成后再修改商品资料。"
            : undefined;
  const generationLocked = Boolean(
    loading ||
      generationRecoveryRequired ||
      (generatingSlot && !selectedSlotIsGenerating) ||
      copilotTarget,
  );
  const generationLockReason = loading
    ? "工作台正在加载或保存项目与素材，请完成后再生成图片。"
    : generationRecoveryRequired
    ? "上次图片生成状态需要恢复，请先点击“重试恢复”。"
    : generatingSlot
      ? `${getPlatformRulePack(generatingSlot.platformId).label} · ${generatingSlot.slotKey} 正在生成，请先等待或取消。`
      : copilotTarget
        ? `${getPlatformRulePack(copilotTarget.platformId).label} · ${copilotTarget.slotKey} Copilot 请求处理中，请先等待或取消。`
      : undefined;
  const hasPlan = Boolean(plan);
  const [sourceDirty, setSourceDirty] = useState(false);
  const [slotDirty, setSlotDirty] = useState(false);
  const [taobaoPreviewOpen, setTaobaoPreviewOpen] = useState(false);
  // Shell v1: after a plan exists, keep the middle+right stage primary.
  const [sourceCollapsed, setSourceCollapsed] = useState(() =>
    shouldDefaultCollapseSource(
      typeof window === "undefined" ? 1100 : window.innerWidth,
      hasPlan,
    ),
  );
  const draftReason = workspaceDraftReason(sourceDirty, slotDirty);
  const planDescriptionId = planningLocked
    ? "planning-task-status"
    : draftReason
      ? "workspace-draft-status"
      : planNeedsRefresh
        ? "plan-freshness-status"
      : undefined;

  useEffect(() => {
    setSourceCollapsed(
      shouldDefaultCollapseSource(
        typeof window === "undefined" ? 1100 : window.innerWidth,
        hasPlan,
      ),
    );
  }, [activeProject?.id, hasPlan, platform]);
  useEffect(() => {
    setSourceDirty(false);
    setSlotDirty(false);
  }, [activeProject?.id]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1099px)");
    const sync = () => {
      setSourceCollapsed(shouldDefaultCollapseSource(window.innerWidth, hasPlan));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [hasPlan, platform, activeProject?.id]);
  useEffect(() => {
    onWorkspaceDirtyChange(draftReason);
    return () => onWorkspaceDirtyChange(null);
  }, [draftReason, onWorkspaceDirtyChange]);
  const planDisabledReason = draftReason ?? (!activeProject
    ? "请先在资料库创建或选择商品资料"
    : loading
      ? "工作台正在加载或保存项目与素材"
    : !isAmazon && referenceAssets.length === 0
      ? "请先上传至少一张商品参考图"
      : planningPlatformId
        ? `${getPlatformRulePack(planningPlatformId).label} 正在生成平台策划，请先等待或取消。`
      : generationRecoveryRequired
        ? "请先重试恢复图片版本与素材"
        : generatingSlot?.platformId === platform
        ? `${generationLockReason}`
        : copilotTarget
          ? `${getPlatformRulePack(copilotTarget.platformId).label} · ${copilotTarget.slotKey} Copilot 请求处理中，请先等待或取消。`
          : undefined);
  const planActionDisabled = Boolean(
    !canPlan ||
      draftReason ||
      loading ||
      planningLocked ||
      generationRecoveryRequired ||
      generatingSlot?.platformId === platform ||
      copilotTarget,
  );
  const nextSlotKey = rulePack.slots.find((rule) => {
    const plannedSlot = plan?.slots.find((slot) => slot.slotKey === rule.key);
    const versionState = slotVersionStates?.[rule.key];
    return !plannedSlot || !currentSlotVersion(plannedSlot, versionState, currentPlanInputSignature);
  })?.key;
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
      copilotTarget ||
      generationRecoveryRequired ||
      planNeedsRefresh ||
      batchJob?.status === "running" ||
      batchJob?.status === "queued" ||
      batchJob?.status === "paused",
  );
  const requestUpload = () => {
    setSourceCollapsed(false);
    (onRequestUpload ?? onOpenLibrary)?.();
  };
  const workflowActionDisabled = Boolean(
    loading ||
      planning ||
      generatingSlot ||
      copilotTarget ||
      generationRecoveryRequired ||
      planNeedsRefresh ||
      (workflowStage === "plan" && planActionDisabled) ||
      (workflowStage === "generate" && (!nextSlotKey || generationLocked)) ||
      workflowStage === "deliver" && (!plan || completedSlots === 0),
  );
  const workflowAction = workflowStage
    ? {
        source: {
          title: activeProject ? "下一步：上传参考图" : "下一步：准备商品资料",
          description: activeProject
            ? "左侧可粘贴 Listing 并上传参考图；完整多项目管理在「资料库」。"
            : "在资料库新建档案，或在此创建后进入 Amazon Listing / A+。",
          onClick: activeProject ? requestUpload : onCreate,
        },
        plan: {
          title: isAmazon
            ? amazonSession.plannerMode === "aplus"
              ? "下一步：AI 策划 A+ 模块"
              : "下一步：AI 策划 Listing 图"
            : "下一步：AI 策划淘宝商品生产包",
          description: isAmazon
            ? `按上方模式生成 ${plannedSlotCount} 个${amazonSession.plannerMode === "aplus" ? " A+" : " Listing"} 槽位（站点 / 张数 / 风格可在「调整参数」中修改）。`
            : "固定生成 5 张主图和 7 张详情图，槽位顺序与规则由商品生产包统一管理。",
          onClick: runAmazonPlan,
        },
        generate: {
          title: completedSlots === 0 ? "下一步：生成第一张图片" : "下一步：继续生成下一张",
          description: "中间选槽位，右侧改 Prompt 后逐张生成；可随时切换 Listing / A+ 模式并重新策划。",
          onClick: () => nextSlotKey && onGenerateSlot(nextSlotKey),
        },
        deliver: {
          title: completedSlots === (plan?.slots.length ?? 0) ? "下一步：导出交付包" : "下一步：检查并导出",
          description: `${completedSlots} / ${plan?.slots.length ?? 0} 已有活动版本。历史任务在左侧「任务历史」。`,
          onClick: onExport,
        },
      }[workflowStage]
    : null;

  const displayedAmazonStage = planNeedsRefresh ? "review" : amazonStage;
  const stageShort = displayedAmazonStage === "prepare"
    ? "准备"
    : displayedAmazonStage === "review"
      ? "策划检查"
      : displayedAmazonStage === "produce"
        ? "逐图生产"
        : displayedAmazonStage === "deliver"
          ? "交付检查"
          : null;
  const stageIndex = displayedAmazonStage === "prepare"
    ? 1
    : displayedAmazonStage === "review"
      ? 2
      : displayedAmazonStage === "produce"
        ? 3
        : displayedAmazonStage === "deliver"
          ? 4
          : 0;

  return (
    <div className="platform-workspace-view platform-workspace-view--production-shell">
      {isAmazon ? (
        <header className="workbench-chrome" aria-label="Amazon 工作台顶栏">
          <div className="workbench-chrome__main">
            <div className="workbench-chrome__brand">
              <h1>Amazon</h1>
              {plan ? (
                <StatusChip tone="mode">
                  {plan.source === "demo" ? "Demo" : "API"}
                </StatusChip>
              ) : (
                <StatusChip tone="neutral">主路径</StatusChip>
              )}
              {stageShort ? (
                <span className="workbench-chrome__step" aria-label={`当前步骤 ${stageIndex} / 4`}>
                  {stageIndex}/4 · {stageShort}
                </span>
              ) : null}
            </div>
            <AmazonSessionControls
              value={amazonSession}
              disabled={planning || loading}
              hasPlan={Boolean(plan)}
              preferCollapsed={Boolean(plan) && !planNeedsRefresh}
              embedded
              onChange={(next) => void changeAmazonSession(next)}
              planAction={{
                label: planning ? "策划中…" : plan ? "重新策划" : "AI 策划",
                disabled: planActionDisabled,
                title: planDisabledReason,
                describedBy: planDescriptionId,
                busy: planning,
                variant: plan ? "secondary" : "primary",
                onClick: runAmazonPlan,
              }}
            />
            <div className="workbench-chrome__tools">
              {plan ? (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={batchActionDisabled}
                  title={batchActionDisabled ? "当前没有可批量生成的槽位，或已有任务正在执行。" : undefined}
                  onClick={onStartBatch}
                >
                  {batchJob?.status === "running" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                  {batchJob?.status === "running" ? "批量执行中" : `批量生成剩余槽位（${pendingSlotCount}）`}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="compact"
                aria-expanded={!sourceCollapsed}
                aria-controls="workbench-source-column"
                onClick={() => setSourceCollapsed((value) => !value)}
              >
                <FileText size={15} />
                {sourceCollapsed ? "资料" : "收起资料"}
              </Button>
            </div>
          </div>
          {!plan && workflowAction ? (
            <div className="workbench-chrome__onboarding">
              <span>{workflowAction.description}</span>
              {workflowAction.onClick ? (
                <Button
                  size="compact"
                  disabled={workflowActionDisabled}
                  onClick={workflowAction.onClick}
                >
                  {workflowAction.title}
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>
      ) : (
        <>
          <div className="workbench-toolbar">
          <div className="workbench-toolbar__title" data-workflow-id="taobao-product">
            <h1>淘宝 / 天猫</h1>
            {plan ? (
              <StatusChip tone="mode">
                {plan.source === "demo" ? "Demo" : "API"}
              </StatusChip>
            ) : (
              <StatusChip tone="neutral">商品生产包</StatusChip>
            )}
            </div>
            <div className="workbench-toolbar__actions">
              {plan ? (
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => setTaobaoPreviewOpen(true)}
                >
                  <Smartphone size={15} />
                  手机预览
                </Button>
              ) : null}
              {plan ? (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={batchActionDisabled}
                  title={batchActionDisabled ? "当前没有可批量生成的槽位，或已有任务正在执行。" : undefined}
                  onClick={onStartBatch}
                >
                  {batchJob?.status === "running" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                  {batchJob?.status === "running" ? "批量执行中" : `批量生成剩余槽位（${pendingSlotCount}）`}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="compact"
                aria-expanded={!sourceCollapsed}
                aria-controls="workbench-source-column"
                onClick={() => setSourceCollapsed((value) => !value)}
              >
                <FileText size={15} />
                {sourceCollapsed ? "展开资料" : "收起资料"}
              </Button>
              <Button
                variant="primary"
                disabled={planActionDisabled}
                title={planDisabledReason}
                aria-describedby={planDescriptionId}
                onClick={runAmazonPlan}
              >
                {planning ? (
                  <LoaderCircle className="spin" size={16} />
                ) : plan ? (
                  <RotateCcw size={16} />
              ) : (
                <Sparkles size={16} />
              )}
                {planning
                  ? "正在策划..."
                  : plan
                    ? "重新策划"
                    : isAmazon
                      ? "AI 策划"
                      : "AI 策划淘宝商品生产包"}
              </Button>
            </div>
          </div>
          {workflowStage && workflowAction ? (
            <section className="amazon-workflow" aria-label={isAmazon ? "平台工作流程" : "淘宝商品生产包流程"}>
              {!isAmazon ? (
                <div className="taobao-workflow__fixed">
                  <strong>固定图组</strong>
                  <span>5 张主图 + 7 张详情图</span>
                </div>
              ) : null}
              <div className="amazon-workflow__next">
                <div>
                  <strong>{workflowAction.title}</strong>
                  <span>{workflowAction.description}</span>
                </div>
                {workflowAction.onClick ? (
                  <Button disabled={workflowActionDisabled} onClick={workflowAction.onClick}>
                    {workflowAction.title}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}

      {planningPlatformId ? (
        <StatusMessage
          id="planning-task-status"
          className="generation-task-status planning-task-status"
        >
          <span className="generation-task-status__copy">
            <LoaderCircle className="spin" size={16} />
            <span>
              <strong>{getPlatformRulePack(planningPlatformId).label} 正在生成平台策划</strong>
              <span>其他平台的策划入口已锁定；可等待完成或取消当前任务。</span>
            </span>
          </span>
          <Button variant="secondary" onClick={onCancelPlanning}>
            <Square size={13} />
            取消策划
          </Button>
        </StatusMessage>
      ) : null}

      {draftReason ? (
        <StatusMessage id="workspace-draft-status" tone="warning">
          {draftReason}
        </StatusMessage>
      ) : null}

      {planRefreshReason ? (
        <StatusMessage id="plan-freshness-status" tone="warning">
          {planRefreshReason}
        </StatusMessage>
      ) : null}

      {planningError ? (
        <StatusMessage tone="danger" className="workbench-error planning-error">
          <span>{planningError}</span>
          <span className="status-message__actions">
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
          </span>
        </StatusMessage>
      ) : null}

      <div
        className={`workbench-grid${sourceCollapsed ? " workbench-grid--source-collapsed" : ""}${isAmazon && !plan ? " workbench-grid--guided" : ""}${isAmazon ? " workbench-grid--shell" : ""}`}
      >
        <div id="workbench-source-column" className="workbench-source-column" hidden={sourceCollapsed}>
        {activeProject ? (
          <ProductSourcePanel
                showListingPaste={isAmazon}
            project={activeProject}
            assets={referenceAssets}
            loading={loading}
            disabledReason={sourceLockReason}
            onDirtyChange={setSourceDirty}
            onSave={onSave}
            onUpload={onUpload}
            onRemove={onRemove}
          />
        ) : (
          <Panel
            title="当前资料"
            className="workbench-panel"
          >
            <EmptyState
              variant="dependency"
              eyebrow="需要商品资料"
              icon={<ImagePlus size={24} />}
              title="还没有载入商品资料"
              description="平台工作区只负责图组制作。先在资料库建立商品档案，再回来生成当前平台的策划。"
              action={
                <div className="platform-empty-actions">
                  {onOpenLibrary ? (
                    <Button onClick={onOpenLibrary}>
                      <Upload size={15} />
                      打开资料库
                    </Button>
                  ) : null}
                </div>
              }
            />
          </Panel>
        )}
        </div>

        <Panel
          title="平台交付槽位"
          className="workbench-panel workbench-panel--slots"
          action={<StatusChip tone={plan ? "success" : "neutral"}>{plan?.slots.length ?? 0} 个槽位</StatusChip>}
        >
          {plan ? (
            <SlotBoard
              rulePack={rulePack}
              plan={plan}
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
                  : "完成商品档案和至少一张参考图后，这里才会出现当前平台的交付槽位。"
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
              saving={planning || loading}
              versionState={slotVersionStates?.[selectedSlot.slotKey]}
              assets={assets}
              runtimeMode={runtimeMode}
              generating={selectedSlotIsGenerating}
              planNeedsRefresh={planNeedsRefresh}
              planningInputSignature={currentPlanInputSignature}
              generationLocked={generationLocked}
              generationLockReason={generationLockReason}
              complianceResult={complianceResult}
              copilotRunning={selectedSlotCopilotRunning}
              copilotLocked={copilotLocked}
              copilotLockReason={copilotLockReason}
              copilotError={selectedSlotHasCopilotFeedback ? copilotError : null}
              copilotMessage={selectedSlotHasCopilotFeedback ? copilotMessage : null}
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
              onCopilotCommand={(command) => onCopilotCommand(selectedSlot.slotKey, command)}
              onCancelCopilot={onCancelCopilot}
              nextSlotAction={
                amazonPrimaryAction?.kind === "select"
                  ? {
                      label: amazonPrimaryAction.label,
                      onSelect: () => onSelectSlot(amazonPrimaryAction.slotKey),
                    }
                  : undefined
              }
              generationActionVariant={amazonStage === "deliver" ? "secondary" : "primary"}
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

      {/* UI_STYLE_GUIDE: delivery strip hidden until first usable output; single-line unless error. */}
      {(completedSlots > 0 || Boolean(exportError)) ? (
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
              copilotTarget ||
              generationRecoveryRequired ||
              planNeedsRefresh,
          )}
          disabledReason={
            loading
              ? "工作台正在加载或保存项目与素材。"
              : generationRecoveryRequired
                ? "请先恢复图片版本与素材。"
                : planning || generatingSlot || copilotTarget
                  ? "请等待当前策划、图片生成或 Copilot 任务完成。"
                  : planRefreshReason
                    ? planRefreshReason
                    : !plan
                      ? "请先完成平台策划。"
                      : undefined
          }
          onExport={onExport}
          onClearError={onClearExportError}
          compact
        />
      ) : null}
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
    </div>
  );
}
