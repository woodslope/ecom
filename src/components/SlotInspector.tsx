import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Bot, ChevronDown, Copy, LoaderCircle, Save, ShieldAlert, Square, WandSparkles } from "lucide-react";

import {
  activeSlotVersion,
  isSlotVersionCurrent,
} from "../domain/generation/current-version";
import type { MaskDraft } from "../domain/generation/mask";
import type { SlotVersion, SlotVersionState } from "../domain/generation/types";
import type { ComplianceResult } from "../domain/compliance";
import type { CopilotCommand } from "../domain/copilot";
import type { PlannedSlot } from "../domain/planning/types";
import type { PlatformRulePack } from "../domain/platforms/types";
import type { RuntimeMode } from "../domain/settings";
import type { WorkbenchAsset } from "../store/workbench-store";
import { CompliancePanel } from "./CompliancePanel";
import { GenerationActions } from "./GenerationActions";
import { ImageTools } from "./ImageTools";
import { MaskEditorDialog } from "./MaskEditorDialog";
import { VersionStrip } from "./VersionStrip";
import { ActionBar, Button, Field, MediaSlot, StatusChip, StatusMessage } from "./ui";

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

export function copilotDraftDisabledReason(draftDirty: boolean): string | undefined {
  return draftDirty
    ? "当前 Prompt 或可见文案尚未保存，请先保存文案与提示词后再使用 Copilot。"
    : undefined;
}

export function SlotInspector({
  rulePack,
  slot,
  saving = false,
  versionState,
  assets = [],
  runtimeMode = "demo",
  generating = false,
  planNeedsRefresh = false,
  planningInputSignature,
  generationLocked = false,
  generationLockReason,
  complianceResult,
  copilotRunning = false,
  copilotLocked = false,
  copilotLockReason,
  copilotError,
  copilotMessage,
  onDirtyChange = () => undefined,
  onSave,
  onGenerate = () => undefined,
  onActivateVersion = () => undefined,
  onCopilotCommand = () => undefined,
  onCancelCopilot = () => undefined,
  imageEditingSupported = true,
  imageEditingDisabledReason,
  onDownloadVersion,
  onUseAsReference,
  onMaskEdit,
  nextSlotAction,
  generationActionVariant = "primary",
}: {
  rulePack: PlatformRulePack;
  slot: PlannedSlot;
  saving?: boolean;
  versionState?: SlotVersionState;
  assets?: WorkbenchAsset[];
  runtimeMode?: RuntimeMode;
  generating?: boolean;
  planNeedsRefresh?: boolean;
  planningInputSignature?: string;
  generationLocked?: boolean;
  generationLockReason?: string;
  complianceResult?: ComplianceResult;
  copilotRunning?: boolean;
  copilotLocked?: boolean;
  copilotLockReason?: string;
  copilotError?: string | null;
  copilotMessage?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (
    patch: Pick<PlannedSlot, "visibleCopy" | "prompt"> &
      Partial<Pick<PlannedSlot, "externalText">>,
  ) => Promise<boolean>;
  onGenerate?: () => void;
  onActivateVersion?: (versionId: string) => void;
  onCopilotCommand?: (command: CopilotCommand) => void;
  onCancelCopilot?: () => void;
  imageEditingSupported?: boolean;
  imageEditingDisabledReason?: string;
  onDownloadVersion?: (version: SlotVersion, asset: WorkbenchAsset) => void;
  onUseAsReference?: (asset: WorkbenchAsset) => void;
  onMaskEdit?: (versionId: string, mask: MaskDraft, prompt: string) => Promise<boolean>;
  nextSlotAction?: { label: string; onSelect: () => void };
  generationActionVariant?: "primary" | "secondary";
}) {
  const [visibleCopy, setVisibleCopy] = useState(slot.visibleCopy);
  const [prompt, setPrompt] = useState(slot.prompt);
  const [externalTitle, setExternalTitle] = useState(slot.externalText?.title ?? "");
  const [externalBody, setExternalBody] = useState(slot.externalText?.body ?? "");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  /** Secondary panels start collapsed so Prompt + Generate stay above the fold. */
  const [metaOpen, setMetaOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [maskEditorSaving, setMaskEditorSaving] = useState(false);
  const [maskEditorError, setMaskEditorError] = useState<string | null>(null);
  const [renderedDimensions, setRenderedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const isMain = rulePack.platformId === "amazon" && slot.slotKey === "MAIN";
  const usesEnglishPrompt = rulePack.promptLanguage === "en";
  const promptLabel = usesEnglishPrompt ? "模型提示词（英文，可复制）" : "图片提示词";
  const evidenceLabel = usesEnglishPrompt ? "策划依据（中文说明）" : "策划依据";
  const negativePromptLabel = usesEnglishPrompt ? "模型负面约束（英文）" : "负面约束";
  const busy = saving || generating || copilotRunning || saveState === "saving";
  const submitting = busy || planNeedsRefresh;
  const hasExternalText = Boolean(slot.externalText);
  const externalText = hasExternalText
    ? { title: externalTitle, body: externalBody }
    : undefined;
  const draftDirty = isSlotDraftDirty(slot, visibleCopy, prompt, externalText);
  const copilotDisabledReason = copilotDraftDisabledReason(draftDirty);
  const copilotPatchDisabledReason = copilotDisabledReason ?? (hasExternalText
    ? "当前模块使用图片外文案；请直接编辑外部标题和正文。"
    : undefined);
  const copilotExpanded = copilotOpen || Boolean(copilotRunning || copilotError || copilotMessage);
  const generationDisabled =
    planNeedsRefresh ||
    draftDirty ||
    saveState === "saving" ||
    saving ||
    (generationLocked && !generating);
  const generationDisabledReason = planNeedsRefresh
    ? "当前策划已过期，请先重新策划。"
    : draftDirty
    ? "当前 Prompt 或可见文案尚未保存，请先保存文案与提示词。"
    : saveState === "saving" || saving
      ? "槽位草稿正在保存，请稍候。"
      : generationLocked && !generating
        ? generationLockReason
        : undefined;
  const activeVersion = activeSlotVersion(versionState);
  const activeVersionIsCurrent = activeVersion
    ? isSlotVersionCurrent(slot, activeVersion, planningInputSignature)
    : true;
  const activeAsset = assets.find((asset) => asset.metadata.id === activeVersion?.assetId);
  const slotRule = rulePack.slots.find((rule) => rule.key === slot.slotKey);
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
    setVisibleCopy(slot.visibleCopy);
    setPrompt(slot.prompt);
    setExternalTitle(slot.externalText?.title ?? "");
    setExternalBody(slot.externalText?.body ?? "");
    setCopyState("idle");
    setSaveState("idle");
  }, [slot.externalText?.body, slot.externalText?.title, slot.prompt, slot.slotKey, slot.visibleCopy]);

  useEffect(() => {
    setRenderedDimensions(null);
  }, [activeVersion?.id]);

  useEffect(() => {
    // Only auto-open meta when there is an actionable compliance finding.
    if (
      complianceResult &&
      complianceResult.findings.some(
        (finding) => finding.severity === "error" || finding.severity === "warning",
      )
    ) {
      setMetaOpen(true);
    }
  }, [complianceResult, slot.slotKey]);

  useEffect(() => {
    if (copilotRunning || copilotError || copilotMessage) setCopilotOpen(true);
  }, [copilotRunning, copilotError, copilotMessage, slot.slotKey]);

  useEffect(() => {
    setStrategyOpen(false);
  }, [slot.slotKey]);

  useEffect(() => {
    onDirtyChange(draftDirty);
  }, [draftDirty, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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

  const strategyPreview =
    slot.strategy.length > 72 ? `${slot.strategy.slice(0, 72).trim()}…` : slot.strategy;
  const complianceBadge =
    complianceResult?.findings.some((f) => f.severity === "error")
      ? "合规有错误"
      : complianceResult?.findings.some((f) => f.severity === "warning")
        ? "合规有提醒"
        : null;
  const needsFacts = slot.evidence.some((item) => item.startsWith("待补资料"));
  const slotComplete = Boolean(activeVersion && activeVersionIsCurrent);
  const uploadHint = slotRule
    ? `上传建议 ${slotRule.dimensions.width}×${slotRule.dimensions.height}px`
    : null;
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
      {/* Fixed top: identity only */}
      <header className="slot-inspector__chrome-top" aria-label="槽位身份">
        <div className="slot-inspector__identity">
          <span className="slot-inspector__eyebrow">槽位详情</span>
          <span className="slot-inspector__key">{slot.slotKey}</span>
          {slotRule ? <span className="slot-inspector__label">{slotRule.label}</span> : null}
          {uploadHint ? <span className="slot-inspector__meta-line">{uploadHint}</span> : null}
        </div>
        <div className="slot-inspector__badges">
          {slotComplete ? (
            <StatusChip tone="success">已完成</StatusChip>
          ) : needsFacts ? (
            <StatusChip tone="warning">待补资料</StatusChip>
          ) : null}
          {complianceBadge ? <StatusChip tone="warning">{complianceBadge}</StatusChip> : null}
          {activeVersion ? (
            <StatusChip tone="mode">
              {activeVersion.source === "demo" ? "Demo" : "API"}
            </StatusChip>
          ) : null}
        </div>
      </header>

      {/* Scroll middle: all dense secondary + primary fields */}
      <div className="slot-inspector__scroll" role="region" aria-label="槽位内容">
        {slot.strategy ? (
          <div className="slot-inspector__strategy">
            <button
              type="button"
              className="slot-inspector__strategy-toggle"
              aria-expanded={strategyOpen}
              onClick={() => setStrategyOpen((value) => !value)}
            >
              <span>{strategyOpen ? "收起策划说明" : "策划说明"}</span>
              {!strategyOpen ? (
                <em className="slot-inspector__strategy-preview">{strategyPreview}</em>
              ) : null}
              <ChevronDown
                size={15}
                className={
                  strategyOpen ? "inspector-section__chevron is-open" : "inspector-section__chevron"
                }
              />
            </button>
            {strategyOpen ? <p className="slot-inspector__strategy-body">{slot.strategy}</p> : null}
          </div>
        ) : null}

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
                  {activeVersion ? "可切换历史版本。" : "确认 Prompt 后在底部生成。"}
                </p>
              )}
              {versionState && versionState.versions.length > 0 ? (
                <VersionStrip
                  state={versionState}
                  slot={slot}
                  assets={assets}
                  planningInputSignature={planningInputSignature}
                  disabled={generating || generationLocked}
                  onActivate={onActivateVersion}
                />
              ) : null}
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
            </div>
          </div>
        </section>

        <form id="slot-inspector-form" className="slot-inspector__form" onSubmit={submit}>
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
                <StatusMessage tone="success">外部标题与正文已复制。</StatusMessage>
              ) : null}
              {copyState === "error" ? (
                <StatusMessage tone="danger">复制失败，请手动选择外部文案。</StatusMessage>
              ) : null}
            </div>
          ) : (
            <Field label="可见文案">
              <textarea
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
          <Field
            label={promptLabel}
            hint={
              usesEnglishPrompt
                ? "英文模型指令；品牌/型号/尺寸等事实可保留原文。"
                : undefined
            }
          >
            <textarea
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
          {saveState === "saved" ? (
            <StatusMessage tone="success">用户编辑：槽位草稿已保存。</StatusMessage>
          ) : null}
          {saveState === "error" ? (
            <StatusMessage tone="danger">保存失败，当前输入仍保留，请检查提示后重试。</StatusMessage>
          ) : null}
        </form>

        <section className="inspector-section">
          <button
            type="button"
            className="inspector-section__toggle"
            aria-expanded={metaOpen}
            onClick={() => setMetaOpen((value) => !value)}
          >
            <span>
              策划依据与合规
              {complianceBadge ? ` · ${complianceBadge}` : ""}
            </span>
            <ChevronDown
              size={16}
              className={
                metaOpen ? "inspector-section__chevron is-open" : "inspector-section__chevron"
              }
            />
          </button>
          <div className="inspector-section__body" hidden={!metaOpen}>
            <section className="slot-inspector__evidence" aria-labelledby="slot-evidence-title">
              <div className="slot-inspector__section-title">
                <ShieldAlert size={15} />
                <strong id="slot-evidence-title">{evidenceLabel}</strong>
              </div>
              <ul>
                {slot.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            {complianceResult ? <CompliancePanel result={complianceResult} /> : null}
            {slot.negativePrompt ? (
              <div className="slot-inspector__negative">
                <strong>{negativePromptLabel}</strong>
                <p>{slot.negativePrompt}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="inspector-section">
          <button
            type="button"
            className="inspector-section__toggle"
            aria-expanded={copilotExpanded}
            onClick={() => setCopilotOpen((value) => !value)}
          >
            <span>AI Copilot</span>
            <ChevronDown
              size={16}
              className={
                copilotExpanded ? "inspector-section__chevron is-open" : "inspector-section__chevron"
              }
            />
          </button>
          <div className="inspector-section__body" hidden={!copilotExpanded}>
            <section className="slot-inspector__copilot" aria-label="AI Copilot">
              <p className="visually-hidden">写入动作只调整当前槽位；检查与解释只返回建议</p>
              {copilotRunning ? (
                <StatusMessage className="copilot-status">
                  <span>
                    <LoaderCircle className="spin" size={14} />
                    Copilot 正在处理当前槽位请求
                  </span>
                  <Button variant="secondary" onClick={onCancelCopilot}>
                    <Square size={13} />
                    取消请求
                  </Button>
                </StatusMessage>
              ) : null}
              {copilotError ? <StatusMessage tone="danger">{copilotError}</StatusMessage> : null}
              {copilotMessage ? <StatusMessage>{copilotMessage}</StatusMessage> : null}
              {!copilotRunning && copilotLockReason ? (
                <StatusMessage tone="warning">{copilotLockReason}</StatusMessage>
              ) : null}
              {copilotPatchDisabledReason ? (
                <StatusMessage tone="warning">{copilotPatchDisabledReason}</StatusMessage>
              ) : null}
              <div className="copilot-actions">
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={submitting || copilotLocked || Boolean(copilotPatchDisabledReason)}
                  onClick={() => onCopilotCommand("shorten-copy")}
                >
                  <WandSparkles size={13} />
                  缩短文案
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={submitting || copilotLocked || Boolean(copilotPatchDisabledReason)}
                  onClick={() => onCopilotCommand("strengthen-evidence")}
                >
                  <WandSparkles size={13} />
                  强化证据
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={submitting || copilotLocked || Boolean(copilotPatchDisabledReason)}
                  onClick={() => onCopilotCommand("adapt-platform")}
                >
                  <WandSparkles size={13} />
                  适配平台
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={submitting || copilotLocked || Boolean(copilotDisabledReason)}
                  onClick={() => onCopilotCommand("check-compliance")}
                >
                  <ShieldAlert size={13} />
                  检查 Prompt
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={submitting || copilotLocked || Boolean(copilotDisabledReason)}
                  onClick={() => onCopilotCommand("explain-next")}
                >
                  <Bot size={13} />
                  解释下一步
                </Button>
              </div>
            </section>
          </div>
        </section>
      </div>

      {/* Fixed bottom: primary actions always visible; disabled reason via GenerationActions. */}
      <ActionBar
        className="slot-inspector__chrome-bottom"
        ariaLabel="槽位操作"
        secondary={
          <div className="slot-inspector__secondary-actions">
            <Button
              type="submit"
              form="slot-inspector-form"
              variant="secondary"
              size="compact"
              disabled={submitting || prompt.trim().length === 0}
              title={
                submitting
                  ? "当前有保存、生成或策划刷新进行中。"
                  : prompt.trim().length === 0
                    ? "请先填写图片提示词再保存。"
                    : undefined
              }
            >
              <Save size={15} />
              {busy ? "保存中…" : hasExternalText ? "保存外部文案与提示词" : "保存文案与提示词"}
            </Button>
            {nextSlotAction && activeVersion ? (
              <GenerationActions
                hasVersion
                generating={generating}
                runtimeMode={runtimeMode}
                variant="secondary"
                disabled={generationDisabled}
                disabledReason={generationDisabledReason}
                onGenerate={onGenerate}
              />
            ) : null}
          </div>
        }
        primary={
          nextSlotAction ? (
            <Button
              size="compact"
              disabled={submitting}
              onClick={nextSlotAction.onSelect}
            >
              {nextSlotAction.label}
              <ArrowRight size={15} />
            </Button>
          ) : (
            <GenerationActions
              hasVersion={Boolean(activeVersion)}
              generating={generating}
              runtimeMode={runtimeMode}
              variant={generationActionVariant}
              disabled={generationDisabled}
              disabledReason={generationDisabledReason}
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
    </div>
  );
}
