import { describe, expect, it } from "vitest";

import { runCompliance } from "../src/domain/compliance";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import type { PlannedSlot } from "../src/domain/planning/types";
import type { ProductProject } from "../src/domain/projects/types";

const project: ProductProject = {
  id: "project_01",
  name: "Travel pillow",
  facts: {
    productName: "Travel pillow",
    category: "Travel accessories",
    brand: "Northwind",
    model: "TP-01",
    sku: "TP-01-BLUE",
    targetAudience: "Long-haul travelers",
    description: "Memory foam travel pillow with a removable cover.",
    sellingPoints: ["Removable cover", "Memory foam core"],
    forbiddenClaims: [],
    specifications: { Material: "Memory foam", Color: "Blue" },
  },
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

function makeSlot(overrides: Partial<PlannedSlot> = {}): PlannedSlot {
  return {
    slotKey: "MAIN",
    visibleCopy: "",
    strategy: "Show the sold product clearly.",
    evidence: ["Project reference image"],
    prompt: "One travel pillow on a pure white background, fully visible.",
    negativePrompt: "No text or decoration.",
    ...overrides,
  };
}

describe("runCompliance", () => {
  it("reports visible copy on the Amazon MAIN image with evidence and a user action", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({ visibleCopy: "Save 20% today" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "amazon-main-visible-copy",
        severity: "error",
        checkType: "automatic",
        evidence: ["Save 20% today"],
        userAction: expect.stringContaining("删除"),
      }),
    );
    expect(result.manualReview.required).toBe(true);
    expect(result.manualReview.reason).toContain("不检查生成图片");
  });

  it("classifies Amazon MAIN forbidden instructions and missing prompt guardrails", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({
        prompt:
          "Create a lifestyle scene with several pillows, add a $19.99 sale badge, five-star rating, watermark, border, and Amazon logo.",
      }),
    );

    expect(result.severity).toBe("error");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "amazon-main-promotion",
        "amazon-main-price",
        "amazon-main-rating",
        "amazon-main-watermark",
        "amazon-main-badge",
        "amazon-main-border",
        "amazon-main-amazon-mark",
        "amazon-main-white-background",
        "amazon-main-single-product",
      ]),
    );
    expect(
      result.findings
        .filter((finding) => finding.code.startsWith("amazon-main-") && finding.evidence.length)
        .every((finding) => finding.checkType === "automatic"),
    ).toBe(true);
    expect(
      result.findings.find((finding) => finding.code === "amazon-main-white-background"),
    ).toMatchObject({ severity: "warning", userAction: expect.stringContaining("纯白背景") });
    expect(
      result.findings.find((finding) => finding.code === "amazon-main-single-product"),
    ).toMatchObject({ severity: "warning", userAction: expect.stringContaining("单个") });
  });

  it.each(["PT01", "A+S02"])(
    "checks prohibited copy and unsupported guarantees in Amazon %s",
    (slotKey) => {
      const result = runCompliance(
        project,
        amazonRulePack,
        makeSlot({
          slotKey,
          visibleCopy:
            "Limited-time sale: $19.99. Rated five stars by customers. Better than Brand X.",
          prompt: "Include support@example.com and a lifetime guarantee.",
        }),
      );

      expect(result.severity).toBe("error");
      expect(result.findings.map((finding) => finding.code)).toEqual(
        expect.arrayContaining([
          "amazon-promotion",
          "amazon-price",
          "amazon-review",
          "amazon-competitor-claim",
          "amazon-contact-details",
          "amazon-unsupported-guarantee",
        ]),
      );
      expect(
        result.findings.find((finding) => finding.code === "amazon-unsupported-guarantee"),
      ).toMatchObject({
        severity: "warning",
        evidence: ["lifetime guarantee"],
        userAction: expect.stringContaining("商品事实"),
      });
    },
  );

  it("separates Taobao absolute claims from missing specification and proof evidence", () => {
    const result = runCompliance(
      {
        ...project,
        facts: {
          ...project.facts,
          description: "A compact travel accessory.",
          sellingPoints: ["Removable cover"],
          specifications: {},
        },
      },
      taobaoRulePack,
      makeSlot({
        slotKey: "TB-DETAIL-06",
        visibleCopy: "全网最好，长度 30 cm，通过 CE 认证",
        prompt: "制作清晰的规格与包装信息版式。",
      }),
    );

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "taobao-absolute-claim",
          severity: "error",
          evidence: ["全网最好"],
        }),
        expect.objectContaining({
          code: "taobao-missing-specification",
          severity: "warning",
          evidence: expect.arrayContaining(["30 cm"]),
          userAction: expect.stringContaining("商品事实"),
        }),
        expect.objectContaining({
          code: "taobao-missing-proof",
          severity: "warning",
          evidence: expect.arrayContaining(["CE 认证"]),
          userAction: expect.stringContaining("证明"),
        }),
      ]),
    );
  });

  it("reports a project-declared forbidden claim in visible copy or the positive prompt", () => {
    const result = runCompliance(
      {
        ...project,
        facts: { ...project.facts, forbiddenClaims: ["medical-grade"] },
      },
      amazonRulePack,
      makeSlot({
        slotKey: "PT02",
        visibleCopy: "Medical-grade comfort for every flight",
      }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "project-forbidden-claim",
        severity: "error",
        evidence: ["medical-grade"],
        userAction: expect.stringContaining("删除"),
      }),
    );
  });

  it("reports an aggressive call to action in an Amazon A+ slot", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({ slotKey: "A+S01", visibleCopy: "Buy now and add to cart" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "amazon-a-plus-aggressive-cta",
        severity: "error",
        evidence: ["Buy now", "add to cart"],
      }),
    );
  });

  it("does not treat Amazon context or negated forbidden items as MAIN violations", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({
        prompt:
          "Amazon MAIN image. One travel pillow on a pure white background. No text, badges, price, rating, watermark, borders, or Amazon-like marks.",
      }),
    );

    expect(result.severity).toBe("info");
    expect(result.findings).toEqual([]);
    expect(result.manualReviewRequired).toBe(true);
  });

  it("does not treat Chinese negated Amazon MAIN restrictions as violations", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({
        prompt:
          "Amazon MAIN 图片。仅展示一个在售商品，使用纯白背景。画面中不叠加任何文字、徽章、价格、评分、水印、边框或类似 Amazon 的标记。",
      }),
    );

    expect(result.severity).toBe("info");
    expect(result.findings).toEqual([]);
  });

  it("does not report a guarantee that is explicitly present in project facts", () => {
    const result = runCompliance(
      {
        ...project,
        facts: {
          ...project.facts,
          description: "Includes a lifetime guarantee subject to the written policy.",
        },
      },
      amazonRulePack,
      makeSlot({ slotKey: "PT06", visibleCopy: "Lifetime guarantee" }),
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "amazon-unsupported-guarantee",
    );
  });

  it("does not report Taobao specification or proof claims already present in project facts", () => {
    const result = runCompliance(
      {
        ...project,
        facts: {
          ...project.facts,
          specifications: { Length: "30 cm", Certification: "CE 认证" },
        },
      },
      taobaoRulePack,
      makeSlot({
        slotKey: "TB-DETAIL-06",
        visibleCopy: "长度 30 cm，通过 CE 认证",
        prompt: "制作清晰的规格与包装信息版式。",
      }),
    );

    expect(result.findings.map((finding) => finding.code)).not.toEqual(
      expect.arrayContaining(["taobao-missing-specification", "taobao-missing-proof"]),
    );
  });

  it("does not treat a numeric substring as supporting a different specification", () => {
    const result = runCompliance(
      {
        ...project,
        facts: {
          ...project.facts,
          specifications: { Length: "130 cm" },
        },
      },
      taobaoRulePack,
      makeSlot({
        slotKey: "TB-DETAIL-06",
        visibleCopy: "长度 30 cm",
        prompt: "制作清晰的规格版式。",
      }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "taobao-missing-specification",
        evidence: ["30 cm"],
      }),
    );
  });

  it("ignores strategy, planner evidence, and negativePrompt during automatic checks", () => {
    const result = runCompliance(
      project,
      amazonRulePack,
      makeSlot({
        slotKey: "PT01",
        visibleCopy: "Travel comfort",
        prompt: "Show the verified removable cover in a clear benefit composition.",
        strategy: "Do not use sale or competitor language.",
        evidence: ["No five-star review is provided"],
        negativePrompt: "watermark, badge, price, contact details",
      }),
    );

    expect(result.findings).toEqual([]);
    expect(result.manualReview.reason).toContain("仅分析项目事实、可见文案和图片提示词");
  });
});
