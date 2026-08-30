import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ImagePlus, LoaderCircle, Sparkles, Square } from "lucide-react";

import type { ProductFacts, ProductProject } from "../domain/projects/types";
import {
  assessPlanningInput,
  createEmptyProductFacts,
  planningInputQualityLabel,
  planningInputQualityMessage,
  type PlanningInputSnapshot,
} from "../domain/planning/input-assessment";
import type { ProductIntakeSourceMode } from "../domain/projects/product-source-text";
import {
  analyzeTaobaoProduct,
  applyTaobaoAnalysisToFacts,
  type TaobaoProductAnalysis,
} from "../domain/platforms/taobao-analysis";
import type { PlatformSession } from "../domain/workspace/project-workspace";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";
import { extractClipboardImageFiles } from "../domain/assets/clipboard";
import { getPlatformRulePack } from "../domain/platforms/registry";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
import { IndustryTemplateSelector } from "./IndustryTemplateSelector";
import { ProductFactsForm } from "./ProductFactsForm";
import { Button, Dialog, Field, OperationStatus, Panel, StatusChip, StatusMessage } from "./ui";

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
  historyAction,
  embedded = false,
  readOnly = false,
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
  historyAction?: ReactNode;
  embedded?: boolean;
  readOnly?: boolean;
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
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const pendingFilePreviews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => {
    pendingFilePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [pendingFilePreviews]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [industryTemplate, setIndustryTemplate] = useState<IndustryTemplateSnapshot | undefined>(
    session?.industryTemplate,
  );

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
    setIndustryTemplate(session?.industryTemplate);
  }, [
    activeProject,
    session?.planningInput?.sourceMode,
    session?.sourceInput.taobaoProduct?.productText,
    session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds,
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
  const assessmentMessage = planningInputQualityMessage(assessment);
  const taskName = facts.productName.trim() || activeProject?.name || null;
  const taskSettingsSummary = [
    taskName,
    industryTemplate?.name ?? "通用模板",
  ].filter(Boolean).join(" · ");
  const controlsDisabled = readOnly || loading || Boolean(lockedReason);
  const analyzeDisabledReason = lockedReason ??
    (assessment.quality === "empty" ? assessmentMessage : undefined);

  const toggleAsset = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setDirty(true);
  };
  const addFiles = (next: File[]) => {
    const images = next.filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) {
      setFiles((current) => [...current, ...images]);
      setDirty(true);
    }
  };
  const dropFiles = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (controlsDisabled) return;
    addFiles(Array.from(event.dataTransfer.files));
  };
  const pasteFiles = (event: ClipboardEvent<HTMLElement>) => {
    if (controlsDisabled) return;
    const images = extractClipboardImageFiles(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    addFiles(images);
  };
  const submit = async () => {
    if (assessment.quality === "empty") return;
    const result = await onAnalyze({
      ...(activeProject && (sourceMode === "library" || session?.planningInput?.sourceMode === "manual")
        ? { projectId: activeProject.id }
        : {}),
      sourceMode,
      productText,
      facts,
      files,
      selectedReferenceAssetIds: selectedIds,
      ...(industryTemplate ? { industryTemplate } : {}),
    });
    if (result) {
      setFiles([]);
      setDirty(false);
    }
  };

  const content = (
    <form className={`taobao-intake${readOnly ? " taobao-intake--readonly" : ""}`} onPaste={pasteFiles} onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}>
      {lockedReason ? (
        <OperationStatus
          id="taobao-planning-lock"
          live="polite"
          data-testid="taobao-planning-operation-status"
          icon={<LoaderCircle className="spin" size={16} />}
          title={lockedReason}
          actions={onCancelLockedTask ? (
            <Button type="button" variant="secondary" onClick={onCancelLockedTask}>
              <Square size={13} />
              取消策划
            </Button>
          ) : undefined}
        />
      ) : null}
      <details className="task-advanced-settings">
        <summary>
          <span>任务设置</span>
          <small title={taskSettingsSummary}>{taskSettingsSummary}</small>
          <ChevronDown size={15} />
        </summary>
        <div className="task-advanced-settings__body">
          <section className="planning-settings-group">
            <IndustryTemplateSelector
              scope={{ platformId: "taobao", workflowId: "taobao-product" }}
              rulePack={getPlatformRulePack("taobao")}
              value={industryTemplate}
              disabled={controlsDisabled}
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
      {error ? <StatusMessage tone="danger" live="assertive">{error}</StatusMessage> : null}

      <div className="taobao-intake__grid">
        <Panel
          title="商品资料"
          description={assessment.quality === "empty" ? assessmentMessage : undefined}
          descriptionId={assessment.quality === "empty" ? "taobao-planning-requirement" : undefined}
          descriptionClassName={assessment.quality === "empty" ? "planning-input-requirement" : undefined}
          className="taobao-intake__copy-panel"
        >
          <div className="planning-source-paste" aria-label="粘贴淘宝商品资料文本">
            <Field label="商品资料原文">
              <textarea
                name="productText"
                aria-label="淘宝商品资料"
                rows={6}
                value={productText}
                disabled={controlsDisabled}
                placeholder="商品名：云感旅行颈枕\n卖点：慢回弹\n规格：材质：记忆棉"
                onChange={(event) => { setProductText(event.target.value); setDirty(true); }}
              />
            </Field>
          </div>
          <ProductFactsForm facts={facts} disabled={controlsDisabled} onChange={(next) => { setFacts(next); setDirty(true); }} />
        </Panel>
        <Panel title="商品图" className="taobao-intake__asset-panel">
          <Button
            variant="quiet"
            type="button"
            aria-label="选择图片"
            className={`reference-upload${isDraggingFiles ? " reference-upload--dragging" : ""}`}
            disabled={controlsDisabled}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!controlsDisabled) setIsDraggingFiles(true);
            }}
            onDragLeave={() => setIsDraggingFiles(false)}
            onDrop={dropFiles}
            onBlur={() => setIsDraggingFiles(false)}
          >
            <ImagePlus size={22} aria-hidden="true" />
            <span>
              <strong>添加本次任务商品图</strong>
              <small>最多 16 张，8 MiB 内，支持直接粘贴</small>
            </span>
          </Button>
          <input
            ref={fileInputRef}
            className="visually-hidden-input"
            aria-label="淘宝分析图片"
            type="file"
            name="referenceFiles"
            accept="image/*"
            multiple
            disabled={controlsDisabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          {pendingFilePreviews.length > 0 ? (
            <div className="reference-asset-grid" role="group" aria-label="待提交商品图">
              {pendingFilePreviews.map(({ file, url }, index) => (
                <div key={`${file.name}-${index}`} className="reference-asset-card reference-asset-card--pending">
                  <img src={url} alt={file.name} />
                  <span>{file.name}</span>
                  <Button
                    type="button"
                    variant="quiet"
                    size="compact"
                    disabled={controlsDisabled}
                    aria-label={`移除文件 ${file.name}`}
                    onClick={() => {
                      setFiles((current) => current.filter((_, i) => i !== index));
                      setDirty(true);
                    }}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {referenceAssets.length > 0 ? (
            <div className="reference-asset-grid" role="group" aria-label="选择商品图">
              {referenceAssets.map((asset) => (
                <label className="reference-asset-card" key={asset.metadata.id}>
                  <input
                    type="checkbox"
                    name="selectedReferenceAssetIds"
                    checked={selectedIds.includes(asset.metadata.id)}
                    disabled={controlsDisabled}
                    onChange={() => toggleAsset(asset.metadata.id)}
                  />
                  <img src={asset.objectUrl} alt={asset.metadata.name} />
                  <span>{asset.metadata.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </form>
  );

  if (embedded) return content;

  return (
    <PlatformWorkflowShell
      platform="taobao"
      title="淘宝 / 天猫"
      stage="prepare"
      completedSlots={0}
      totalSlots={0}
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
            disabled={controlsDisabled || assessment.quality === "empty"}
            loading={loading}
            loadingLabel="AI策划中..."
            title={analyzeDisabledReason}
            aria-describedby={lockedReason ? "taobao-planning-lock" : assessment.quality === "empty" ? "taobao-planning-requirement" : undefined}
            onClick={() => void submit()}
          >
            <Sparkles size={16} />
            AI策划
          </Button>
        </>
      }
    >
      {content}
    </PlatformWorkflowShell>
  );
}
