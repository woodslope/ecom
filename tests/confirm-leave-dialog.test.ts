import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmLeaveDialog } from "../src/components/ConfirmLeaveDialog";

describe("ConfirmLeaveDialog", () => {
  it("offers return-to-save, discard, and cancel actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmLeaveDialog, {
        open: true,
        description: "商品资料有未保存修改。",
        onSave: () => undefined,
        onDiscard: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain("有未保存的修改");
    expect(markup).toContain("返回保存");
    expect(markup).toContain("丢弃修改");
    expect(markup).toContain("取消");
    expect(markup).toContain("商品资料有未保存修改");
  });
});
