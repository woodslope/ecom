import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssetLibrary } from "../src/components/AssetLibrary";
import {
  isProductSourceDirty,
  ProductSourcePanel,
} from "../src/components/ProductSourcePanel";
import { ProjectDialog } from "../src/components/ProjectDialog";
import type { ProductProject } from "../src/domain/projects/types";

const project: ProductProject = {
  id: "project_01",
  name: "旅行颈枕上新",
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
  facts: {
    productName: "云感旅行颈枕",
    category: "旅行用品",
    brand: "Northwind",
    model: "NW-P01",
    sku: "P01-GRAY",
    targetAudience: "长途出行人群",
    description: "可折叠记忆棉颈枕",
    sellingPoints: ["慢回弹", "可拆洗"],
    forbiddenClaims: ["治疗颈椎病"],
    specifications: { 材质: "记忆棉" },
  },
};

describe("project and asset UI contract", () => {
  it("detects whether product facts still have unsaved changes", () => {
    expect(isProductSourceDirty(project.facts, project.facts)).toBe(false);
    expect(
      isProductSourceDirty(project.facts, {
        ...project.facts,
        productName: "尚未保存的新商品名",
      }),
    ).toBe(true);
  });

  it("renders project facts, real image upload, preview, and removal actions", () => {
    const dialogMarkup = renderToStaticMarkup(
      createElement(ProjectDialog, {
        open: true,
        loading: false,
        submissionError: "项目写入失败，请检查浏览器存储后重试。",
        onClose: () => undefined,
        onCreate: async () => true,
      }),
    );
    const libraryMarkup = renderToStaticMarkup(
      createElement(AssetLibrary, {
        assets: [
          {
            metadata: {
              id: "asset_01",
              projectId: project.id,
              name: "front.png",
              kind: "reference",
              role: "reference",
              tags: [],
              mimeType: "image/png",
              size: 128,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
            objectUrl: "blob:test/front",
          },
        ],
        loading: false,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
      }),
    );
    const sourceMarkup = renderToStaticMarkup(
      createElement(ProductSourcePanel, {
        project,
        assets: [],
        loading: false,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
      }),
    );
    const savingSourceMarkup = renderToStaticMarkup(
      createElement(ProductSourcePanel, {
        project,
        assets: [],
        loading: true,
        onSave: async () => true,
        onUpload: async () => undefined,
        onRemove: async () => undefined,
      }),
    );

    expect(dialogMarkup).toContain("资料名称");
    expect(dialogMarkup).toContain("商品名称");
    expect(dialogMarkup).toContain("载入示例");
    expect(dialogMarkup).toContain("完整英文资料 · CloudRest Travel Pillow");
    expect(dialogMarkup).toContain("缺资料测试 · CloudRest 未完成档案");
    expect(dialogMarkup).toContain("核心卖点");
    expect(dialogMarkup).toContain("规格参数");
    expect(dialogMarkup).toContain("项目写入失败，请检查浏览器存储后重试。");
    expect(libraryMarkup).toContain('type="file"');
    expect(libraryMarkup).toContain('accept="image/*"');
    expect(libraryMarkup).toContain("multiple");
    expect(libraryMarkup).toContain('alt="front.png"');
    expect(libraryMarkup).toContain('aria-label="删除素材 front.png"');
    expect(sourceMarkup).toContain("保存商品资料");
    expect(savingSourceMarkup).toContain("保存中");
    expect((savingSourceMarkup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(11);
  });
});
