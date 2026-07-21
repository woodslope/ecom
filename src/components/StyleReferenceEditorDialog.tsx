import { useEffect, useState } from "react";

import type { StyleReferenceDraft } from "../domain/assets/style-reference";
import { getAmazonStylePreset } from "../domain/platforms/amazon-style-presets";
import { Button, Dialog, Field, Select } from "./ui";

export function StyleReferenceEditorDialog({
  open,
  presetId,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  presetId: string;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: Partial<StyleReferenceDraft>) => Promise<void>;
}) {
  const preset = getAmazonStylePreset(presetId);
  const [name, setName] = useState("");
  const [palette, setPalette] = useState<string[]>([]);
  const [typography, setTypography] = useState<StyleReferenceDraft["typography"]>("sans");
  const [lighting, setLighting] = useState<StyleReferenceDraft["lighting"]>("neutral");
  const [material, setMaterial] = useState<StyleReferenceDraft["material"]>("clean");
  const [density, setDensity] = useState<StyleReferenceDraft["density"]>("balanced");

  useEffect(() => {
    if (!open || !preset) return;
    setName(`${preset.label} · 我的风格`);
    setPalette([...preset.palette]);
    setTypography(preset.typography);
    setLighting(preset.lighting);
    setMaterial(preset.material);
    setDensity(preset.density);
  }, [open, preset]);

  if (!preset) return null;
  return (
    <Dialog
      open={open}
      title="编辑我的风格"
      eyebrow={`派生自 ${preset.label}`}
      className="style-reference-dialog"
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button loading={saving} loadingLabel="保存中" onClick={() => void onSave({ name, sourcePresetId: preset.id, palette, typography, lighting, material, density })}>保存风格板</Button></>}
    >
      <div className="style-reference-editor">
        <Field label="风格名称"><input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="色板">
          <div className="style-reference-editor__palette">
            {palette.map((color, index) => <input key={index} aria-label={`颜色 ${index + 1}`} type="color" value={color} onChange={(event) => setPalette((current) => current.map((value, i) => i === index ? event.target.value : value))} />)}
          </div>
        </Field>
        <div className="style-reference-editor__grid">
          <Field label="字体"><Select value={typography} onChange={(event) => setTypography(event.target.value as typeof typography)}><option value="sans">现代无衬线</option><option value="serif">编辑感衬线</option><option value="display">展示字体</option></Select></Field>
          <Field label="光影"><Select value={lighting} onChange={(event) => setLighting(event.target.value as typeof lighting)}><option value="neutral">中性</option><option value="soft">柔和</option><option value="dramatic">高对比</option></Select></Field>
          <Field label="材质"><Select value={material} onChange={(event) => setMaterial(event.target.value as typeof material)}><option value="clean">干净</option><option value="matte">哑光</option><option value="glossy">亮面</option><option value="natural">自然</option></Select></Field>
          <Field label="密度"><Select value={density} onChange={(event) => setDensity(event.target.value as typeof density)}><option value="airy">留白</option><option value="balanced">平衡</option><option value="dense">高密度</option></Select></Field>
        </div>
      </div>
    </Dialog>
  );
}
