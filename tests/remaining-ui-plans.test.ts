/// <reference types="vite/client" />

import { createElement } from "react";
// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import slotInspectorSource from "../src/components/SlotInspector.tsx?raw";
import { PlatformRail } from "../src/components/PlatformRail";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("reference-image follow-up plans", () => {
  it("uses one narrow navigation contract for the platform rail", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformRail, {
        activeItem: "amazon",
        runtimeMode: "api",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('class="platform-rail"');
    expect(markup).not.toContain("platform-rail--compact");
    expect(markup).toContain("runtime-badge");
    expect(markup).toContain("API");
    expect(appSource).toContain('activeItem === "amazon"');
    expect(appSource).not.toContain("compactRail");
    expect(appSource).toContain("platform-page-layout");
    expect(styles).not.toContain(".app-frame--compact-rail");
    expect(styles).toContain("--rail-width: 72px");
    expect(styles).not.toContain("--rail-width-compact");
  });

  it("opens a scoped Prompt asset center from the selected slot inspector", () => {
    expect(slotInspectorSource).toContain("PromptAssetCenterDialog");
    expect(slotInspectorSource).toContain("Prompt 资产");
    expect(slotInspectorSource).toContain('onCopilotCommand("rewrite-prompt")');
    expect(styles).toContain(".prompt-asset-center");
    expect(styles).toContain(".prompt-asset-center-dialog.dialog--sidebar");
  });
});
