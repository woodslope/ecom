import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";

import {
  type PlanningStrategy,
  type PromptProfile,
  PROMPT_PROFILES,
  allProfiles,
  saveCustomProfile,
  deleteCustomProfile,
} from "../domain/prompt-profiles/prompt-profiles";
import { Button, Dialog, Field, IconButton, Select, StatusMessage } from "./ui";

const COPY_TONE_OPTIONS = [
  { value: "product", label: "产品导向" },
  { value: "benefit", label: "利益导向" },
  { value: "conversational", label: "口语化" },
  { value: "formal", label: "正式" },
] as const;

const COMPOSITION_OPTIONS = [
  { value: "balanced", label: "平衡" },
  { value: "evidence", label: "证据优先" },
  { value: "lifestyle", label: "场景优先" },
] as const;

const DENSITY_OPTIONS = [
  { value: "concise", label: "简洁" },
  { value: "detailed", label: "详细" },
] as const;

function emptyStrategy(): PlanningStrategy {
  return {
    direction: "",
    copyTone: "product",
    compositionBias: "balanced",
    copyDensity: "concise",
  };
}

export interface PromptProfileDialogProps {
  open: boolean;
  /** If provided, edit this existing profile; otherwise create new. */
  editProfile?: PromptProfile | null;
  onClose: () => void;
  onSaved?: (profile: PromptProfile) => void;
}

export function PromptProfileDialog({
  open,
  editProfile,
  onClose,
  onSaved,
}: PromptProfileDialogProps) {
  const isEditing = Boolean(editProfile);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourcePresetId, setSourcePresetId] = useState(PROMPT_PROFILES[0]!.id);
  const [strategy, setStrategy] = useState<PlanningStrategy>(emptyStrategy());
  const [saving, setSaving] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const storage = typeof window !== "undefined" ? window.localStorage : null;

  const reset = useCallback(() => {
    if (editProfile) {
      setName(editProfile.label);
      setDescription(editProfile.description);
      setSourcePresetId(editProfile.style.id);
      setStrategy({ ...editProfile.planningStrategy });
    } else {
      const base = PROMPT_PROFILES[0]!;
      setName(`我的方案`);
      setDescription("");
      setSourcePresetId(base.id);
      setStrategy({ ...base.planningStrategy });
    }
  }, [editProfile]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleSave = async () => {
    if (!storage || !name.trim()) return;
    setSaving(true);
    try {
      const profile = saveCustomProfile(storage, {
        id: editProfile?.id,
        label: name.trim(),
        description: description.trim(),
        sourcePresetId,
        planningStrategy: { ...strategy },
      });
      onSaved?.(profile);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editProfile || !storage) return;
    if (!window.confirm(`删除方案"${editProfile.label}"？此操作不可撤销。`)) return;
    deleteCustomProfile(storage, editProfile.id);
    onClose();
  };

  const handleExport = () => {
    if (!storage) return;
    const customs = allProfiles().filter((p) => p.source === "custom");
    if (customs.length === 0) {
      setImportError("没有可导出的自定义方案。");
      return;
    }
    const json = JSON.stringify(
      customs.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        sourcePresetId: p.style.id,
        planningStrategy: p.planningStrategy,
      })),
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ecom-prompt-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    if (!storage) return;
    setImportMessage(null);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const profiles = JSON.parse(reader.result as string);
        if (!Array.isArray(profiles)) throw new Error("格式不正确");
        let count = 0;
        for (const p of profiles) {
          if (!p.label || !p.planningStrategy) continue;
          saveCustomProfile(storage, {
            label: `${p.label}（导入）`,
            description: p.description ?? "",
            sourcePresetId: p.sourcePresetId ?? "clean-retail",
            planningStrategy: p.planningStrategy,
          });
          count++;
        }
        setImportMessage(`已导入 ${count} 个方案。`);
        onSaved?.(null as unknown as PromptProfile);
      } catch {
        setImportError("文件格式不正确，请选择有效的方案导出文件。");
      }
    };
    reader.readAsText(file);
  };

  const baseProfile = PROMPT_PROFILES.find((p) => p.id === sourcePresetId);

  const updateStrategy = <K extends keyof PlanningStrategy>(
    key: K,
    value: PlanningStrategy[K],
  ) => {
    setStrategy((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog
      open={open}
      title={isEditing ? "编辑提示词方案" : "新建提示词方案"}
      eyebrow="自定义 Prompt Profile"
      className="prompt-profile-dialog"
      onClose={onClose}
      footer={
        <div className="prompt-profile-dialog__footer">
          {isEditing ? (
            <IconButton
              label="删除方案"
              className="prompt-profile-dialog__delete"
              onClick={() => void handleDelete()}
            >
              <Trash2 size={15} />
            </IconButton>
          ) : (
            <span />
          )}
          <div className="prompt-profile-dialog__actions">
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              disabled={!name.trim()}
              loading={saving}
              loadingLabel="保存中"
              onClick={() => void handleSave()}
            >
              保存方案
            </Button>
          </div>
        </div>
      }
    >
      <div className="prompt-profile-editor">
        <Field label="方案名称">
          <input
            aria-label="方案名称"
            value={name}
            placeholder="例如：我的3C产品方案"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="简述" hint="用于方案列表中的识别。">
          <input
            aria-label="简述"
            value={description}
            placeholder="例如：适合消费电子品类的转化导向方案"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="视觉风格基础" hint="选择内置风格作为视觉基调，可在风格板中进一步微调。">
          <Select
            aria-label="视觉风格基础"
            value={sourcePresetId}
            onChange={(e) => setSourcePresetId(e.target.value)}
          >
            {PROMPT_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}（{p.style.shortLabel}）
              </option>
            ))}
          </Select>
        </Field>
        {baseProfile ? (
          <div
            className="prompt-profile-editor__preview"
            style={{
              background: `linear-gradient(135deg, ${baseProfile.style.palette.join(", ")})`,
            }}
          >
            <span>{baseProfile.style.label} 视觉基调</span>
          </div>
        ) : null}

        <section className="prompt-profile-editor__strategy">
          <h4>策划策略</h4>
          <Field label="策略方向" hint="描述策划的侧重点，将注入到 AI 策划模型的 system prompt 中。">
            <textarea
              aria-label="策略方向"
              rows={3}
              value={strategy.direction}
              placeholder="例如：Prioritize clean, professional product presentation..."
              onChange={(e) => updateStrategy("direction", e.target.value)}
            />
          </Field>
          <div className="prompt-profile-editor__grid">
            <Field label="文案基调">
              <Select
                aria-label="文案基调"
                value={strategy.copyTone}
                onChange={(e) =>
                  updateStrategy("copyTone", e.target.value as PlanningStrategy["copyTone"])
                }
              >
                {COPY_TONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="构图偏好">
              <Select
                aria-label="构图偏好"
                value={strategy.compositionBias}
                onChange={(e) =>
                  updateStrategy(
                    "compositionBias",
                    e.target.value as PlanningStrategy["compositionBias"],
                  )
                }
              >
                {COMPOSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="文案密度">
              <Select
                aria-label="文案密度"
                value={strategy.copyDensity}
                onChange={(e) =>
                  updateStrategy(
                    "copyDensity",
                    e.target.value as PlanningStrategy["copyDensity"],
                  )
                }
              >
                {DENSITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        <section className="prompt-profile-editor__import-export">
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleImport(file);
            }}
          />
          <div className="prompt-profile-editor__import-export-buttons">
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={handleExport}
            >
              <Download size={14} />
              导出方案
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={14} />
              导入方案
            </Button>
          </div>
          {importMessage ? (
            <StatusMessage tone="success">{importMessage}</StatusMessage>
          ) : null}
          {importError ? (
            <StatusMessage tone="danger">{importError}</StatusMessage>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}

/** Hook to manage profile list and dialog state. */
export function usePromptProfilePicker() {
  const [profiles, setProfiles] = useState<PromptProfile[]>(() =>
    typeof window !== "undefined" ? allProfiles() : [...PROMPT_PROFILES],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PromptProfile | null>(null);

  const openNew = useCallback(() => {
    setEditingProfile(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((profile: PromptProfile) => {
    setEditingProfile(profile);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingProfile(null);
  }, []);

  const refresh = useCallback(() => {
    if (typeof window !== "undefined") setProfiles(allProfiles());
  }, []);

  const handleSaved = useCallback(
    (_profile: PromptProfile) => {
      refresh();
    },
    [refresh],
  );

  return {
    profiles,
    dialogOpen,
    editingProfile,
    openNew,
    openEdit,
    closeDialog,
    handleSaved,
    refresh,
  };
}
