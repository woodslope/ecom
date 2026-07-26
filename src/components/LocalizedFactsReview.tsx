import { useEffect, useState } from "react";
import { Check, Languages } from "lucide-react";

import type { PlatformFactsDraft } from "../domain/localization/product-localizer";
import type { ProductFacts } from "../domain/projects/types";
import { Button, Field, StatusChip, StatusMessage } from "./ui";

function specificationsText(specifications: Readonly<Record<string, string>>): string {
  return Object.entries(specifications).map(([key, value]) => `${key}: ${value}`).join("\n");
}

function parseSpecifications(value: string): Record<string, string> {
  return Object.fromEntries(value.split("\n").flatMap((line) => {
    const separator = line.search(/[:：]/);
    if (separator < 1) return [];
    const key = line.slice(0, separator).trim();
    const item = line.slice(separator + 1).trim();
    return key && item ? [[key, item]] : [];
  }));
}

function draftFacts(draft: PlatformFactsDraft): ProductFacts {
  return {
    ...draft.localizedFacts,
    sellingPoints: [...draft.localizedFacts.sellingPoints],
    forbiddenClaims: [...draft.localizedFacts.forbiddenClaims],
    specifications: { ...draft.localizedFacts.specifications },
  };
}

export function LocalizedFactsReview({
  draft,
  disabled = false,
  actionLabel = "确认并生成图片策划",
  onConfirm,
}: {
  draft: PlatformFactsDraft;
  disabled?: boolean;
  actionLabel?: string;
  onConfirm: (facts: ProductFacts) => Promise<void> | void;
}) {
  const [facts, setFacts] = useState(() => draftFacts(draft));
  const [specifications, setSpecifications] = useState(() =>
    specificationsText(draft.localizedFacts.specifications),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFacts(draftFacts(draft));
    setSpecifications(specificationsText(draft.localizedFacts.specifications));
  }, [draft.updatedAt]);

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ ...facts, specifications: parseSpecifications(specifications) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="localized-facts-review" aria-label="站点语言草稿">
      <header className="localized-facts-review__header">
        <span className="localized-facts-review__icon"><Languages size={18} /></span>
        <div>
          <span>站点语言草稿</span>
          <h2>{draft.targetLocale}</h2>
        </div>
        <StatusChip tone={draft.status === "confirmed" ? "success" : "warning"}>
          {draft.status === "confirmed" ? "已确认" : draft.status === "generated" ? "待确认" : "待补充"}
        </StatusChip>
      </header>

      <StatusMessage tone={draft.status === "pending" ? "warning" : "neutral"}>
        {draft.status === "pending"
          ? "自动本地化未完成。请检查并手动补充站点语言，品牌、型号、SKU 与数字会继续保持原值。"
          : "确认后，图片策划会固定使用这份站点语言版本；之后修改主档不会自动覆盖当前任务。"}
      </StatusMessage>

      <details className="localized-facts-review__source">
        <summary>查看中文事实快照</summary>
        <dl>
          <div><dt>商品名称</dt><dd>{draft.sourceFactsSnapshot.productName || "未填写"}</dd></div>
          <div><dt>描述</dt><dd>{draft.sourceFactsSnapshot.description || "未填写"}</dd></div>
          <div><dt>卖点</dt><dd>{draft.sourceFactsSnapshot.sellingPoints.join("；") || "未填写"}</dd></div>
        </dl>
      </details>

      <div className="localized-facts-review__form">
        <Field label="商品名称">
          <input
            value={facts.productName}
            disabled={disabled || saving}
            onChange={(event) => setFacts({ ...facts, productName: event.target.value })}
          />
        </Field>
        <Field label="品类">
          <input
            value={facts.category}
            disabled={disabled || saving}
            onChange={(event) => setFacts({ ...facts, category: event.target.value })}
          />
        </Field>
        <Field label="目标人群">
          <input
            value={facts.targetAudience}
            disabled={disabled || saving}
            onChange={(event) => setFacts({ ...facts, targetAudience: event.target.value })}
          />
        </Field>
        <Field label="商品描述" className="localized-facts-review__wide">
          <textarea
            rows={4}
            value={facts.description}
            disabled={disabled || saving}
            onChange={(event) => setFacts({ ...facts, description: event.target.value })}
          />
        </Field>
        <Field label="卖点（每行一条）">
          <textarea
            rows={6}
            value={facts.sellingPoints.join("\n")}
            disabled={disabled || saving}
            onChange={(event) => setFacts({
              ...facts,
              sellingPoints: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
            })}
          />
        </Field>
        <Field label="规格（名称: 值）">
          <textarea
            rows={6}
            value={specifications}
            disabled={disabled || saving}
            onChange={(event) => setSpecifications(event.target.value)}
          />
        </Field>
      </div>

      <p className="localized-facts-review__locked">
        锁定字段：品牌 {facts.brand || "未填写"} · 型号 {facts.model || "未填写"} · SKU {facts.sku || "未填写"}
      </p>
      <div className="localized-facts-review__actions">
        <Button disabled={disabled} loading={saving} loadingLabel="正在保存" onClick={() => void confirm()}>
          <Check size={15} />
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}
