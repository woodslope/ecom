import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CopilotTaskStatus } from "../src/components/GenerationActions";

describe("SlotInspector Copilot", () => {
  it("keeps the Copilot target and cancel action visible outside the inspector", () => {
    const markup = renderToStaticMarkup(
      createElement(CopilotTaskStatus, {
        target: { platformId: "amazon", slotKey: "PT01" },
        onCancel: () => undefined,
      }),
    );

    expect(markup).toContain("Amazon · PT01 Copilot 请求处理中");
    expect(markup).toContain("请求仅作用于目标槽位");
    expect(markup).not.toContain("只会保存目标槽位");
    expect(markup).toContain("取消 Copilot");
  });

});
