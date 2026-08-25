import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmLeaveDialog } from "../src/components/ConfirmLeaveDialog";

describe("ConfirmLeaveDialog", () => {
  it("offers discard and cancel actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmLeaveDialog, {
        open: true,
        description: "商品资料有未保存修改，离开后会丢失。",
        onDiscard: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(markup).toContain("提示");
    expect(markup).not.toContain("离开提醒");
    expect(markup).not.toContain("返回保存");
    expect(markup).toContain("放弃");
    expect(markup).toContain("button--danger");
    expect(markup).toContain("取消");
    expect(markup).toContain("商品资料有未保存修改，离开后会丢失");
  });
});
