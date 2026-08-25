import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell, DESKTOP_MIN_WIDTH } from "../src/components/AppShell";

describe("workbench runtime context", () => {
  it("exposes desktop runtime mode and a desktop-only gate", () => {
    const markup = renderToStaticMarkup(
      createElement(
        AppShell,
        {
          activeItem: "amazon",
          onActiveItemChange: () => undefined,
          children: createElement("div"),
        },
      ),
    );

    expect(markup).not.toContain("runtime-badge");
    expect(markup).not.toContain("本地演示");
    expect(markup).toContain("desktop-only-gate");
    expect(markup).toContain("app-desktop-content");
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("当前只支持电脑端浏览");
    expect(markup).toContain(String(DESKTOP_MIN_WIDTH));
    expect(markup).not.toContain("移动端导航");
    expect(markup).not.toContain("mobile-runtime-badge");

    // The global shell does not expose legacy project switching.
    expect(markup).not.toContain('aria-label="切换商品资料"');
    expect(markup).not.toContain('aria-label="移动端切换商品资料"');
  });
});
