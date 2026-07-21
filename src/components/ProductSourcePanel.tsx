import { useEffect, useState, type FormEvent } from "react";
import { ClipboardPaste, Save } from "lucide-react";

import {
  listingParseToFactsPatch,
  parseAmazonListingText,
} from "../domain/planning/listing-parse";
import type { ProductFacts, ProductProject, UpdateProductProjectInput } from "../domain/projects/types";
import type { WorkbenchAsset } from "../store/workbench-store";
import { AssetLibrary } from "./AssetLibrary";
import { Button, Field, Panel, StatusChip, StatusMessage } from "./ui";

function toLines(values: readonly string[]): string {
  return values.join("\n");
}

function toSpecificationLines(specifications: Record<string, string>): string {
  return Object.entries(specifications)
    .map(([key, value]) => `${key}：${value}`)
    .join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSpecifications(value: string): Record<string, string> {
  return Object.fromEntries(
    splitLines(value).flatMap((line) => {
      const separator = line.search(/[:：]/);
      if (separator <= 0) return [];
      const key = line.slice(0, separator).trim();
      const specificationValue = line.slice(separator + 1).trim();
      return key && specificationValue ? [[key, specificationValue]] : [];
    }),
  );
}

function comparableFacts(facts: ProductFacts): string {
  return JSON.stringify({
    ...facts,
    sellingPoints: [...facts.sellingPoints],
    forbiddenClaims: [...facts.forbiddenClaims],
    specifications: Object.entries(facts.specifications).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  });
}

export function isProductSourceDirty(saved: ProductFacts, draft: ProductFacts): boolean {
  return comparableFacts(saved) !== comparableFacts(draft);
}

export function ProductSourcePanel({
  project,
  assets,
  loading,
  disabledReason,
  showListingPaste = false,
  showAssets = true,
  onDirtyChange = () => undefined,
  onSave,
  onUpload,
  onRemove,
}: {
  project: ProductProject;
  assets: WorkbenchAsset[];
  loading: boolean;
  disabledReason?: string;
  /** AIS-style paste for title / bullets / description (Amazon path). */
  showListingPaste?: boolean;
  showAssets?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (input: UpdateProductProjectInput) => Promise<boolean>;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [facts, setFacts] = useState<ProductFacts>(project.facts);
  const [sellingPoints, setSellingPoints] = useState(toLines(project.facts.sellingPoints));
  const [forbiddenClaims, setForbiddenClaims] = useState(toLines(project.facts.forbiddenClaims));
  const [specifications, setSpecifications] = useState(
    toSpecificationLines(project.facts.specifications),
  );
  const [listingPaste, setListingPaste] = useState("");
  const [listingPasteMessage, setListingPasteMessage] = useState<string | null>(null);
  const [listingPasteTone, setListingPasteTone] = useState<"success" | "warning" | "danger">(
    "success",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const controlsDisabled = loading || Boolean(disabledReason);
  const draftFacts: ProductFacts = {
    ...facts,
    sellingPoints: splitLines(sellingPoints),
    forbiddenClaims: splitLines(forbiddenClaims),
    specifications: parseSpecifications(specifications),
  };
  const dirty = isProductSourceDirty(project.facts, draftFacts);

  useEffect(() => {
    setFacts(project.facts);
    setSellingPoints(toLines(project.facts.sellingPoints));
    setForbiddenClaims(toLines(project.facts.forbiddenClaims));
    setSpecifications(toSpecificationLines(project.facts.specifications));
    setListingPaste("");
    setListingPasteMessage(null);
    setSaveState("idle");
  }, [project]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const setFact = (field: keyof Omit<ProductFacts, "sellingPoints" | "forbiddenClaims" | "specifications">) =>
    (value: string) => {
      setFacts((current) => ({ ...current, [field]: value }));
      setSaveState("idle");
    };

  const applyListingPaste = (mode: "fill-empty" | "overwrite") => {
    const parsed = parseAmazonListingText(listingPaste);
    if (!parsed.title && parsed.bullets.length === 0 && !parsed.description) {
      setListingPasteTone("warning");
      setListingPasteMessage(parsed.summary);
      return;
    }

    const current: ProductFacts = {
      ...facts,
      sellingPoints: splitLines(sellingPoints),
      forbiddenClaims: splitLines(forbiddenClaims),
      specifications: parseSpecifications(specifications),
    };
    const patch = listingParseToFactsPatch(parsed, {
      overwriteEmptyOnly: mode === "fill-empty",
      current: {
        productName: current.productName,
        sellingPoints: current.sellingPoints,
        description: current.description,
      },
    });

    if (
      patch.productName === undefined &&
      patch.sellingPoints === undefined &&
      patch.description === undefined
    ) {
      setListingPasteTone("warning");
      setListingPasteMessage(
        mode === "fill-empty"
          ? "已有名称/卖点/描述，未覆盖。可改用「覆盖填入」。"
          : "没有可写入的字段。",
      );
      return;
    }

    if (patch.productName !== undefined) {
      setFacts((currentFacts) => ({ ...currentFacts, productName: patch.productName! }));
    }
    if (patch.description !== undefined) {
      setFacts((currentFacts) => ({ ...currentFacts, description: patch.description! }));
    }
    if (patch.sellingPoints !== undefined) {
      setSellingPoints(toLines(patch.sellingPoints));
    }
    setSaveState("idle");
    setListingPasteTone("success");
    setListingPasteMessage(
      `${parsed.summary}。已写入草稿，请检查后点「保存商品资料」。`,
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveState("saving");
    const saved = await onSave({ facts: draftFacts });
    setSaveState(saved ? "saved" : "error");
  };

  return (
    <Panel
      title="当前资料"
      className="workbench-panel product-source-panel"
      action={<StatusChip tone={assets.length > 0 ? "success" : "neutral"}>{assets.length} 图</StatusChip>}
    >
      <div className="product-source-panel__scroll">
        {showAssets ? (
          <AssetLibrary assets={assets} loading={controlsDisabled} onUpload={onUpload} onRemove={onRemove} />
        ) : null}
        <form className="source-form" onSubmit={save}>
          {showListingPaste ? (
            <div className="listing-paste" aria-label="粘贴 Amazon Listing 文本">
              <Field
                label="粘贴 Listing（标题 / 五点）"
                hint="支持 Title:、About this item、- 列表等常见格式。本地解析，不调用 API。"
              >
                <textarea
                  aria-label="粘贴 Listing 文本"
                  placeholder={
                    "Title: Cloud Travel Neck Pillow\n\nAbout this item\n- Memory foam support\n- Foldable for carry-on\n- Removable cover\n\nOptional longer product description..."
                  }
                  disabled={controlsDisabled}
                  rows={6}
                  value={listingPaste}
                  onChange={(event) => {
                    setListingPaste(event.target.value);
                    setListingPasteMessage(null);
                  }}
                />
              </Field>
              <div className="listing-paste__actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={controlsDisabled || !listingPaste.trim()}
                  onClick={() => applyListingPaste("fill-empty")}
                >
                  <ClipboardPaste size={15} />
                  填入空字段
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={controlsDisabled || !listingPaste.trim()}
                  onClick={() => applyListingPaste("overwrite")}
                >
                  覆盖填入
                </Button>
              </div>
              {listingPasteMessage ? (
                <StatusMessage tone={listingPasteTone}>{listingPasteMessage}</StatusMessage>
              ) : null}
            </div>
          ) : null}
          <Field label="商品名称">
            <input disabled={controlsDisabled} value={facts.productName} onChange={(event) => setFact("productName")(event.target.value)} />
          </Field>
          <div className="source-form__pair">
            <Field label="品类">
              <input disabled={controlsDisabled} value={facts.category} onChange={(event) => setFact("category")(event.target.value)} />
            </Field>
            <Field label="品牌">
              <input disabled={controlsDisabled} value={facts.brand} onChange={(event) => setFact("brand")(event.target.value)} />
            </Field>
          </div>
          <div className="source-form__pair">
            <Field label="型号">
              <input disabled={controlsDisabled} value={facts.model} onChange={(event) => setFact("model")(event.target.value)} />
            </Field>
            <Field label="SKU">
              <input disabled={controlsDisabled} value={facts.sku} onChange={(event) => setFact("sku")(event.target.value)} />
            </Field>
          </div>
          <Field label="目标人群">
            <input disabled={controlsDisabled} value={facts.targetAudience} onChange={(event) => setFact("targetAudience")(event.target.value)} />
          </Field>
          <Field label="商品描述">
            <textarea disabled={controlsDisabled} value={facts.description} onChange={(event) => setFact("description")(event.target.value)} />
          </Field>
          <Field label="核心卖点">
            <textarea
              aria-label="核心卖点"
              placeholder="每行一条卖点"
              disabled={controlsDisabled}
              value={sellingPoints}
              onChange={(event) => {
                setSellingPoints(event.target.value);
                setSaveState("idle");
              }}
            />
          </Field>
          <Field label="规格参数">
            <textarea
              aria-label="规格参数"
              placeholder={"每行一条，例如：\n材质：记忆棉"}
              disabled={controlsDisabled}
              value={specifications}
              onChange={(event) => {
                setSpecifications(event.target.value);
                setSaveState("idle");
              }}
            />
          </Field>
          <Field label="禁用声明">
            <textarea
              aria-label="禁用声明"
              placeholder="每行一条禁用说法"
              disabled={controlsDisabled}
              value={forbiddenClaims}
              onChange={(event) => {
                setForbiddenClaims(event.target.value);
                setSaveState("idle");
              }}
            />
          </Field>
          {disabledReason ? <StatusMessage tone="warning">{disabledReason}</StatusMessage> : null}
          {saveState === "saved" ? (
            <StatusMessage tone="success">商品资料已保存。</StatusMessage>
          ) : null}
          {saveState === "error" ? (
            <StatusMessage tone="danger">保存失败，当前输入仍保留，请重试。</StatusMessage>
          ) : null}
          <Button type="submit" variant="secondary" disabled={controlsDisabled || !dirty}>
            <Save size={15} />
            {saveState === "saving" || loading ? "保存中" : "保存商品资料"}
          </Button>
        </form>
      </div>
    </Panel>
  );
}
