import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Columns3, Copy, Save } from "lucide-react";

import {
  activeSlotVersion,
  isSlotVersionCurrent,
} from "../domain/generation/current-version";
import type { MaskDraft } from "../domain/generation/mask";
import type { SlotVersion, SlotVersionState } from "../domain/generation/types";
import type { ComplianceResult } from "../domain/compliance";
import { CompliancePanel } from "./CompliancePanel";
import type { PlannedSlot } from "../domain/planning/types";
import {
  industryTemplateSnapshot,
  listIndustryTemplatePacks,
  saveIndustryTemplatePack,
  templateSlotGuidance,
  type IndustryTemplateSnapshot,
} from "../domain/prompt-templates/industry-template-packs";
import type { PlatformRulePack } from "../domain/platforms/types";
import type { WorkbenchAsset } from "../store/workbench-store";
import { GenerationActions } from "./GenerationActions";
import { ImageTools } from "./ImageTools";
import { MaskEditorDialog } from "./MaskEditorDialog";
import { VersionStrip } from "./VersionStrip";
import { VersionCompareDialog } from "./VersionCompareDialog";
import {
  ActionBar,
  Button,
  ConfirmDialog,
  Field,
  MediaSlot,
  SegmentedControl,
  StatusMessage,
} from "./ui";

type InspectorPane = "copy" | "versions";

const inspectorPanes = [
  { value: "copy", label: "文案" },
  { value: "versions", label: "版本" },
] as const satisfies readonly { value: InspectorPane; label: string }[];

export function isSlotDraftDirty(
  slot: PlannedSlot,
  visibleCopy: string,
  prompt: string,
  externalText: PlannedSlot["externalText"] = slot.externalText,
): boolean {
  return (
    visibleCopy !== slot.visibleCopy ||
    prompt !== slot.prompt ||
    (externalText?.title ?? "") !== (slot.externalText?.title ?? "") ||
    (externalText?.body ?? "") !== (slot.externalText?.body ?? "")
  );
}

export function SlotInspector({
  rulePack,
  slot,
  industryTemplate,
  saving = false,
  versionState,
  assets = [],
  generating = false,
  planNeedsRefresh = false,
  planningInputSignature,
  generationLocked = false,
  generationLockReason,
  onDirtyChange = () => undefined,
  onSave,
  onGenerate = () => undefined,
  onActivateVersion = () => undefined,
  imageEditingSupported = true,
  imageEditingDisabledReason,
  onDownloadVersion,
  onUseAsReference,
  onMaskEdit,
  nextSlotAction,
  generationActionVariant = "primary",
  generationError,
  complianceResult,
  taskContext,
}: {
  rulePack: PlatformRulePack;
  slot: PlannedSlot;
  industryTemplate?: IndustryTemplateSnapshot;
  saving?: boolean;
  versionState?: SlotVersionState;
  assets?: WorkbenchAsset[];
  generating?: boolean;
  planNeedsRefresh?: boolean;
  planningInputSignature?: string;
  generationLocked?: boolean;
  generationLockReason?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (
    patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> &
      Partial<Pick<PlannedSlot, "externalText">>,
  ) => Promise<boolean>;
  onGenerate?: () => void;
  onActivateVersion?: (versionId: string) => void;
  imageEditingSupported?: boolean;
  imageEditingDisabledReason?: string;
  onDownloadVersion?: (version: SlotVersion, asset: WorkbenchAsset) => void;
  onUseAsReference?: (asset: WorkbenchAsset) => void;
  onMaskEdit?: (versionId: string, mask: MaskDraft, prompt: string) => Promise<boolean>;
  nextSlotAction?: { label: string; onSelect: () => void };
  generationActionVariant?: "primary" | "secondary";
  generationError?: string;
  complianceResult?: ComplianceResult;
  taskContext?: {
    name: string;
    mode: string;
    status: string;
  };
}) {
  const [visibleCopy, setVisibleCopy] = useState(slot.visibleCopy);
  const [prompt, setPrompt] = useState(slot.prompt);
  const [externalTitle, setExternalTitle] = useState(slot.externalText?.title ?? "");
  const [externalBody, setExternalBody] = useState(slot.externalText?.body ?? "");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activePane, setActivePane] = useState<InspectorPane>("copy");
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [maskEditorSaving, setMaskEditorSaving] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [maskEditorError, setMaskEditorError] = useState<string | null>(null);
  const [industryTemplateMessage, setIndustryTemplateMessage] = useState<string | null>(null);
  const [industryTemplateConfirmOpen, setIndustryTemplateConfirmOpen] = useState(false);
  const slotKeyRef = useRef(slot.slotKey);
  const nextSlotDisabledReasonId = useId();
  const [renderedDimensions, setRenderedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const isMain = rulePack.platformId === "amazon" && slot.slotKey === "MAIN";
  const usesEnglishPrompt = rulePack.promptLanguage === "en";
  const promptLabel = usesEnglishPrompt ? "模型提示词（英文，可复制）" : "图片提示词";
  const busy = saving || generating || saveState === "saving";
  const submitting = busy || planNeedsRefresh;
  const hasExternalText = Boolean(slot.externalText);
  const saveLabel = typeof window !== "undefined" && hasExternalText
    ? "保存外部文案与提示词"
    : "保存";
  const externalText = hasExternalText
    ? { title: externalTitle, body: externalBody }
    : undefined;
  const draftDirty = isSlotDraftDirty(slot, visibleCopy, prompt, externalText);
  const generationDisabled =
    planNeedsRefresh ||
    draftDirty ||
    saveState === "saving" ||
    saving ||
    (generationLocked && !generating);
  const generationDisabledReason = planNeedsRefresh
    ? "当前策划已过期，请先重新策划。"
    : draftDirty
      ? "请先保存当前修改，再生成图片。"
    : saveState === "saving" || saving
      ? "槽位草稿正在保存，请稍候。"
      : generationLocked && !generating
        ? generationLockReason
        : undefined;
  const nextSlotDisabledReason = draftDirty
    ? "请先在“文案”中保存当前修改，再切换槽位。"
    : undefined;
  const activeVersion = activeSlotVersion(versionState);
  const activeVersionIsCurrent = activeVersion
    ? isSlotVersionCurrent(slot, activeVersion, planningInputSignature)
    : true;
  const activeAsset = assets.find((asset) => asset.metadata.id === activeVersion?.assetId);
  const slotRule = rulePack.slots.find((rule) => rule.key === slot.slotKey);
  const industryGuidance = templateSlotGuidance(industryTemplate, slot.slotKey);

  const savePromptAsIndustryTemplateVersion = () => {
    if (
      typeof window === "undefined" ||
      !industryTemplate ||
      industryTemplate.source !== "custom" ||
      !industryGuidance
    ) return;
    setIndustryTemplateConfirmOpen(true);
    return;
  };

  const confirmSavePromptAsIndustryTemplateVersion = () => {
    if (
      typeof window === "undefined" ||
      !industryTemplate ||
      industryTemplate.source !== "custom" ||
      !industryGuidance
    ) return;
    const pack = listIndustryTemplatePacks(window.localStorage, industryTemplate.scope)
      .find((candidate) => candidate.id === industryTemplate.id);
    if (!pack) {
      setIndustryTemplateMessage("行业模板已被删除，当前任务快照仍可继续使用。");
      setIndustryTemplateConfirmOpen(false);
      return;
    }
    const latest = industryTemplateSnapshot(pack);
    const saved = saveIndustryTemplatePack(window.localStorage, {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      scope: pack.scope,
      brief: latest.brief,
      slots: latest.slots.map((templateSlot) =>
        templateSlot.slotKey === slot.slotKey
          ? { ...templateSlot, guidance: prompt.trim() }
          : templateSlot,
      ),
    });
    setIndustryTemplateMessage(
      `已保存为行业模板 v${saved.revisions.at(-1)?.version ?? latest.version + 1}；当前任务仍使用原快照。`,
    );
    setIndustryTemplateConfirmOpen(false);
  };
  const previewAspectRatio = `${activeVersion?.width ?? slotRule?.dimensions.width ?? 1} / ${
    activeVersion?.height ?? slotRule?.dimensions.height ?? 1
  }`;
  const actualWidth = renderedDimensions?.width ?? activeVersion?.width;
  const actualHeight = renderedDimensions?.height ?? activeVersion?.height;
  const requestedSize = activeVersion
    ? String(activeVersion.parameters.requestedSize ?? activeVersion.parameters.size ?? "")
    : "";
  const targetUploadSize = activeVersion
    ? String(
        activeVersion.parameters.uploadSize ??
          (slotRule ? `${slotRule.dimensions.width}x${slotRule.dimensions.height}` : ""),
      )
    : "";

  useEffect(() => {
    const slotChanged = slotKeyRef.current !== slot.slotKey;
    slotKeyRef.current = slot.slotKey;
    setVisibleCopy(slot.visibleCopy);
    setPrompt(slot.prompt);
    setExternalTitle(slot.externalText?.title ?? "");
    setExternalBody(slot.externalText?.body ?? "");
    setCopyState("idle");
    if (slotChanged) setSaveState("idle");
    setActivePane("copy");
  }, [slot.externalText?.body, slot.externalText?.title, slot.prompt, slot.slotKey, slot.visibleCopy]);

  useEffect(() => {
    setRenderedDimensions(null);
  }, [activeVersion?.id]);

  useEffect(() => {
    onDirtyChange(draftDirty);
  }, [draftDirty, onDirtyChange]);

  const saveDraft = async () => {
    if (!draftDirty || submitting) return;
    setSaveState("saving");
    const saved = await onSave({
      visibleCopy: isMain || hasExternalText ? "" : visibleCopy,
      prompt,
      ...(externalText ? { externalText } : {}),
    });
    setSaveState(saved ? "saved" : "error");
  };

  const copyExternalText = async () => {
    try {
      await navigator.clipboard.writeText(`${externalTitle}\n\n${externalBody}`.trim());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const openMaskEditor = () => {
    setMaskEditorError(null);
    setMaskEditorOpen(true);
  };
  const saveMaskEdit = async (mask: MaskDraft, editPrompt: string) => {
    if (!activeVersion || !onMaskEdit) return;
    setMaskEditorSaving(true);
    setMaskEditorError(null);
    try {
      const saved = await onMaskEdit(activeVersion.id, mask, editPrompt);
      if (saved) setMaskEditorOpen(false);
      else setMaskEditorError("局部编辑未保存，旧版本仍保持可用。");
    } finally {
      setMaskEditorSaving(false);
    }
  };

  return (
    <div className="slot-inspector slot-inspector--shell">
      {/* Fixed top: slot identity and detail-view switcher. */}
      <header className="slot-inspector__chrome-top" aria-label="槽位身份">
        <div className="slot-inspector__identity">
          {taskContext ? (
            <span
              className="slot-inspector__task-context"
              title={`${taskContext.name} · ${taskContext.mode} · ${taskContext.status}`}
            >
              {taskContext.name} · {taskContext.mode} · {taskContext.status}
            </span>
          ) : null}
          <span className="slot-inspector__key">{slot.slotKey}</span>
          {slotRule ? <span className="slot-inspector__label">{slotRule.uiLabel ?? slotRule.label}</span> : null}
        </div>
        <div className="slot-inspector__chrome-actions">
          <SegmentedControl
            className="slot-inspector__views"
            ariaLabel="槽位检查视图"
            options={inspectorPanes}
            value={activePane}
            onChange={setActivePane}
          />
        </div>
      </header>

      {/* Scroll middle: current result plus one active detail view. */}
      <div className="slot-inspector__scroll" role="region" aria-label="槽位内容">
        <section className="generated-result generated-result--compact" aria-label="当前生成结果">
          <div className="generated-result__row">
            <MediaSlot
              className="generated-result__preview"
              aspectRatio={previewAspectRatio}
              state={generating ? "loading" : activeAsset ? "ready" : "empty"}
              src={activeAsset?.objectUrl}
              alt={`${slot.slotKey} 当前生成版本`}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setRenderedDimensions({ width: naturalWidth, height: naturalHeight });
                }
              }}
            />
            <div className="generated-result__side">
              {activeVersion && actualWidth && actualHeight ? (
                <p className="generated-result__dimensions">
                  <span>实际图片 {actualWidth}×{actualHeight}px</span>
                  {requestedSize ? <span>生成请求 {requestedSize.replace("x", "×")}px</span> : null}
                  {targetUploadSize ? (
                    <span>目标上传 {targetUploadSize.replace("x", "×")}px</span>
                  ) : null}
                </p>
              ) : null}
              {activeVersion && !activeVersionIsCurrent ? (
                <StatusMessage tone="warning" className="generated-result__stale">
                  当前图基于旧草稿，请重新生成后再计入交付。
                </StatusMessage>
              ) : (
                <p className="generated-result__hint">
                  {generating
                    ? "正在生成当前槽位，完成后会自动显示并保留为新版本。"
                    : activeVersion
                      ? "可切换历史版本。"
                      : "确认 Prompt 后在底部生成。"}
                </p>
              )}
              {versionState?.versions.length ? (
                <p className="generated-result__version-summary">
                  已保留 {versionState.versions.length} 个版本，当前操作请到“版本”。
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <form
          id="slot-inspector-form"
          className="slot-inspector__form slot-inspector__pane"
          aria-label="文案与提示词"
          hidden={activePane !== "copy"}
          onSubmit={(event) => event.preventDefault()}
        >
            {hasExternalText ? (
              <div className="slot-inspector__external-copy" aria-label="A+ 图片外文案">
                <div className="slot-inspector__external-copy-header">
                  <strong>A+ 图片外文案</strong>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={submitting || !externalTitle.trim() || !externalBody.trim()}
                    onClick={() => void copyExternalText()}
                  >
                    <Copy size={14} />
                    复制外部文案
                  </Button>
                </div>
                <Field label="外部标题（图片外）">
                  <input
                    name="externalTitle"
                    aria-label="外部标题（图片外）"
                    value={externalTitle}
                    disabled={submitting}
                    onChange={(event) => {
                      setExternalTitle(event.target.value);
                      setCopyState("idle");
                      setSaveState("idle");
                    }}
                  />
                </Field>
                <Field label="外部正文（图片外）">
                  <textarea
                    name="externalBody"
                    aria-label="外部正文（图片外）"
                    value={externalBody}
                    disabled={submitting}
                    rows={4}
                    onChange={(event) => {
                      setExternalBody(event.target.value);
                      setCopyState("idle");
                      setSaveState("idle");
                    }}
                  />
                </Field>
                {copyState === "copied" ? (
                  <StatusMessage tone="success" live="polite">外部标题与正文已复制。</StatusMessage>
                ) : null}
                {copyState === "error" ? (
                  <StatusMessage tone="danger" live="assertive">复制失败，请手动选择外部文案。</StatusMessage>
                ) : null}
              </div>
            ) : (
              <Field label="可见文案">
                <textarea
                  name="visibleCopy"
                  aria-label="可见文案"
                  className="slot-inspector__visible-copy"
                  placeholder={isMain ? "Amazon MAIN 不使用可见文案" : undefined}
                  value={visibleCopy}
                  disabled={isMain || submitting}
                  rows={isMain ? 2 : 3}
                  onChange={(event) => {
                    setVisibleCopy(event.target.value);
                    setSaveState("idle");
                  }}
                />
              </Field>
            )}
            {industryTemplate && industryGuidance ? (
              <StatusMessage className="slot-inspector__template-source">
                <span>
                  模板来源：{industryTemplate.source === "system"
                    ? `通用模板 · 系统 v${industryTemplate.version}`
                    : `通用模板 ＞ ${industryTemplate.name} v${industryTemplate.version}`}
                </span>
                {industryTemplate.source === "custom" ? (
                  <Button
                    type="button"
                    variant="quiet"
                    size="compact"
                    disabled={submitting || !prompt.trim()}
                    onClick={savePromptAsIndustryTemplateVersion}
                  >
                    保存新版本
                  </Button>
                ) : null}
              </StatusMessage>
            ) : null}
            {industryTemplateMessage ? (
              <StatusMessage tone="success" live="polite">{industryTemplateMessage}</StatusMessage>
            ) : null}
            {complianceResult ? <CompliancePanel result={complianceResult} /> : null}
            <Field
              label={promptLabel}
              hint={
                usesEnglishPrompt
                  ? "英文模型指令；品牌/型号/尺寸等事实可保留原文。"
                  : undefined
              }
            >
              <textarea
                name="prompt"
                aria-label={promptLabel}
                className="slot-inspector__prompt"
                value={prompt}
                disabled={submitting}
                rows={8}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setSaveState("idle");
                }}
              />
            </Field>
            {rulePack.platformId === "amazon" ? (
              <section className="slot-inspector__planning-output" aria-label="Amazon 策划输出">
                {slot.strategy ? (
                  <div className="slot-inspector__strategy" aria-labelledby="slot-strategy-title">
                    <div className="slot-inspector__section-title">
                      <strong id="slot-strategy-title">中文策划说明</strong>
                      <span className="slot-inspector__section-hint">人工确认画面目标与合规边界</span>
                    </div>
                    <div className="slot-inspector__strategy-card"><p>{slot.strategy}</p></div>
                  </div>
                ) : null}
                {slot.negativePrompt ? (
                  <div className="slot-inspector__negative" aria-label="英文 Negative Prompt">
                    <strong>模型负面约束（英文）</strong>
                    <p>{slot.negativePrompt}</p>
                  </div>
                ) : null}
              </section>
            ) : null}
        </form>

        <section
          className="slot-inspector__pane slot-inspector__versions"
          aria-label="版本与图片工具"
          hidden={activePane !== "versions"}
        >
            <div className="slot-inspector__pane-heading">
              <strong>版本与图片工具</strong>
              <span>
                {versionState?.versions.length
                  ? `${versionState.versions.length} 个历史版本，只导出当前版本。`
                  : "生成首张图片后，可在这里切换、下载或继续编辑。"}
              </span>
              {versionState && versionState.versions.length >= 2 ? (
                <Button
                  type="button"
                  variant="quiet"
                  size="compact"
                  onClick={() => setCompareOpen(true)}
                >
                  <Columns3 size={14} />
                  对比
                </Button>
              ) : null}
            </div>
            {versionState && versionState.versions.length > 0 ? (
              <VersionStrip
                state={versionState}
                slot={slot}
                assets={assets}
                planningInputSignature={planningInputSignature}
                disabled={generating || generationLocked}
                onActivate={onActivateVersion}
              />
            ) : (
              <StatusMessage>当前槽位还没有图片版本。</StatusMessage>
            )}
            {activeVersion && activeAsset ? (
              <ImageTools
                fileName={activeAsset.metadata.name}
                editingSupported={imageEditingSupported && Boolean(onMaskEdit)}
                editingDisabledReason={
                  onMaskEdit ? imageEditingDisabledReason : "当前工作流没有可用的图片编辑入口。"
                }
                busy={busy || maskEditorSaving}
                onDownload={() => onDownloadVersion?.(activeVersion, activeAsset)}
                onUseAsReference={() => onUseAsReference?.(activeAsset)}
                onEdit={openMaskEditor}
              />
            ) : null}
        </section>

      </div>

      {saveState === "saved" ? (
        <StatusMessage tone="success" live="polite">用户编辑：槽位草稿已保存。</StatusMessage>
      ) : null}

      {/* Fixed bottom: primary actions always visible; disabled reason via GenerationActions. */}
      <ActionBar
        className="slot-inspector__chrome-bottom"
        ariaLabel="槽位操作"
        secondary={
          <div className="slot-inspector__secondary-actions">
            {saveState === "error" ? (
              <StatusMessage tone="danger" live="assertive" appearance="inline">
                保存失败，请重试。
              </StatusMessage>
            ) : null}
            {activePane === "copy" ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={!draftDirty || submitting}
                loading={saveState === "saving" || saving}
                loadingLabel="保存中…"
                onClick={() => void saveDraft()}
              >
                <Save size={15} />
                {saveLabel}
              </Button>
            ) : null}
            {nextSlotAction && activeVersion ? (
              <GenerationActions
                hasVersion
                generating={generating}
                variant="secondary"
                disabled={generationDisabled}
                disabledReason={generationDisabledReason}
                errorMessage={generationError}
                onGenerate={onGenerate}
              />
            ) : null}
          </div>
        }
        primary={
          nextSlotAction ? (
            <>
              <Button
                size="compact"
                disabled={submitting || draftDirty}
                title={nextSlotDisabledReason}
                aria-describedby={nextSlotDisabledReason ? nextSlotDisabledReasonId : undefined}
                onClick={nextSlotAction.onSelect}
              >
                {nextSlotAction.label}
                <ArrowRight size={15} />
              </Button>
              {nextSlotDisabledReason ? (
                <StatusMessage id={nextSlotDisabledReasonId} className="slot-inspector__disabled-reason">
                  {nextSlotDisabledReason}
                </StatusMessage>
              ) : null}
            </>
          ) : (
            <GenerationActions
              hasVersion={Boolean(activeVersion)}
              generating={generating}
              variant={generationActionVariant}
              disabled={generationDisabled}
              disabledReason={generationDisabledReason}
              errorMessage={generationError}
              onGenerate={onGenerate}
            />
          )
        }
      />
      {activeVersion && activeAsset ? (
        <MaskEditorDialog
          open={maskEditorOpen}
          imageUrl={activeAsset.objectUrl}
          imageAlt={`${slot.slotKey} 当前版本`}
          width={activeVersion.width}
          height={activeVersion.height}
          initialPrompt={activeVersion.promptSnapshot}
          saving={maskEditorSaving}
          error={maskEditorError}
          onClose={() => {
            if (!maskEditorSaving) setMaskEditorOpen(false);
          }}
          onSave={saveMaskEdit}
        />
      ) : null}
      {versionState ? (
        <VersionCompareDialog
          open={compareOpen}
          versions={versionState.versions}
          assets={assets}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={industryTemplateConfirmOpen}
        title="保存为行业模板新版本？"
        description="请确认当前 Prompt 不包含只适用于当前商品的型号、尺寸、颜色、包装或认证信息。"
        confirmLabel="保存新版本"
        onConfirm={confirmSavePromptAsIndustryTemplateVersion}
        onCancel={() => setIndustryTemplateConfirmOpen(false)}
      />
    </div>
  );
}
