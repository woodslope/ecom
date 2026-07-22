import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileText, FolderOpen, ImagePlus, LoaderCircle, Sparkles, Square, Upload } from "lucide-react";

import type { ProductProject } from "../domain/projects/types";
import {
  hasUsableProductFacts,
  productFactsToTaobaoText,
  resolveInitialIntakeSourceMode,
  type ProductIntakeSourceMode,
} from "../domain/projects/product-source-text";
import type { TaobaoProductAnalysis } from "../domain/platforms/taobao-analysis";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import { Button, Dialog, EmptyState, Field, Panel, SegmentedControl, StatusChip, StatusMessage } from "./ui";
import { WorkflowStepper } from "./WorkflowStepper";

/** Matches PlatformWorkspace canPlan: Taobao planning needs at least one reference image. */
export function taobaoAnalysisHasReference(input: {
  selectedReferenceCount: number;
  pendingFileCount: number;
}): boolean {
  return input.selectedReferenceCount > 0 || input.pendingFileCount > 0;
}

const citationSourceLabel = {
  "shared-product": "共享商品",
  "analysis-input": "补充资料",
  "reference-asset": "参考图",
} as const;

export function TaobaoAnalysisSummary({
  open = true,
  analysis,
  onClose = () => undefined,
  onReanalyze,
  reanalyzeDisabled = false,
  reanalyzeDisabledReason,
}: {
  open?: boolean;
  analysis: TaobaoProductAnalysis;
  onClose?: () => void;
  onReanalyze?: () => void;
  reanalyzeDisabled?: boolean;
  reanalyzeDisabledReason?: string;
}) {
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
          <Button
            variant="secondary"
            disabled={reanalyzeDisabled}
            title={reanalyzeDisabledReason}
            onClick={onReanalyze}
          >
            重新分析
          </Button>
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
  onDirtyChange,
  onOpenLibrary,
  onOpenProductPicker,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: { sourceInput: { taobaoProduct?: { productText: string; selectedReferenceAssetIds: string[] } } };
  loading: boolean;
  lockedReason?: string;
  onCancelLockedTask?: () => void;
  error: string | null;
  onAnalyze: (input: AnalyzeTaobaoProductInput) => Promise<unknown>;
  onDirtyChange?: (reason: string | null) => void;
  onOpenLibrary?: () => void;
  onOpenProductPicker?: () => void;
}) {
  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.metadata.kind === "reference"),
    [assets],
  );
  const sessionDraft = session?.sourceInput.taobaoProduct;
  const hasLibraryFacts = Boolean(activeProject && hasUsableProductFacts(activeProject.facts));
  const [sourceMode, setSourceMode] = useState<ProductIntakeSourceMode>(() =>
    resolveInitialIntakeSourceMode({
      hasSessionDraft: Boolean(sessionDraft?.productText?.trim()),
      hasLibraryFacts,
    }),
  );
  const [productText, setProductText] = useState(() => {
    if (sessionDraft?.productText?.trim()) return sessionDraft.productText;
    if (activeProject && hasUsableProductFacts(activeProject.facts)) {
      return productFactsToTaobaoText(activeProject.facts);
    }
    return "";
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(
    sessionDraft?.selectedReferenceAssetIds ?? referenceAssets.map((asset) => asset.metadata.id),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const draft = session?.sourceInput.taobaoProduct;
    const libraryReady = Boolean(activeProject && hasUsableProductFacts(activeProject.facts));
    const nextMode = resolveInitialIntakeSourceMode({
      hasSessionDraft: Boolean(draft?.productText?.trim()),
      hasLibraryFacts: libraryReady,
    });
    setSourceMode(nextMode);
    if (draft?.productText?.trim()) {
      setProductText(draft.productText);
    } else if (nextMode === "library" && activeProject) {
      setProductText(productFactsToTaobaoText(activeProject.facts));
    } else {
      setProductText("");
    }
    setSelectedIds(
      draft?.selectedReferenceAssetIds ??
        referenceAssets.map((asset) => asset.metadata.id),
    );
    setFiles([]);
    setDirty(false);
  }, [
    activeProject,
    referenceAssets,
    session?.sourceInput.taobaoProduct?.productText,
    session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds,
  ]);

  useEffect(() => {
    onDirtyChange?.(dirty ? "淘宝任务输入有未提交修改。" : null);
    return () => onDirtyChange?.(null);
  }, [dirty, onDirtyChange]);

  if (!activeProject) {
    return (
      <EmptyState
        variant="setup"
        icon={<FileText size={24} />}
        title="先选择商品资料"
        description="淘宝生产可从资料库载入商品档案，也可新建档案后回来手动填写。"
        action={
          <div className="platform-empty-actions">
            {onOpenProductPicker ? (
              <Button onClick={onOpenProductPicker}>
                <FolderOpen size={15} />
                选择商品
              </Button>
            ) : null}
            {onOpenLibrary ? (
              <Button variant="secondary" onClick={onOpenLibrary}>
                <FolderOpen size={15} />
                打开资料库
              </Button>
            ) : null}
          </div>
        }
      />
    );
  }

  const applyLibrarySource = () => {
    setSourceMode("library");
    setProductText(productFactsToTaobaoText(activeProject.facts));
    setSelectedIds(referenceAssets.map((asset) => asset.metadata.id));
    setDirty(true);
  };

  const applyManualSource = () => {
    setSourceMode("manual");
    // Keep current text so users can continue editing after switching.
  };

  const hasReference = taobaoAnalysisHasReference({
    selectedReferenceCount: selectedIds.length,
    pendingFileCount: files.length,
  });
  const analyzeDisabledReason = lockedReason ?? (!hasReference
    ? "请先添加或选择至少一张商品参考图（与后续平台策划门槛一致）"
    : undefined);

  const toggleAsset = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setDirty(true);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasReference) return;
    const result = await onAnalyze({
      projectId: activeProject.id,
      productText,
      files,
      selectedReferenceAssetIds: selectedIds,
    });
    if (result) {
      setFiles([]);
      setDirty(false);
    }
  };

  return (
    <form className="taobao-intake" onSubmit={(event) => void submit(event)}>
      <div className="workbench-toolbar">
        <div className="workbench-toolbar__title">
          <h1>淘宝 / 天猫</h1>
          <StatusChip tone="neutral">商品分析</StatusChip>
        </div>
        <Button
          type="submit"
          disabled={loading || Boolean(lockedReason) || !hasReference}
          title={analyzeDisabledReason}
        >
          <Sparkles size={16} />
          {loading ? "分析并策划中..." : "分析并策划"}
        </Button>
      </div>
      <WorkflowStepper
        platform="taobao"
        stage="prepare"
        completedSlots={0}
        totalSlots={0}
      />
      {lockedReason ? (
        <StatusMessage className="planning-task-status">
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
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <div className="intake-source-bar" role="region" aria-label="商品资料来源">
        <div className="intake-source-bar__copy">
          <strong>任务输入来源</strong>
          <span>
            {sourceMode === "library"
              ? "已载入资料库商品资料与参考图，可在下方继续修改；不会自动写回资料库。"
              : "手动填写本次任务文案与参考图；需要时可一键载入资料库。"}
          </span>
        </div>
        <SegmentedControl
          ariaLabel="商品资料来源"
          value={sourceMode}
          onChange={(mode) => {
            if (mode === "library") applyLibrarySource();
            else applyManualSource();
          }}
          options={[
            {
              value: "library",
              label: "载入资料库",
              disabled: !hasLibraryFacts && referenceAssets.length === 0,
            },
            { value: "manual", label: "手动填写" },
          ]}
        />
        {sourceMode === "library" ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={!hasLibraryFacts && referenceAssets.length === 0}
            onClick={applyLibrarySource}
          >
            重新载入
          </Button>
        ) : null}
      </div>

      {!hasLibraryFacts && sourceMode === "manual" ? (
        <StatusMessage>
          当前资料库商品事实较空。可直接粘贴文案，或先到资料库补全后再点「载入资料库」。
        </StatusMessage>
      ) : null}
      {!hasReference ? (
        <StatusMessage tone="warning">
          淘宝策划需要至少一张参考图。请在下方添加图片，或勾选资料库中的现有素材后再分析。
        </StatusMessage>
      ) : null}
      <div className="taobao-intake__grid">
        <Panel title="商品资料" className="taobao-intake__copy-panel">
          <Field
            label="淘宝商品资料"
            hint={
              sourceMode === "library"
                ? "来自资料库的任务副本，改这里只影响本次 session。"
                : "粘贴或手写本次任务文案。"
            }
          >
            <textarea
              aria-label="淘宝商品资料"
              rows={14}
              value={productText}
              onChange={(event) => {
                setSourceMode("manual");
                setProductText(event.target.value);
                setDirty(true);
              }}
              placeholder="可粘贴商品名称、卖点、规格和禁用声明"
            />
          </Field>
          <StatusMessage>分析结果只保存到本次淘宝商品 session，不会自动修改资料库。</StatusMessage>
        </Panel>
        <Panel title="商品参考图" className="taobao-intake__asset-panel">
          <label className="taobao-intake__upload">
            <Upload size={18} />
            <span>添加本次分析图片（至少 1 张，与后续策划一致）</span>
            <input
              aria-label="淘宝分析图片"
              type="file"
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
                description="请在这里添加至少一张图片，或先到资料库补充素材。没有参考图无法完成分析与策划。"
                action={
                  onOpenLibrary ? (
                    <Button variant="secondary" size="compact" onClick={onOpenLibrary}>
                      <FolderOpen size={14} />
                      打开资料库
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : null}
        </Panel>
      </div>
    </form>
  );
}
