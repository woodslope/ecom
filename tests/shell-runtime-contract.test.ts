import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell, DESKTOP_MIN_WIDTH } from "../src/components/AppShell";
import type { ProductProject } from "../src/domain/projects/types";

const project: ProductProject = {
  id: "project_01",
  name: "桌面切换测试",
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
  facts: {
    productName: "测试商品",
    category: "测试品类",
    brand: "",
    model: "",
    sku: "",
    targetAudience: "",
    description: "",
    sellingPoints: [],
    forbiddenClaims: [],
    specifications: {},
  },
};

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

    expect(markup).toContain("runtime-badge");
    expect(markup).toContain("runtime-badge-button");
    expect(markup).toContain("当前运行模式：演示引擎");
    expect(markup).toContain("打开设置切换 Demo / API");
    expect(markup).toContain("desktop-only-gate");
    expect(markup).toContain("当前只支持电脑端浏览");
    expect(markup).toContain(String(DESKTOP_MIN_WIDTH));
    expect(markup).not.toContain("移动端导航");
    expect(markup).not.toContain("mobile-runtime-badge");

    const projectMarkup = renderToStaticMarkup(
      createElement(AppShell, {
        activeItem: "amazon",
        onActiveItemChange: () => undefined,
        projects: [project],
        activeProject: project,
        onSelectProject: () => undefined,
        children: createElement("div"),
      }),
    );
    // Global top bar no longer hosts project switching; library list owns selection.
    expect(projectMarkup).not.toContain(project.name);
    expect(projectMarkup).not.toContain('aria-label="切换商品资料"');
    expect(projectMarkup).not.toContain('aria-label="移动端切换商品资料"');
    expect(projectMarkup).toContain("runtime-badge");
  });
});
