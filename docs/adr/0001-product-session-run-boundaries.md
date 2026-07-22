# ADR 0001: Product, Session, And Run Boundaries

- Status: Accepted
- Date: 2026-07-20
- Decision owners: Ecom product and implementation

## Context

The original workspace mixed shared product facts, current platform editing state, and task history. That made Listing/A+ mode switching, cross-platform progress, history recovery, and re-export ambiguous. Test data from the v1 business store also looked like real user data, while runtime API settings needed to remain available.

The aligned Amazon path requires separate ownership for reusable product truth, an editable platform workflow, and an immutable production attempt.

## Decision

Use three domain layers:

1. `ProductProject` owns platform-independent product facts and project-scoped assets.
2. `PlatformSession` owns one current platform/workflow context: source input, options, selected references/style, plan, input signature, selected slot, versions, and active Run.
3. `ProductionRun` owns an immutable production snapshot and its plan/generate/regenerate/edit/export events.

The navigation and UI follow the same ownership:

- 资料库 manages ProductProject data and platform progress.
- Amazon and 淘宝 / 天猫 edit PlatformSession state.
- 生产记录 queries ProductionRun data and supports resume, fork, reuse, and historical re-export.

## Persistence

Projects and assets remain at v2:

- `ecom-workbench.projects.v2`
- `ecom-workbench-assets-v2`
- `ecom-workbench.workspace.v2.{projectId}` is retained as an immutable migration source.

The active persistence model was amended on 2026-07-21:

- `ecom-workbench.workspace.v3.{projectId}` stores current sessions and migration metadata only.
- IndexedDB `ecom-workbench-runs-v1` stores ProductionRun history independently.
- Migration is idempotent and writes the completed marker only after every valid v2 run is stored and verified.
- A ProductionRun remains queryable when its original PlatformSession no longer exists.
- New writes use ProductionEvent only; legacy TaskRecord values remain readable but are not converted into runs.

The planning-input model was amended on 2026-07-22:

- `PlatformSession.planningInput` optionally snapshots source mode, input quality, missing facts, task text, selected product-reference IDs, and the source-project revision.
- `ProductionRun.contextSnapshot.planningInput` preserves the same task boundary for restore, fork, and historical inspection.
- Old sessions and runs without this field remain valid and are normalized without a destructive migration.
- Planning signatures and planner requests include only product-reference images selected for that task. Project assets that were not selected and style references cannot make a plan stale or satisfy product-image completeness.

The implementation amendment also fixes the application ownership boundary:

- Store actions own request state, cancellation, error, recovery, and UI facades.
- Application use cases and pure mutations coordinate session/run snapshots and cross-repository compensation.
- Platform Registry owns workflow labels, capabilities, and legacy workflow normalization; history queries consume RunRepository pagination rather than scanning Workspace.

Old v1 business fixtures are not read or migrated. Runtime settings remain at `ecom-workbench.runtime-settings.v1` and are normalized so existing credentials and Demo/API choice survive the business reset.

Project deletion removes only that project's runs, assets, V3/v2 workspace, and project metadata in that order. A failed step leaves the project visible and retryable; deletion must not call `localStorage.clear()` or remove unrelated settings.

## Behavioral Consequences

- Amazon Listing and A+ can restore independent sessions for the same product.
- Listing parsing does not silently overwrite shared ProductProject facts.
- Replanning can create a new Run without deleting earlier Runs.
- Generation and mask editing append immutable versions; failure preserves the active version.
- Historical re-export uses the original Run snapshot and does not switch the current session.
- A Run created before version snapshots were stored may reject historical re-export with an explicit message.
- Amazon and Taobao / Tmall can create a draft ProductProject and PlatformSession atomically from manual facts or product images when no saved project exists.
- Input assessment is shared across platforms, while each platform Rule Pack continues to own slots, dimensions, locale/copy, and compliance constraints.
- Pure-image planning is rejected when the configured planner cannot read images; it never silently drops the selected images.

## Alternatives Considered

### One project document owns everything

Rejected. It couples shared facts to one platform mode, makes history mutable, and creates unclear restore behavior.

### TaskRecord as the primary history model

Rejected. A flat task log cannot represent one complete production attempt, its option/plan/version snapshots, or fork/re-export semantics. Legacy TaskRecord values remain readable in the retained v2 source for compatibility, but V3 and new writes do not create or mirror TaskRecord history.

### Migrate all v1 business data

Rejected. The v1 data was test-oriented and could be mistaken for real product history. A clean v2 business start is safer and simpler.

### Clear all browser storage during migration

Rejected. It would destroy user API settings and unrelated local data. Business data and runtime settings have different lifecycles.

### Add a separate image-analysis Agent

Rejected for the current scope. It would add a second model call, extra waiting and cost, and another orchestration state without improving the platform Rule Pack boundary. The existing multimodal planner receives the selected product images and must separate user facts, visible image evidence, and missing facts in one request.

## Tradeoffs

- Workspace V3 intentionally has no runs, TaskRecord history, top-level plans/versions mirrors, or Amazon workspace mirror; the retained v2 document is migration input only.
- RunRepository query pagination and lazy asset URL ownership add a small operational layer, but keep history independent from the current session lifecycle.
- v1 business data is intentionally unavailable in the current UI.
- Local browser storage is not encrypted; API settings must continue to disclose that risk.
- Cross-device sync and server-side durability are outside this decision.

## Verification

- `tests/workspace-v2.test.ts`
- `tests/workspace-v3.test.ts`
- `tests/run-repository.test.ts`
- `tests/run-migration.test.ts`
- `tests/repository-compensation.test.ts`
- `tests/production-history.test.ts`
- `tests/run-export.test.ts`
- `tests/settings-store.test.ts`
- `tests/browser-smoke.mjs`
- Evidence under `artifacts/cross-platform-ais/`
