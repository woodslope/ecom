/// <reference types="vite/client" />

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import platformProductionViewSource from "../src/components/PlatformProductionView.tsx?raw";
import { PlatformRail } from "../src/components/PlatformRail";
import { styles } from "./fixtures/style-source";

describe("reference-image follow-up plans", () => {
  it("uses one narrow navigation contract for the platform rail", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformRail, {
        activeItem: "amazon",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('class="platform-rail"');
    expect(markup).not.toContain("platform-rail--compact");
    expect(markup).toContain('aria-label="设置"');
    expect(markup).not.toContain("runtime-badge");
    expect(platformProductionViewSource).toContain('activeItem === "amazon"');
    expect(appSource).not.toContain("compactRail");
    expect(platformProductionViewSource).toContain("platform-page-layout");
    expect(styles).not.toContain(".app-frame--compact-rail");
    expect(styles).toContain("--rail-width: 72px");
    expect(styles).not.toContain("--rail-width-compact");
  });

});
