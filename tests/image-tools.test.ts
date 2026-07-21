import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImageTools } from "../src/components/ImageTools";
import { MaskEditorDialog } from "../src/components/MaskEditorDialog";

describe("image tools UI", () => {
  it("exposes download, reference reuse, and capability-gated mask editing", () => {
    const enabled = renderToStaticMarkup(
      createElement(ImageTools, {
        fileName: "amazon-PT01-version-01.png",
        editingSupported: true,
        onDownload: () => undefined,
        onUseAsReference: () => undefined,
        onEdit: () => undefined,
      }),
    );
    const disabled = renderToStaticMarkup(
      createElement(ImageTools, {
        fileName: "amazon-PT01-version-01.png",
        editingSupported: false,
        editingDisabledReason: "当前图片服务不支持显式遮罩编辑。",
        onDownload: () => undefined,
        onUseAsReference: () => undefined,
        onEdit: () => undefined,
      }),
    );

    expect(enabled).toContain('aria-label="下载 amazon-PT01-version-01.png"');
    expect(enabled).toContain("用作参考图");
    expect(enabled).toContain("局部编辑");
    expect(disabled).toContain("当前图片服务不支持显式遮罩编辑。");
    expect(disabled).toContain("disabled");
  });

  it("renders a bounded mask editor with complete edit controls and a guarded save", () => {
    const markup = renderToStaticMarkup(
      createElement(MaskEditorDialog, {
        open: true,
        imageUrl: "blob:test/version-01",
        imageAlt: "PT01 当前版本",
        width: 1200,
        height: 800,
        initialPrompt: "Replace the selected area.",
        saving: false,
        onClose: () => undefined,
        onSave: async () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="遮罩编辑画布"');
    expect(markup).toContain("画笔");
    expect(markup).toContain("橡皮擦");
    expect(markup).toContain('aria-label="画笔大小"');
    expect(markup).toContain('aria-label="撤销遮罩操作"');
    expect(markup).toContain('aria-label="重做遮罩操作"');
    expect(markup).toContain('aria-label="重置遮罩"');
    expect(markup).toContain("取消");
    expect(markup).toContain("保存编辑");
    expect(markup).toContain("disabled");
  });
});
