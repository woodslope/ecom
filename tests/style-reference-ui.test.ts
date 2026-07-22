import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StyleReferenceEditorDialog } from "../src/components/StyleReferenceEditorDialog";
import { StyleReferencePicker } from "../src/components/StyleReferencePicker";
import type { WorkbenchAsset } from "../src/store/workbench-store";

const customStyle: WorkbenchAsset = {
  objectUrl: "blob:style-board",
  metadata: {
    id: "style_custom",
    projectId: "project_01",
    name: "静谧棚拍风格板",
    kind: "style-reference",
    tags: ["style", "custom"],
    mimeType: "image/svg+xml",
    size: 128,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    styleReference: {
      name: "静谧棚拍",
      sourcePresetId: "studio-proof",
      palette: ["#ffffff", "#111827"],
      typography: "sans",
      lighting: "soft",
      material: "matte",
      density: "airy",
      promptGuidance: "Soft studio proof",
    },
  },
};

describe("style reference UI ownership", () => {
  it("separates the base text style from the optional style-board attachment", () => {
    const markup = renderToStaticMarkup(
      createElement(StyleReferencePicker, {
        assets: [customStyle],
        value: customStyle.metadata.id,
        basePresetId: "studio-proof",
        canCreate: true,
        onChange: () => undefined,
        onBasePresetChange: () => undefined,
        onCreate: async () => null,
        onRemove: async () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="附加风格板"');
    expect(markup).toContain("叠加在基础风格上");
    expect(markup).toContain("新建自定义风格");
    expect(markup).toContain("当前商品的自定义风格板");
    expect(markup).toContain("删除当前自定义风格");
    expect(markup).not.toContain("编辑为我的风格");
  });

  it("names the editor save scope and exposes labeled controls", () => {
    const markup = renderToStaticMarkup(
      createElement(StyleReferenceEditorDialog, {
        open: true,
        presetId: "clean-retail",
        saving: false,
        onClose: () => undefined,
        onSave: async () => undefined,
      }),
    );

    expect(markup).toContain("新建自定义风格");
    expect(markup).toContain("保存到当前商品");
    expect(markup).toContain('aria-label="风格名称"');
    expect(markup).toContain('aria-label="字体"');
    expect(markup).toContain('aria-label="光影"');
  });
});
