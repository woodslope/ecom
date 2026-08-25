import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Bot,
  Layers3,
  Library,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";

import {
  createGeneralIndustryTemplateSnapshot,
  deleteIndustryTemplatePack,
  EMPTY_INDUSTRY_TEMPLATE_BRIEF,
  getDefaultIndustryTemplatePackId,
  industryTemplateSnapshot,
  latestIndustryTemplateRevision,
  listIndustryTemplatePacks,
  saveIndustryTemplatePack,
  setDefaultIndustryTemplatePackId,
  SYSTEM_GENERAL_TEMPLATE_ID,
  type IndustryTemplateBrief,
  type IndustryTemplatePack,
  type IndustryTemplateScope,
  type IndustryTemplateSnapshot,
} from "../domain/prompt-templates/industry-template-packs";
import type { PlatformRulePack } from "../domain/platforms/types";
import { useWorkbenchStore } from "../store/workbench-store";
import {
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Select,
  StatusChip,
  StatusMessage,
} from "./ui";

function sameScope(left: IndustryTemplateScope, right: IndustryTemplateScope): boolean {
  return left.platformId === right.platformId && left.workflowId === right.workflowId;
}

function latestSnapshot(pack: IndustryTemplatePack): IndustryTemplateSnapshot {
  return industryTemplateSnapshot(pack, latestIndustryTemplateRevision(pack).version);
}

function blankBrief(): IndustryTemplateBrief {
  return { ...EMPTY_INDUSTRY_TEMPLATE_BRIEF };
}

function templateOptionValue(template: IndustryTemplateSnapshot): string {
  return `${template.id}@${template.version}`;
}

export function IndustryTemplateSelector({
  scope,
  rulePack,
  value,
  disabled = false,
  onChange,
}: {
  scope: IndustryTemplateScope;
  rulePack: PlatformRulePack;
  value?: IndustryTemplateSnapshot;
  disabled?: boolean;
  onChange: (template: IndustryTemplateSnapshot) => void;
}) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const generalTemplate = useMemo(
    () => createGeneralIndustryTemplateSnapshot(scope, rulePack),
    [rulePack, scope.platformId, scope.workflowId],
  );
  const rulePackSignature = rulePack.slots.map((slot) => slot.key).join("|");
  const [packs, setPacks] = useState<IndustryTemplatePack[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(SYSTEM_GENERAL_TEMPLATE_ID);
  const [selectedVersion, setSelectedVersion] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brief, setBrief] = useState<IndustryTemplateBrief>(() => blankBrief());
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const transforming = useWorkbenchStore((state) => state.industryTemplateTransforming);
  const transformError = useWorkbenchStore((state) => state.industryTemplateTransformError);
  const transformIndustryTemplate = useWorkbenchStore((state) => state.transformIndustryTemplate);
  const cancelIndustryTemplateTransform = useWorkbenchStore(
    (state) => state.cancelIndustryTemplateTransform,
  );

  const refresh = () => {
    if (!storage) {
      setPacks([]);
      return [];
    }
    const next = listIndustryTemplatePacks(storage, scope);
    setPacks(next);
    return next;
  };

  useEffect(() => {
    const nextPacks = refresh();
    if (value && sameScope(value.scope, scope)) {
      if (value.source === "system") onChange(generalTemplate);
      return;
    }
    const defaultId = storage ? getDefaultIndustryTemplatePackId(storage, scope) : null;
    const defaultPack = defaultId ? nextPacks.find((pack) => pack.id === defaultId) : undefined;
    onChange(defaultPack ? latestSnapshot(defaultPack) : generalTemplate);
  }, [scope.platformId, scope.workflowId, rulePackSignature]);

  const snapshots = useMemo(
    () => packs.map((pack) => latestSnapshot(pack)),
    [packs],
  );
  const selectedPack = packs.find((pack) => pack.id === selectedId) ?? null;
  const selectedSnapshot = selectedPack
    ? industryTemplateSnapshot(selectedPack, selectedVersion)
    : generalTemplate;
  const defaultId = storage ? getDefaultIndustryTemplatePackId(storage, scope) : null;

  const selectForPreview = (id: string) => {
    setSelectedId(id);
    setMessage(null);
    if (id === SYSTEM_GENERAL_TEMPLATE_ID) {
      setSelectedVersion(1);
      setName("");
      setDescription("");
      setBrief(blankBrief());
      return;
    }
    const pack = packs.find((candidate) => candidate.id === id);
    if (!pack) return;
    const snapshot = latestSnapshot(pack);
    setSelectedVersion(snapshot.version);
    setName(pack.name);
    setDescription(pack.description);
    setBrief({ ...snapshot.brief });
  };

  const openLibrary = () => {
    const nextPacks = refresh();
    const currentId = value?.id ?? SYSTEM_GENERAL_TEMPLATE_ID;
    const currentPack = nextPacks.find((pack) => pack.id === currentId);
    setSelectedId(currentPack?.id ?? SYSTEM_GENERAL_TEMPLATE_ID);
    setSelectedVersion(currentPack ? latestIndustryTemplateRevision(currentPack).version : 1);
    if (currentPack) {
      const snapshot = latestSnapshot(currentPack);
      setName(currentPack.name);
      setDescription(currentPack.description);
      setBrief({ ...snapshot.brief });
    } else {
      setName("");
      setDescription("");
      setBrief(blankBrief());
    }
    setMessage(null);
    setDialogOpen(true);
  };

  const updateBrief = (key: keyof IndustryTemplateBrief, next: string) => {
    setBrief((current) => ({ ...current, [key]: next }));
  };

  const transform = async () => {
    if (!storage || !name.trim() || !brief.industry.trim()) return;
    const result = await transformIndustryTemplate({
      baseTemplate: selectedSnapshot,
      brief,
      rulePack,
    });
    if (!result) return;
    try {
      const pack = saveIndustryTemplatePack(storage, {
        ...(selectedPack ? { id: selectedPack.id } : {}),
        name,
        description,
        scope,
        baseTemplateId: selectedSnapshot.id,
        brief,
        slots: result.slots,
      });
      const nextPacks = refresh();
      const saved = nextPacks.find((candidate) => candidate.id === pack.id) ?? pack;
      const snapshot = latestSnapshot(saved);
      setSelectedId(saved.id);
      setSelectedVersion(snapshot.version);
      onChange(snapshot);
      setMessage(`已保存“${saved.name}”v${snapshot.version}，并应用到当前任务。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "行业模板保存失败");
    }
  };

  const applySelected = () => {
    onChange(selectedSnapshot);
    setMessage(`已将“${selectedSnapshot.name}”v${selectedSnapshot.version}应用到当前任务。`);
  };

  const markDefault = () => {
    if (!storage) return;
    setDefaultIndustryTemplatePackId(
      storage,
      scope,
      selectedPack?.id ?? null,
    );
    setMessage(selectedPack
      ? `已将“${selectedPack.name}”设为当前工作流默认模板。`
      : "已恢复通用模板为当前工作流默认模板。",
    );
  };

  const removeSelected = () => {
    if (!storage || !selectedPack) return;
    setDeleteConfirmOpen(true);
  };

  const confirmRemoveSelected = () => {
    if (!storage || !selectedPack) return;
    deleteIndustryTemplatePack(storage, selectedPack.id);
    refresh();
    selectForPreview(SYSTEM_GENERAL_TEMPLATE_ID);
    if (value?.id === selectedPack.id) onChange(generalTemplate);
    setMessage("模板已删除，历史任务仍保留原模板快照。 ");
    setDeleteConfirmOpen(false);
  };

  const currentValue = value && sameScope(value.scope, scope) ? value : generalTemplate;
  const currentValueMissingFromLibrary = currentValue.source === "custom" &&
    !snapshots.some((snapshot) =>
      snapshot.id === currentValue.id && snapshot.version === currentValue.version,
    );
  const availableSnapshots = currentValueMissingFromLibrary
    ? [currentValue, ...snapshots]
    : snapshots;

  return (
    <>
      <div className="industry-template-selector">
        <Field label="行业模板">
          <Select
            name="industryTemplate"
            aria-label="行业模板"
            value={templateOptionValue(currentValue)}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value === templateOptionValue(generalTemplate)
                ? generalTemplate
                : availableSnapshots.find(
                    (snapshot) => templateOptionValue(snapshot) === event.target.value,
                  ) ?? generalTemplate;
              onChange(next);
            }}
          >
            <option value={templateOptionValue(generalTemplate)}>通用模板（系统）</option>
            {snapshots.map((snapshot) => (
              <option key={templateOptionValue(snapshot)} value={templateOptionValue(snapshot)}>
                {snapshot.name} · v{snapshot.version}
              </option>
            ))}
            {currentValueMissingFromLibrary ? (
              <option value={templateOptionValue(currentValue)}>
                {currentValue.name} · v{currentValue.version}（任务快照）
              </option>
            ) : null}
          </Select>
        </Field>
        <div className="industry-template-selector__actions">
          <Button
            variant="secondary"
            type="button"
            disabled={disabled}
            onClick={openLibrary}
          >
            管理模板
          </Button>
        </div>
      </div>

      <Dialog
        open={dialogOpen && !deleteConfirmOpen}
        variant="sidebar"
        title="行业模板库"
        className="industry-template-dialog"
        onClose={() => {
          if (!transforming) setDialogOpen(false);
        }}
        footer={
          <div className="industry-template-dialog__footer">
            <span>模板修改不会反向改变已有任务快照。</span>
            <Button disabled={transforming} onClick={() => setDialogOpen(false)}>完成</Button>
          </div>
        }
      >
        <div className="industry-template-library">
          <aside className="industry-template-library__list" aria-label="行业模板列表">
            <div className="industry-template-library__heading">
              <div>
                <strong>模板</strong>
              </div>
              <StatusChip tone="info">{packs.length + 1}</StatusChip>
            </div>
            <button
              type="button"
              className={`industry-template-card${selectedId === SYSTEM_GENERAL_TEMPLATE_ID ? " industry-template-card--selected" : ""}`}
              aria-pressed={selectedId === SYSTEM_GENERAL_TEMPLATE_ID}
              onClick={() => selectForPreview(SYSTEM_GENERAL_TEMPLATE_ID)}
            >
              <span className="industry-template-card__icon"><Layers3 size={16} /></span>
              <span><strong>通用模板</strong><small>系统锁定 · v1</small></span>
            </button>
            {packs.map((pack) => {
              const latest = latestIndustryTemplateRevision(pack);
              return (
                <button
                  type="button"
                  key={pack.id}
                  className={`industry-template-card${selectedId === pack.id ? " industry-template-card--selected" : ""}`}
                  aria-pressed={selectedId === pack.id}
                  onClick={() => selectForPreview(pack.id)}
                >
                  <span className="industry-template-card__icon"><Library size={16} /></span>
                  <span>
                    <strong>{pack.name}</strong>
                    <small>v{latest.version} · {pack.revisions.length} 个版本{defaultId === pack.id ? " · 默认" : ""}</small>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="industry-template-library__detail">
            <div className="industry-template-library__toolbar">
              <div>
                <strong>{selectedSnapshot.name}</strong>
              </div>
              <div className="industry-template-library__toolbar-actions">
                <Button type="button" variant="quiet" size="compact" onClick={markDefault}>
                  {selectedPack && defaultId === selectedPack.id
                    ? <BookmarkCheck size={14} />
                    : <Bookmark size={14} />}
                  {selectedPack && defaultId === selectedPack.id ? "当前默认" : "设为默认"}
                </Button>
                {selectedPack ? (
                  <IconButton label="删除行业模板" disabled={transforming} onClick={removeSelected}>
                    <Trash2 size={15} />
                  </IconButton>
                ) : null}
              </div>
            </div>

            {selectedPack ? (
              <Field label="模板版本">
                <Select
                  name="industryTemplateVersion"
                  aria-label="行业模板版本"
                  value={String(selectedVersion)}
                  disabled={transforming}
                  onChange={(event) => {
                    const version = Number(event.target.value);
                    const snapshot = industryTemplateSnapshot(selectedPack, version);
                    setSelectedVersion(version);
                    setBrief({ ...snapshot.brief });
                  }}
                >
                  {[...selectedPack.revisions].sort((left, right) => right.version - left.version).map((revision) => (
                    <option key={revision.version} value={revision.version}>
                      v{revision.version} · {new Date(revision.createdAt).toLocaleString("zh-CN")}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <div className="industry-template-slot-preview">
              {selectedSnapshot.slots.map((slot) => (
                <details key={slot.slotKey}>
                  <summary><strong>{slot.label}</strong><span>{slot.slotKey}</span></summary>
                  <p>{slot.guidance}</p>
                  {slot.negativeGuidance ? <small>约束：{slot.negativeGuidance}</small> : null}
                </details>
              ))}
            </div>

            <div className="industry-template-library__apply">
              <Button type="button" variant="secondary" disabled={transforming} onClick={applySelected}>
                应用模板
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={transforming}
                onClick={() => {
                  selectForPreview(SYSTEM_GENERAL_TEMPLATE_ID);
                  onChange(generalTemplate);
                }}
              >
                <RotateCcw size={14} />恢复通用模板
              </Button>
            </div>

            <section className="industry-template-transform">
              <div className="industry-template-library__heading">
                <div>
                  <strong>{selectedPack ? "AI 生成模板新版本" : "AI 创建行业模板"}</strong>
                  <span>批量改造当前工作流的全部槽位，不写入具体 SKU 参数。</span>
                </div>
              </div>
              <div className="industry-template-transform__grid">
                <Field label="模板名称">
                  <input name="industryTemplateName" value={name} disabled={transforming} placeholder="例如：家居饰品摆件" onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label="行业">
                  <input name="industry" value={brief.industry} disabled={transforming} placeholder="例如：家居软装" onChange={(event) => updateBrief("industry", event.target.value)} />
                </Field>
                <Field label="产品类型">
                  <input name="productTypes" value={brief.productTypes} disabled={transforming} placeholder="花瓶、摆件、相框、装饰画" onChange={(event) => updateBrief("productTypes", event.target.value)} />
                </Field>
                <Field label="目标人群">
                  <input name="targetAudience" value={brief.targetAudience} disabled={transforming} placeholder="例如：25–45 岁家居审美人群" onChange={(event) => updateBrief("targetAudience", event.target.value)} />
                </Field>
                <Field label="风格偏好">
                  <input name="stylePreference" value={brief.stylePreference} disabled={transforming} placeholder="自然、质感、生活方式" onChange={(event) => updateBrief("stylePreference", event.target.value)} />
                </Field>
                <Field label="模板说明">
                  <input name="industryTemplateDescription" value={description} disabled={transforming} placeholder="适用范围和使用边界" onChange={(event) => setDescription(event.target.value)} />
                </Field>
              </div>
              <Field label="额外要求">
                <textarea name="extraRequirements" rows={3} value={brief.extraRequirements} disabled={transforming} placeholder="对构图、材质、场景的额外方向" onChange={(event) => updateBrief("extraRequirements", event.target.value)} />
              </Field>
              <Field label="禁止内容">
                <textarea name="forbiddenContent" rows={2} value={brief.forbiddenContent} disabled={transforming} placeholder="行业特有的禁用场景、道具或表达" onChange={(event) => updateBrief("forbiddenContent", event.target.value)} />
              </Field>
              <div className="industry-template-transform__actions">
                {transforming ? (
                  <Button type="button" variant="secondary" onClick={cancelIndustryTemplateTransform}>
                    <Square size={13} />取消改造
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={transforming || !storage || !name.trim() || !brief.industry.trim()}
                  loading={transforming}
                  loadingLabel="AI 正在批量改造槽位..."
                  onClick={() => void transform()}
                >
                  {selectedPack ? <Bot size={14} /> : <Plus size={14} />}
                  {selectedPack ? "生成并保存新版本" : "生成并保存行业模板"}
                </Button>
              </div>
              {transformError ? <StatusMessage tone="danger" live="assertive">{transformError}</StatusMessage> : null}
              {message ? <StatusMessage tone={message.includes("失败") ? "danger" : "success"} live={message.includes("失败") ? "assertive" : "polite"}>{message}</StatusMessage> : null}
            </section>
          </section>
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除行业模板？"
        description={`将删除“${selectedPack?.name ?? "当前模板"}”及其全部版本，历史任务快照不会受影响。`}
        confirmLabel="删除模板"
        onConfirm={confirmRemoveSelected}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
