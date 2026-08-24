#!/usr/bin/env node
/**
 * Minimal frontend visual-consistency governance checks.
 * Contract: UI_STYLE_GUIDE.md §9–§12
 *
 * Run: node scripts/check-ui-governance.mjs
 * Exit 0 = pass, 1 = fail (prints every violation).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const stylesPath = join(root, "src/styles.css");
const componentsDir = join(root, "src/components");
const appTsx = join(root, "src/App.tsx");
const guidePath = join(root, "UI_STYLE_GUIDE.md");
const indexPath = join(root, "index.html");

/** @type {string[]} */
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function tokenValue(block, name) {
  return block.match(new RegExp(`--${name}:\\s*([^;]+);`, "i"))?.[1].trim().toLowerCase();
}

function relativeLuminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
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
  if (!/--rail-width:\s*72px/.test(tokenBlock)) {
    fail("styles.css top :root must set --rail-width: 72px (UI_STYLE_GUIDE §3).");
  }
  if (!/color-scheme:\s*light/.test(tokenBlock)) {
    fail("styles.css top :root must declare the single supported color-scheme: light.");
  }
  if (/--rail-width-compact\s*:/.test(css)) {
    fail("styles.css must use one 72px rail token; --rail-width-compact is a retired variant.");
  }
  if (/\.(?:app-frame|platform-rail)--compact(?:-rail)?\b/.test(css)) {
    fail("styles.css must not restore compact/non-compact rail variants.");
  }
  if (!/--font-page-title:\s*22px/.test(tokenBlock)) {
    fail("styles.css top :root must set --font-page-title: 22px (UI_STYLE_GUIDE §3).");
  }

  for (const [foreground, background, threshold, label] of [
    ["text-muted", "page", 4.5, "muted text on page"],
    ["text-muted", "surface", 4.5, "muted text on surface"],
    ["text-muted", "surface-soft", 4.5, "muted text on soft surface"],
    ["placeholder-text", "surface", 4.5, "placeholder text on surface"],
    ["text-secondary", "page", 4.5, "secondary text on page"],
    ["success-text", "success-soft", 4.5, "success status text"],
    ["warning-text", "warning-soft", 4.5, "warning status text"],
    ["danger-text", "danger-soft", 4.5, "danger status text"],
    ["ink-text-muted", "rail", 4.5, "rail text on rail"],
    ["ink-text-muted", "ink-soft", 4.5, "rail text on dark hover surface"],
    ["focus-ring", "surface", 3, "focus ring on surface"],
    ["focus-ring", "page", 3, "focus ring on page"],
    ["focus-ring", "rail", 3, "focus ring on rail"],
    ["focus-ring", "ink-soft", 3, "focus ring on dark hover surface"],
  ]) {
    const foregroundValue = tokenValue(tokenBlock, foreground);
    const backgroundValue = tokenValue(tokenBlock, background);
    const ratio = foregroundValue && backgroundValue
      ? contrastRatio(foregroundValue, backgroundValue)
      : null;
    if (ratio === null || ratio < threshold) {
      fail(
        `styles.css ${label} must reach ${threshold}:1 (${foreground} on ${background}; received ${ratio?.toFixed(2) ?? "non-hex or missing token"}).`,
      );
    }
  }

  // Typography and shape declarations must consume semantic tokens. The few
  // literal values below are structural exceptions documented in the guide.
  const governedCss = afterRoot;
  const directFontSizes = (governedCss.match(/font-size:\s*[^;]+;/g) ?? [])
    .filter((declaration) => !declaration.includes("var(--"));
  if (directFontSizes.length > 0) {
    fail(`business CSS contains hard-coded font-size declarations (${directFontSizes.join(", ")}). Use a typography token.`);
  }
  const directLineHeights = (governedCss.match(/line-height:\s*[^;]+;/g) ?? [])
    .filter((declaration) => !declaration.includes("var(--"))
    .filter((declaration) => !/line-height:\s*1\s*;/.test(declaration));
  if (directLineHeights.length > 0) {
    fail(`business CSS contains hard-coded line-height declarations (${directLineHeights.join(", ")}). Use a line-height token.`);
  }
  const directRadii = (governedCss.match(/border-radius:\s*[^;]+;/g) ?? [])
    .filter((declaration) => !declaration.includes("var(--"))
    .filter((declaration) => !/border-radius:\s*(?:0|50%|999px|inherit|0\s+2px\s+2px\s+0)\s*;/.test(declaration));
  if (directRadii.length > 0) {
    fail(`business CSS contains non-token border-radius declarations (${directRadii.join(", ")}). Use a radius token or document a structural exception.`);
  }
  const directShadows = (governedCss.match(/box-shadow:\s*[^;]+;/g) ?? [])
    .filter((declaration) => !declaration.includes("var(--"))
    .filter((declaration) => !/box-shadow:\s*(?:none|0\s+0\s+0\s+[23]px\s+var\(--primary-soft\))\s*;/.test(declaration));
  if (directShadows.length > 0) {
    fail(`business CSS contains non-token box-shadow declarations (${directShadows.join(", ")}). Use a shadow token or document a structural exception.`);
  }

  const typographyTokens = [...tokenBlock.matchAll(/(--(?:font|line)-[\w-]+)\s*:/g)].map((match) => match[1]);
  for (const token of new Set(typographyTokens)) {
    const references = [...governedCss.matchAll(new RegExp("var\\(" + token + "(?:[,)]|\\s)", "g"))];
    if (references.length === 0) {
      fail(`declared typography token ${token} has no CSS consumer; remove it or add a documented consumer.`);
    }
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
    ".amazon-intake",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = [...css.matchAll(new RegExp(`^${escaped}\\s*\\{`, "gm"))].length;
    if (count !== 1) {
      fail(`styles.css selector "${selector}" must have one core owner (found ${count}).`);
    }
  }

  const collapsedRules = css.match(/^\.workbench-grid--source-collapsed\s*\{[^}]*\}/gms) ?? [];
  if (
    collapsedRules.length !== 1 ||
    !/grid-template-columns:\s*minmax\(420px,\s*0\.82fr\)\s+minmax\(520px,\s*1\.18fr\)/.test(
      collapsedRules[0] ?? "",
    )
  ) {
    fail("styles.css must own one stable collapsed grid: slots 420px/0.82fr + inspector 520px/1.18fr.");
  }

  if (/\.(?:overview|library)(?:[-_]|(?=[\s:{>,]))/.test(css)) {
    fail("styles.css still contains retired overview/library selector families.");
  }
  for (const selectorFamily of [
    "amazon-workflow",
    "platform-product-picker",
    "platform-progress",
    "onboarding-overlay",
    "onboarding-card",
    "history-archive",
    "deposit-dialog",
    "deposit-form",
    "amazon-session-controls--embedded",
    "workbench-chrome__controls",
    "workbench-chrome__onboarding",
  ]) {
    if (css.includes(`.${selectorFamily}`)) {
      fail(`styles.css still contains retired selector family ".${selectorFamily}".`);
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
    "success-text": "#0b735c",
    warning: "#c88719",
    danger: "#d0443a",
    "danger-text": "#b8322a",
    "text-muted": "#62707e",
    "placeholder-text": "#62707e",
    "focus-ring": "#3b82f6",
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

  // Raw buttons are reserved for controls whose semantics are the domain object
  // itself: selection cards, version cards, preview thumbnails, and canvas tools.
  // Navigation, context actions, and file actions must use Button/IconButton.
  const rawButtonExceptions = new Map([
    ["src/components/SlotBoard.tsx", { label: "领域选择卡", count: 1, marker: "slot-card" }],
    ["src/components/VersionStrip.tsx", { label: "版本卡", count: 1, marker: "version-tile" }],
    ["src/components/IndustryTemplateSelector.tsx", { label: "领域选择卡", count: 2, marker: "industry-template-card" }],
    ["src/components/PromptAssetCenterDialog.tsx", { label: "Prompt 资产卡", count: 2, marker: "prompt-asset-card" }],
    ["src/components/AmazonMobilePreview.tsx", { label: "预览缩略图", count: 1, marker: "amazon-phone-preview__thumb" }],
    ["src/components/TaobaoMobilePreview.tsx", { label: "预览缩略图", count: 1, marker: "taobao-phone-preview__thumb" }],
    ["src/components/MaskEditorDialog.tsx", { label: "画布工具", count: null, marker: "mask-editor" }],
  ]);
  for (const file of files) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const source = read(file);
    const rawCount = (source.match(/<button\b/g) ?? []).length;
    if (rawCount === 0) continue;
    const exception = rawButtonExceptions.get(rel);
    if (!exception) {
      fail(`${rel}: raw <button> is outside the approved domain/card exceptions; use Button or IconButton.`);
      continue;
    }
    if (exception.count !== null && rawCount !== exception.count) {
      fail(`${rel}: expected ${exception.count} raw ${exception.label} button(s), found ${rawCount}; update the exception only with an explicit semantic review.`);
    }
    if (!source.includes(exception.marker)) {
      fail(`${rel}: raw button exception must retain the ${exception.label} marker "${exception.marker}".`);
    }
    if ((source.match(/type="button"/g) ?? []).length < rawCount) {
      fail(`${rel}: every approved raw button must declare type="button".`);
    }
  }

  const semanticSources = new Map([
    ["AmazonIntake.tsx", read(join(componentsDir, "AmazonIntake.tsx"))],
    ["AssetLibrary.tsx", read(join(componentsDir, "AssetLibrary.tsx"))],
    ["IndustryTemplateSelector.tsx", read(join(componentsDir, "IndustryTemplateSelector.tsx"))],
    ["ProductContextBar.tsx", read(join(componentsDir, "ProductContextBar.tsx"))],
    ["ProductionRunCard.tsx", read(join(componentsDir, "ProductionRunCard.tsx"))],
    ["LocalizedFactsReview.tsx", read(join(componentsDir, "LocalizedFactsReview.tsx"))],
    ["ExportPanel.tsx", read(join(componentsDir, "ExportPanel.tsx"))],
    ["ImageTools.tsx", read(join(componentsDir, "ImageTools.tsx"))],
    ["GenerationActions.tsx", read(join(componentsDir, "GenerationActions.tsx"))],
    ["PromptAssetCenterDialog.tsx", read(join(componentsDir, "PromptAssetCenterDialog.tsx"))],
    ["TaobaoIntake.tsx", read(join(componentsDir, "TaobaoIntake.tsx"))],
    ["SlotInspector.tsx", read(join(componentsDir, "SlotInspector.tsx"))],
    ["SettingsDialog.tsx", read(join(componentsDir, "SettingsDialog.tsx"))],
    ["AppShell.tsx", read(join(componentsDir, "AppShell.tsx"))],
  ]);
  const inputContract = /className="visually-hidden-input"[\s\S]*?tabIndex=\{-1\}[\s\S]*?aria-hidden="true"/;
  for (const name of ["AmazonIntake.tsx", "AssetLibrary.tsx"]) {
    if (!inputContract.test(semanticSources.get(name))) {
      fail(`${name}: programmatic visually-hidden input must use tabIndex={-1} and aria-hidden="true".`);
    }
  }
  const templateSource = semanticSources.get("IndustryTemplateSelector.tsx");
  if ((templateSource.match(/aria-pressed=\{selectedId ===/g) ?? []).length < 2) {
    fail("IndustryTemplateSelector.tsx: every template selection card must expose aria-pressed.");
  }
  const contextSource = semanticSources.get("ProductContextBar.tsx");
  if (contextSource.includes("aria-label={detailLabel}") || !contextSource.includes("${taskName}，${detailLabel}")) {
    fail("ProductContextBar.tsx: detail action name must retain the current task name in its accessible label.");
  }
  const runSource = semanticSources.get("ProductionRunCard.tsx");
  if (!runSource.includes("aria-controls={detailsId}") || !runSource.includes("id={detailsId}")) {
    fail("ProductionRunCard.tsx: history toggle and details region must share a stable aria-controls/id relationship.");
  }
  if (semanticSources.get("LocalizedFactsReview.tsx").includes('live="polite"')) {
    fail("LocalizedFactsReview.tsx: static explanatory StatusMessage must keep live=\"off\".");
  }
  for (const [name, needles] of [
    ["ExportPanel.tsx", ["aria-describedby={disabledReason ? disabledReasonId : undefined}", "export-panel__disabled-reason"]],
    ["ImageTools.tsx", ["aria-describedby={!editingSupported && showEditingHint ? editingReasonId : undefined}", "image-tools__hint"]],
    ["GenerationActions.tsx", ["aria-describedby={disabledReason ? disabledReasonId : undefined}", "generation-actions__hint"]],
    ["PromptAssetCenterDialog.tsx", ["aria-describedby={aiRewriteDisabledReason ? aiRewriteReasonId : undefined}", "prompt-asset-center__disabled-reason"]],
    ["TaobaoIntake.tsx", ["aria-describedby={reanalyzeDisabledReason ? reanalyzeReasonId : undefined}", "taobao-analysis-summary__reanalyze-reason"]],
    ["SlotInspector.tsx", ["aria-describedby={saveDisabledReason ? saveDisabledReasonId : undefined}", "slot-inspector__disabled-reason"]],
  ]) {
    const source = semanticSources.get(name);
    if (needles.some((needle) => !source.includes(needle))) {
      fail(`${name}: disabled controls must expose a visible reason and associate it with aria-describedby.`);
    }
  }
  if (semanticSources.get("SettingsDialog.tsx").includes("connectionMessage")) {
    fail("SettingsDialog.tsx: retired connectionMessage prop must stay removed.");
  }
  if (semanticSources.get("AppShell.tsx").includes("context-bar")) {
    fail("AppShell.tsx: retired hidden context-bar test hook must stay removed.");
  }
}

// --- 3. Workbench module columns must use Panel, not hand-written panel shells ---
{
  const workspace = read(join(componentsDir, "PlatformWorkspace.tsx"));
  const shell = read(join(componentsDir, "AppShell.tsx"));
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

  const workflowShell = read(join(componentsDir, "PlatformWorkflowShell.tsx"));
  if (!workflowShell.includes("<WorkflowStepper")) {
    fail("PlatformWorkflowShell.tsx must own the shared WorkflowStepper for platform progress.");
  }
  for (const fileName of ["AmazonIntake.tsx", "TaobaoIntake.tsx", "PlatformWorkspace.tsx"]) {
    const component = read(join(componentsDir, fileName));
    if (!component.includes("PlatformWorkflowShell")) {
      fail(`${fileName} must render through the shared PlatformWorkflowShell for platform progress.`);
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
  for (const needle of [
    "createPortal(layer, root)",
    "desktopContent.inert = gateActive || modalActive",
    "layer.inert = !active",
    'live = "off"',
  ]) {
    if (!ui.includes(needle)) {
      fail(`ui.tsx missing shared modal/live-region governance hook ${JSON.stringify(needle)}.`);
    }
  }
  const app = read(appTsx);
  if (!app.includes('variant="sidebar"') || app.includes("platform-history-backdrop")) {
    fail("App.tsx history must use the shared sidebar Dialog without a private backdrop owner.");
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

  for (const needle of ["basePresetId", "onBasePresetChange", 'aria-label="视觉参考"']) {
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

// --- 8. Current UI owners remain explicit and non-duplicated ---
{
  const shell = read(join(componentsDir, "AppShell.tsx"));
  const rail = read(join(componentsDir, "PlatformRail.tsx"));
  const workspace = read(join(componentsDir, "PlatformWorkspace.tsx"));
  const amazonIntake = read(join(componentsDir, "AmazonIntake.tsx"));
  const taobaoIntake = read(join(componentsDir, "TaobaoIntake.tsx"));
  const slotBoard = read(join(componentsDir, "SlotBoard.tsx"));
  const platformTypes = read(join(root, "src/domain/platforms/types.ts"));
  const index = read(indexPath);

  for (const needle of ["runtimeMode", "runtime-badge", 'onChange("settings")']) {
    if (!rail.includes(needle)) {
      fail(`PlatformRail.tsx missing always-visible runtime ownership hook ${JSON.stringify(needle)}.`);
    }
  }
  if (!shell.includes("runtimeMode={runtimeSettings.mode}")) {
    fail("AppShell.tsx must pass the active runtime mode to PlatformRail.");
  }
  if (workspace.includes("workflowAction")) {
    fail("PlatformWorkspace.tsx must not duplicate generation/export as a top-chrome workflowAction.");
  }
  for (const [name, source] of [
    ["AmazonIntake.tsx", amazonIntake],
    ["TaobaoIntake.tsx", taobaoIntake],
  ]) {
    if (source.includes('className="planning-input-requirement visually-hidden"')) {
      fail(`${name} must keep its empty-input requirement visible beside the disabled action.`);
    }
  }
  if (!platformTypes.includes("readonly uiLabel?: string")) {
    fail("PlatformSlotRule must expose optional uiLabel without replacing its canonical label.");
  }
  if (slotBoard.includes("<small>{rule.key}</small>")) {
    fail("SlotBoard.tsx must not duplicate the slot key inside an empty thumbnail.");
  }
  if (!index.includes('<meta name="theme-color" content="#20252b"')) {
    fail("index.html must keep the single light-theme browser chrome color at #20252b.");
  }
}

// --- 9. Retired zero-consumer UI surfaces must stay removed ---
{
  for (const fileName of ["PlatformProgress.tsx", "GlobalAssetUpload.tsx"]) {
    if (existsSync(join(componentsDir, fileName))) {
      fail(`${fileName} is a retired zero-consumer component and must stay removed.`);
    }
  }
  const shell = read(join(componentsDir, "AppShell.tsx"));
  const workspace = read(join(componentsDir, "PlatformWorkspace.tsx"));
  const amazonWorkspace = read(join(componentsDir, "AmazonWorkspace.tsx"));
  const amazonIntake = read(join(componentsDir, "AmazonIntake.tsx"));
  const taobaoIntake = read(join(componentsDir, "TaobaoIntake.tsx"));
  for (const legacyProp of [
    "onOpenHistory",
    "onOpenLibrary",
    "onOpenProductPicker",
    "onSyncListingFacts",
    "onCreateProject",
    "onSelectProject",
    "onSettingsOpenChange",
  ]) {
    if ([shell, workspace, amazonWorkspace, amazonIntake, taobaoIntake].some((source) => source.includes(legacyProp))) {
      fail(`Retired zero-consumer compatibility prop ${legacyProp} must stay removed.`);
    }
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
