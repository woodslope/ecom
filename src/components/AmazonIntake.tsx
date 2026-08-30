import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ImagePlus, Sparkles } from "lucide-react";

import {
  assessPlanningInput,
  createEmptyProductFacts,
  planningInputQualityMessage,
  resolveAmazonPlanningFacts,
} from "../domain/planning/input-assessment";
import type { ProductFacts, ProductProject } from "../domain/projects/types";
import type { ProductIntakeSourceMode } from "../domain/projects/product-source-text";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
} from "../domain/workspace/project-workspace";
import type { StartAmazonSessionInput, WorkbenchAsset } from "../store/workbench-store";
import { extractClipboardImageFiles } from "../domain/assets/clipboard";
import { resolvePlanningRulePack } from "../domain/planning/resolve-planning-pack";
import type { IndustryTemplateSnapshot } from "../domain/prompt-templates/industry-template-packs";
import {
  AmazonSessionControls,
  amazonControlsSummary,
  amazonOptionsFromControls,
  controlsFromPlan,
  type AmazonSessionControlsState,
} from "./AmazonSessionControls";
import { PlatformWorkflowShell } from "./PlatformWorkflowShell";
import { Button, Field, Panel, StatusMessage } from "./ui";
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
  historyAction,
  embedded = false,
  readOnly = false,
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
  historyAction?: ReactNode;
  embedded?: boolean;
  readOnly?: boolean;
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
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const pendingFilePreviews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => {
    pendingFilePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [pendingFilePreviews]);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>(
    session?.selectedReferenceAssetIds ??
      [],
  );
  const [industryTemplate, setIndustryTemplate] = useState<IndustryTemplateSnapshot | undefined>(
    session?.industryTemplate,
  );
  const [dirty, setDirty] = useState(false);
  const submittingDraft = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const disabled = readOnly || loading || planning;

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

  const assessedFacts = useMemo(
    () => resolveAmazonPlanningFacts(facts, listingText, "library"),
    [facts, listingText],
  );
  const assessment = useMemo(
    () => assessPlanningInput({
      facts: assessedFacts,
      productImageCount: selectedReferenceAssetIds.length + files.length,
    }),
    [assessedFacts, files.length, selectedReferenceAssetIds.length],
  );
  const assessmentMessage = planningInputQualityMessage(assessment);
  const taskName = facts.productName.trim() || activeProject?.name || null;
  const taskSettingsSummary = [
    taskName,
    amazonControlsSummary(controls),
    industryTemplate?.name ?? "通用模板",
  ].filter(Boolean).join(" · ");

  const addFiles = (next: File[]) => {
    const images = next.filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) {
      setFiles((current) => [...current, ...images]);
      setDirty(true);
    }
  };

  const changeFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const dropFiles = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (disabled) return;
    addFiles(Array.from(event.dataTransfer.files));
  };

  const pasteFiles = (event: ClipboardEvent<HTMLElement>) => {
    if (disabled) return;
    const images = extractClipboardImageFiles(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    addFiles(images);
  };

  const dragOverFiles = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!disabled) setIsDraggingFiles(true);
  };

  const dragLeaveFiles = (event: DragEvent<HTMLButtonElement>) => {
    if (event.currentTarget === event.target) setIsDraggingFiles(false);
  };

  const clearDragState = () => setIsDraggingFiles(false);

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

  const content = (
    <div className={`amazon-intake${readOnly ? " amazon-intake--readonly" : ""}`} onPaste={pasteFiles}>
      <details className="task-advanced-settings">
        <summary>
          <span>任务设置</span>
          <small title={taskSettingsSummary}>{taskSettingsSummary}</small>
          <ChevronDown size={15} />
        </summary>
        <div className="task-advanced-settings__body">
          <AmazonSessionControls
            value={controls}
            disabled={disabled}
            onChange={(next) => {
              setControls(next);
              setDirty(true);
            }}
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
        <Panel
          title="Listing 资料"
          description={assessment.quality === "empty" ? assessmentMessage : undefined}
          descriptionId={assessment.quality === "empty" ? "amazon-planning-requirement" : undefined}
          descriptionClassName={assessment.quality === "empty" ? "planning-input-requirement" : undefined}
          className="amazon-intake__listing"
        >
          <div className="planning-source-paste" aria-label="粘贴 Amazon Listing 文本">
            <Field label="Listing 原文">
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
          </div>
          <ProductFactsForm facts={facts} disabled={disabled} onChange={(next) => { setFacts(next); setDirty(true); }} />
        </Panel>

        <Panel title="商品图" className="amazon-intake__references">
          <Button
            variant="quiet"
            type="button"
            aria-label="选择图片"
            className={`reference-upload${isDraggingFiles ? " reference-upload--dragging" : ""}`}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={dragOverFiles}
            onDragLeave={dragLeaveFiles}
            onDrop={dropFiles}
            onBlur={clearDragState}
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
            type="file"
            name="referenceFiles"
            accept="image/*"
            multiple
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={changeFiles}
          />

          {referenceAssets.length > 0 ? (
            <div className="reference-asset-grid" role="group" aria-label="选择商品图">
              {referenceAssets.map((asset) => {
                const selected = selectedReferenceAssetIds.includes(asset.metadata.id);
                return (
                  <label key={asset.metadata.id} className="reference-asset-card">
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

          {pendingFilePreviews.length > 0 ? (
            <div className="reference-asset-grid" role="group" aria-label="待提交商品图">
              {pendingFilePreviews.map(({ file, url }, index) => (
                <div key={`${file.name}-${index}`} className="reference-asset-card reference-asset-card--pending">
                  <img src={url} alt={file.name} />
                  <span>{file.name}</span>
                  <Button
                    variant="quiet"
                    size="compact"
                    type="button"
                    disabled={disabled}
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
        </Panel>
      </div>

      {error ? <StatusMessage tone="danger" live="assertive">{error}</StatusMessage> : null}
    </div>
  );

  if (embedded) return content;

  return (
    <PlatformWorkflowShell
      platform="amazon"
      title="Amazon"
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
            disabled={disabled || assessment.quality === "empty"}
            loading={planning}
            loadingLabel="AI策划中..."
            title={assessment.quality === "empty" ? assessmentMessage : undefined}
            aria-describedby={assessment.quality === "empty" ? "amazon-planning-requirement" : undefined}
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
