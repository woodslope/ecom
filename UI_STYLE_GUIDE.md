# Ecom UI Style Guide

> This file is the project-level visual contract. Exact values belong here and in the implementation. Xiaobai experience rules provide review methods, not competing tokens.

## 1. Screen Contract

For ecommerce operators and designers, the workspace turns product facts and reference images into a platform-specific delivery package, while always showing the active platform, runtime mode, current task, visible result, and next action.

## 2. Visual Direction

- Working title: Ecom / 电商工作台.
- Character: quiet, precise, operational, image-focused; closer to a studio workbench than a finance dashboard.
- Visual language: cool-grey canvas, white production surfaces, charcoal rail, digital cobalt actions, hairline dividers, and compact operational labels.
- Reference relationship: retain the readable dark navigation rail and bright work surface, while making slots, Prompt, generated media, and compliance states the dominant production hierarchy.
- Do not copy finance-dashboard card density, decorative promotional cards, warm legacy admin themes, or blue/purple AI gradients.
- This is a production workbench, not a landing page, poster, or presentation slide.

## 3. Tokens

### Color

- `--page`: `#F3F5F7`
- `--shell`: `#F3F5F7`
- `--surface`: `#FFFFFF`
- `--surface-soft`: `#F0F3F6`
- `--rail`: `#20252B`
- `--rail-muted`: `#A6B0BA`
- `--text`: `#14191F`
- `--text-secondary`: `#475569`
- `--text-muted`: `#62707E`
- `--placeholder-text`: `#62707E`
- `--border`: `#D8DEE5`
- `--border-strong`: `#BCC6D1`
- `--focus-ring`: `#3B82F6`
- `--disabled-text`: `#8A96A3`
- `--disabled-surface`: `#E7EBEF`
- `--disabled-border`: `#D3DAE2`
- `--primary`: `#2563EB`
- `--primary-hover`: `#1D4ED8`
- `--primary-soft`: `#EAF1FF`
- `--primary-border`: `#B8CCFF`
- `--on-primary`: `#FFFFFF`
- `--ai`: `#475569`
- `--ai-soft`: `#F0F3F6`
- `--ai-border`: `#D8DEE5`
- `--success`: `#0F8B6E`
- `--success-text`: `#0B735C`
- `--success-soft`: `#E5F5F0`
- `--success-border`: `#A9DACA`
- `--warning`: `#C88719`
- `--warning-text`: `#7A510C`
- `--warning-soft`: `#FFF5DC`
- `--warning-border`: `#EAD19A`
- `--danger`: `#D0443A`
- `--danger-text`: `#B8322A`
- `--danger-soft`: `#FDECEA`
- `--danger-border`: `#EFBBB5`
- `--taobao`: `#E85D22`
- `--amazon`: `#1C2E3A`

Digital cobalt represents the active workflow, selection, and primary action. API and Demo are neutral operating modes rather than warning or AI colors. Green, amber, and red retain success, warning, and error meaning. Orange appears only in platform identity, promotion, or marketing semantics.

### Typography

- Font family: `Avenir Next`, `PingFang SC`, `Microsoft YaHei`, system sans-serif.
- Page title: `22px / 30px`, weight `700` → CSS `--font-page-title` / `--line-page-title`.
- Section title: `15px / 22px`, weight `700` → CSS `--font-section` / `--line-section`.
- Body: `13px / 20px`, weight `400` → CSS `--font-body` / `--line-body`.
- Compact labels: `12px / 18px`, weight `600–700` → CSS `--font-label` / `--line-label`.
- Helper text: `12px / 18px`, weight `400` → CSS `--font-helper` / `--line-helper`.
- Caption / dense meta: `11px / 16px` → CSS `--font-caption` / `--line-caption`. Prefer this over ad-hoc `9–10px` text.
- Dialog titles: `18px / 26px` → CSS `--font-dialog-title` / `--line-dialog-title`.
- Micro markers: `10px / 14px` → CSS `--font-micro` / `--line-micro`; reserve for compact numeric markers only.
- Context labels: `14px / 20px` → CSS `--font-context` / `--line-context`.
- Toolbar titles: `16px / 22px` → CSS `--font-toolbar` / `--line-toolbar`.
- Command headings: `20px / 28px` → CSS `--font-command` / `--line-command`.
- Value exception: `22px / 28px` → CSS `--font-value` / `--line-value`; use only for compact result counts such as the history overflow marker.
- No viewport-based font scaling, no negative letter spacing, and no forced uppercase on Chinese eyebrows.
- All business typography consumes the semantic tokens above. Direct `font-size` or `line-height` literals are prohibited; fixed-height controls may retain `line-height: 1`, and structural dots / asymmetric edge treatments may retain their explicit geometry.

### Spacing And Dimensions

- Spacing scale: `4, 8, 12, 16, 20, 24, 32` → CSS `--space-1` … `--space-7`.
- Desktop platform rail stays at `72px` → CSS `--rail-width`; it only switches Taobao / Amazon, while the always-visible Demo/API mode and settings remain in the footer. There is no second compact-width token or rail variant.
- Top context band: not rendered; the page toolbar owns context and actions.
- All controls: `32px` high → CSS `--control-height` and `--control-height-compact`; normal and compact buttons, inputs, selects, and icon buttons share one height, with icon buttons remaining square.
- Slot thumbnail: stable aspect ratio from its rule pack; no content-driven resizing.
- Expanded-source columns remain product source `minmax(290px, 0.82fr)`, slots `minmax(340px, 1.06fr)`, inspector `minmax(320px, 0.96fr)`.
- Once a plan exists, `1100px` and wider defaults to the two-column slots `minmax(420px, 0.82fr)` + inspector `minmax(520px, 1.18fr)` canvas. From `900–1099px`, keep slots + inspector as a compact two-column canvas (`minmax(320px, 0.82fr)` + `minmax(340px, 1.18fr)`) and open product source on demand as a `360px`-maximum elevated overlay. The inspector remains the wider primary workspace. History remains a shared sidebar Dialog and never consumes permanent grid width.
- The page gives the production workspace the full available width by default. The current platform's history opens on demand as a right-side drawer and must not permanently compress production.
- Main content max width: about `1600px` inside the full-viewport shell.

### Surfaces

- Application shell is full-viewport on desktop: no floating card margin, no outer radius, no outer shadow. CSS `--radius-shell` remains `0` and `--shell-shadow` is `none`.
- Cards, panels, menus, and dialogs: maximum `8px` radius → CSS `--radius-panel`.
- Fields and buttons: `6px` radius → CSS `--radius-control`.
- Repeated cards use borders, not stacked shadows.
- Metric and status surfaces use the shared border token, not near-invisible one-off borders.
- No gradient or decorative orb backgrounds.
- The product ships one light visual theme. CSS declares `color-scheme: light`, the document theme color is `#20252B`, and system dark-mode preference must not create an undeclared second token set.

### Charcoal chrome (rail / workflow strips)

Dark operational chrome reuses these tokens instead of one-off hex:

- `--ink`: `#20252B` (aligned with `--rail`)
- `--ink-elevated`: `#2A3037` (elevated dark surface)
- `--ink-soft`: `#313841` (hover / soft fill on ink)
- `--ink-border`: `#414A55`
- `--ink-text`: `#F8FAFC`
- `--ink-text-muted`: `#A6B0BA`
- `--accent-warm`: `#F59E0B` (reserved platform or promotion accent)
- `--accent-warm-text`: `#14191F`
- `--brand-mark-bg`: `#EAF1FF`
- `--overlay-soft`, `--media-scrim`, `--white-surface-overlay`, `--shadow-subtle`, `--shadow-card`, `--shadow-drawer`, `--shadow-dialog`, `--gate-backdrop`, and `--shadow-gate` own local overlays and elevation values. Component rules must reference these tokens instead of repeating rgba shadows or scrims.

## 4. Layout Ownership

### Desktop

- The application fills the viewport. The cool-grey canvas lives inside the workspace content area, not as a surrounding page mat.
- The dark rail remains fixed at the left edge of the shell.
- No global top context bar. Content uses the full height beside the left rail.
- Runtime mode is shown on the left rail footer, not in a top chrome band or persistent workspace banner.
- Page headings are compact single-line toolbars; no eyebrow marketing copy or permanent helper paragraphs.
- Field hints are placeholders or validation errors, not permanent helper lines under every input.
- Panel descriptions are omitted by default.
- Product source, delivery slots, and inspector each own their internal scrolling in the shared Amazon/Taobao production shell. The platform workspace itself does not page-scroll.
- Platform workspaces use a fixed shell with column-level scroll regions; there is no standalone overview page.
- Amazon and Taobao share one compact stage control in the workspace toolbar: `准备资料 → 检查策划 → 逐图生产 → 交付检查`. The current stage remains visible; the complete four-stage path opens on demand and must not occupy a permanent second row.
- Amazon and Taobao place the shared product context inside the workspace toolbar. It owns current product identity, task details, and switching to an existing product without creating a second chrome band.
- Dense task-input and analysis details open through the shared sidebar `Dialog` variant. Expanding details must not push the production grid or create a second page scroll owner.
- Amazon with no active plan uses a focused intake surface: session parameters, Listing source, references, and one planning action. It may create a draft product/session atomically and must not render empty production columns.
- Amazon Listing source belongs to the platform session and must never silently overwrite shared facts. The current UI keeps parsed values inside the task; a future sync action would require a separate product decision and explicit user confirmation.
- Amazon A+ keeps one compact module summary in both preparation and planned states. `编排模块` always opens the same dialog; changes remain dialog-local until `应用编排`, while cancel/close discards them. The applied list defines the current task's slot count and order, and changing an existing plan marks it for replanning.
- Amazon style input has two explicit layers: `生成方案` owns planning strategy and base visual guidance, while `视觉参考` optionally supplies a hidden visual reference for secondary Listing images and A+ (never MAIN). Choosing an internal or custom reference synchronizes its source preset back to the base style. Custom-reference creation and deletion state that they affect the current product; deleting a reference does not delete existing plans or images.
- Delivery readiness stays hidden before the first usable output. Once output exists, the delivery strip remains single-line unless it is showing an error or recovery decision.
- Partial slot completion remains part of `逐图生成`; `交付检查` means all required slots are complete or the operator explicitly enters a partial-delivery review.
- Each platform owns its history pane. Events, recovery, fork, reuse, and re-export remain inside the selected Run and never mix across platforms.

### Desktop minimum width

- This product is desktop-only. Minimum supported viewport width is `900px` (`--desktop-min-width`); `1100px` and above remains the preferred wider workbench.
- Below that width, show a full-screen gate: “当前只支持电脑端浏览”, and do not offer a mobile workbench layout.
- Do not ship a bottom navigation or mobile pane switcher for the production workbench.

## 5. Navigation

- Desktop navigation is a compact `72px` platform rail. Only Taobao / Amazon are primary destinations; settings stays in the footer.
- Overview, library, and global history are not rail destinations. Existing work resumes or forks from the active platform's history drawer.
- Every rail item exposes the same label through a tooltip and `aria-label`.
- Active navigation is location only: use one shared active row treatment and a single left accent line. Do not show persistent platform-color markers on inactive items.
- Runtime mode and settings live in the rail footer; they do not compete with the production order.
- The runtime badge is always visible as `Demo` or `API` and opens settings; mode details and connection configuration remain inside the settings dialog.
- Below the desktop minimum width, show the desktop-only gate instead of a mobile navigation.
- Unimplemented platforms do not appear as selectable active items.

## 6. Component Families

### Buttons

- Primary: digital cobalt fill (`--primary`), white text.
- Secondary: white surface, neutral border, dark text.
- Quiet/icon: transparent until hover; fixed icon box.
- Destructive: red text or fill only when consequence is clear.
- Loading changes the local label and blocks repeat activation.
- Disabled controls expose a nearby reason or a predictable message.
- Save labels must name the persisted object. For the slot editor, prefer `保存文案与提示词` over the ambiguous `保存槽位草稿`.

### Inputs And Selects

- Inputs, textareas, selects, and search fields share border, type, focus ring, and disabled treatment.
- Native select indicators use the shared `Select` wrapper. Business-specific project switchers keep their own layout and density classes while consuming that shared indicator and disabled treatment.
- Textareas have a bounded initial height and remain scrollable/resizable where useful.
- Labels remain visible; placeholders do not replace field names.

### Segmented controls and tabs

- Use segmented controls for Listing/A+ or view modes.
- Use tabs only when every tab has real data and a reachable state.
- Selection is shown with structure and contrast, not color alone.

### Slots and cards

- Delivery slots are repeated cards and may contain one bounded media surface.
- Each slot shows key, title, status, target dimensions, current version count, and local action.
- Amazon may expose a localized `uiLabel` in product UI while retaining the canonical English `label` for Prompt, marketplace rules, manifests, and export naming.
- Empty slot thumbnails show only the state icon; the full slot key remains once in the card identity and accessible button content.
- Generated slots use the active version asset as their thumbnail. A stale version remains visible with a stale status instead of falling back to a generic icon.
- Slot lists use an auto-fitting visual grid: two columns when the slot panel has room and one column at compact widths.
- Selected, loading, error, success, disabled, and long-copy states share the same outer dimensions.
- A selected card must not make nested actions unreadable.
- Do not place cards around entire page regions or nest decorative cards.

### Dialogs, feedback, tooltips

- Dialogs have header, scrollable body when needed, and separate footer.
- Every modal and history drawer renders in the shared overlay root. While any dialog is open, the desktop workbench is `inert` and hidden from assistive technology; for nested dialogs only the topmost layer is active, and close returns focus to the trigger when it still exists.
- Dense workspace details and product switching use the shared sidebar dialog variant; centered dialogs remain for short confirmations and forms.
- Blocking validation errors stay inside the dialog.
- Current operation feedback uses shared inline status surfaces. Add a Toast primitive only when transient feedback has a real repeated need and can maintain safe distance from fixed actions.
- `StatusMessage` is static by default. Set `live="polite"` only for dynamic progress/success and `live="assertive"` for blocking failures; do not make explanatory copy a live region.
- Tooltips name unfamiliar rail and icon actions; required workflow information cannot live only in a tooltip.
- Menus and popovers share border, radius, shadow, active, disabled, and z-index rules.
- Programmatic upload inputs stay out of the Tab order and assistive-technology tree; a named upload Button owns focus. A native file input directly wrapped by a user-facing `<label>` may retain its browser-native focus behavior.
- A disabled reason is visible beside the affected action and referenced with `aria-describedby`; `title` is supplemental only. Compact delivery strips keep the reason to one line.

### Prompt assets

- The slot inspector owns the `Prompt 资产` entry. It opens the shared sidebar dialog and must not create a nested centered modal.
- Prompt templates are scoped by platform, workflow, and slot key. Applying one changes only the inspector draft until the user explicitly saves the slot.
- Each custom template retains numbered revisions, may be marked as the scoped default, and can be deleted without modifying an already saved slot.
- `恢复策划 Prompt` clears the custom default and restores the current plan's Prompt. `AI 改写当前 Prompt` reuses the existing Copilot lock, error, and cancellation behavior.

### Media

- Uploaded and generated images use `object-fit: contain` when product inspection matters.
- Lifestyle/result grids may use `cover` only when the full image remains accessible in preview.
- Empty, loading, failed, and missing-image states retain the slot aspect ratio.
- Product references must not be darkened or blurred as decoration.

## 7. State Language

- Empty states are classified by ownership:
  - `setup`: the current module owns the first action and gives a short checklist of what will be created.
  - `dependency`: the module is downstream and routes to its upstream owner; it must not duplicate creation actions.
  - `selection`: the data exists but the user has not selected an item; keep the state compact and do not add a second create CTA.
  - `asset`: a bounded media slot asks for a reference image and preserves its aspect ratio.
  - `loading`: preserve the final module geometry and name the current operation.
  - `result`: the input exists but no output has been produced; explain what event will populate the module.
- ProductProject facts and reference images remain project-scoped data, while each platform intake owns the visible new-task action and may atomically create a draft project/session.
- Platform workspaces must not silently overwrite facts already preserved by an existing session or historical snapshot.
- Empty: explain what is missing, the next action, and what appears after it.
- Before the first task exists, use `未命名任务` as identity and do not render a redundant `新任务` action. Empty-input requirements stay visibly adjacent to the disabled planning action.
- Loading: name the current work, such as analyzing product, writing slot prompts, or generating image.
- Success: show the result and the next available action.
- Error: show what failed, what remains safe, and how to retry or change input.
- Restored: identify which local project and platform were restored.
- Demo: label mock planning and mock images at the decision point.
- API mode: show provider/model status without exposing the API key.

## 8. Copy Rules

- User-facing product language is Simplified Chinese.
- Keep domain terms such as API, Prompt, Listing, A+, MAIN, and PT01 only where users need to recognize or copy them.
- For Amazon, label the model-facing fields as `模型提示词（英文，可复制）` and `模型负面约束（英文）`; keep `策划依据（中文说明）` visible beside them so a Chinese-speaking operator can understand why a slot was planned.
- The prompt field may include original Chinese product values when a safe translation is unavailable; show this boundary as a concise field hint rather than hiding it in a tooltip.
- Do not hide the Chinese planning explanation inside an English model prompt, and do not imply that copying an English prompt removes the need for product-fact or Seller Central review.
- Prefer direct task verbs: 创建项目、分析商品、生成策划、生成图片、检查合规、导出交付包.
- Avoid marketing filler such as ultimate, professional-grade, or one-click miracle claims.
- Compliance copy must distinguish automatic prompt checks from final marketplace approval.
- `导出当前结果` means one active image version per completed slot plus its manifest and Prompt snapshot. Historical versions are excluded; an eventual all-version export must be a separate action.

## 9. Implementation Ownership

- CSS variables in the single top-level `:root` block of `src/styles.css` are the token source of truth. Keep them in sync with §3 of this file.
- Shared React primitives in `src/components/ui.tsx` own buttons, icon buttons, selects, fields, dialogs, tooltips, panels, empty-state variants, `StatusChip`, `SegmentedControl`, `MediaSlot`, `ActionBar`, and status surfaces. `Badge` remains a compatibility primitive; business status should use `StatusChip`.
- Workbench module columns (当前资料 / 平台交付槽位 / 槽位检查器) must render through `Panel` (or a thin wrapper around it). Do not hand-write `<section class="panel">` shells in business views.
- When a module owns its own chrome bands (e.g. filled 槽位检查器), use `Panel` with `hideHeader` rather than a parallel DOM structure.
- `PlatformRail` owns workflow grouping, visible scope descriptors, active-location treatment, and runtime/settings footer placement.
- Production top chrome owns task identity, progress, history, and `新任务` only. Slot generation belongs to `SlotInspector`; export belongs to `ExportPanel`; do not duplicate either as a top-chrome primary action.
- `WorkflowStepper` and `domain/workspace/platform-stage.ts` own the shared four-stage language, current-stage mapping, and completed-slot progress for Amazon and Taobao. Platform pages must not reimplement their own step labels.
- `ProductContextBar` owns current product identity and existing-product actions inside the shared Amazon/Taobao toolbar. Page headers and source selectors must not duplicate those actions.
- `AmazonSessionControls` owns the stable Listing/A+ parameters and the single A+ module-summary/dialog path. A+ rows must not move between inline and dialog owners based on whether a plan exists; dialog edits commit only through `应用编排`.
- `StyleReferencePicker` owns optional visual-reference selection, custom-reference preview, and delete confirmation. `StyleReferenceEditorDialog` creates a new current-product reference; it must not label that action as editing an existing reference. `AmazonSessionControls` continues to own the base generation preset.
- `SlotInspector` owns one fixed four-view switcher for `文案 / 版本 / 检查 / Copilot` between the identity header and scrollable body; only one detail view is active, and the current result remains visible in every view. Strategy, evidence, negative constraints, and compliance belong to `检查`; version selection and image actions belong to `版本`. Do not reintroduce independent accordions for these concerns.
- The slot footer may show save only while the `文案` view owns the editable form. Generation remains the result commit action, and navigation to the next slot must stay blocked while the current slot has unsaved copy or Prompt changes.
- Domain-specific slot cards and version tiles stay with their owning components until a second real consumer proves that a shared primitive would remove duplication.
- Platform rule packs own platform labels, colors, dimensions, slots, prompt rules, compliance rules, and export names.
- Page components must not redefine shared tokens or platform rules with one-off constants.

## 10. Verification Contract

For a visual pass, browser rendering is the acceptance source of truth. Automated browser checks protect repeatable geometry, interaction, accessibility, and runtime invariants; a human review remains necessary for overall visual judgment:

- Inspect `1600×900`, `1366×768`, `1280×800`, `1200×800`, the minimum desktop at `900px` (including the `900×650` height constraint), and the desktop-only gate at `899px` or below.
- Review the first-run source state, planned slot grid, selected inspector, generated-result surface, settings dialog, task history, and restored project when available.
- Confirm no horizontal overflow, clipped text, overlapping fixed regions, or competing scroll containers.
- Exercise default, hover/focus-visible, selected, disabled, loading, empty, success, error, and destructive states where practical.
- Exercise system dark preference, reduced motion, forced colors, DPR 2, and the 125% zoom-equivalent CSS viewport. The shipping contract remains one light theme and a `900px` CSS-pixel desktop minimum; these conditions must not create an undeclared theme or bypass the gate.
- Verify ordinary dialogs, nested confirmations, and the history drawer expose only one active modal layer, isolate the workbench background, trap focus, and return focus on close.
- A complete governance run writes a timestamped evidence batch and manifest. Root-level historical screenshots are not evidence of the current run.

## 11. Prohibited Patterns

- Marketing hero sections or oversized type inside the workbench
- Purple- or blue-dominated page backgrounds
- Platform or orange marketing colors used as generic action or state colors
- Cards nested inside decorative cards
- Text buttons where a familiar icon communicates the command better
- Unlabeled icon-only actions
- Fake platform tabs, history filters, or selectors without backing data
- Silent API calls, duplicate submissions, or success without visible result
- Claims that tests or source review prove the user experience
- A second `:root { … }` token block later in `styles.css` (cascade overrides of tokens are forbidden; component rules may still refine layout)
- Business views assembling `button button--primary` class strings instead of the `Button` primitive
- Raw `<button>` in business views except domain selection cards, version cards, preview thumbnails, and canvas tools; navigation, context actions, and file actions use `Button` / `IconButton`
- New hard-coded brand hex values outside the top `:root` token block (semantic one-offs on the dark rail chrome are the only temporary exception while that region is still being tokenized)

## 12. Visual Consistency Governance (minimal loop)

This is the project’s lightweight frontend visual governance — not a full design-system platform.

| Layer | Owner | Rule |
| --- | --- | --- |
| Contract | `UI_STYLE_GUIDE.md` | Product-facing visual decisions live here first |
| Tokens | `src/styles.css` top `:root` | Exactly one token block; values match §3 |
| Primitives | `src/components/ui.tsx` | New shared controls go here before page-local copies |
| Component owners | named sections of `styles.css` | Each shared or domain family has one owner; do not append final-pass overrides |
| Domain views | `src/components/*` | Compose primitives + domain class names |

When changing UI:

1. Prefer token / primitive change over a page-local hex or raw `<button>`.
2. Prefer deleting a dead cascade rule over adding another override with higher specificity.
3. Keep the shared three-module production shell on `Panel` so Amazon and Taobao empty/filled states share one component path; Amazon-specific controls may remain in its top workflow branch.
4. After structural UI edits, re-check the manual list in §10.
5. Run continuous checks before merge:

```bash
pnpm check:ui   # or: node scripts/check-ui-governance.mjs
pnpm typecheck
pnpm test       # runs check:ui then vitest
pnpm test:browser
pnpm test:browser:governance
pnpm test:ui:acceptance  # complete gate + timestamped manifest
```

`scripts/check-ui-governance.mjs` enforces: one `:root` token block, guide-aligned primary / rail / type tokens, state-text and focus contrast thresholds, shared modal/live-region ownership, no business `button--*` class assembly, the explicit raw-button exception list, upload/context/history semantic contracts, workbench modules on `Panel` + `hideHeader` for filled inspector, stable skeleton hooks in `AppShell` / `PlatformWorkspace`, no legacy mobile-pane hooks, and no return of retired zero-consumer component/CSS families.

Browser and full acceptance output goes to `artifacts/cross-platform-ais/runs/<timestamp>/manifest.json`; `artifacts/cross-platform-ais/latest.json` points to the most recent batch. The manifest records suite type, Git SHA/dirty state, tool versions, commands, viewports and conditions, test counts and bundle size when the full suite runs, plus the exact screenshot list. `check:bundle` limits the Vite business entry chunk to `500 kB`.

Still out of scope for this minimal loop (add only when pain is repeated): Storybook, pixel-diff visual regression, stylelint token rules, CSS Modules.

## 13. Governance Status (2026-08-24)

### Completed

- Commerce Ops tokens, typography, spacing, radius, borders, state colors, the single light theme, and the `72px` rail are owned by the single top `:root` block.
- Amazon and Taobao use the shared production shell with an on-demand platform-history drawer; product source opens on demand and becomes an elevated overlay from `900–1099px`. The desktop-only gate remains at `899px` and below.
- Amazon and Taobao preparation/production states use the same toolbar stage control with an on-demand four-stage path; browser checks protect the Taobao `检查策划 → 逐图生产` transition as a representative cross-platform consumer.
- Listing / A+ and settings mode selection use `SegmentedControl`; operating modes use neutral `StatusChip` semantics.
- A+ module setup now uses one compact summary and one staged dialog before and after planning; base text style and optional hidden style-board attachment have explicit, synchronized ownership and scoped create/delete copy.
- Generated results use fixed-ratio `MediaSlot`; the inspector footer uses `ActionBar` and keeps save / generate actions visible without covering Prompt content.
- Library, source, history, compliance, export, shell runtime, and Amazon consumers share the same status and control primitives.
- 淘宝分析、固定 5+7 槽位、手机预览和历史导出继续复用同一套 `Panel`、`Button`、`StatusChip`、`Dialog`、`MediaSlot` 和 `ActionBar`；生产记录样式只引用已声明的视觉 Token。
- Success/danger text tokens and the solid focus-ring token meet the governed contrast thresholds; status feedback opts into polite/assertive live regions only when it is dynamic.
- Muted text uses `--text-muted` only where it remains readable on page, surface, and soft-surface backgrounds. `--disabled-text` is a documented state exception for disabled controls, not a normal reading color; rail text uses the separate dark-chrome tokens.
- Every centered dialog and history sidebar uses the shared overlay stack, background isolation, topmost-only nested behavior, focus trap, and focus return.
- Production history loads 50 Runs per page, preserves already loaded records when an older-page read fails, and exposes retry; browser evidence exercises 120 records and both initial/older-page recovery paths.
- Browser evidence covers the production shell and opened history drawer, Listing/A+, settings, mask states, loading/error, the full supported desktop matrix, `899px` gate, compact-source overlay, dark preference, reduced motion, forced colors, DPR 2, and 125% zoom-equivalent rendering.
- Each browser/full acceptance run has an isolated manifest-backed evidence batch; the 500 kB entry-chunk budget and supported Node/pnpm ranges are explicit.

### Remaining Debt

- `Badge` remains exported for compatibility but has no current business-view consumer; remove it only with a separate API cleanup.
- Screenshot evidence is deterministic acceptance output, not a pixel-diff baseline. Add image diffing only if visual regressions become recurrent.
- Safari/Firefox, real external Providers, actual marketplace upload review, and browser UI zoom behavior beyond the CSS-pixel/DPR equivalent remain external/manual checks.
- The product remains desktop-only by decision. A responsive mobile workbench requires a separate product and interaction design scope.

### Alignment Handoff

- Amazon behavior and evidence status live in `AIS_ALIGNMENT_CHECKLIST.md`; visual checks cannot replace that domain verdict.
- ProductProject, PlatformSession, ProductionRun, v2 business storage, and runtime-settings retention are fixed by `docs/adr/0001-product-session-run-boundaries.md`.
- Future UI work must preserve the current domain ownership and manifest-backed `artifacts/cross-platform-ais/runs/` browser evidence contract unless a new product decision explicitly replaces them.
