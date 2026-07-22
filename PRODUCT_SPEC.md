# Ecom Product Specification

> Status: aligned baseline
> Updated: 2026-07-21
> Primary alignment target: Amazon Image Studio @ `bca89d728e415c453db363dcba30ac8ea243edaf`

## 1. Product Positioning

Ecom is a local-first AI image-production workspace for solo ecommerce operators. It turns shared product facts and reference images into platform-specific image plans, editable delivery slots, generated versions, resumable local execution jobs, compliance reminders, and an export package.

Amazon Listing and A+ are the primary product path and follow AIS behavior and defaults. Taobao / Tmall is a secondary but independently usable product-material workflow. The implementation keeps Ecom's own shell and domain model; it does not copy AIS source code or promise pixel-identical UI.

## 2. Primary User And Job

The primary user is an independent shop operator without a dedicated ecommerce designer. The job is to turn an existing product brief into reviewable, platform-ready image work without requiring professional image-editing software.

The product helps with facts, planning, generation, limited editing, compliance review, history recovery, and delivery preparation. It does not promise automatic marketplace approval, factual correctness without review, or guaranteed model output quality.

## 3. Product Truth And Runtime Modes

The interface always identifies the runtime mode:

- **Demo**: deterministic local planning, mock images, and no external model call.
- **API**: user-provided text and image services, with provider/model status visible but keys never shown in feedback or screenshots.

Settings support dual configuration for text planning and image generation, or single connection when the provider supports both. OpenRouter and DeepSeek capability differences are checked before requests; unsupported image editing never silently falls back to ordinary generation.

## 4. Information Architecture

### 4.1 Shared navigation

- `资料库`: shared ProductProject facts, reference assets, and platform progress.
- `淘宝 / 天猫`: secondary platform workflow.
- `Amazon`: Listing/A+ session workbench.
- `生产记录`: ProductionRun list and filters.
- `设置`: runtime mode, provider connection, and connection tests.

### 4.2 Product workspace

The product has three domain layers:

1. ProductProject: shared facts and reference materials.
2. PlatformSession: one platform/workflow's editable source, options, plan, selected slot, versions, and active run.
3. ProductionRun: immutable snapshot and event history for a complete production attempt.

Amazon workspaces expose Listing/A+ mode, marketplace, count/type, module options, size tier, style, Listing source, reference assets, plan, slot board, inspector, generation, compliance, and export. Taobao exposes product analysis input, fixed gallery/detail slots, the same slot inspector and version workflow, phone product-page preview, and partial/full delivery export. The shared production shell owns column scroll; at `900–1099px` the source panel is a drawer; at `899px` and below the desktop-only gate is shown.

Production history is a filter row plus Run list. Events, recovery, fork, image reuse, and re-export belong to an expanded Run; history is not a flat per-product task log.

## 5. Core Domain Objects

### ProductProject

```ts
ProductProject = {
  id, name,
  facts: { productName, category, brand, model, sku, targetAudience,
    description, sellingPoints, forbiddenClaims, specifications },
  createdAt, updatedAt
}
```

### ProductAsset

Reference and generated assets are project-scoped. Generated output can be copied as a new reference asset; it does not mutate the generated asset or another project.

### PlatformSession

```ts
PlatformSession = {
  projectId, platformId, workflowId,
  sourceInput, options, selectedReferenceAssetIds,
  planningInput?,
  selectedStyleReferenceId?, plan?, planInputSignature?, selectedSlotKey?,
  slotVersions, activeRunId?, createdAt, updatedAt
}
```

Amazon options include `marketplaceId`, `plannerMode`, Listing count or A+ type/module specs, `sizeTier`, and optional style preset. Taobao options use the `taobao-product` workflow and keep analysis input, selected product references, fixed Rule Pack plan, and slot versions in the session.

`planningInput` is an optional backward-compatible snapshot of the task source, input quality, missing facts, task text, selected product-reference asset IDs, and source-project revision. ProductionRun context snapshots preserve the same value so restore and historical inspection do not depend on the current project state.

### ProductionRun and events

Runs preserve `contextSnapshot`, `planSnapshot`, `slotVersionsSnapshot`, planning signature, status, and `ProductionEvent[]`. Events cover planning, generation, regeneration, mask edit, and export, each with success/failure/canceled state and references to assets, versions, or artifacts.

### ExecutionJob

`ExecutionJob` is a separate local queue for resumable work that spans multiple slots. The current baseline supports `batch-generate` for the active ProductProject and PlatformSession, with `queued / running / paused / completed / failed / canceled` states, per-slot progress, cancellation, failed-item retry, and refresh recovery. Jobs persist in IndexedDB and are available only while the browser runtime is available; they are not a server worker or a cross-product Agent.

## 6. Amazon Contract

### Marketplaces

Default is US (`us`, `en-US`, Amazon.com). Supported marketplaces are `jp`, `de`, `fr`, `it`, and `es`. Marketplace options flow into rule packs, planning prompts, visible-copy language, and compliance checks.

### Listing

- Default: 7 slots, `MAIN + PT01–PT06`.
- Range: 7–12 slots.
- MAIN has no visible copy; other slots follow marketplace and rule-pack copy constraints.

### A+

Default type is `standard-large`. The catalog also supports standard, premium, and mobile A+ with module specs, dimensions, optional external copy, and restore-default behavior. Modules are resolved into the active plan and input signature.

### Planning input

Amazon accepts Listing title, bullets, description, product facts, forbidden claims, reference assets, marketplace, mode options, size tier, and style. `parseAmazonListingText` provides local extraction; writing parsed values into shared ProductProject facts requires explicit user action.

## 7. Cross-platform Workflow

### Shared planning intake

Amazon and Taobao / Tmall use the same planning-intake contract. The user chooses either `从资料库选择` or `手动填写`; only the library path opens the product picker. Manual intake may start with text, product images, or both. Submitting without a saved ProductProject creates a local draft project atomically with the session.

Input quality is evaluated before planning:

| Quality | Input | Planning behavior |
| --- | --- | --- |
| `standard` | Product name, verifiable details, and at least one selected product image | Labeled `达标策划` |
| `image-only` | At least one selected product image, but facts remain incomplete | Labeled `策划草稿`; may continue when the planner can read images |
| `facts-only` | Any usable product facts without a selected product image | Labeled `策划草稿`; preserves the existing Amazon text-only path |
| `empty` | No usable facts and no selected product image | Planning is blocked |

Only product-reference images selected for the current task are sent to the planner and included in the planning signature. Style references do not satisfy the product-image requirement. Missing specifications, materials, certifications, and similar facts remain item-level planning warnings rather than a global blocker. A planner without image-input capability must reject pure-image intake explicitly instead of silently ignoring images.

Both platforms expose one stable primary action, `生成图片策划`, and the same four stages: `准备 -> 策划检查 -> 逐图生产 -> 交付检查`. Platform Rule Packs still own slot count, dimensions, locale/copy, and compliance differences.

### Taobao / Tmall

- New writes use `taobao-product`; legacy `taobao-detail` is normalized only while reading old data.
- One workflow always contains five `800×800` gallery slots and seven `750×1000` detail slots in fixed Rule Pack order. AI planning cannot add, remove, duplicate, or reorder required slots.
- Product text, references, selling points, specifications, forbidden claims, analysis citations, and missing facts are written to the current Taobao `PlatformSession`; analysis does not silently update `ProductProject`.
- Each slot supports Prompt/copy editing, generation, regeneration, immutable version activation, mask editing where supported, failure recovery, and history reuse.
- The phone product-page preview consumes either the current session or an immutable Run snapshot. Partial/full export and historical re-export preserve the 12-slot manifest and missing-slot semantics.

### Shared production workflow

1. Choose a library product or start manual intake for either platform.
2. Provide product facts, selected product-reference images, or both; an empty input cannot continue.
3. Adjust optional platform parameters or style only when needed.
4. Run Demo or API planning through `生成图片策划`.
5. Review the plan, choose a slot, and inspect Chinese strategy/evidence beside the English model prompt.
6. Edit and save visible copy or prompt, then generate one slot at a time.
7. Optionally batch-generate the remaining slots for the current platform workflow, then monitor or cancel the local task from 生产记录.
8. Review compliance findings and the need for manual marketplace review.
9. Regenerate, activate an older version, open the mask editor, or reuse a completed image as a new reference asset.
10. Export current active results or recover/fork/re-export from ProductionRun history.

Every asynchronous operation has visible loading, success, failure, cancellation, and recovery behavior where applicable. Failed generation or edit preserves the previous active version.

## 8. Images, Mask Editing, And Provider Boundaries

Reference payloads are limited to 16 images and prepared with primary 1024px / fallback 768px compression and an 8 MiB total limit. Generation dimensions are separate from platform upload recommendations and are written into prompts and version metadata.

Mask editing is a bounded local tool: brush/eraser, size, undo/redo, reset, cancel, and save. It validates PNG format, target existence, dimensions, and coverage. Supported providers receive an explicit source image plus PNG mask through an edit request. The edit produces a new immutable version; unsupported providers receive a capability message.

Style presets and project style references apply to attached/A+ work where supported. MAIN excludes style injection so the product remains the subject.

## 9. Persistence And Export

Projects and assets remain in v2 business storage. Editable sessions and immutable history are now persisted separately:

- Projects: `ecom-workbench.projects.v2`
- Assets: `ecom-workbench-assets-v2`
- Legacy migration source: `ecom-workbench.workspace.v2.{projectId}`
- Current sessions: `ecom-workbench.workspace.v3.{projectId}`
- Production runs: IndexedDB `ecom-workbench-runs-v1`

Workspace V3 contains current sessions and migration metadata only. It does not contain runs, TaskRecord history, top-level plan/version mirrors, or Amazon workspace mirrors. The v2 source remains intact; migration is idempotent and is marked complete only after every valid run is stored and verified. New operations write ProductionRun events and no longer append TaskRecord entries.

New sessions and runs persist the optional `planningInput` snapshot. Readers normalize old records that do not contain it, so this addition requires no destructive migration. Failed planning preserves the draft project, entered text, uploaded images, and selected references for retry.

Runtime settings retain `ecom-workbench.runtime-settings.v1` for compatibility and normalize legacy credentials. Removing a project removes that project's runs, assets, V3/v2 workspace, and project metadata in a retryable order; it does not clear unrelated browser storage or runtime settings.

Current export is a platform ZIP with manifest, Prompt snapshot, active version files, and missing-slot information. Partial export is allowed when explicitly labeled; historical re-export reads the independent RunRepository snapshot and does not change the current session.

## 10. Required States

- First run with no project: one create-project action owned by 资料库.
- Existing project with no plan: explain missing facts/references and expose one planning action.
- No saved project: allow manual facts or product-image intake and create a local draft only on submit.
- Image-only input: label the result as a planning draft and require planner image capability.
- Planning/generation: preserve geometry, identify the current operation, and block duplicate actions.
- Success: show the result, active version, source/runtime, and next action.
- Failure: state what failed, preserve safe previous data, and expose retry or correction.
- History restore/fork: identify project, platform, workflow, Run and source.
- Local batch task: show queued/running/paused/completed/failed/canceled state, progress, cancel/retry actions, and refresh recovery.
- API settings: show dual/single mode, connection feedback, provider restrictions, and no key echo.
- Narrow viewport: 900px compact desktop; 899px desktop-only gate.

## 11. Non-Goals And External Risks

The following are outside this aligned baseline: cross-product batch-agent production, server-side workers, web search, full Photoshop editing, automatic Seller Central submission/approval, mobile production workbench, PWA/Electron packaging, and pixel-level AIS visual replication.

External provider availability, CORS, quotas, model quality, generated-image factual accuracy, Seller Central rules, and final marketplace approval require operator verification and are not proven by local tests.

## 12. Acceptance Criteria

### Product experience

- A solo operator can complete Listing default 7 and A+ default `standard-large` paths in Demo mode.
- Six Amazon marketplaces, Listing 7–12, A+ types/modules, Listing parsing, slot editing, version recovery, production history, export, and mask editing are reachable where listed above.
- A solo operator can analyze a Taobao product, create the fixed 5+7 plan, generate/edit/version individual slots, preview the phone product page, and export partial/full or historical results.
- Browser evidence covers `1600/1280/1100/900/899`, empty/loading/success/failure/recovery, settings modes, production filters, and mask states under `artifacts/cross-platform-ais/`.

### Engineering

- `pnpm check:ui`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:browser`

The latest full run is 74 test files and 387 passing tests. The GitHub Pages contract also passes with `VITE_BASE_PATH=/Ecom/ pnpm build`. A non-blocking bundle-size warning and one filtered 404 resource note from the browser smoke fixture remain documented risks. External Provider behavior, marketplace back-office acceptance, and large-history performance remain outside deterministic local verification.
