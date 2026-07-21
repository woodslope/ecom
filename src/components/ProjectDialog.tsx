import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import {
  cloneDemoProductFixture,
  demoProductFixtures,
} from "../domain/projects/demo-fixtures";
import type { CreateProductProjectInput, ProductFacts } from "../domain/projects/types";
import { Button, Dialog, Field, Select, StatusMessage } from "./ui";

const emptyFacts: ProductFacts = {
  productName: "",
  category: "",
  brand: "",
  model: "",
  sku: "",
  targetAudience: "",
  description: "",
  sellingPoints: [],
  forbiddenClaims: [],
  specifications: {},
};

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

export function ProjectDialog({
  open,
  loading,
  submissionError,
  onClose,
  onCreate,
}: {
  open: boolean;
  loading: boolean;
  submissionError?: string | null;
  onClose: () => void;
  onCreate: (input: CreateProductProjectInput) => Promise<boolean>;
}) {
  const [projectName, setProjectName] = useState("");
  const [facts, setFacts] = useState(emptyFacts);
  const [sellingPoints, setSellingPoints] = useState("");
  const [forbiddenClaims, setForbiddenClaims] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [fixtureMessage, setFixtureMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectName("");
    setFacts(emptyFacts);
    setSellingPoints("");
    setForbiddenClaims("");
    setSpecifications("");
    setSelectedFixtureId("");
    setFixtureMessage(null);
    setValidationError(null);
  }, [open]);

  const loadFixture = () => {
    if (!selectedFixtureId) return;
    const fixture = cloneDemoProductFixture(selectedFixtureId);
    setProjectName(fixture.projectName);
    setFacts(fixture.facts);
    setSellingPoints(fixture.facts.sellingPoints.join("\n"));
    setForbiddenClaims(fixture.facts.forbiddenClaims.join("\n"));
    setSpecifications(
      Object.entries(fixture.facts.specifications)
        .map(([key, value]) => `${key}：${value}`)
        .join("\n"),
    );
    setFixtureMessage("已载入演示样例；提交前仍请上传真实商品参考图。");
    setValidationError(null);
  };

  const setFact = (field: keyof Omit<ProductFacts, "sellingPoints" | "forbiddenClaims" | "specifications">) =>
    (value: string) => setFacts((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectName.trim() || !facts.productName.trim()) {
      setValidationError("请填写资料名称和商品名称。");
      return;
    }

    setValidationError(null);
    const created = await onCreate({
      name: projectName.trim(),
      facts: {
        ...facts,
        productName: facts.productName.trim(),
        sellingPoints: splitLines(sellingPoints),
        forbiddenClaims: splitLines(forbiddenClaims),
        specifications: parseSpecifications(specifications),
      },
    });
    if (created) onClose();
  };

  return (
    <Dialog
      open={open}
      title="新建商品资料"
      eyebrow="商品资料"
      className="project-dialog"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" form="project-create-form" disabled={loading}>
            <Plus size={16} />
            {loading ? "正在创建" : "创建资料"}
          </Button>
        </>
      }
    >
      <form id="project-create-form" className="project-form" onSubmit={submit}>
        {validationError || submissionError ? (
          <StatusMessage tone="danger">{validationError ?? submissionError}</StatusMessage>
        ) : null}
        <Field
          label="演示样例"
          hint="仅填入测试资料，不会自动创建项目或伪造参考图。"
          className="form-grid__wide"
        >
          <div className="demo-fixture-picker">
            <Select aria-label="示例商品资料" value={selectedFixtureId} onChange={(event) => setSelectedFixtureId(event.target.value)}>
              <option value="">选择一份测试资料</option>
              {demoProductFixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" onClick={loadFixture} disabled={loading || !selectedFixtureId}>
              载入示例
            </Button>
          </div>
          {fixtureMessage ? <span className="field__hint">{fixtureMessage}</span> : null}
        </Field>
        <div className="form-grid">
          <Field label="资料名称">
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="例如：云感旅行颈枕"
              required
            />
          </Field>
          <Field label="商品名称">
            <input
              value={facts.productName}
              onChange={(event) => setFact("productName")(event.target.value)}
              placeholder="真实商品名称"
              required
            />
          </Field>
          <Field label="品类">
            <input value={facts.category} onChange={(event) => setFact("category")(event.target.value)} />
          </Field>
          <Field label="品牌">
            <input value={facts.brand} onChange={(event) => setFact("brand")(event.target.value)} />
          </Field>
          <Field label="型号">
            <input value={facts.model} onChange={(event) => setFact("model")(event.target.value)} />
          </Field>
          <Field label="SKU">
            <input value={facts.sku} onChange={(event) => setFact("sku")(event.target.value)} />
          </Field>
          <Field label="目标人群" className="form-grid__wide">
            <input
              value={facts.targetAudience}
              onChange={(event) => setFact("targetAudience")(event.target.value)}
            />
          </Field>
          <Field label="商品描述" className="form-grid__wide">
            <textarea
              value={facts.description}
              onChange={(event) => setFact("description")(event.target.value)}
              placeholder="只写已经确认的结构、材质、使用方式和包装事实"
            />
          </Field>
          <Field label="核心卖点" hint="每行一条；策划只会使用这里明确提供的事实。" className="form-grid__wide">
            <textarea
              aria-label="核心卖点"
              value={sellingPoints}
              onChange={(event) => setSellingPoints(event.target.value)}
            />
          </Field>
          <Field label="规格参数" hint="每行使用“名称：值”，例如“材质：记忆棉”。" className="form-grid__wide">
            <textarea
              aria-label="规格参数"
              value={specifications}
              onChange={(event) => setSpecifications(event.target.value)}
            />
          </Field>
          <Field label="禁用声明" hint="每行一条，生成和合规检查会主动避开。" className="form-grid__wide">
            <textarea
              aria-label="禁用声明"
              value={forbiddenClaims}
              onChange={(event) => setForbiddenClaims(event.target.value)}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
