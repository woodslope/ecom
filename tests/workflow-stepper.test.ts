import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowStepper } from "../src/components/WorkflowStepper";

describe("shared platform workflow stepper", () => {
  it("shows the same four-step language for Amazon and Taobao", () => {
    for (const platform of ["amazon", "taobao"] as const) {
      const markup = renderToStaticMarkup(
        createElement(WorkflowStepper, {
          platform,
          stage: "review",
          completedSlots: 0,
          totalSlots: 7,
        }),
      );

      expect(markup).toContain("准备");
      expect(markup).toContain("策划检查");
      expect(markup).toContain("逐图生产");
      expect(markup).toContain("交付检查");
      expect(markup).toContain('aria-current="step"');
      expect(markup).toContain("0/7 个槽位已完成");
    }
  });

  it("marks earlier steps complete and exposes delivery progress", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowStepper, {
        platform: "amazon",
        stage: "deliver",
        completedSlots: 7,
        totalSlots: 7,
      }),
    );

    expect(markup.match(/is-complete/g)).toHaveLength(3);
    expect(markup).toContain("7/7 个槽位已完成");
  });

  it("offers a compact intake variant without hints or duplicate summary", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowStepper, {
        platform: "amazon",
        stage: "prepare",
        completedSlots: 0,
        totalSlots: 0,
        compact: true,
      }),
    );

    expect(markup).toContain("workbench-chrome__progress-row--compact");
    expect(markup).toContain("策划");
    expect(markup).toContain("生产");
    expect(markup).toContain("交付");
    expect(markup).not.toContain("商品事实与参考图");
    expect(markup).not.toContain("等待策划");
  });
});
