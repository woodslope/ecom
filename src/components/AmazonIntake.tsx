import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ChevronDown, FileText, ImagePlus, Sparkles, Upload } from "lucide-react";

import {
  assessPlanningInput,
  createEmptyProductFacts,
  planningInputQualityLabel,
  planningInputQualityMessage,
  resolveAmazonPlanningFacts,
} from "../domain/planning/input-assessment";
import type { ProductFacts, ProductProject } from "../domain/projects/types";
import { parseAmazonListingText, listingParseToFactsPatch } from "../domain/planning/listing-parse";
import type { ProductIntakeSourceMode } from "../domain/projects/product-source-text";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
} from "../domain/workspace/project-workspace";
import type { StartAmazonSessionInput, WorkbenchAsset } from "../store/workbench-store";
import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import { resolvePlanningRulePack } from "../domain/planning/resolve-planning-pack";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";
import {
  AmazonSessionControls,
  amazonControlsSummary,
  amazonOptionsFromControls,
  controlsFromPlan,
  type AmazonSessionControlsState,
} from "./AmazonSessionControls";
import { ProductContextBar } from "./ProductContextBar";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
import { Button, Field, Panel, StatusMessage } from "./ui";
import { StyleReferencePicker } from "./StyleReferencePicker";
import { IndustryTemplateSelector } from "./IndustryTemplateSelector";
import { ProductFactsForm } from "./ProductFactsForm";

function controlsFromSession(
  session?: PlatformSession,
  plannerMode?: AmazonWorkspaceMode,
): AmazonSessionControlsState {
  if (!session || session.options.platformId !== "amazon") {
    const defaults = controlsFromPlan(null);
    return plannerMode ? { ...defaults, plannerMode } : defaults;
  }
  const options = session.options;
  return {
    marketplaceId: options.marketplaceId,
    plannerMode: options.plannerMode,
    listingImageCount: options.listingImageCount ?? 7,
    aPlusType: options.aPlusType ?? "standard-large",
    aPlusModuleSpecs: options.aPlusModuleSpecs ?? null,
    sizeTier: options.sizeTier,
    stylePresetId: options.stylePresetId ?? "clean-retail",
  };
}

function initialAmazonFacts(
  project: ProductProject | null,
  listingText: string,
): ProductFacts {
  const base = project?.facts;
  return resolveAmazonPlanningFacts(base, listingText, base ? "library" : "manual");
}

export function AmazonIntake({
  activeProject,
  assets,
  session,
  plannerMode,
  loading,
  planning,
  error,
  onSubmit,
  onStartNewTask,
  onDirtyChange,
  onCreateStyleReference = async () => null,
  onRemoveAsset = async () => undefined,
  historyAction,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  plannerMode?: AmazonWorkspaceMode;
  loading: boolean;
  planning: boolean;
  error: string | null;
  onSubmit: (input: StartAmazonSessionInput) => Promise<PlatformSession | null>;
  onStartNewTask?: () => void;
  onDirtyChange?: (reason: string | null) => void;
  onCreateStyleReference?: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemoveAsset?: (id: string) => Promise<void>;
  historyAction?: ReactNode;
}) {
  const [controls, setControls] = useState(() => controlsFromSession(session, plannerMode));
  const referenceAssets = assets.filter((asset) => asset.metadata.kind === "reference");
  const referenceAssetIds = referenceAssets.map((asset) => asset.metadata.id);
  const referenceAssetIdsKey = referenceAssetIds.join(",");
  const [sourceMode, setSourceMode] = useState<ProductIntakeSourceMode>(
    () => session?.planningInput?.sourceMode ?? "manual",
  );
  const [listingText, setListingText] = useState(() => {
    if (session?.sourceInput.listingText?.trim()) return session.sourceInput.listingText;
    return "";
  });
  const [facts, setFacts] = useState<ProductFacts>(() =>
    initialAmazonFacts(
      activeProject,
      session?.sourceInput.listingText ?? "",
    ),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>(
    session?.selectedReferenceAssetIds ??
      [],
  );
  const [selectedStyleReferenceId, setSelectedStyleReferenceId] = useState<string | null>(
    session?.selectedStyleReferenceId ?? `preset:${controlsFromSession(session, plannerMode).stylePresetId}`,
  );
  const [industryTemplate, setIndustryTemplate] = useState<IndustryTemplateSnapshot | undefined>(
    session?.industryTemplate,
  );
  const [dirty, setDirty] = useState(false);
  const submittingDraft = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const disabled = loading || planning;

  useEffect(() => {
    if (submittingDraft.current) return;
    setControls(controlsFromSession(session, plannerMode));
    const nextMode = session?.planningInput?.sourceMode ?? "manual";
    setSourceMode(nextMode);
    if (session?.sourceInput.listingText?.trim()) {
      setListingText(session.sourceInput.listingText);
    } else {
      setListingText("");
    }
    setFacts(
      initialAmazonFacts(
        activeProject,
        session?.sourceInput.listingText ?? "",
      ),
    );
    setSelectedReferenceAssetIds(
      session?.selectedReferenceAssetIds ??
        [],
    );
    setSelectedStyleReferenceId(
      session?.selectedStyleReferenceId ??
        `preset:${controlsFromSession(session, plannerMode).stylePresetId}`,
    );
    setIndustryTemplate(session?.industryTemplate);
    setFiles([]);
    setDirty(false);
  }, [
    activeProject?.id,
    activeProject?.facts,
    referenceAssetIdsKey,
    plannerMode,
    session?.id,
    session?.planningInput?.sourceMode,
    session?.sourceInput.listingText,
    session?.selectedReferenceAssetIds,
    session?.selectedStyleReferenceId,
    session?.industryTemplate,
  ]);

  const templateScope = useMemo(() => ({
    platformId: "amazon" as const,
    workflowId: controls.plannerMode === "aplus" ? "amazon-aplus" as const : "amazon-listing" as const,
  }), [controls.plannerMode]);
  const templateRulePack = useMemo(
    () => resolvePlanningRulePack("amazon", amazonOptionsFromControls(controls)).rulePack,
    [controls],
  );

  useEffect(() => {
    onDirtyChange?.(dirty ? "Amazon 任务输入有未提交修改。" : null);
    return () => onDirtyChange?.(null);
  }, [dirty, onDirtyChange]);

  const assessment = useMemo(
    () => assessPlanningInput({
      facts,
      productImageCount: selectedReferenceAssetIds.length + files.length,
    }),
    [facts, files.length, selectedReferenceAssetIds.length],
  );
  const assessmentLabel = planningInputQualityLabel(assessment.quality);
  const assessmentMessage = planningInputQualityMessage(assessment);

  const changeFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (next.length > 0) {
      setFiles((current) => [...current, ...next]);
      setDirty(true);
    }
  };

  const applyListingPaste = (overwriteEmptyOnly: boolean) => {
    const parsed = parseAmazonListingText(listingText);
    const patch = listingParseToFactsPatch(parsed, {
      overwriteEmptyOnly,
      current: {
        productName: facts.productName,
        sellingPoints: facts.sellingPoints,
        description: facts.description,
      },
    });
    if (patch.productName === undefined && patch.sellingPoints === undefined && patch.description === undefined) return;
    setFacts((current) => ({
      ...current,
      ...(patch.productName === undefined ? {} : { productName: patch.productName }),
      ...(patch.sellingPoints === undefined ? {} : { sellingPoints: patch.sellingPoints }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
    }));
    setDirty(true);
  };

  const submit = async () => {
    submittingDraft.current = true;
    try {
      const result = await onSubmit({
        ...(activeProject && (sourceMode === "library" || session?.planningInput?.sourceMode === "manual")
          ? { projectId: activeProject.id }
          : {}),
        sourceMode,
        workflowId: controls.plannerMode === "aplus" ? "amazon-aplus" : "amazon-listing",
        listingText,
        facts,
        files,
        selectedReferenceAssetIds,
        selectedStyleReferenceId,
        ...(industryTemplate ? { industryTemplate } : {}),
        options: amazonOptionsFromControls(controls),
      });
      if (result) {
        setFiles([]);
        setDirty(false);
      }
    } finally {
      submittingDraft.current = false;
    }
  };

  return (
    <PlatformWorkflowShell
      platform="amazon"
      title="Amazon"
      stage="prepare"
      completedSlots={0}
      totalSlots={0}
      contextBar={
        <ProductContextBar
          platformLabel="Amazon"
          project={activeProject}
          statusLabel={session?.planningInput ? assessmentLabel : "准备"}
          statusTone="neutral"
          disabled={disabled}
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
            disabled={disabled || assessment.quality === "empty"}
            loading={planning}
            loadingLabel="生成图片策划中..."
            title={assessment.quality === "empty" ? assessmentMessage : undefined}
            aria-describedby={assessment.quality === "empty" ? "amazon-planning-requirement" : undefined}
            onClick={() => void submit()}
          >
            <Sparkles size={16} />
            生成图片策划
          </Button>
        </>
      }
    >
      <div className="amazon-intake">
      {assessment.quality === "empty" ? (
        <StatusMessage id="amazon-planning-requirement" className="planning-input-requirement">
          {assessmentMessage}
        </StatusMessage>
      ) : null}
      <details className="task-advanced-settings">
        <summary><span>策划参数</span><small>{amazonControlsSummary(controls)}</small><ChevronDown size={15} /></summary>
        <div className="task-advanced-settings__body">
          <AmazonSessionControls
            value={controls}
            disabled={disabled}
            onChange={(next) => {
              if (
                next.stylePresetId !== controls.stylePresetId &&
                selectedStyleReferenceId?.startsWith("preset:")
              ) {
                setSelectedStyleReferenceId(`preset:${next.stylePresetId}`);
              }
              setControls(next);
              setDirty(true);
            }}
            additionalSettings={
              <StyleReferencePicker
                assets={assets}
                value={selectedStyleReferenceId}
                basePresetId={controls.stylePresetId}
                disabled={disabled}
                canCreate={Boolean(activeProject)}
                notice={session?.styleReferenceNotice}
                embedded
                onChange={(value) => {
                  setSelectedStyleReferenceId(value);
                  setDirty(true);
                }}
                onBasePresetChange={(stylePresetId) => {
                  setControls((current) => ({ ...current, stylePresetId }));
                  setDirty(true);
                }}
                onCreate={onCreateStyleReference}
                onRemove={onRemoveAsset}
              />
            }
            industrySettings={
              <IndustryTemplateSelector
                scope={templateScope}
                rulePack={templateRulePack}
                value={industryTemplate}
                disabled={disabled}
                onChange={(next) => {
                  if (industryTemplate && (next.id !== industryTemplate.id || next.version !== industryTemplate.version)) {
                    setDirty(true);
                  }
                  setIndustryTemplate(next);
                }}
              />
            }
          />
        </div>
      </details>

      <div className="amazon-intake__grid">
        <Panel title="Listing 原文" className="amazon-intake__listing">
          <ProductFactsForm facts={facts} disabled={disabled} onChange={(next) => { setFacts(next); setDirty(true); }} />
          <details className="planning-source-paste">
            <summary>粘贴 Amazon Listing（可选）</summary>
            <Field label="Listing 原文" hint="本地解析后可填入上方结构化字段，不会自动覆盖已填写内容。">
              <textarea
                name="listingText"
                aria-label="Amazon Listing 原文"
                rows={6}
                disabled={disabled}
                value={listingText}
                placeholder={"Title: Product title\n\nAbout this item\n- First benefit\n- Second benefit\n\nProduct description..."}
                onChange={(event) => { setListingText(event.target.value); setDirty(true); }}
              />
            </Field>
            <div className="planning-source-paste__actions">
              <Button type="button" variant="secondary" size="compact" disabled={disabled || !listingText.trim()} onClick={() => applyListingPaste(true)}>填入空字段</Button>
              <Button type="button" variant="secondary" size="compact" disabled={disabled || !listingText.trim()} onClick={() => applyListingPaste(false)}>覆盖填入</Button>
            </div>
          </details>
        </Panel>

        <Panel title="参考图" className="amazon-intake__references">
          <div className="amazon-intake__upload">
            <ImagePlus size={22} aria-hidden="true" />
            <span>
              <strong>添加本次任务参考图</strong>
              <small>最多 16 张，提交前检查 8 MiB 总预算</small>
            </span>
            <Button
              variant="secondary"
              size="compact"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />选择图片
            </Button>
            <input
              ref={fileInputRef}
              className="visually-hidden-input"
              type="file"
              name="referenceFiles"
              accept="image/*"
              multiple
              disabled={disabled}
              onChange={changeFiles}
            />
          </div>

          {referenceAssets.length > 0 ? (
            <div className="amazon-intake__asset-options">
              {referenceAssets.map((asset) => {
                const selected = selectedReferenceAssetIds.includes(asset.metadata.id);
                return (
                  <label key={asset.metadata.id} className="amazon-intake__asset-option">
                    <input
                      type="checkbox"
                      name="selectedReferenceAssetIds"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => {
                        setSelectedReferenceAssetIds((current) =>
                          selected
                            ? current.filter((id) => id !== asset.metadata.id)
                            : [...current, asset.metadata.id],
                        );
                        setDirty(true);
                      }}
                    />
                    <img src={asset.objectUrl} alt={asset.metadata.name} />
                    <span>{asset.metadata.name}</span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {files.length > 0 ? (
            <ul className="amazon-intake__pending-files">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <FileText size={14} aria-hidden="true" />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setFiles((current) => current.filter((_, i) => i !== index));
                      setDirty(true);
                    }}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="amazon-intake__empty-reference">
              {sourceMode === "library"
                ? "已保存任务资料中的参考图已列出，可勾选本次要用的图，也可继续上传。"
                : "可先填写商品资料，再补参考图。"}
            </p>
          )}
        </Panel>
      </div>

      {error ? <StatusMessage tone="danger" live="assertive">{error}</StatusMessage> : null}
      </div>
    </PlatformWorkflowShell>
  );
}
