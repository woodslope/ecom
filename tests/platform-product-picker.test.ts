import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  filterPickerProjects,
  PlatformProductPickerDialog,
} from "../src/components/PlatformProductPickerDialog";
import {
  hasPlatformTaskWork,
  hasUsablePlatformIntakeDraft,
  resolvePlatformIntakeSeedAction,
  shouldPromptPlatformProductPicker,
} from "../src/domain/workspace/platform-product-picker";

const projects = [
  {
    id: "p1",
    name: "颈枕 A",
    facts: {
      productName: "云感颈枕",
      category: "旅行",
      brand: "Northwind",
      model: "",
      sku: "",
      targetAudience: "",
      description: "描述",
      sellingPoints: ["慢回弹"],
      forbiddenClaims: [],
      specifications: {},
    },
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T09:00:00.000Z",
  },
  {
    id: "p2",
    name: "颈枕 B",
    facts: {
      productName: "另一款",
      category: "家居",
      brand: "Other",
      model: "",
      sku: "",
      targetAudience: "",
      description: "",
      sellingPoints: [],
      forbiddenClaims: [],
      specifications: {},
    },
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:30:00.000Z",
  },
];

describe("platform product picker", () => {
  it("prompts on platform entry unless caller already chose a product or work exists", () => {
    expect(
      shouldPromptPlatformProductPicker({
        platform: "taobao",
        projectCount: 2,
        hasPlatformWork: false,
      }),
    ).toBe(true);
    expect(
      shouldPromptPlatformProductPicker({
        platform: "amazon",
        projectCount: 0,
        hasPlatformWork: false,
      }),
    ).toBe(true);
    expect(
      shouldPromptPlatformProductPicker({
        platform: "taobao",
        projectCount: 1,
        hasPlatformWork: true,
      }),
    ).toBe(false);
    expect(
      shouldPromptPlatformProductPicker({
        platform: "amazon",
        projectCount: 3,
        hasPlatformWork: false,
        skipBecauseCallerChoseProduct: true,
      }),
    ).toBe(false);
  });

  it("detects existing platform task work", () => {
    expect(
      hasPlatformTaskWork({ platform: "taobao", hasTaobaoAnalysis: true }),
    ).toBe(true);
    expect(
      hasPlatformTaskWork({ platform: "taobao", hasTaobaoDraft: true }),
    ).toBe(true);
    expect(hasPlatformTaskWork({ platform: "amazon", hasListingDraft: true })).toBe(true);
    expect(hasPlatformTaskWork({ platform: "amazon", hasPlan: true })).toBe(true);
    expect(hasPlatformTaskWork({ platform: "taobao" })).toBe(false);
  });

  it("detects usable session drafts and resolves seed confirm gate", () => {
    expect(hasUsablePlatformIntakeDraft("amazon", null)).toBe(false);
    expect(
      hasUsablePlatformIntakeDraft("amazon", {
        id: "s1",
        projectId: "p1",
        platformId: "amazon",
        workflowId: "amazon-listing",
        sourceInput: { listingText: "  Title: pillow  " },
        options: {
          platformId: "amazon",
          marketplaceId: "us",
          plannerMode: "listing",
          sizeTier: "2K",
        },
        selectedReferenceAssetIds: [],
        slotVersions: {},
        createdAt: "2026-07-21T08:00:00.000Z",
        updatedAt: "2026-07-21T08:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      hasUsablePlatformIntakeDraft("taobao", {
        id: "s2",
        projectId: "p1",
        platformId: "taobao",
        workflowId: "taobao-product",
        sourceInput: {
          listingText: "",
          taobaoProduct: { productText: "商品名：颈枕", selectedReferenceAssetIds: [] },
        },
        options: { platformId: "taobao" },
        selectedReferenceAssetIds: [],
        slotVersions: {},
        createdAt: "2026-07-21T08:00:00.000Z",
        updatedAt: "2026-07-21T08:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      resolvePlatformIntakeSeedAction({ hasPlan: false, hasUsableDraft: false }),
    ).toBe("seed");
    expect(
      resolvePlatformIntakeSeedAction({ hasPlan: true, hasUsableDraft: false }),
    ).toBe("needs-confirm");
    expect(
      resolvePlatformIntakeSeedAction({ hasPlan: false, hasUsableDraft: true }),
    ).toBe("needs-confirm");
    expect(
      resolvePlatformIntakeSeedAction({
        hasPlan: true,
        hasUsableDraft: true,
        force: true,
      }),
    ).toBe("seed");
  });

  it("filters projects by name, product, category, or brand", () => {
    expect(filterPickerProjects(projects, "家居").map((item) => item.id)).toEqual(["p2"]);
    expect(filterPickerProjects(projects, "north").map((item) => item.id)).toEqual(["p1"]);
  });

  it("renders restore-oriented product switching for Amazon and Taobao", () => {
    const amazon = renderToStaticMarkup(
      createElement(PlatformProductPickerDialog, {
        open: true,
        platformLabel: "Amazon",
        projects,
        activeProjectId: "p1",
        allowManualWithoutProject: true,
        onClose: () => undefined,
        onChoose: () => undefined,
      }),
    );
    expect(amazon).toContain("切换 Amazon 商品");
    expect(amazon).toContain("商品工作上下文");
    expect(amazon).toContain("继续当前商品");
    expect(amazon).toContain("恢复该商品");
    expect(amazon).toContain("dialog--sidebar");
    expect(amazon).toContain("手动填写 / 粘贴");
    expect(amazon).toContain("云感颈枕");

    const sparse = renderToStaticMarkup(
      createElement(PlatformProductPickerDialog, {
        open: true,
        platformLabel: "Amazon",
        projects: [
          {
            id: "empty",
            name: "空档案",
            facts: {
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
            },
            createdAt: "2026-07-21T08:00:00.000Z",
            updatedAt: "2026-07-21T08:00:00.000Z",
          },
        ],
        activeProjectId: "empty",
        allowManualWithoutProject: true,
        onClose: () => undefined,
        onChoose: () => undefined,
      }),
    );
    expect(sparse).toContain("继续当前商品");
    expect(sparse).toContain("待补资料");

    const taobaoEmpty = renderToStaticMarkup(
      createElement(PlatformProductPickerDialog, {
        open: true,
        platformLabel: "淘宝 / 天猫",
        projects: [],
        allowManualWithoutProject: false,
        onClose: () => undefined,
        onChoose: () => undefined,
      }),
    );
    expect(taobaoEmpty).toContain("还没有商品档案");
    expect(taobaoEmpty).toContain("新建商品");
    expect(taobaoEmpty).toContain("打开资料库");
    expect(taobaoEmpty).not.toContain("手动填写 / 粘贴");
  });
});
