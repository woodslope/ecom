import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, FileText, ImagePlus, LoaderCircle, Pencil, Plus, Sparkles, Square, Upload } from "lucide-react";

import type { ProductFacts, ProductProject } from "../domain/projects/types";
import {
  assessPlanningInput,
  createEmptyProductFacts,
  planningInputQualityLabel,
  planningInputQualityMessage,
  type PlanningInputSnapshot,
} from "../domain/planning/input-assessment";
import type { ProductIntakeSourceMode } from "../domain/projects/product-source-text";
import { productFactsToTaobaoText } from "../domain/projects/product-source-text";
import {
  analyzeTaobaoProduct,
  applyTaobaoAnalysisToFacts,
  type TaobaoProductAnalysis,
} from "../domain/platforms/taobao-analysis";
import type { PlatformSession } from "../domain/workspace/project-workspace";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";
import { getPlatformRulePack } from "../domain/platforms/registry";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
import { ProductContextBar } from "./ProductContextBar";
import { IndustryTemplateSelector } from "./IndustryTemplateSelector";
import { ProductFactsForm } from "./ProductFactsForm";
import { Button, Dialog, EmptyState, Field, IconButton, Panel, Select, StatusChip, StatusMessage } from "./ui";
import {
  allProfiles,
  DEFAULT_PROMPT_PROFILE_ID,
} from "../domain/prompt-profiles/prompt-profiles";
import { PromptProfileDialog, usePromptProfilePicker } from "./PromptProfileDialog";

export function taobaoAnalysisHasReference(input: {
  selectedReferenceCount: number;
  pendingFileCount: number;
}): boolean {
  return input.selectedReferenceCount > 0 || input.pendingFileCount > 0;
}

const citationSourceLabel = {
  "shared-product": "历史任务",
  "analysis-input": "补充资料",
  "reference-asset": "参考图",
} as const;

export function TaobaoAnalysisSummary({
  open = true,
  analysis,
  planningInput,
  onClose = () => undefined,
  onReanalyze,
  reanalyzeDisabled = false,
  reanalyzeDisabledReason,
}: {
  open?: boolean;
  analysis: TaobaoProductAnalysis;
  planningInput?: PlanningInputSnapshot;
  onClose?: () => void;
  onReanalyze?: () => void;
  reanalyzeDisabled?: boolean;
  reanalyzeDisabledReason?: string;
}) {
  const reanalyzeReasonId = useId();
  const findingCount = analysis.missingFacts.length + analysis.warnings.length;

  return (
    <Dialog
      open={open}
      title="商品分析结果"
      eyebrow="淘宝商品上下文"
      variant="sidebar"
      className="taobao-analysis-summary"
      onClose={onClose}
      footer={
        onReanalyze ? (
          <div className="taobao-analysis-summary__footer">
            <Button
              variant="secondary"
              disabled={reanalyzeDisabled}
              title={reanalyzeDisabledReason}
              aria-describedby={reanalyzeDisabledReason ? reanalyzeReasonId : undefined}
              onClick={onReanalyze}
            >
              重新分析
            </Button>
            {reanalyzeDisabledReason ? (
              <span id={reanalyzeReasonId} className="taobao-analysis-summary__reanalyze-reason">
                {reanalyzeDisabledReason}
              </span>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className="taobao-analysis-summary__overview">
        <strong>{analysis.suggestedProductName || "待补商品名称"}</strong>
        <span>
          <StatusChip tone={analysis.missingFacts.length > 0 ? "warning" : "success"}>
            {analysis.missingFacts.length > 0 ? `待补 ${analysis.missingFacts.length} 项` : "资料齐全"}
          </StatusChip>
          {findingCount > 0 ? <StatusChip tone="warning">{findingCount} 条提醒</StatusChip> : null}
        </span>
      </div>
      {planningInput ? (
        <StatusMessage tone={planningInput.quality === "standard" ? "success" : "warning"}>
          {planningInput.sourceMode === "library" ? "已保存任务资料" : "当前任务填写"} · {planningInputQualityLabel(planningInput.quality)}
          {planningInput.missingFacts.length > 0
            ? ` · 待补：${planningInput.missingFacts.join("、")}`
            : " · 输入完整"}
        </StatusMessage>
      ) : null}
      <div className="taobao-analysis-summary__body">
        <dl className="taobao-analysis-summary__facts">
          <div>
            <dt>可用卖点</dt>
            <dd>{analysis.sellingPoints.length > 0 ? analysis.sellingPoints.join("、") : "待补可验证卖点"}</dd>
          </div>
          <div>
            <dt>规格参数</dt>
            <dd>
              {Object.keys(analysis.specifications).length > 0
                ? Object.entries(analysis.specifications).map(([key, value]) => `${key}：${value}`).join("；")
                : "待补规格参数"}
            </dd>
          </div>
          <div>
            <dt>禁用声明</dt>
            <dd>{analysis.forbiddenClaims.length > 0 ? analysis.forbiddenClaims.join("、") : "暂无"}</dd>
          </div>
          <div>
            <dt>引用素材</dt>
            <dd>{analysis.referenceAssets.length > 0 ? analysis.referenceAssets.map((asset) => asset.name).join("、") : "未选择"}</dd>
          </div>
        </dl>
        {analysis.missingFacts.length > 0 ? (
          <StatusMessage tone="warning">待补资料：{analysis.missingFacts.join("、")}</StatusMessage>
        ) : null}
        {analysis.warnings.map((warning) => <StatusMessage key={warning} tone="warning">{warning}</StatusMessage>)}
        {analysis.citations.length > 0 ? (
          <details className="taobao-analysis-summary__citations">
            <summary>来源记录 · {analysis.citations.length}</summary>
            <ul>
              {analysis.citations.map((citation, index) => (
                <li key={`${citation.source}-${citation.field}-${index}`}>
                  <StatusChip tone="neutral">{citationSourceLabel[citation.source]}</StatusChip>
                  <span>{citation.field}</span>
                  <strong>{citation.value}</strong>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Dialog>
  );
}

export function TaobaoIntake({
  activeProject,
  assets,
  session,
  loading,
  lockedReason,
  onCancelLockedTask,
  error,
  onAnalyze,
  onStartNewTask,
  onDirtyChange,
  onOpenAnalysisDetails,
  stylePresetId,
  historyAction,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  loading: boolean;
  lockedReason?: string;
  onCancelLockedTask?: () => void;
  error: string | null;
  onAnalyze: (input: AnalyzeTaobaoProductInput) => Promise<unknown>;
  onStartNewTask?: () => void;
  onDirtyChange?: (reason: string | null) => void;
  onOpenAnalysisDetails?: () => void;
  stylePresetId?: string | null;
  historyAction?: ReactNode;
}) {
  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.metadata.kind === "reference"),
    [assets],
  );
  const sessionDraft = session?.sourceInput.taobaoProduct;
  const [sourceMode, setSourceMode] = useState<ProductIntakeSourceMode>(
    () => session?.planningInput?.sourceMode ?? "manual",
  );
  const [productText, setProductText] = useState(() => {
    if (sessionDraft?.productText?.trim()) return sessionDraft.productText;
    return "";
  });
  const [facts, setFacts] = useState<ProductFacts>(() => {
    const base = activeProject && session ? activeProject.facts : createEmptyProductFacts();
    return applyTaobaoAnalysisToFacts(base, analyzeTaobaoProduct({ facts: base, productText, referenceAssets: [] }));
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(
    sessionDraft?.selectedReferenceAssetIds ?? [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState(
    () => stylePresetId ?? DEFAULT_PROMPT_PROFILE_ID,
  );
  const [industryTemplate, setIndustryTemplate] = useState<IndustryTemplateSnapshot | undefined>(
    session?.industryTemplate,
  );
  const profilePicker = usePromptProfilePicker();
  const availableProfiles = profilePicker.profiles.length > 0 ? profilePicker.profiles : allProfiles();
  const selectedProfile = availableProfiles.find((profile) => profile.id === selectedStylePresetId);

  useEffect(() => {
    const draft = session?.sourceInput.taobaoProduct;
    const nextMode = session?.planningInput?.sourceMode ?? "manual";
    setSourceMode(nextMode);
    if (draft?.productText?.trim()) {
      setProductText(draft.productText);
    } else {
      setProductText("");
    }
    const nextText = draft?.productText ?? "";
    const base = activeProject && session ? activeProject.facts : createEmptyProductFacts();
    setFacts(applyTaobaoAnalysisToFacts(base, analyzeTaobaoProduct({ facts: base, productText: nextText, referenceAssets: [] })));
    setSelectedIds(
      draft?.selectedReferenceAssetIds ?? [],
    );
    setFiles([]);
    setDirty(false);
    setSelectedStylePresetId(stylePresetId ?? DEFAULT_PROMPT_PROFILE_ID);
    setIndustryTemplate(session?.industryTemplate);
  }, [
    activeProject,
    session?.planningInput?.sourceMode,
    session?.sourceInput.taobaoProduct?.productText,
    session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds,
    stylePresetId,
    session?.industryTemplate,
  ]);

  useEffect(() => {
    onDirtyChange?.(dirty ? "淘宝任务输入有未提交修改。" : null);
    return () => onDirtyChange?.(null);
  }, [dirty, onDirtyChange]);

  const assessment = useMemo(
    () => assessPlanningInput({
      facts,
      productImageCount: selectedIds.length + files.length,
    }),
    [facts, files.length, selectedIds.length],
  );
  const assessmentLabel = planningInputQualityLabel(assessment.quality);
  const assessmentMessage = planningInputQualityMessage(assessment);
  const analyzeDisabledReason = lockedReason ??
    (assessment.quality === "empty" ? assessmentMessage : undefined);

  const toggleAsset = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setDirty(true);
  };
  const applyProductText = () => {
    const base = facts;
    const analysis = analyzeTaobaoProduct({ facts: base, productText, referenceAssets: [] });
    setFacts(applyTaobaoAnalysisToFacts(base, analysis));
    setDirty(true);
  };
  const submit = async () => {
    if (assessment.quality === "empty") return;
    const result = await onAnalyze({
      ...(activeProject && (sourceMode === "library" || session?.planningInput?.sourceMode === "manual")
        ? { projectId: activeProject.id }
        : {}),
      sourceMode,
      productText: productFactsToTaobaoText(facts),
      facts,
      files,
      selectedReferenceAssetIds: selectedIds,
      stylePresetId: selectedStylePresetId,
      ...(industryTemplate ? { industryTemplate } : {}),
    });
    if (result) {
      setFiles([]);
      setDirty(false);
    }
  };

  return (
    <PlatformWorkflowShell
      platform="taobao"
      title="淘宝 / 天猫"
      stage="prepare"
      completedSlots={0}
      totalSlots={0}
      contextBar={
        <ProductContextBar
          platformLabel="淘宝 / 天猫"
          project={activeProject}
          statusLabel={session?.planningInput ? assessmentLabel : "准备"}
          statusTone="neutral"
          detailLabel={session?.taobaoAnalysis ? "分析详情" : undefined}
          disabled={loading}
          onOpenDetails={session?.taobaoAnalysis ? onOpenAnalysisDetails : undefined}
        />
      }
      historyAction={historyAction}
      actions={
        <>
          {onStartNewTask && (activeProject || session) ? (
            <Button variant="secondary" size="normal" onClick={onStartNewTask}>
              <Sparkles size={15} />新任务
            </Button>
          ) : null}
          <Button
            type="button"
            className="planning-primary-action"
            disabled={loading || Boolean(lockedReason) || assessment.quality === "empty"}
            loading={loading}
            loadingLabel="生成图片策划中..."
            title={analyzeDisabledReason}
            aria-describedby={lockedReason ? "taobao-planning-lock" : assessment.quality === "empty" ? "taobao-planning-requirement" : undefined}
            onClick={() => void submit()}
          >
            <Sparkles size={16} />
            生成图片策划
          </Button>
        </>
      }
    >
      <form className="taobao-intake" onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}>
      {assessment.quality === "empty" ? (
        <StatusMessage id="taobao-planning-requirement" className="planning-input-requirement">
          {assessmentMessage}
        </StatusMessage>
      ) : null}
      {lockedReason ? (
        <StatusMessage id="taobao-planning-lock" live="polite" className="planning-task-status">
          <span className="generation-task-status__copy">
            <LoaderCircle className="spin" size={16} />
            <strong>{lockedReason}</strong>
          </span>
          {onCancelLockedTask ? (
            <Button type="button" variant="secondary" onClick={onCancelLockedTask}>
              <Square size={13} />
              取消策划
            </Button>
          ) : null}
        </StatusMessage>
      ) : null}
      <details className="task-advanced-settings">
        <summary><span>任务设置</span><small>{selectedProfile?.label ?? "干净零售"} · {industryTemplate?.name ?? "通用模板"}</small><ChevronDown size={15} /></summary>
        <div className="task-advanced-settings__body">
          <section className="planning-settings-group">
            <div className="planning-settings-group__heading">
              <strong>生成策略</strong>
              <span>控制策划策略、文案密度、视觉风格和行业方向。</span>
            </div>
            <Field label="生成方案" className="taobao-intake__profile-field">
              <div className="prompt-profile-select-row">
                <Select
                  name="stylePresetId"
                  aria-label="生成方案"
                  value={selectedStylePresetId}
                  disabled={loading}
                  onChange={(event) => {
                    setSelectedStylePresetId(event.target.value);
                    setDirty(true);
                  }}
                >
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id} title={profile.description}>
                      {profile.label}{profile.source === "custom" ? "（自定义）" : ""}
                    </option>
                  ))}
                </Select>
                <div className="prompt-profile-select-row__actions">
                  <IconButton label="新建生成方案" disabled={loading} onClick={profilePicker.openNew}>
                    <Plus size={14} />
                  </IconButton>
                  {selectedProfile?.source === "custom" ? (
                    <IconButton label="编辑此方案" disabled={loading} onClick={() => profilePicker.openEdit(selectedProfile)}>
                      <Pencil size={14} />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            </Field>
            <IndustryTemplateSelector
              scope={{ platformId: "taobao", workflowId: "taobao-product" }}
              rulePack={getPlatformRulePack("taobao")}
              value={industryTemplate}
              disabled={loading || Boolean(lockedReason)}
              onChange={(next) => {
                if (industryTemplate && (next.id !== industryTemplate.id || next.version !== industryTemplate.version)) {
                  setDirty(true);
                }
                setIndustryTemplate(next);
              }}
            />
          </section>
        </div>
      </details>
      <PromptProfileDialog
        open={profilePicker.dialogOpen}
        editProfile={profilePicker.editingProfile}
        onClose={profilePicker.closeDialog}
        onSaved={profilePicker.handleSaved}
      />
      {error ? <StatusMessage tone="danger" live="assertive">{error}</StatusMessage> : null}

      <div className="taobao-intake__grid">
        <Panel title="商品资料" className="taobao-intake__copy-panel">
          <ProductFactsForm facts={facts} disabled={loading || Boolean(lockedReason)} onChange={(next) => { setFacts(next); setDirty(true); }} />
          <details className="planning-source-paste">
            <summary>粘贴淘宝商品资料（可选）</summary>
            <Field label="商品资料原文" hint="解析后可填入上方结构化字段，不会自动覆盖已填写内容。">
              <textarea
                name="productText"
                aria-label="淘宝商品资料"
                rows={6}
                value={productText}
                disabled={loading || Boolean(lockedReason)}
                placeholder="商品名：云感旅行颈枕\n卖点：慢回弹\n规格：材质：记忆棉"
                onChange={(event) => { setProductText(event.target.value); setDirty(true); }}
              />
            </Field>
            <div className="planning-source-paste__actions">
              <Button type="button" variant="secondary" size="compact" disabled={loading || Boolean(lockedReason) || !productText.trim()} onClick={applyProductText}>填入结构化字段</Button>
            </div>
          </details>
        </Panel>
        <Panel title="商品参考图" className="taobao-intake__asset-panel">
          <label className="taobao-intake__upload">
            <Upload size={18} />
            <span>添加本次任务商品图<small>最多 16 张，合计不超过 8 MiB</small></span>
            <input
              aria-label="淘宝分析图片"
              type="file"
              name="referenceFiles"
              accept="image/*"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setDirty(true);
              }}
            />
          </label>
          {files.length > 0 ? (
            <StatusMessage className="taobao-intake__file-count">
              <FileText size={15} aria-hidden="true" />
              <span>已选择 {files.length} 张图片，将随本次分析一起提交。</span>
            </StatusMessage>
          ) : null}
          {referenceAssets.length > 0 ? (
            <div className="taobao-intake__asset-list" role="group" aria-label="选择商品参考图">
              {referenceAssets.map((asset) => (
                <label className="taobao-intake__asset" key={asset.metadata.id}>
                  <input
                    type="checkbox"
                    name="selectedReferenceAssetIds"
                    checked={selectedIds.includes(asset.metadata.id)}
                    onChange={() => toggleAsset(asset.metadata.id)}
                  />
                  <img src={asset.objectUrl} alt={asset.metadata.name} />
                  <span>{asset.metadata.name}</span>
                </label>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="taobao-intake__asset-list" role="group" aria-label="选择商品参考图">
              <EmptyState
                variant="selection"
                icon={<ImagePlus size={20} />}
                title="还没有参考图"
                description="可只填写商品资料生成策划草稿，也可上传商品图提升输入完整度。"
              />
            </div>
          ) : null}
        </Panel>
      </div>
      </form>
    </PlatformWorkflowShell>
  );
}
