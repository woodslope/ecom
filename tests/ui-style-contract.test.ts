// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const guide = readFileSync(new URL("../UI_STYLE_GUIDE.md", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const platformWorkspace = readFileSync(
  new URL("../src/components/PlatformWorkspace.tsx", import.meta.url),
  "utf8",
);
const amazonSessionControls = readFileSync(
  new URL("../src/components/AmazonSessionControls.tsx", import.meta.url),
  "utf8",
);
const styleReferencePicker = readFileSync(
  new URL("../src/components/StyleReferencePicker.tsx", import.meta.url),
  "utf8",
);
const industryTemplateSelector = readFileSync(
  new URL("../src/components/IndustryTemplateSelector.tsx", import.meta.url),
  "utf8",
);

const commerceOpsTokens = {
  page: "#f3f5f7",
  shell: "#f3f5f7",
  surface: "#ffffff",
  "surface-soft": "#f0f3f6",
  text: "#14191f",
  "text-secondary": "#475569",
  "text-muted": "#62707e",
  "placeholder-text": "#8a96a3",
  primary: "#2563eb",
  "primary-hover": "#1d4ed8",
  "primary-soft": "#eaf1ff",
  success: "#0f8b6e",
  "success-text": "#0b735c",
  warning: "#c88719",
  danger: "#d0443a",
  "danger-text": "#b8322a",
  "focus-ring": "#3b82f6",
};

function cssTokenRaw(name: string): string | undefined {
  return styles.match(new RegExp(`--${name}:\\s*([^;]+);`, "i"))?.[1].trim().toLowerCase();
}

function cssToken(name: string, seen = new Set<string>()): string | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const value = cssTokenRaw(name);
  const alias = value?.match(/^var\((--[\w-]+)\)$/i)?.[1];
  return alias ? cssToken(alias.slice(2), seen) : value;
}

const guideTokenValues: Record<string, string> = {
  ...commerceOpsTokens,
  shell: "var(--page)",
  "placeholder-text": "var(--disabled-text)",
  ai: "var(--text-secondary)",
  "ai-soft": "var(--surface-soft)",
  "ai-border": "var(--border)",
  ink: "var(--rail)",
  "ink-text-muted": "var(--rail-muted)",
  "accent-warm-text": "var(--text)",
  "brand-mark-bg": "var(--primary-soft)",
};

const semanticAliases: Record<string, string> = {
  shell: "var(--page)",
  ai: "var(--text-secondary)",
  "ai-soft": "var(--surface-soft)",
  "ai-border": "var(--border)",
  ink: "var(--rail)",
  "ink-text-muted": "var(--rail-muted)",
  "accent-warm-text": "var(--text)",
  "brand-mark-bg": "var(--primary-soft)",
};

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3 || channels.some(Number.isNaN)) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("Commerce Ops visual contract", () => {
  it("uses one authoritative Commerce Ops token block", () => {
    expect(styles.match(/(^|\n):root\s*\{/g)).toHaveLength(1);
    for (const [name, value] of Object.entries(commerceOpsTokens)) {
      expect(cssToken(name), name).toBe(value);
      expect(guide.toLowerCase(), `${name} missing from UI_STYLE_GUIDE`).toContain(
        `\`--${name}\`: \`${guideTokenValues[name]}\``,
      );
    }
    for (const [name, value] of Object.entries(semanticAliases)) {
      expect(cssTokenRaw(name), name).toBe(value);
    }
    expect(cssToken("radius-panel")).toBe("8px");
    expect(cssToken("radius-control")).toBe("6px");
    expect(cssToken("rail-width")).toBe("72px");
    expect(styles).toContain("color-scheme: light");
    expect(styles).not.toContain("--rail-width-compact");
    expect(indexHtml).toContain('<meta name="theme-color" content="#20252b"');
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

  it("keeps repeated spacing on the semantic scale and selectors single-owned", () => {
    expect(styles).not.toMatch(
      /^\s*(?:gap|row-gap|column-gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?)\s*:[^;{}]*\b(?:4|8|12|16|20|24|32)px\b[^;{}]*;/m,
    );

    const duplicateSelectors = new Map<string, number>();
    const selectorPattern = /(^|[}])\s*([^@{}][^{}]*?)\s*\{/gm;
    for (const match of styles.matchAll(selectorPattern)) {
      const selector = match[2].trim().replace(/\s+/g, " ");
      if (!selector || selector.startsWith(":root") || selector === "*") continue;
      duplicateSelectors.set(selector, (duplicateSelectors.get(selector) ?? 0) + 1);
    }
    expect(duplicateSelectors.get("body")).toBe(2);
    expect([...duplicateSelectors.entries()].filter(([selector, count]) => count > 1 && ![
      "body",
    ].includes(selector))).toEqual([]);
  });

  it("keeps state text and keyboard focus above the contrast gates", () => {
    for (const background of ["page", "surface", "surface-soft"]) {
      expect(contrast(cssToken("text-muted")!, cssToken(background)!), `muted on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(cssToken("placeholder-text")!, cssToken("surface")!), "placeholder on surface").toBeGreaterThanOrEqual(3);
    expect(contrast(cssToken("text-secondary")!, cssToken("page")!), "secondary on page").toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("success-text")!, cssToken("success-soft")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("warning-text")!, cssToken("warning-soft")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("danger-text")!, cssToken("danger-soft")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("ink-text-muted")!, cssToken("rail")!), "rail text on rail").toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("ink-text-muted")!, cssToken("ink-soft")!), "rail text on dark surface").toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssToken("disabled-text")!, cssToken("disabled-surface")!), "disabled text is an explicit state exception").toBeLessThan(4.5);
    for (const background of ["surface", "page", "rail", "ink-soft"]) {
      expect(contrast(cssToken("focus-ring")!, cssToken(background)!), background).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the core workbench geometry at a single owner", () => {
    expect(styles.match(/^\.workbench-grid\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.slot-inspector\.slot-inspector--shell\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.amazon-session-controls\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.amazon-intake\s*\{/gm)).toHaveLength(1);
    expect(styles.match(/^\.workbench-grid--source-collapsed\s*\{/gm)).toHaveLength(1);
    expect(styles).toMatch(
      /\.workbench-grid--source-collapsed\s*\{[^}]*grid-template-columns:\s*minmax\(420px,\s*0\.82fr\)\s+minmax\(520px,\s*1\.18fr\)/s,
    );
    expect(styles).not.toMatch(/\.(?:overview|library)(?:[-_]|(?=[\s:{>,]))/);
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

  it("aligns business icon actions with secondary text buttons", () => {
    expect(styles).toMatch(
      /\.icon-button--secondary\s*\{[^}]*width:\s*var\(--control-height\)[^}]*color:\s*var\(--text\)[^}]*background:\s*var\(--surface\)[^}]*border-color:\s*var\(--border-strong\)/s,
    );
    expect(styles).toMatch(
      /\.icon-button--secondary:hover:not\(:disabled\)\s*\{[^}]*color:\s*var\(--primary-hover\)[^}]*background:\s*var\(--primary-soft\)[^}]*border-color:\s*var\(--primary-border\)/s,
    );
    expect(amazonSessionControls).not.toContain('className="icon-button--secondary"');
    expect(styleReferencePicker).toContain('className="icon-button--secondary"');
    expect(industryTemplateSelector).toContain('variant="secondary"');
    expect(industryTemplateSelector).toContain("管理模板");
    expect(styles).toMatch(/\.icon-button:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-soft\)/s);
    expect(styles).toContain(".style-reference-picker__linked");
    expect(amazonSessionControls).not.toContain("prompt-profile-select-row");
  });
});
