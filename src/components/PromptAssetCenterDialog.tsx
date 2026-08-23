import { useEffect, useMemo, useState } from "react";
import { Bot, Bookmark, BookmarkCheck, Library, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  deleteSlotPromptAsset,
  getDefaultSlotPromptAssetId,
  listSlotPromptAssets,
  saveSlotPromptAsset,
  setDefaultSlotPromptAssetId,
  type SlotPromptAsset,
  type SlotPromptScope,
} from "../domain/prompt-profiles/slot-prompt-assets";
import { Button, ConfirmDialog, Dialog, Field, IconButton, Select, StatusChip, StatusMessage } from "./ui";

function latestVersion(asset: SlotPromptAsset): number {
  return Math.max(...asset.revisions.map((revision) => revision.version));
}

export function PromptAssetCenterDialog({
  open,
  scope,
  slotLabel,
  baselinePrompt,
  currentPrompt,
  aiRewriteDisabledReason,
  onApply,
  onAIRewrite,
  onClose,
}: {
  open: boolean;
  scope: SlotPromptScope;
  slotLabel: string;
  baselinePrompt: string;
  currentPrompt: string;
  aiRewriteDisabledReason?: string;
  onApply: (prompt: string) => void;
  onAIRewrite: () => void;
  onClose: () => void;
}) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const [assets, setAssets] = useState<SlotPromptAsset[]>([]);
  const [defaultAssetId, setDefaultAssetId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("baseline");
  const [selectedVersion, setSelectedVersion] = useState<number>(1);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const refresh = () => {
    if (!storage) return;
    const nextAssets = listSlotPromptAssets(storage, scope);
    const nextDefault = getDefaultSlotPromptAssetId(storage, scope);
    setAssets(nextAssets);
    setDefaultAssetId(nextDefault);
    if (nextDefault && nextAssets.some((asset) => asset.id === nextDefault)) {
      setSelectedAssetId(nextDefault);
      const asset = nextAssets.find((candidate) => candidate.id === nextDefault)!;
      setSelectedVersion(latestVersion(asset));
    } else {
      setSelectedAssetId("baseline");
      setSelectedVersion(1);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    setLabel("");
    setDescription("");
    setMessage(null);
  }, [open, scope.platformId, scope.slotKey, scope.workflowId]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedRevision = useMemo(
    () => selectedAsset?.revisions.find((revision) => revision.version === selectedVersion),
    [selectedAsset, selectedVersion],
  );
  const previewPrompt = selectedRevision?.prompt ?? baselinePrompt;

  const selectAsset = (asset: SlotPromptAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedVersion(latestVersion(asset));
    setMessage(null);
  };

  const saveNewAsset = () => {
    if (!storage || !label.trim() || !currentPrompt.trim()) return;
    const asset = saveSlotPromptAsset(storage, {
      label,
      description,
      scope,
      prompt: currentPrompt,
    });
    refresh();
    setSelectedAssetId(asset.id);
    setSelectedVersion(latestVersion(asset));
    setLabel("");
    setDescription("");
    setMessage(`已保存模板“${asset.label}”的 v1。`);
  };

  const saveNewVersion = () => {
    if (!storage || !selectedAsset || !currentPrompt.trim()) return;
    const asset = saveSlotPromptAsset(storage, {
      id: selectedAsset.id,
      label: selectedAsset.label,
      description: selectedAsset.description,
      scope,
      prompt: currentPrompt,
    });
    refresh();
    setSelectedAssetId(asset.id);
    setSelectedVersion(latestVersion(asset));
    setMessage(`已保存 ${asset.label} v${latestVersion(asset)}。`);
  };

  const removeSelectedAsset = () => {
    if (!storage || !selectedAsset) return;
    setDeleteConfirmOpen(true);
  };

  const confirmRemoveSelectedAsset = () => {
    if (!storage || !selectedAsset) return;
    deleteSlotPromptAsset(storage, selectedAsset.id);
    refresh();
    setMessage("模板已删除，当前槽位内容未改变。");
    setDeleteConfirmOpen(false);
  };

  const markDefault = () => {
    if (!storage || !selectedAsset) return;
    setDefaultSlotPromptAssetId(storage, scope, selectedAsset.id);
    setDefaultAssetId(selectedAsset.id);
    setMessage(`已将“${selectedAsset.label}”设为当前槽位默认模板。`);
  };

  const restoreBaseline = () => {
    if (storage) setDefaultSlotPromptAssetId(storage, scope, null);
    setDefaultAssetId(null);
    setSelectedAssetId("baseline");
    setSelectedVersion(1);
    onApply(baselinePrompt);
    setMessage("已恢复当前策划生成的 Prompt，并清除自定义默认模板。");
  };

  return (
    <>
      <Dialog
      open={open && !deleteConfirmOpen}
      variant="sidebar"
      title="Prompt 资产中心"
      eyebrow={`${scope.platformId === "amazon" ? "Amazon" : "淘宝 / 天猫"} · ${scope.workflowId} · ${scope.slotKey}`}
      className="prompt-asset-center-dialog"
      onClose={onClose}
      footer={
        <div className="prompt-asset-center__footer">
          <span>应用模板后，请在检查器中保存当前槽位。</span>
          <Button onClick={onClose}>完成</Button>
        </div>
      }
    >
      <div className="prompt-asset-center">
        <section className="prompt-asset-center__library" aria-label="Prompt 模板列表">
          <div className="prompt-asset-center__section-heading">
            <div>
              <strong>{slotLabel}</strong>
              <span>模板只作用于当前平台、工作流和槽位。</span>
            </div>
            <StatusChip tone="info">{assets.length + 1} 个模板</StatusChip>
          </div>
          <div className="prompt-asset-list">
            <button
              type="button"
              className={`prompt-asset-card${selectedAssetId === "baseline" ? " prompt-asset-card--selected" : ""}`}
              aria-pressed={selectedAssetId === "baseline"}
              onClick={() => {
                setSelectedAssetId("baseline");
                setSelectedVersion(1);
              }}
            >
              <span className="prompt-asset-card__icon"><RotateCcw size={16} /></span>
              <span>
                <strong>当前策划基准</strong>
                <small>系统模板 · v1</small>
              </span>
            </button>
            {assets.map((asset) => (
              <button
                type="button"
                className={`prompt-asset-card${selectedAssetId === asset.id ? " prompt-asset-card--selected" : ""}`}
                key={asset.id}
                aria-pressed={selectedAssetId === asset.id}
                onClick={() => selectAsset(asset)}
              >
                <span className="prompt-asset-card__icon"><Library size={16} /></span>
                <span>
                  <strong>{asset.label}</strong>
                  <small>
                    v{latestVersion(asset)} · {asset.revisions.length} 个版本
                    {defaultAssetId === asset.id ? " · 默认" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="prompt-asset-center__detail" aria-label="Prompt 模板详情">
          <div className="prompt-asset-center__detail-toolbar">
            <div>
              <strong>{selectedAsset?.label ?? "当前策划基准"}</strong>
              <span>{selectedAsset?.description || "策划器为当前槽位生成的原始 Prompt。"}</span>
            </div>
            {selectedAsset ? (
              <div className="prompt-asset-center__detail-actions">
                <Button
                  variant="quiet"
                  size="compact"
                  disabled={defaultAssetId === selectedAsset.id}
                  onClick={markDefault}
                >
                  {defaultAssetId === selectedAsset.id ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  {defaultAssetId === selectedAsset.id ? "当前默认" : "设为默认"}
                </Button>
                <IconButton label="删除 Prompt 模板" onClick={removeSelectedAsset}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ) : null}
          </div>

          {selectedAsset ? (
            <Field label="模板版本">
              <Select
                name="templateVersion"
                aria-label="模板版本"
                value={String(selectedVersion)}
                onChange={(event) => setSelectedVersion(Number(event.target.value))}
              >
                {[...selectedAsset.revisions]
                  .sort((left, right) => right.version - left.version)
                  .map((revision) => (
                    <option key={revision.version} value={revision.version}>
                      v{revision.version} · {new Date(revision.createdAt).toLocaleString("zh-CN")}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}

          <Field label="模板 Prompt">
            <textarea name="templatePrompt" aria-label="模板 Prompt" rows={12} value={previewPrompt} readOnly />
          </Field>

          <div className="prompt-asset-center__apply-actions">
            <Button variant="secondary" onClick={() => onApply(previewPrompt)}>
              应用
            </Button>
            <Button variant="secondary" onClick={restoreBaseline}>
              <RotateCcw size={14} />
              恢复策划稿
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(aiRewriteDisabledReason)}
              title={aiRewriteDisabledReason}
              onClick={() => {
                onClose();
                onAIRewrite();
              }}
            >
              <Bot size={14} />
              AI 改写
            </Button>
          </div>

          {selectedAsset ? (
            <Button variant="quiet" size="compact" onClick={saveNewVersion}>
              <Plus size={14} />
              保存新版本
            </Button>
          ) : null}

          <div className="prompt-asset-center__create">
            <div className="prompt-asset-center__section-heading">
              <div>
                <strong>保存当前 Prompt</strong>
                <span>创建后可在同一槽位重复应用和继续积累版本。</span>
              </div>
            </div>
            <div className="prompt-asset-center__create-grid">
              <Field label="模板名称">
                <input
                  name="templateLabel"
                  aria-label="Prompt 模板名称"
                  value={label}
                  placeholder="例如：旅行用品场景强化"
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              <Field label="说明">
                <input
                  name="templateDescription"
                  aria-label="Prompt 模板说明"
                  value={description}
                  placeholder="适用目标或修改方向"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </div>
            <Button disabled={!label.trim() || !currentPrompt.trim()} onClick={saveNewAsset}>
              <Plus size={14} />
              保存为新模板
            </Button>
          </div>

          {message ? <StatusMessage tone="success" live="polite">{message}</StatusMessage> : null}
        </section>
      </div>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除 Prompt 模板？"
        description={`将删除“${selectedAsset?.label ?? "当前模板"}”及其全部版本，当前槽位内容不会改变。`}
        confirmLabel="删除模板"
        onConfirm={confirmRemoveSelectedAsset}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
