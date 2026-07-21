import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { AMAZON_STYLE_PRESETS } from "../domain/platforms/amazon-style-presets";
import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import type { WorkbenchAsset } from "../store/workbench-store";
import { Button, Field, IconButton, Select, StatusMessage } from "./ui";
import { StyleReferenceEditorDialog } from "./StyleReferenceEditorDialog";

export function StyleReferencePicker({ assets, value, disabled, canCreate, notice, embedded = false, onChange, onCreate, onRemove }: {
  assets: WorkbenchAsset[];
  value: string | null;
  disabled?: boolean;
  canCreate: boolean;
  notice?: string | null;
  embedded?: boolean;
  onChange: (value: string | null) => void;
  onCreate: (presetId: string, draft: Partial<StyleReferenceDraft>) => Promise<WorkbenchAsset | null>;
  onRemove: (id: string) => Promise<void>;
}) {
  const customAssets = assets.filter((asset) => asset.metadata.kind === "style-reference" && asset.metadata.tags.includes("custom"));
  const selectedPresetId = value?.startsWith("preset:") ? value.slice(7) : customAssets.find((asset) => asset.metadata.id === value)?.metadata.styleReference?.sourcePresetId ?? AMAZON_STYLE_PRESETS[0]!.id;
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <section className={`style-reference-picker${embedded ? " style-reference-picker--embedded" : ""}`} aria-label="隐藏风格参考图">
      <div className="style-reference-picker__head"><div><strong>隐藏风格参考</strong><span>只用于附图与 A+，MAIN 自动排除</span></div><Button variant="secondary" size="compact" disabled={disabled || !canCreate} onClick={() => setEditorOpen(true)}><Pencil size={14} />编辑为我的风格</Button></div>
      <Field label="风格板">
        <Select aria-label="隐藏风格参考" value={value ?? "none"} disabled={disabled} onChange={(event) => onChange(event.target.value === "none" ? null : event.target.value)}>
          <option value="none">仅文本风格（不附图）</option>
          <optgroup label="内置风格">
            {AMAZON_STYLE_PRESETS.map((preset) => <option key={preset.id} value={`preset:${preset.id}`}>{preset.label}</option>)}
          </optgroup>
          {customAssets.length > 0 ? <optgroup label="我的风格">{customAssets.map((asset) => <option key={asset.metadata.id} value={asset.metadata.id}>{asset.metadata.styleReference?.name ?? asset.metadata.name}</option>)}</optgroup> : null}
        </Select>
      </Field>
      {value && !value.startsWith("preset:") ? <div className="style-reference-picker__selected">{customAssets.find((asset) => asset.metadata.id === value) ? <><img src={customAssets.find((asset) => asset.metadata.id === value)!.objectUrl} alt="当前风格板预览" /><span>{customAssets.find((asset) => asset.metadata.id === value)!.metadata.styleReference?.name}</span><IconButton label="删除当前风格板" disabled={disabled} onClick={() => void onRemove(value)}><Trash2 size={15} /></IconButton></> : <StatusMessage tone="warning">风格板不可用，提交时将使用文本风格。</StatusMessage>}</div> : null}
      {notice ? <StatusMessage tone="warning">{notice}</StatusMessage> : null}
      {!canCreate ? <p className="style-reference-picker__hint">先创建或选择商品后，可保存自定义风格板。</p> : null}
      <StyleReferenceEditorDialog open={editorOpen} presetId={selectedPresetId} saving={saving} onClose={() => setEditorOpen(false)} onSave={async (draft) => { setSaving(true); const created = await onCreate(selectedPresetId, draft); setSaving(false); if (created) { onChange(created.metadata.id); setEditorOpen(false); } }} />
    </section>
  );
}
