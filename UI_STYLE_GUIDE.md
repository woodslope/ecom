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
- `--text-muted`: `#6B7785`
- `--border`: `#D8DEE5`
- `--border-strong`: `#BCC6D1`
- `--focus-ring`: `rgba(37, 99, 235, 0.24)`
- `--disabled-text`: `#8A96A3`
- `--disabled-surface`: `#E7EBEF`
- `--disabled-border`: `#D3DAE2`
- `--primary`: `#2563EB`
- `--primary-hover`: `#1D4ED8`
- `--primary-soft`: `#EAF1FF`
- `--primary-border`: `#B8CCFF`
- `--ai`: `#475569`
- `--ai-soft`: `#F0F3F6`
- `--ai-border`: `#D8DEE5`
- `--success`: `#0F8B6E`
- `--success-soft`: `#E5F5F0`
- `--success-border`: `#A9DACA`
- `--warning`: `#C88719`
- `--warning-text`: `#7A510C`
- `--warning-soft`: `#FFF5DC`
- `--warning-border`: `#EAD19A`
- `--danger`: `#D0443A`
- `--danger-soft`: `#FDECEA`
- `--danger-border`: `#EFBBB5`
- `--taobao`: `#E85D22`
- `--amazon`: `#1C2E3A`

Digital cobalt represents the active workflow, selection, and primary action. API and Demo are neutral operating modes rather than warning or AI colors. Green, amber, and red retain success, warning, and error meaning. Orange appears only in platform identity, promotion, or marketing semantics.

### Typography

- Font family: `Avenir Next`, `PingFang SC`, `Microsoft YaHei`, system sans-serif.
- Page title: `22px / 30px`, weight `750` → CSS `--font-page-title` / `--line-page-title`.
- Section title: `15px / 22px`, weight `750` → CSS `--font-section` / `--line-section`.
- Body: `13px / 20px`, weight `400` → CSS `--font-body` / `--line-body`.
- Compact labels: `12px / 18px`, weight `600–700` → CSS `--font-label` / `--line-label`.
- Helper text: `12px / 18px`, weight `400` → CSS `--font-helper` / `--line-helper`.
- Caption / dense meta: `11px / 16px` → CSS `--font-caption` / `--line-caption`. Prefer this over ad-hoc `9–10px` text.
- No viewport-based font scaling, no negative letter spacing, and no forced uppercase on Chinese eyebrows.

### Spacing And Dimensions

- Spacing scale: `4, 8, 12, 16, 20, 24, 32` → CSS `--space-1` … `--space-7`.
- Desktop workflow rail: `208px` → CSS `--rail-width`; labels stay visible so tooltips are optional.
- Top context band: not rendered; the page toolbar owns context and actions.
- Normal controls: `40px` high → CSS `--control-height`.
- Compact controls and icon buttons: `32px` high → CSS `--control-height-compact`; icon buttons remain square.
- Slot thumbnail: stable aspect ratio from its rule pack; no content-driven resizing.
- Desktop workbench default columns: product source `minmax(290px, 0.82fr)`, slots `minmax(340px, 1.06fr)`, inspector `minmax(320px, 0.96fr)`.
- Keep three columns at `1100px` and above, with slightly tighter column mins between `1100px` and `1320px`.
- Between `900px` and `1099px`, use compact desktop mode: slots + inspector stay in two columns, while product source opens as an overlay drawer.
- Main content max width: about `1600px` inside the full-viewport shell.

### Surfaces

- Application shell is full-viewport on desktop: no floating card margin, no outer radius, no outer shadow. CSS `--radius-shell` remains `0` and `--shell-shadow` is `none`.
- Cards, panels, menus, and dialogs: maximum `8px` radius → CSS `--radius-panel`.
- Fields and buttons: `6px` radius → CSS `--radius-control`.
- Repeated cards use borders, not stacked shadows.
- Metric and status surfaces use the shared border token, not near-invisible one-off borders.
- No gradient or decorative orb backgrounds.

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

## 4. Layout Ownership

### Desktop

- The application fills the viewport. The cool-grey canvas lives inside the workspace content area, not as a surrounding page mat.
- The dark rail remains fixed at the left edge of the shell.
- No global top context bar. Content uses the full height beside the left rail.
- Runtime mode is shown on the left rail footer, not in a top chrome band.
- Page headings are compact single-line toolbars; no eyebrow marketing copy or permanent helper paragraphs.
- Field hints are placeholders or validation errors, not permanent helper lines under every input.
- Panel descriptions are omitted by default.
- Product source, delivery slots, and inspector each own their internal scrolling in the shared Amazon/Taobao production shell. The platform workspace itself does not page-scroll.
- Overview and simple pages may page-scroll; platform workspaces use a fixed shell with column-level scroll regions.
- Overview places “当前下一步” beside the metric strip as the primary action cluster.
- The Amazon workflow indicator is a compact navigation/status strip, not a second content panel. It must not repeat the export action or permanently reserve explanatory height.
- Amazon with no active plan uses a focused intake surface: session parameters, Listing source, references, and one planning action. It may create a draft product/session atomically and must not render empty production columns.
- Amazon Listing source belongs to the platform session. Differences from shared facts stay visible and require an explicit `同步到共享商品资料` action.
- Delivery readiness stays hidden before the first usable output. Once output exists, the delivery strip remains single-line unless it is showing an error or recovery decision.
- Partial slot completion remains part of `逐图生成`; `交付检查` means all required slots are complete or the operator explicitly enters a partial-delivery review.
- `生产记录` is owned by a filter row plus production-run list. Events, recovery, fork, reuse, and re-export belong inside the selected run; it is not a flat per-product task log.

### Desktop minimum width

- This product is desktop-only. Minimum supported viewport width is `900px` (`--desktop-min-width`); `1100px` and above is the preferred three-column experience.
- Below that width, show a full-screen gate: “当前只支持电脑端浏览”, and do not offer a mobile workbench layout.
- Do not ship a bottom navigation or mobile pane switcher for the production workbench.

## 5. Navigation

- Desktop navigation is a readable workflow rail, not an icon-only launcher. It shows three groups: `工作台`, `生产流程`, and `记录`.
- `资料库` carries the descriptor `档案 · 资料与参考图`; it is the shared management center, not a mandatory page-navigation first step.
- Every rail item owns an icon, primary label, and one short scope descriptor. Tooltips may remain as a fallback but cannot be the only explanation.
- Active navigation is location only: use one shared active row treatment and a single left accent line. Do not show persistent platform-color markers on inactive items.
- Runtime mode and settings live in the rail footer; they do not compete with the production order.
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
- Each slot shows key, title, purpose, status, current version count, and local action.
- Selected, loading, error, success, disabled, and long-copy states share the same outer dimensions.
- A selected card must not make nested actions unreadable.
- Do not place cards around entire page regions or nest decorative cards.

### Dialogs, feedback, tooltips

- Dialogs have header, scrollable body when needed, and separate footer.
- Blocking validation errors stay inside the dialog.
- Current operation feedback uses shared inline status surfaces. Add a Toast primitive only when transient feedback has a real repeated need and can maintain safe distance from fixed actions.
- Tooltips name unfamiliar rail and icon actions; required workflow information cannot live only in a tooltip.
- Menus and popovers share border, radius, shadow, active, disabled, and z-index rules.

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
- `资料库` owns shared product facts, reference images, platform progress, and the main create-product action.
- Platform workspaces consume shared data but may create a draft product and platform session from a direct intake flow; they must not silently overwrite existing shared facts.
- Empty: explain what is missing, the next action, and what appears after it.
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
- Domain-specific slot cards and version tiles stay with their owning components until a second real consumer proves that a shared primitive would remove duplication.
- Platform rule packs own platform labels, colors, dimensions, slots, prompt rules, compliance rules, and export names.
- Page components must not redefine shared tokens or platform rules with one-off constants.

## 10. Verification Contract

For a visual pass, manual browser review is the acceptance source of truth:

- Inspect one wide desktop, one normal desktop at or above `1100px`, compact desktop at `900px`, and the desktop-only gate at `899px` or below.
- Review the first-run source state, planned slot grid, selected inspector, generated-result surface, settings dialog, task history, and restored project when available.
- Confirm no horizontal overflow, clipped text, overlapping fixed regions, or competing scroll containers.
- Exercise default, hover/focus-visible, selected, disabled, loading, empty, success, error, and destructive states where practical.
- Automated checks remain a separate engineering concern and are not required for a manual-only visual redesign request.

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
pnpm test       # runs check:ui then vitest
```

`scripts/check-ui-governance.mjs` enforces: one `:root` token block, guide-aligned primary / rail / type tokens, no business `button--*` class assembly, workbench modules on `Panel` + `hideHeader` for filled inspector, stable skeleton hooks in `AppShell` / `PlatformWorkspace`, and no legacy mobile-pane hooks.

Still out of scope for this minimal loop (add only when pain is repeated): Storybook, pixel-diff visual regression, stylelint token rules, CSS Modules.

## 13. Governance Status (2026-07-21)

### Completed

- Commerce Ops tokens, typography, spacing, radius, borders, state colors, and the `208px` rail are owned by the single top `:root` block.
- Amazon and Taobao use the same three-column production shell at `1100px` and above, slots + inspector with a source drawer from `900px` to `1099px`, and the desktop-only gate at `899px` and below.
- Listing / A+ and settings mode selection use `SegmentedControl`; operating modes use neutral `StatusChip` semantics.
- Generated results use fixed-ratio `MediaSlot`; the inspector footer uses `ActionBar` and keeps save / generate actions visible without covering Prompt content.
- Library, source, history, compliance, export, shell runtime, and Amazon consumers share the same status and control primitives.
- 淘宝分析、固定 5+7 槽位、手机预览和历史导出继续复用同一套 `Panel`、`Button`、`StatusChip`、`Dialog`、`MediaSlot` 和 `ActionBar`；生产记录样式只引用已声明的视觉 Token。
- Browser evidence is generated under `artifacts/cross-platform-ais/` for library empty/search/progress, Listing/A+, production runs/filter empty, settings dual/single/error, mask states, loading/error, `1600px`, `1280px`, `1100px`, `900px`, and `899px` states.

### Remaining Debt

- `Badge` remains exported for compatibility but has no current business-view consumer; remove it only with a separate API cleanup.
- Screenshot evidence is deterministic acceptance output, not a pixel-diff baseline. Add image diffing only if visual regressions become recurrent.
- The product remains desktop-only by decision. A responsive mobile workbench requires a separate product and interaction design scope.

### Alignment Handoff

- Amazon behavior and evidence status live in `AIS_ALIGNMENT_CHECKLIST.md`; visual checks cannot replace that domain verdict.
- ProductProject, PlatformSession, ProductionRun, v2 business storage, and runtime-settings retention are fixed by `docs/adr/0001-product-session-run-boundaries.md`.
- Future UI work must preserve the current domain ownership and `artifacts/cross-platform-ais/` browser evidence contract unless a new product decision explicitly replaces them.
