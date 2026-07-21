// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const guide = readFileSync(new URL("../UI_STYLE_GUIDE.md", import.meta.url), "utf8");
const platformWorkspace = readFileSync(
  new URL("../src/components/PlatformWorkspace.tsx", import.meta.url),
  "utf8",
);

const commerceOpsTokens = {
  page: "#f3f5f7",
  shell: "#f3f5f7",
  surface: "#ffffff",
  "surface-soft": "#f0f3f6",
  text: "#14191f",
  "text-secondary": "#475569",
  primary: "#2563eb",
  "primary-hover": "#1d4ed8",
  "primary-soft": "#eaf1ff",
  success: "#0f8b6e",
  warning: "#c88719",
  danger: "#d0443a",
};

function cssToken(name: string): string | undefined {
  return styles.match(new RegExp(`--${name}:\\s*([^;]+);`, "i"))?.[1].trim().toLowerCase();
}

describe("Commerce Ops visual contract", () => {
  it("uses one authoritative Commerce Ops token block", () => {
    expect(styles.match(/(^|\n):root\s*\{/g)).toHaveLength(1);
    for (const [name, value] of Object.entries(commerceOpsTokens)) {
      expect(cssToken(name), name).toBe(value);
      expect(guide.toLowerCase(), `${name} missing from UI_STYLE_GUIDE`).toContain(
        `\`--${name}\`: \`${value}\``,
      );
    }
    expect(cssToken("radius-panel")).toBe("8px");
    expect(cssToken("radius-control")).toBe("6px");
    expect(cssToken("rail-width")).toBe("208px");
  });

  it("contains no malformed var declarations or legacy override sections", () => {
    expect(styles).not.toMatch(/:\s*var\(--[\w-]+\)\)\s*;/);
    for (const legacySection of [
      "AIS-aligned Amazon session controls",
      "Production console refresh",
      "Workbench shell v1",
      "Final inspector pass",
    ]) {
      expect(styles, legacySection).not.toContain(legacySection);
    }
  });

  it("keeps the core workbench geometry at a single owner", () => {
    expect(styles.match(/^\.workbench-grid\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.slot-inspector\.slot-inspector--shell\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.amazon-session-controls\s*\{/gm)).toHaveLength(1);
  });

  it("does not reference undeclared visual tokens", () => {
    const declarations = new Set(
      [...styles.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
    );
    const references = new Set(
      [...styles.matchAll(/var\((--[\w-]+)(?:,\s*[^)]+)?\)/g)].map((match) => match[1]),
    );

    expect([...references].filter((token) => !declarations.has(token))).toEqual([]);
  });

  it("uses one production shell for Amazon and Taobao workspaces", () => {
    expect(platformWorkspace).toContain(
      'className="platform-workspace-view platform-workspace-view--production-shell"',
    );
    expect(styles).toContain(".platform-workspace-view--production-shell > .workbench-grid");
    expect(styles).not.toContain(".platform-workspace-view--amazon-shell");
  });
});
