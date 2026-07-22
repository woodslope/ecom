#!/usr/bin/env node
/**
 * Minimal frontend visual-consistency governance checks.
 * Contract: UI_STYLE_GUIDE.md §9–§12
 *
 * Run: node scripts/check-ui-governance.mjs
 * Exit 0 = pass, 1 = fail (prints every violation).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const stylesPath = join(root, "src/styles.css");
const componentsDir = join(root, "src/components");
const appTsx = join(root, "src/App.tsx");
const guidePath = join(root, "UI_STYLE_GUIDE.md");

/** @type {string[]} */
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function walkTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsx(full, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// --- 1. Exactly one :root token block in styles.css ---
{
  const css = read(stylesPath);
  const rootMatches = css.match(/(^|\n):root\s*\{/g) ?? [];
  if (rootMatches.length !== 1) {
    fail(
      `styles.css must contain exactly one ":root {" token block (found ${rootMatches.length}). See UI_STYLE_GUIDE §9 / §11.`,
    );
  }

  const firstRoot = css.indexOf(":root");
  const brace = css.indexOf("{", firstRoot);
  let depth = 0;
  let firstClose = -1;
  for (let j = brace; j < css.length; j += 1) {
    if (css[j] === "{") depth += 1;
    else if (css[j] === "}") {
      depth -= 1;
      if (depth === 0) {
        firstClose = j;
        break;
      }
    }
  }

  // No later re-assignment of core brand tokens outside the first :root block.
  // Match custom-property declarations only (not .button--primary:hover class names).
  const afterRoot = firstClose >= 0 ? css.slice(firstClose + 1) : css;
  const tokenReassign =
    /(?:^|[\s;{])(--(?:page|shell|surface|primary|primary-hover|ai|rail|rail-width|font-page-title|font-body))\s*:/gm;
  const reassigned = [...afterRoot.matchAll(tokenReassign)].map((m) => m[1]);
  if (reassigned.length > 0) {
    fail(
      `styles.css re-declares core tokens after the top :root block (${[...new Set(reassigned)].join(
        ", ",
      )}). Move values into the single :root or use component rules without token reassignment.`,
    );
  }

  // Guide-aligned Commerce Ops accent.
  const tokenBlock = firstClose >= 0 ? css.slice(firstRoot, firstClose + 1) : "";
  if (!/--primary:\s*#2563eb/i.test(tokenBlock)) {
    fail("styles.css top :root must set --primary: #2563eb (UI_STYLE_GUIDE §3).");
  }
  if (!/--rail-width:\s*208px/.test(tokenBlock)) {
    fail("styles.css top :root must set --rail-width: 208px (UI_STYLE_GUIDE §3).");
  }
  if (!/--font-page-title:\s*22px/.test(tokenBlock)) {
    fail("styles.css top :root must set --font-page-title: 22px (UI_STYLE_GUIDE §3).");
  }

  if (/:\s*var\(--[\w-]+\)\)\s*;/.test(css)) {
    fail('styles.css contains a malformed declaration such as "var(--token))".');
  }

  for (const legacySection of [
    "AIS-aligned Amazon session controls",
    "Production console refresh",
    "Workbench shell v1",
    "Final inspector pass",
  ]) {
    if (css.includes(legacySection)) {
      fail(`styles.css still contains legacy override section "${legacySection}".`);
    }
  }

  for (const selector of [
    ".workbench-grid",
    ".slot-inspector.slot-inspector--shell",
    ".amazon-session-controls",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = [...css.matchAll(new RegExp(`^${escaped}\\s*\\{`, "gm"))].length;
    if (count !== 1) {
      fail(`styles.css selector "${selector}" must have one core owner (found ${count}).`);
    }
  }

  const afterTokens = firstClose >= 0 ? css.slice(firstClose + 1) : css;
  const brandLiterals = afterTokens.match(/#(?:2563eb|1d4ed8|eaf1ff|9f4e25|7e391b|f6e6dc|e6c1ad)\b/gi) ?? [];
  if (brandLiterals.length > 0) {
    fail(`styles.css contains brand color literals outside :root (${[...new Set(brandLiterals)].join(", ")}).`);
  }

  const guide = read(guidePath).toLowerCase();
  for (const [name, value] of Object.entries({
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
  })) {
    if (!guide.includes(`\`--${name}\`: \`${value}\``)) {
      fail(`UI_STYLE_GUIDE.md token --${name} must match styles.css (${value}).`);
    }
  }
}

// --- 2. Business views must not assemble button class strings ---
{
  const files = [...walkTsx(componentsDir), appTsx].filter((p) => !p.endsWith(`${join("components", "ui.tsx")}`));
  const banned = /className=\{?[`'"][^`'"]*\bbutton--(?:primary|secondary|quiet|danger|normal|compact)\b/;
  const bannedRaw = /["'`]button button--/;
  for (const file of files) {
    const text = read(file);
    const rel = relative(root, file);
    if (banned.test(text) || bannedRaw.test(text)) {
      fail(
        `${rel}: do not assemble "button button--*" class strings; use <Button> from ui.tsx (UI_STYLE_GUIDE §11).`,
      );
    }
  }
}

// --- 3. Workbench module columns must use Panel, not hand-written panel shells ---
{
  const workspace = read(join(componentsDir, "PlatformWorkspace.tsx"));
  if (/<section[^>]*className=["'`][^"'`]*\bpanel\b/.test(workspace)) {
    fail(
      "PlatformWorkspace.tsx: hand-written <section class=\"panel…\"> is forbidden; use <Panel> (UI_STYLE_GUIDE §9).",
    );
  }
  if (!workspace.includes("hideHeader")) {
    fail(
      "PlatformWorkspace.tsx: filled inspector must use Panel hideHeader so empty/filled share one shell path.",
    );
  }
  const filledPanel =
    /<Panel[\s\S]*?workbench-panel--inspector-filled[\s\S]*?>/.test(workspace) ||
    /workbench-panel--inspector-filled[\s\S]*?hideHeader/.test(workspace) ||
    /hideHeader[\s\S]*?workbench-panel--inspector-filled/.test(workspace);
  if (!filledPanel) {
    fail(
      "PlatformWorkspace.tsx: filled inspector must render through <Panel className=\"…inspector-filled\">.",
    );
  }
}

// --- 4. Skeleton ownership hooks remain present ---
{
  const shell = read(join(componentsDir, "AppShell.tsx"));
  for (const needle of ["app-frame", "workspace", "desktop-only-gate", "PlatformRail"]) {
    if (!shell.includes(needle)) {
      fail(`AppShell.tsx missing skeleton hook "${needle}".`);
    }
  }
  const workspace = read(join(componentsDir, "PlatformWorkspace.tsx"));
  for (const needle of [
    "workbench-grid",
    "workbench-panel--slots",
    "workbench-panel--inspector",
    "platform-workspace-view",
  ]) {
    if (!workspace.includes(needle)) {
      fail(`PlatformWorkspace.tsx missing skeleton hook "${needle}".`);
    }
  }

  const css = read(stylesPath);
  for (const legacyHook of ["mobilePane", "data-mobile-pane", "mobile-workbench-tabs"]) {
    if (workspace.includes(legacyHook) || css.includes(legacyHook)) {
      fail(
        `Legacy mobile workbench hook "${legacyHook}" must stay removed; 899px and below use the desktop-only gate.`,
      );
    }
  }

  for (const fileName of ["AmazonIntake.tsx", "TaobaoIntake.tsx", "PlatformWorkspace.tsx"]) {
    const component = read(join(componentsDir, fileName));
    if (!component.includes("<WorkflowStepper")) {
      fail(`${fileName} must use the shared WorkflowStepper for platform progress.`);
    }
  }
}

// --- 5. Cross-platform product context and dense-detail ownership ---
{
  const ui = read(join(componentsDir, "ui.tsx"));
  const amazonWorkspace = read(join(componentsDir, "AmazonWorkspace.tsx"));
  const taobaoWorkspace = read(join(componentsDir, "TaobaoWorkspace.tsx"));
  const amazonIntake = read(join(componentsDir, "AmazonIntake.tsx"));
  const taobaoIntake = read(join(componentsDir, "TaobaoIntake.tsx"));
  const css = read(stylesPath);

  for (const [name, source] of [
    ["AmazonWorkspace.tsx", amazonWorkspace],
    ["TaobaoWorkspace.tsx", taobaoWorkspace],
  ]) {
    if (!source.includes("<ProductContextBar")) {
      fail(`${name} must render the shared ProductContextBar in preparation and production states.`);
    }
  }

  for (const [name, source] of [
    ["AmazonIntake.tsx", amazonIntake],
    ["TaobaoIntake.tsx", taobaoIntake],
  ]) {
    if (source.includes("切换商品")) {
      fail(`${name} must not duplicate product switching owned by ProductContextBar.`);
    }
  }

  if (!ui.includes('variant?: "modal" | "sidebar"')) {
    fail("ui.tsx Dialog must own the shared sidebar variant for dense workspace details.");
  }
  if (!css.includes(".dialog.dialog--sidebar")) {
    fail("styles.css must own shared sidebar Dialog geometry.");
  }
}

// --- 6. Slot inspector has one detail-view owner ---
{
  const inspector = read(join(componentsDir, "SlotInspector.tsx"));
  const css = read(stylesPath);

  for (const needle of [
    "<SegmentedControl",
    'ariaLabel="槽位检查视图"',
    'hidden={activePane !== "versions"}',
    'hidden={activePane !== "checks"}',
    'hidden={activePane !== "copilot"}',
    "disabled={submitting || draftDirty}",
  ]) {
    if (!inspector.includes(needle)) {
      fail(`SlotInspector.tsx missing the single-view ownership hook ${JSON.stringify(needle)}.`);
    }
  }

  for (const legacyHook of ["inspector-section__toggle", "slot-inspector__strategy-toggle"]) {
    if (inspector.includes(legacyHook) || css.includes(`.${legacyHook}`)) {
      fail(`Legacy SlotInspector expansion owner "${legacyHook}" must stay removed.`);
    }
  }

  if (!css.includes(".slot-inspector__views.segmented-control")) {
    fail("styles.css must own the four-view SlotInspector switcher geometry.");
  }
}

// --- 7. Amazon A+ and style configuration keep one stable owner ---
{
  const controls = read(join(componentsDir, "AmazonSessionControls.tsx"));
  const intake = read(join(componentsDir, "AmazonIntake.tsx"));
  const stylePicker = read(join(componentsDir, "StyleReferencePicker.tsx"));
  const styleEditor = read(join(componentsDir, "StyleReferenceEditorDialog.tsx"));

  for (const needle of [
    'className="aplus-module-summary"',
    "moduleDraft",
    'title="编排 A+ 模块"',
    "应用编排",
  ]) {
    if (!controls.includes(needle)) {
      fail(`AmazonSessionControls.tsx missing staged A+ module ownership hook ${JSON.stringify(needle)}.`);
    }
  }
  if (controls.includes("aplus-module-readonly")) {
    fail("AmazonSessionControls.tsx must not switch A+ module ownership to a plan-only inline variant.");
  }

  for (const needle of ["basePresetId", "onBasePresetChange", 'aria-label="附加风格板"']) {
    if (!stylePicker.includes(needle)) {
      fail(`StyleReferencePicker.tsx missing style ownership hook ${JSON.stringify(needle)}.`);
    }
  }
  if (!intake.includes('setSelectedStyleReferenceId(`preset:${next.stylePresetId}`)')) {
    fail("AmazonIntake.tsx must keep built-in style-board selection synchronized with the base preset.");
  }
  for (const legacyCopy of ["隐藏风格参考图", "编辑为我的风格", "编辑我的风格"]) {
    if (stylePicker.includes(legacyCopy) || styleEditor.includes(legacyCopy)) {
      fail(`Amazon style configuration still contains ambiguous legacy copy ${JSON.stringify(legacyCopy)}.`);
    }
  }
  if (!styleEditor.includes("保存到当前商品")) {
    fail("StyleReferenceEditorDialog.tsx must name the persistence scope in its save action.");
  }
}

// --- Report ---
if (failures.length === 0) {
  console.log("UI governance checks passed (token / primitives / skeleton).");
  process.exit(0);
}

console.error(`UI governance checks failed (${failures.length}):\n`);
for (const item of failures) {
  console.error(`  • ${item}`);
}
console.error("\nSee UI_STYLE_GUIDE.md §9–§12.");
process.exit(1);
