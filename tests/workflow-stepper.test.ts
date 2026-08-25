import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowStepper } from "../src/components/WorkflowStepper";

describe("shared platform workflow stepper", () => {
  it("shows the same two-step language for Amazon and Taobao", () => {
    for (const platform of ["amazon", "taobao"] as const) {
      const markup = renderToStaticMarkup(
        createElement(WorkflowStepper, {
          platform,
          stage: "review",
          completedSlots: 0,
          totalSlots: 7,
        }),
      );

      expect(markup).toContain("准备资料");
      expect(markup).toContain("生成交付");
      expect(markup).not.toContain("商品事实与参考图");
      expect(markup).not.toContain("策划、生成与交付");
      expect(markup).toContain('aria-current="step"');
      expect(markup).not.toContain("个槽位已完成");
    }
  });

  it("marks preparation complete throughout the production page", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowStepper, {
        platform: "amazon",
        stage: "deliver",
        completedSlots: 7,
        totalSlots: 7,
      }),
    );

    expect(markup.match(/is-complete/g)).toHaveLength(1);
    expect(markup).not.toContain("个槽位已完成");
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
    expect(markup).toContain("准备资料");
    expect(markup).toContain("生成交付");
    expect(markup).not.toContain("商品事实与参考图");
    expect(markup).not.toContain("等待策划");
  });

  it("renders available stages as navigation buttons", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowStepper, {
        platform: "amazon",
        stage: "review",
        completedSlots: 0,
        totalSlots: 7,
        selectableStages: ["prepare", "review", "produce"],
        onStageSelect: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="前往准备资料"');
    expect(markup).toContain('aria-label="前往生成交付"');
  });
});
