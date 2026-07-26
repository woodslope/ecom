import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArchiveRestore } from "lucide-react";

import type { AssetMetadata } from "../domain/assets/types";
import { extractSharedFactsFromRun } from "../domain/projects/deposition";
import type { ProductFacts, ProductProject } from "../domain/projects/types";
import type { ProductionRunRecord } from "../domain/tasks";
import type { DepositRunInput } from "../store/workbench-store";
import { Button, Dialog, Field, Select, StatusMessage } from "./ui";

const scalarFields: Array<{ key: keyof ProductFacts; label: string }> = [
  { key: "productName", label: "商品名称" },
  { key: "category", label: "品类" },
  { key: "brand", label: "品牌" },
  { key: "model", label: "型号" },
  { key: "sku", label: "SKU" },
  { key: "targetAudience", label: "基础人群与场景" },
  { key: "description", label: "商品描述" },
];

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

function specifications(value: string): Record<string, string> {
  return Object.fromEntries(lines(value).flatMap((line) => {
    const separator = line.search(/[:：]/u);
    if (separator < 1) return [];
    const key = line.slice(0, separator).trim();
    const item = line.slice(separator + 1).trim();
    return key && item ? [[key, item]] : [];
  }));
}

function factsText(facts: ProductFacts, field: keyof ProductFacts): string {
  const value = facts[field];
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}：${item}`).join("\n");
  return value;
}

export function DepositToLibraryDialog({
  record,
  projects,
  assets,
  loading,
  initialFacts,
  onClose,
  onSubmit,
}: {
  record: ProductionRunRecord | null;
  projects: ProductProject[];
  assets: AssetMetadata[];
  loading: boolean;
  initialFacts?: ProductFacts | null;
  onClose: () => void;
  onSubmit: (input: DepositRunInput) => Promise<ProductProject | null>;
}) {
  const candidate = useMemo(
    () => initialFacts ?? (record ? extractSharedFactsFromRun(record.run, record.project.facts) : null),
    [initialFacts, record],
  );
  const [mode, setMode] = useState<"create" | "merge">("create");
  const [name, setName] = useState("");
  const [facts, setFacts] = useState<ProductFacts | null>(candidate);
  const [targetProjectId, setTargetProjectId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [overwriteFields, setOverwriteFields] = useState<Array<keyof ProductFacts>>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const usedAssets = useMemo(() => {
    if (!record) return [];
    const referenceIds = new Set(record.run.contextSnapshot.selectedReferenceAssetIds);
    const generatedIds = new Set(record.run.events.flatMap((event) => event.assetId ? [event.assetId] : []));
    return assets.filter((asset) => referenceIds.has(asset.id) || generatedIds.has(asset.id));
  }, [assets, record]);
  const referenceIds = useMemo(
    () => new Set(record?.run.contextSnapshot.selectedReferenceAssetIds ?? []),
    [record],
  );
  const target = projects.find((project) => project.id === targetProjectId) ?? null;

  useEffect(() => {
    if (!record || !candidate) return;
    setMode("create");
    setName(candidate.productName || record.project.name.replace(/\s*·\s*(?:Amazon|淘宝)任务$/u, ""));
    setFacts(candidate);
    setTargetProjectId(projects[0]?.id ?? "");
    setSelectedAssetIds(record.run.contextSnapshot.selectedReferenceAssetIds);
    setOverwriteFields([]);
    setValidationError(null);
  }, [candidate, projects, record]);

  if (!record || !facts) return null;

  const setTextField = (field: keyof ProductFacts, value: string) => {
    setFacts((current) => {
      if (!current) return current;
      if (field === "sellingPoints" || field === "forbiddenClaims") return { ...current, [field]: lines(value) };
      if (field === "specifications") return { ...current, specifications: specifications(value) };
      return { ...current, [field]: value };
    });
  };
  const toggleAsset = (id: string) => setSelectedAssetIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
  );
  const toggleOverwrite = (field: keyof ProductFacts) => setOverwriteFields((current) =>
    current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!facts.productName.trim()) {
      setValidationError("请确认商品名称。");
      return;
    }
    if (mode === "merge" && !targetProjectId) {
      setValidationError("请选择要合并的商品档案。");
      return;
    }
    const saved = await onSubmit({
      runId: record.run.id,
      mode,
      name,
      targetProjectId: mode === "merge" ? targetProjectId : undefined,
      facts,
      selectedAssetIds,
      overwriteFields,
    });
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      title="沉淀到资料库"
      eyebrow="保存跨平台商品事实"
      className="deposit-dialog"
      onClose={loading ? () => undefined : onClose}
      footer={<><Button variant="secondary" disabled={loading} onClick={onClose}>取消</Button><Button type="submit" form="deposit-form" disabled={loading}><ArchiveRestore size={15} />{loading ? "正在沉淀" : "确认沉淀"}</Button></>}
    >
      <form id="deposit-form" className="deposit-form" onSubmit={submit}>
        {validationError ? <StatusMessage tone="danger">{validationError}</StatusMessage> : null}
        <div className="deposit-mode" role="group" aria-label="沉淀模式">
          <Button type="button" variant={mode === "create" ? "primary" : "secondary"} onClick={() => setMode("create")}>新建商品档案</Button>
          <Button type="button" variant={mode === "merge" ? "primary" : "secondary"} disabled={projects.length === 0} onClick={() => setMode("merge")}>合并到已有商品</Button>
        </div>
        {mode === "create" ? <Field label="档案名称"><input value={name} onChange={(event) => setName(event.target.value)} /></Field> : <Field label="目标商品"><Select value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>}

        <section className="deposit-section">
          <h3>商品事实</h3>
          {mode === "merge" && target ? <div className="deposit-merge-head"><span>字段</span><span>资料库现有值</span><span>本次候选值</span><span>采用候选</span></div> : null}
          {scalarFields.map(({ key, label }) => mode === "merge" && target ? (
            <label key={key} className="deposit-merge-row"><strong>{label}</strong><span>{factsText(target.facts, key) || "（空）"}</span><span>{factsText(facts, key) || "（空）"}</span><input type="checkbox" aria-label={`采用候选${label}`} checked={!factsText(target.facts, key) || overwriteFields.includes(key)} onChange={() => toggleOverwrite(key)} /></label>
          ) : <Field key={key} label={label}><input value={factsText(facts, key)} onChange={(event) => setTextField(key, event.target.value)} /></Field>)}
          {(["sellingPoints", "specifications", "forbiddenClaims"] as const).map((key) => <Field key={key} label={key === "sellingPoints" ? "可验证特点" : key === "specifications" ? "规格参数" : "合规边界"}><textarea value={factsText(facts, key)} onChange={(event) => setTextField(key, event.target.value)} /></Field>)}
        </section>

        <section className="deposit-section">
          <h3>参考素材</h3>
          {usedAssets.length === 0 ? <StatusMessage>本次 Run 没有可复制的素材。</StatusMessage> : <div className="deposit-assets">{usedAssets.map((asset) => <label key={asset.id}><input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} /><span><strong>{asset.name}</strong><em>{referenceIds.has(asset.id) ? "原始参考图 · 默认选中" : "AI 生成图 · 需明确选择"}</em></span></label>)}</div>}
        </section>
      </form>
    </Dialog>
  );
}
