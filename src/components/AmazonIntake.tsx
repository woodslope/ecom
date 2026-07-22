import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileText, ImagePlus, Upload } from "lucide-react";

import { parseAmazonListingText } from "../domain/planning/listing-parse";
import type { ProductProject } from "../domain/projects/types";
import {
  hasUsableProductFacts,
  productFactsToAmazonListingText,
  resolveInitialIntakeSourceMode,
  type ProductIntakeSourceMode,
} from "../domain/projects/product-source-text";
import type {
  AmazonWorkspaceMode,
  PlatformSession,
} from "../domain/workspace/project-workspace";
import type { StartAmazonSessionInput, WorkbenchAsset } from "../store/workbench-store";
import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import {
  AmazonSessionControls,
  amazonOptionsFromControls,
  controlsFromPlan,
  type AmazonSessionControlsState,
} from "./AmazonSessionControls";
import { Button, Field, Panel, SegmentedControl, StatusMessage } from "./ui";
import { StyleReferencePicker } from "./StyleReferencePicker";
import { WorkflowStepper } from "./WorkflowStepper";

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

function listingDifferenceSummary(project: ProductProject, listingText: string): string | null {
  const parsed = parseAmazonListingText(listingText);
  const differences: string[] = [];
  if (parsed.title && parsed.title !== project.facts.productName) differences.push("商品名称");
  if (
    parsed.bullets.length > 0 &&
    JSON.stringify(parsed.bullets) !== JSON.stringify(project.facts.sellingPoints)
  ) {
    differences.push("核心卖点");
  }
  if (parsed.description && parsed.description !== project.facts.description) {
    differences.push("商品描述");
  }
  return differences.length > 0 ? `Listing 与共享资料存在差异：${differences.join("、")}` : null;
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
  onSyncListingFacts,
  onDirtyChange,
  onCreateStyleReference = async () => null,
  onRemoveAsset = async () => undefined,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: PlatformSession;
  plannerMode?: AmazonWorkspaceMode;
  loading: boolean;
  planning: boolean;
  error: string | null;
  onSubmit: (input: StartAmazonSessionInput) => Promise<PlatformSession | null>;
  onSyncListingFacts: (listingText: string) => Promise<boolean>;
  onDirtyChange?: (reason: string | null) => void;
  onCreateStyleReference?: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemoveAsset?: (id: string) => Promise<void>;
}) {
  const [controls, setControls] = useState(() => controlsFromSession(session, plannerMode));
  const referenceAssets = assets.filter((asset) => asset.metadata.kind === "reference");
  const referenceAssetIds = referenceAssets.map((asset) => asset.metadata.id);
  const referenceAssetIdsKey = referenceAssetIds.join(",");
  const hasLibraryFacts = Boolean(activeProject && hasUsableProductFacts(activeProject.facts));
  const [sourceMode, setSourceMode] = useState<ProductIntakeSourceMode>(() =>
    resolveInitialIntakeSourceMode({
      hasSessionDraft: Boolean(session?.sourceInput.listingText?.trim()),
      hasLibraryFacts,
    }),
  );
  const [listingText, setListingText] = useState(() => {
    if (session?.sourceInput.listingText?.trim()) return session.sourceInput.listingText;
    if (activeProject && hasUsableProductFacts(activeProject.facts)) {
      return productFactsToAmazonListingText(activeProject.facts);
    }
    return "";
  });
  const [files, setFiles] = useState<File[]>([]);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>(
    session?.selectedReferenceAssetIds ??
      (hasLibraryFacts ? referenceAssets.map((asset) => asset.metadata.id) : []),
  );
  const [selectedStyleReferenceId, setSelectedStyleReferenceId] = useState<string | null>(
    session?.selectedStyleReferenceId ?? `preset:${controlsFromSession(session, plannerMode).stylePresetId}`,
  );
  const [syncStatus, setSyncStatus] = useState<"idle" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const submittingDraft = useRef(false);
  const disabled = loading || planning;

  useEffect(() => {
    if (submittingDraft.current) return;
    setControls(controlsFromSession(session, plannerMode));
    const libraryReady = Boolean(activeProject && hasUsableProductFacts(activeProject.facts));
    const nextMode = resolveInitialIntakeSourceMode({
      hasSessionDraft: Boolean(session?.sourceInput.listingText?.trim()),
      hasLibraryFacts: libraryReady,
    });
    setSourceMode(nextMode);
    if (session?.sourceInput.listingText?.trim()) {
      setListingText(session.sourceInput.listingText);
    } else if (nextMode === "library" && activeProject) {
      setListingText(productFactsToAmazonListingText(activeProject.facts));
    } else {
      setListingText("");
    }
    setSelectedReferenceAssetIds(
      session?.selectedReferenceAssetIds ??
        (nextMode === "library"
          ? referenceAssetIds
          : []),
    );
    setSelectedStyleReferenceId(
      session?.selectedStyleReferenceId ??
        `preset:${controlsFromSession(session, plannerMode).stylePresetId}`,
    );
    setFiles([]);
    setSyncStatus("idle");
    setDirty(false);
  }, [
    activeProject?.id,
    activeProject?.facts,
    referenceAssetIdsKey,
    plannerMode,
    session?.id,
    session?.sourceInput.listingText,
    session?.selectedReferenceAssetIds,
    session?.selectedStyleReferenceId,
  ]);

  useEffect(() => {
    onDirtyChange?.(dirty ? "Amazon 任务输入有未提交修改。" : null);
    return () => onDirtyChange?.(null);
  }, [dirty, onDirtyChange]);

  const differenceSummary = useMemo(
    () => activeProject && listingText.trim()
      ? listingDifferenceSummary(activeProject, listingText)
      : null,
    [activeProject, listingText],
  );

  const applyLibrarySource = () => {
    if (!activeProject) return;
    setSourceMode("library");
    setListingText(productFactsToAmazonListingText(activeProject.facts));
    setSelectedReferenceAssetIds(
      referenceAssetIds,
    );
    setSyncStatus("idle");
    setDirty(true);
  };

  const changeFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (next.length > 0) {
      setFiles((current) => [...current, ...next]);
      setDirty(true);
    }
  };

  const submit = async () => {
    submittingDraft.current = true;
    try {
      const result = await onSubmit({
        ...(activeProject ? { projectId: activeProject.id } : {}),
        workflowId: controls.plannerMode === "aplus" ? "amazon-aplus" : "amazon-listing",
        listingText,
        files,
        selectedReferenceAssetIds,
        selectedStyleReferenceId,
        options: amazonOptionsFromControls(controls),
      });
      if (result) setDirty(false);
    } finally {
      submittingDraft.current = false;
    }
  };

  return (
    <div className="amazon-intake">
      <div className="amazon-intake__toolbar">
        <div>
          <h1>Amazon</h1>
        </div>
      </div>

      <WorkflowStepper
        platform="amazon"
        stage="prepare"
        completedSlots={0}
        totalSlots={0}
      />

      <div className="intake-source-bar" role="region" aria-label="商品资料来源">
        <div className="intake-source-bar__copy">
          <strong>任务输入来源</strong>
          <span>
            {sourceMode === "library"
              ? activeProject
                ? "已从资料库生成 Listing 草稿并勾选参考图，可继续改；不会自动写回资料库。"
                : "请先在资料库选择商品，或下方手动粘贴 Listing。"
              : "手动粘贴 Listing / 手填；有资料库商品时可一键载入。"}
          </span>
        </div>
        <SegmentedControl
          ariaLabel="商品资料来源"
          value={sourceMode}
          disabled={disabled}
          onChange={(mode) => {
            if (mode === "library") applyLibrarySource();
            else setSourceMode("manual");
          }}
          options={[
            {
              value: "library",
              label: "载入资料库",
              disabled: !activeProject || (!hasLibraryFacts && referenceAssets.length === 0),
            },
            { value: "manual", label: "手动填写" },
          ]}
        />
        {sourceMode === "library" && activeProject ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={disabled || (!hasLibraryFacts && referenceAssets.length === 0)}
            onClick={applyLibrarySource}
          >
            重新载入
          </Button>
        ) : null}
      </div>

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
        planAction={{
          label: "生成图片策划",
          disabled: !listingText.trim(),
          title: !listingText.trim() ? "先填写 Listing 原文" : undefined,
          busy: planning,
          onClick: () => void submit(),
        }}
      />

      <div className="amazon-intake__grid">
        <Panel title="Listing 原文" className="amazon-intake__listing">
          <Field
            label="标题、五点与商品说明"
            hint={
              sourceMode === "library"
                ? "来自资料库的任务副本；改这里只影响本次 session。"
                : "原文只保存到当前 Amazon session，不会自动覆盖共享商品资料。"
            }
          >
            <textarea
              aria-label="Amazon Listing 原文"
              rows={14}
              disabled={disabled}
              value={listingText}
              placeholder={"Title: Product title\n\nAbout this item\n- First benefit\n- Second benefit\n\nProduct description..."}
              onChange={(event) => {
                setSourceMode("manual");
                setListingText(event.target.value);
                setSyncStatus("idle");
                setDirty(true);
              }}
            />
          </Field>
          {differenceSummary ? (
            <StatusMessage tone="warning">
              <span>{differenceSummary}。不会自动覆盖共享商品资料。</span>
              <Button
                variant="secondary"
                size="compact"
                disabled={disabled}
                onClick={async () =>
                  setSyncStatus(await onSyncListingFacts(listingText) ? "saved" : "error")
                }
              >
                同步到共享商品资料
              </Button>
            </StatusMessage>
          ) : null}
          {syncStatus === "saved" ? (
            <StatusMessage tone="success">已同步到共享商品资料。</StatusMessage>
          ) : null}
          {syncStatus === "error" ? (
            <StatusMessage tone="danger">同步失败，session 原文仍保留。</StatusMessage>
          ) : null}
        </Panel>

        <Panel title="参考图" className="amazon-intake__references">
          <label className="amazon-intake__upload">
            <ImagePlus size={22} aria-hidden="true" />
            <span>
              <strong>添加本次任务参考图</strong>
              <small>最多 16 张，提交前检查 8 MiB 总预算</small>
            </span>
            <Button variant="secondary" size="compact" disabled={disabled}>
              <Upload size={14} />选择图片
            </Button>
            <input
              className="visually-hidden-input"
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              onChange={changeFiles}
            />
          </label>

          {referenceAssets.length > 0 ? (
            <div className="amazon-intake__asset-options">
              {referenceAssets.map((asset) => {
                const selected = selectedReferenceAssetIds.includes(asset.metadata.id);
                return (
                  <label key={asset.metadata.id} className="amazon-intake__asset-option">
                    <input
                      type="checkbox"
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
                ? "资料库参考图已列出，可勾选本次要用的图，也可继续上传。"
                : "可先粘贴 Listing，再补参考图。"}
            </p>
          )}
        </Panel>
      </div>

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
    </div>
  );
}
