/// <reference types="vite/client" />

// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import appShellSource from "../src/components/AppShell.tsx?raw";
import platformWorkspaceSource from "../src/components/PlatformWorkspace.tsx?raw";
import settingsDialogSource from "../src/components/SettingsDialog.tsx?raw";
import slotInspectorSource from "../src/components/SlotInspector.tsx?raw";

import {
  ActionBar,
  Button,
  Dialog,
  Field,
  IconButton,
  MediaSlot,
  SegmentedControl,
  Select,
  StatusChip,
  StatusMessage,
  Tooltip,
} from "../src/components/ui";

describe("shared workbench primitives", () => {
  it("renders the Commerce Ops control and state families", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(Button, { loading: true, loadingLabel: "保存中" }, "保存"),
        createElement(Button, { size: "compact", disabled: true }, "禁用"),
        createElement(StatusChip, { tone: "mode" }, "Demo"),
        createElement(StatusChip, { tone: "info" }, "已选择"),
        createElement(SegmentedControl, {
          ariaLabel: "图片类型",
          value: "listing",
          options: [
            { value: "listing", label: "Listing 图" },
            { value: "aplus", label: "A+ 图", disabled: true },
          ],
          onChange: () => undefined,
        }),
        createElement(MediaSlot, {
          aspectRatio: "1 / 1",
          state: "loading",
          alt: "生成预览",
        }),
        createElement(MediaSlot, {
          aspectRatio: "1 / 1",
          state: "error",
          alt: "生成预览",
          onRetry: () => undefined,
        }),
        createElement(ActionBar, {
          primary: createElement(Button, null, "生成图片"),
          secondary: createElement(Button, { variant: "secondary" }, "保存"),
          status: createElement(StatusChip, { tone: "neutral" }, "待生成"),
        }),
      ),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("保存中");
    expect(markup).toContain("status-chip--mode");
    expect(markup).toContain("status-chip--info");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("segmented-control__option--selected");
    expect(markup).toContain("media-slot--loading");
    expect(markup).toContain("media-slot--error");
    expect(markup).toContain("重试");
    expect(markup).toContain("action-bar__primary");
    expect(markup).toContain("action-bar__secondary");
  });

  it("renders reusable field, select, button, dialog, tooltip, and status contracts", () => {
    const field = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "商品名称",
          hint: "按商品事实填写",
          children: createElement("input", { name: "productName" }),
        },
      ),
    );
    const dialog = renderToStaticMarkup(
      createElement(Dialog, {
        open: true,
        title: "连接与生成模式",
        eyebrow: "运行设置",
        variant: "sidebar",
        onClose: () => undefined,
        children: createElement("p", null, "设置内容"),
      }),
    );
    const tooltip = renderToStaticMarkup(
      createElement(
        Tooltip,
        {
          label: "设置",
          children: createElement("button", { type: "button" }, "打开"),
        },
      ),
    );
    const status = renderToStaticMarkup(
      createElement(StatusMessage, { tone: "warning" }, "当前为演示引擎"),
    );
    const buttons = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(Button, { size: "compact", disabled: true }, "创建"),
        createElement(IconButton, { label: "设置", disabled: true, children: "S" }),
        createElement(
          Select,
          { "aria-label": "运行模式", disabled: true, value: "demo", onChange: () => undefined },
          createElement("option", { value: "demo" }, "演示模式"),
        ),
      ),
    );

    expect(field).toContain("field__hint");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("dialog--sidebar");
    expect(dialog).toContain("关闭侧栏");
    expect(tooltip).toContain('data-tooltip="设置"');
    expect(status).toContain("status-message--warning");
    expect(buttons.match(/type="button"/g)).toHaveLength(2);
    expect(buttons).toContain("button--compact");
    expect(buttons).toContain("select-control");
    expect(buttons).toContain("select-control__input");
    expect(buttons).toContain("select-control__icon");
    expect(buttons.match(/disabled=""/g)).toHaveLength(3);
  });

  it("protects shared select, compact size, and disabled visual contracts", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(appShellSource.match(/<Select\b/g) ?? []).toHaveLength(0);
    expect(settingsDialogSource.match(/<SegmentedControl\b/g)).toHaveLength(2);
    expect(appShellSource).not.toMatch(/<select\b/);
    expect(settingsDialogSource).not.toMatch(/<select\b/);

    expect(appSource).toContain('size="compact"');
    expect(platformWorkspaceSource).toContain('size="compact"');
    expect(slotInspectorSource.match(/size="compact"/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(styles).toMatch(/--control-height-compact:\s*32px/);
    expect(styles).toMatch(/\.button--compact\s*{[^}]*min-height:\s*var\(--control-height-compact\)/);
    expect(styles).toMatch(/--desktop-min-width:\s*900px/);
    expect(styles).toMatch(/@media \(max-width: 899px\)[\s\S]*?\.desktop-only-gate/);
    expect(styles).toMatch(
      /@media \(min-width: 900px\) and \(max-width: 1099px\)[\s\S]*?\.workbench-grid:not\(\.workbench-grid--guided\)/,
    );

    expect(styles).toMatch(/\.icon-button:disabled\s*{[^}]*var\(--disabled-text\)/);
    expect(styles).toMatch(/select\.select-control__input:disabled\s*{[^}]*var\(--disabled-surface\)/);
    expect(styles).toMatch(/\.field input:disabled,[\s\S]*?\.field textarea:disabled\s*{[^}]*var\(--disabled-border\)/);
    expect(styles).toMatch(/\.version-tile:disabled\s*{[^}]*var\(--disabled-border\)/);
    expect(styles).toMatch(/--font-page-title:\s*22px/);
    expect(styles).toMatch(/--font-body:\s*13px/);
    expect(styles).toMatch(/--font-label:\s*12px/);
    expect(styles).toMatch(/--font-caption:\s*11px/);
    expect(styles).toMatch(/--radius-shell:\s*0/);
    expect(styles).toMatch(/--shell-shadow:\s*none/);
    expect(styles).toMatch(/--primary:\s*#2563eb/i);
    expect(styles).toMatch(/--rail-width:\s*208px/);
    expect(styles).toMatch(/--ink-elevated:\s*#2a3037/i);
    expect(styles).toMatch(/\.app-frame\s*{[^}]*width:\s*100%/);
    expect(styles).toMatch(/\.app-frame\s*{[^}]*height:\s*100vh/);
    // UI_STYLE_GUIDE §3 desktop workbench columns
    expect(styles).toMatch(
      /\.workbench-grid\s*{[^}]*minmax\(290px,\s*0\.82fr\)\s+minmax\(340px,\s*1\.06fr\)\s+minmax\(320px,\s*0\.96fr\)/,
    );
    expect(styles).toMatch(/\.overview-top-grid\s*{/);
    expect(styles).toMatch(/\.overview-next-action\s*{/);
    expect(styles).toMatch(/workspace:has\(\.platform-workspace-view\)/);
  });

  it("keeps the workbench skeleton on shared Panel modules", () => {
    expect(platformWorkspaceSource).toContain("<Panel");
    expect(platformWorkspaceSource).toContain("hideHeader");
    expect(platformWorkspaceSource).toContain("workbench-panel--inspector-filled");
    expect(platformWorkspaceSource).toContain("workbench-panel--slots");
    expect(platformWorkspaceSource).not.toMatch(/<section[^>]*className=["'`][^"'`]*\bpanel\b/);
    expect(appShellSource).toContain("app-frame");
    expect(appShellSource).toContain("workspace");
    expect(appShellSource).toContain("desktop-only-gate");
    expect(appShellSource).toContain("PlatformRail");
  });

  it("keeps slot details under one inspector view owner", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(slotInspectorSource).toContain("<SegmentedControl");
    expect(slotInspectorSource).toContain('ariaLabel="槽位检查视图"');
    expect(slotInspectorSource).toContain('hidden={activePane !== "versions"}');
    expect(slotInspectorSource).toContain('hidden={activePane !== "checks"}');
    expect(slotInspectorSource).toContain('hidden={activePane !== "copilot"}');
    expect(slotInspectorSource).toContain("disabled={submitting || draftDirty}");
    expect(slotInspectorSource).not.toContain("inspector-section__toggle");
    expect(slotInspectorSource).not.toContain("slot-inspector__strategy-toggle");
    expect(styles).toContain(".slot-inspector__views.segmented-control");
  });

});
