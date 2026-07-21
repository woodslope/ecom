import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileText, ImagePlus, Sparkles, Upload } from "lucide-react";

import type { ProductProject } from "../domain/projects/types";
import type { TaobaoProductAnalysis } from "../domain/platforms/taobao-analysis";
import type { AnalyzeTaobaoProductInput, WorkbenchAsset } from "../store/workbench-store";
import { Button, EmptyState, Field, Panel, StatusChip, StatusMessage } from "./ui";

const citationSourceLabel = {
  "shared-product": "共享商品",
  "analysis-input": "补充资料",
  "reference-asset": "参考图",
} as const;

export function TaobaoAnalysisSummary({ analysis }: { analysis: TaobaoProductAnalysis }) {
  return (
    <Panel title="商品分析结果" className="taobao-analysis-summary">
      <div className="taobao-analysis-summary__headline">
        <strong>{analysis.suggestedProductName || "待补商品名称"}</strong>
        <StatusChip tone={analysis.missingFacts.length > 0 ? "warning" : "success"}>
          {analysis.missingFacts.length > 0 ? `待补 ${analysis.missingFacts.length} 项` : "资料齐全"}
        </StatusChip>
      </div>
      <dl className="taobao-analysis-summary__facts">
        <div>
          <dt>可用卖点</dt>
          <dd>{analysis.sellingPoints.length > 0 ? analysis.sellingPoints.join("、") : "待补可验证卖点"}</dd>
        </div>
        <div>
          <dt>规格参数</dt>
          <dd>
            {Object.keys(analysis.specifications).length > 0
              ? Object.entries(analysis.specifications).map(([key, value]) => `${key}：${value}`).join("；")
              : "待补规格参数"}
          </dd>
        </div>
        <div>
          <dt>禁用声明</dt>
          <dd>{analysis.forbiddenClaims.length > 0 ? analysis.forbiddenClaims.join("、") : "暂无"}</dd>
        </div>
        <div>
          <dt>引用素材</dt>
          <dd>{analysis.referenceAssets.length > 0 ? analysis.referenceAssets.map((asset) => asset.name).join("、") : "未选择"}</dd>
        </div>
      </dl>
      {analysis.missingFacts.length > 0 ? (
        <StatusMessage tone="warning">待补资料：{analysis.missingFacts.join("、")}</StatusMessage>
      ) : null}
      {analysis.warnings.map((warning) => <StatusMessage key={warning} tone="warning">{warning}</StatusMessage>)}
      {analysis.citations.length > 0 ? (
        <details className="taobao-analysis-summary__citations">
          <summary>来源记录 · {analysis.citations.length}</summary>
          <ul>
            {analysis.citations.map((citation, index) => (
              <li key={`${citation.source}-${citation.field}-${index}`}>
                <StatusChip tone="neutral">{citationSourceLabel[citation.source]}</StatusChip>
                <span>{citation.field}</span>
                <strong>{citation.value}</strong>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

export function TaobaoIntake({
  activeProject,
  assets,
  session,
  loading,
  error,
  onAnalyze,
}: {
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  session?: { sourceInput: { taobaoProduct?: { productText: string; selectedReferenceAssetIds: string[] } } };
  loading: boolean;
  error: string | null;
  onAnalyze: (input: AnalyzeTaobaoProductInput) => Promise<unknown>;
}) {
  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.metadata.kind === "reference"),
    [assets],
  );
  const [productText, setProductText] = useState(session?.sourceInput.taobaoProduct?.productText ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds ?? referenceAssets.map((asset) => asset.metadata.id),
  );
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    setProductText(session?.sourceInput.taobaoProduct?.productText ?? "");
    setSelectedIds(
      session?.sourceInput.taobaoProduct?.selectedReferenceAssetIds ??
        referenceAssets.map((asset) => asset.metadata.id),
    );
  }, [referenceAssets, session]);

  if (!activeProject) {
    return (
      <EmptyState
        variant="setup"
        icon={<FileText size={24} />}
        title="先选择商品资料"
        description="从资料库建立或选择商品档案后，再进入淘宝 / 天猫商品生产包。"
      />
    );
  }

  const toggleAsset = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAnalyze({
      projectId: activeProject.id,
      productText,
      files,
      selectedReferenceAssetIds: selectedIds,
    });
    setFiles([]);
  };

  return (
    <form className="taobao-intake" onSubmit={(event) => void submit(event)}>
      <div className="workbench-toolbar">
        <div className="workbench-toolbar__title">
          <h1>淘宝 / 天猫</h1>
          <StatusChip tone="neutral">商品分析</StatusChip>
        </div>
        <Button type="submit" disabled={loading || (!productText.trim() && selectedIds.length === 0 && files.length === 0)}>
          <Sparkles size={16} />
          {loading ? "分析中..." : "分析淘宝商品"}
        </Button>
      </div>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <div className="taobao-intake__grid">
        <Panel title="商品资料" className="taobao-intake__copy-panel">
          <Field label="淘宝商品资料">
            <textarea
              aria-label="淘宝商品资料"
              rows={14}
              value={productText}
              onChange={(event) => setProductText(event.target.value)}
              placeholder="可粘贴商品名称、卖点、规格和禁用声明"
            />
          </Field>
          <StatusMessage>分析结果只保存到本次淘宝商品 session，不会自动修改资料库。</StatusMessage>
        </Panel>
        <Panel title="商品参考图" className="taobao-intake__asset-panel">
          <label className="taobao-intake__upload">
            <Upload size={18} />
            <span>添加本次分析图片</span>
            <input
              aria-label="淘宝分析图片"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          {files.length > 0 ? (
            <StatusMessage className="taobao-intake__file-count">
              <FileText size={15} aria-hidden="true" />
              <span>已选择 {files.length} 张图片，将随本次分析一起提交。</span>
            </StatusMessage>
          ) : null}
          {referenceAssets.length > 0 ? (
            <div className="taobao-intake__asset-list" role="group" aria-label="选择商品参考图">
              {referenceAssets.map((asset) => (
                <label className="taobao-intake__asset" key={asset.metadata.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(asset.metadata.id)}
                    onChange={() => toggleAsset(asset.metadata.id)}
                  />
                  <img src={asset.objectUrl} alt={asset.metadata.name} />
                  <span>{asset.metadata.name}</span>
                </label>
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="taobao-intake__asset-list" role="group" aria-label="选择商品参考图">
              <EmptyState variant="selection" icon={<ImagePlus size={20} />} title="还没有参考图" description="可在这里添加图片，或先到资料库补充素材。" />
            </div>
          ) : null}
        </Panel>
      </div>
    </form>
  );
}
