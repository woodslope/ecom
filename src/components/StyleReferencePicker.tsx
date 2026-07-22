import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { AMAZON_STYLE_PRESETS } from "../domain/platforms/amazon-style-presets";
import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import type { WorkbenchAsset } from "../store/workbench-store";
import { Button, Dialog, Field, IconButton, Select, StatusMessage } from "./ui";
import { StyleReferenceEditorDialog } from "./StyleReferenceEditorDialog";

export function StyleReferencePicker({
  assets,
  value,
  basePresetId,
  disabled,
  canCreate,
  notice,
  embedded = false,
  onChange,
  onBasePresetChange,
  onCreate,
  onRemove,
}: {
  assets: WorkbenchAsset[];
  value: string | null;
  basePresetId: string;
  disabled?: boolean;
  canCreate: boolean;
  notice?: string | null;
  embedded?: boolean;
  onChange: (value: string | null) => void;
  onBasePresetChange: (presetId: string) => void;
  onCreate: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemove: (id: string) => Promise<void>;
}) {
  const customAssets = assets.filter(
    (asset) => asset.metadata.kind === "style-reference" && asset.metadata.tags.includes("custom"),
  );
  const selectedCustomAsset = customAssets.find((asset) => asset.metadata.id === value);
  const selectedPresetId = value?.startsWith("preset:")
    ? value.slice(7)
    : selectedCustomAsset?.metadata.styleReference?.sourcePresetId ?? basePresetId;
  const [editorOpen, setEditorOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const changeStyleReference = (nextValue: string | null) => {
    const presetId = nextValue?.startsWith("preset:")
      ? nextValue.slice(7)
      : customAssets.find((asset) => asset.metadata.id === nextValue)?.metadata.styleReference
          ?.sourcePresetId;
    if (presetId) onBasePresetChange(presetId);
    onChange(nextValue);
  };

  const removeSelectedStyle = async () => {
    if (!selectedCustomAsset) return;
    setRemoving(true);
    try {
      await onRemove(selectedCustomAsset.metadata.id);
      onChange(null);
      setRemoveDialogOpen(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section
      className={`style-reference-picker${embedded ? " style-reference-picker--embedded" : ""}`}
      aria-label="Amazon 风格参考设置"
    >
      <div className="style-reference-picker__head">
        <div>
          <strong>附加风格板</strong>
          <span>叠加在基础风格上，只用于附图与 A+；MAIN 自动排除</span>
        </div>
        <Button
          variant="secondary"
          size="compact"
          disabled={disabled || !canCreate}
          onClick={() => setEditorOpen(true)}
        >
          <Pencil size={14} />
          新建自定义风格
        </Button>
      </div>
      <Field label="当前风格板">
        <Select
          aria-label="附加风格板"
          value={value ?? "none"}
          disabled={disabled}
          onChange={(event) =>
            changeStyleReference(event.target.value === "none" ? null : event.target.value)
          }
        >
          <option value="none">仅文本风格（不附图）</option>
          <optgroup label="内置风格">
            {AMAZON_STYLE_PRESETS.map((preset) => (
              <option key={preset.id} value={`preset:${preset.id}`}>
                {preset.label}
              </option>
            ))}
          </optgroup>
          {customAssets.length > 0 ? (
            <optgroup label="我的风格">
              {customAssets.map((asset) => (
                <option key={asset.metadata.id} value={asset.metadata.id}>
                  {asset.metadata.styleReference?.name ?? asset.metadata.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>
      {value && !value.startsWith("preset:") ? (
        <div className="style-reference-picker__selected">
          {selectedCustomAsset ? (
            <>
              <img src={selectedCustomAsset.objectUrl} alt="当前风格板预览" />
              <span>
                <strong>{selectedCustomAsset.metadata.styleReference?.name}</strong>
                当前商品的自定义风格板
              </span>
              <IconButton
                label="删除当前自定义风格"
                disabled={disabled}
                onClick={() => setRemoveDialogOpen(true)}
              >
                <Trash2 size={15} />
              </IconButton>
            </>
          ) : (
            <StatusMessage tone="warning">
              风格板不可用，提交时将使用基础文本风格。
            </StatusMessage>
          )}
        </div>
      ) : null}
      {notice ? <StatusMessage tone="warning">{notice}</StatusMessage> : null}
      {!canCreate ? <p className="style-reference-picker__hint">先创建或选择商品后，可保存自定义风格板。</p> : null}
      <StyleReferenceEditorDialog
        open={editorOpen}
        presetId={selectedPresetId}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSave={async (draft) => {
          setSaving(true);
          try {
            const created = await onCreate(selectedPresetId, draft);
            if (created) {
              changeStyleReference(created.metadata.id);
              setEditorOpen(false);
            }
          } finally {
            setSaving(false);
          }
        }}
      />
      <Dialog
        open={removeDialogOpen}
        title="删除自定义风格板？"
        eyebrow="当前商品"
        className="style-reference-remove-dialog"
        onClose={() => setRemoveDialogOpen(false)}
        footer={
          <>
            <Button variant="secondary" disabled={removing} onClick={() => setRemoveDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={removing}
              loadingLabel="删除中"
              onClick={() => void removeSelectedStyle()}
            >
              删除风格板
            </Button>
          </>
        }
      >
        <p className="style-reference-remove-dialog__copy">
          将从当前商品资料中删除“
          {selectedCustomAsset?.metadata.styleReference?.name ?? selectedCustomAsset?.metadata.name}
          ”。正在使用它的 Amazon 任务会降级为基础文本风格；已有策划和图片不会删除。
        </p>
      </Dialog>
    </section>
  );
}
