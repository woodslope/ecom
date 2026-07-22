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

      expect(markup).toContain("准备资料");
      expect(markup).toContain("检查策划");
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
});
