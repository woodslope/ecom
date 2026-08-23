import type { ProductFacts } from "../domain/projects/types";
import { Field } from "./ui";

function lines(value: readonly string[]): string {
  return value.join("\n");
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function specifications(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, item]) => `${key}：${item}`)
    .join("\n");
}

function parseSpecifications(value: string): Record<string, string> {
  return Object.fromEntries(
    parseLines(value).flatMap((line) => {
      const separator = line.search(/[:：]/);
      if (separator <= 0) return [];
      const key = line.slice(0, separator).trim();
      const item = line.slice(separator + 1).trim();
      return key && item ? [[key, item]] : [];
    }),
  );
}

export function ProductFactsForm({
  facts,
  disabled = false,
  onChange,
  className = "",
}: {
  facts: ProductFacts;
  disabled?: boolean;
  onChange: (facts: ProductFacts) => void;
  className?: string;
}) {
  const setText = (field: keyof ProductFacts) => (value: string) => {
    onChange({ ...facts, [field]: value } as ProductFacts);
  };

  return (
    <div className={`product-facts-form ${className}`.trim()}>
      <section className="product-facts-form__group">
        <div className="product-facts-form__heading">
          <strong>基本信息</strong>
          <span>商品名称是平台策划的主要识别字段。</span>
        </div>
        <div className="product-facts-form__grid product-facts-form__grid--identity">
          <Field label="商品名称" name="productName">
            <input
              name="productName"
              aria-label="商品名称"
              value={facts.productName}
              disabled={disabled}
              onChange={(event) => setText("productName")(event.target.value)}
            />
          </Field>
          <Field label="品类" name="category">
            <input
              name="category"
              aria-label="品类"
              value={facts.category}
              disabled={disabled}
              onChange={(event) => setText("category")(event.target.value)}
            />
          </Field>
          <Field label="品牌" name="brand">
            <input
              name="brand"
              aria-label="品牌"
              value={facts.brand}
              disabled={disabled}
              onChange={(event) => setText("brand")(event.target.value)}
            />
          </Field>
          <Field label="型号" name="model">
            <input
              name="model"
              aria-label="型号"
              value={facts.model}
              disabled={disabled}
              onChange={(event) => setText("model")(event.target.value)}
            />
          </Field>
          <Field label="SKU" name="sku">
            <input
              name="sku"
              aria-label="SKU"
              value={facts.sku}
              disabled={disabled}
              onChange={(event) => setText("sku")(event.target.value)}
            />
          </Field>
          <Field label="目标人群" name="targetAudience">
            <input
              name="targetAudience"
              aria-label="目标人群"
              value={facts.targetAudience}
              disabled={disabled}
              onChange={(event) => setText("targetAudience")(event.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="product-facts-form__group">
        <div className="product-facts-form__heading">
          <strong>商品资料</strong>
          <span>按字段填写，平台文本仅作为可选补充。</span>
        </div>
        <Field label="商品描述" name="description">
          <textarea
            name="description"
            aria-label="商品描述"
            value={facts.description}
            disabled={disabled}
            onChange={(event) => setText("description")(event.target.value)}
          />
        </Field>
        <div className="product-facts-form__grid product-facts-form__grid--content">
          <Field label="核心卖点" name="sellingPoints" hint="每行一条卖点">
            <textarea
              name="sellingPoints"
              aria-label="核心卖点"
              value={lines(facts.sellingPoints)}
              disabled={disabled}
              onChange={(event) => onChange({ ...facts, sellingPoints: parseLines(event.target.value) })}
            />
          </Field>
          <Field label="规格参数" name="specifications" hint="每行一条，例如：材质：记忆棉">
            <textarea
              name="specifications"
              aria-label="规格参数"
              value={specifications(facts.specifications)}
              disabled={disabled}
              onChange={(event) => onChange({ ...facts, specifications: parseSpecifications(event.target.value) })}
            />
          </Field>
          <Field label="禁用声明" name="forbiddenClaims" hint="每行一条禁用说法">
            <textarea
              name="forbiddenClaims"
              aria-label="禁用声明"
              value={lines(facts.forbiddenClaims)}
              disabled={disabled}
              onChange={(event) => onChange({ ...facts, forbiddenClaims: parseLines(event.target.value) })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
