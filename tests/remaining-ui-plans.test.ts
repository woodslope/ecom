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
  it("uses compact navigation only for a planned production workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformRail, {
        activeItem: "amazon",
        compact: true,
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain("platform-rail--compact");
    expect(markup).toContain('data-compact="true"');
    expect(appSource).toContain('activeItem === "amazon"');
    expect(appSource).toContain("Boolean(activeAmazonSession?.plan)");
    expect(appSource).toContain("Boolean(activeTaobaoSession?.plan)");
    expect(styles).toContain(".app-frame--compact-rail");
    expect(styles).toContain("--rail-width-compact: 72px");
  });

  it("opens a scoped Prompt asset center from the selected slot inspector", () => {
    expect(slotInspectorSource).toContain("PromptAssetCenterDialog");
    expect(slotInspectorSource).toContain("Prompt 资产");
    expect(slotInspectorSource).toContain('onCopilotCommand("rewrite-prompt")');
    expect(styles).toContain(".prompt-asset-center");
    expect(styles).toContain(".prompt-asset-center-dialog.dialog--sidebar");
  });
});
