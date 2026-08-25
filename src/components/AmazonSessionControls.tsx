import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  A_PLUS_CONTENT_TYPES,
  DEFAULT_A_PLUS_CONTENT_TYPE,
  DEFAULT_LISTING_IMAGE_COUNT,
  LISTING_IMAGE_COUNT_OPTIONS,
  MAX_A_PLUS_MODULE_COUNT,
  MIN_A_PLUS_MODULE_COUNT,
  areAPlusModuleSpecsEquivalent,
  formatAmazonListingSlotRange,
  getAPlusContentTypeLabel,
  getAPlusModuleSpecs,
  getAPlusModuleUploadSize,
  insertAPlusModuleSpecAfter,
  normalizeAPlusModuleSpecs,
  removeAPlusModuleSpecAt,
  type AmazonAPlusModuleSpec,
  type APlusContentType,
  type SizeTier,
} from "../domain/platforms/amazon-catalog";
import {
  AMAZON_MARKETPLACES,
  DEFAULT_AMAZON_MARKETPLACE_ID,
  type AmazonMarketplaceId,
} from "../domain/platforms/amazon-marketplaces";
import type { AmazonPlanningRequestOptions, PlatformPlan } from "../domain/planning/types";
import { Button, Dialog, Field, IconButton, Select, SegmentedControl } from "./ui";
import { DEFAULT_PROMPT_PROFILE_ID } from "../domain/prompt-profiles/prompt-profiles";

export interface AmazonSessionControlsState {
  marketplaceId: AmazonMarketplaceId;
  plannerMode: "listing" | "aplus";
  listingImageCount: number;
  aPlusType: APlusContentType;
  /** Custom A+ rows; null means “use type defaults”. */
  aPlusModuleSpecs: readonly AmazonAPlusModuleSpec[] | null;
  sizeTier: SizeTier;
  /** Internal fixed default; visual strategy is now owned by industry templates. */
  stylePresetId: string;
}

function cloneSpecs(specs: readonly AmazonAPlusModuleSpec[]): AmazonAPlusModuleSpec[] {
  return specs.map((spec) => ({ ...spec }));
}

export function effectiveAPlusModuleSpecs(
  state: Pick<AmazonSessionControlsState, "aPlusType" | "aPlusModuleSpecs">,
): readonly AmazonAPlusModuleSpec[] {
  if (state.aPlusModuleSpecs && state.aPlusModuleSpecs.length > 0) {
    return normalizeAPlusModuleSpecs(state.aPlusType, state.aPlusModuleSpecs);
  }
  return getAPlusModuleSpecs(state.aPlusType);
}

export function amazonOptionsFromControls(
  state: AmazonSessionControlsState,
): AmazonPlanningRequestOptions {
  const options: AmazonPlanningRequestOptions = {
    marketplaceId: state.marketplaceId,
    plannerMode: state.plannerMode,
    listingImageCount: state.listingImageCount,
    aPlusType: state.aPlusType,
    sizeTier: state.sizeTier,
    stylePresetId: state.stylePresetId,
  };
  if (state.plannerMode === "aplus" && state.aPlusModuleSpecs) {
    options.aPlusModuleSpecs = effectiveAPlusModuleSpecs(state);
  }
  return options;
}

export function controlsFromPlan(plan?: PlatformPlan | null): AmazonSessionControlsState {
  const session = plan?.amazonSession;
  // Older persisted plans used one combined Amazon mode. Keep them readable as
  // Listing defaults until the user explicitly replans; remove after migration
  // confirms no stored session emits legacy-combined.
  if (!session || session.plannerMode === "legacy-combined") {
    return {
      marketplaceId: session?.marketplaceId ?? DEFAULT_AMAZON_MARKETPLACE_ID,
      plannerMode: "listing",
      listingImageCount: session?.listingImageCount ?? DEFAULT_LISTING_IMAGE_COUNT,
      aPlusType: DEFAULT_A_PLUS_CONTENT_TYPE,
      aPlusModuleSpecs: null,
      sizeTier: session?.sizeTier ?? "2K",
      stylePresetId: DEFAULT_PROMPT_PROFILE_ID,
    };
  }
  const aPlusType = session.aPlusType ?? DEFAULT_A_PLUS_CONTENT_TYPE;
  const defaults = getAPlusModuleSpecs(aPlusType);
  const custom = session.aPlusModuleSpecs;
  const useCustom =
    session.plannerMode === "aplus" &&
    custom &&
    custom.length > 0 &&
    !areAPlusModuleSpecsEquivalent(normalizeAPlusModuleSpecs(aPlusType, custom), defaults);

  return {
    marketplaceId: session.marketplaceId,
    plannerMode: session.plannerMode === "aplus" ? "aplus" : "listing",
    listingImageCount: session.listingImageCount ?? DEFAULT_LISTING_IMAGE_COUNT,
    aPlusType,
    aPlusModuleSpecs: useCustom ? cloneSpecs(normalizeAPlusModuleSpecs(aPlusType, custom)) : null,
    sizeTier: session.sizeTier ?? "2K",
    stylePresetId: DEFAULT_PROMPT_PROFILE_ID,
  };
}

export function expectedSlotCount(state: AmazonSessionControlsState): number {
  if (state.plannerMode === "listing") return state.listingImageCount;
  return effectiveAPlusModuleSpecs(state).length;
}

export function amazonControlsSummary(value: AmazonSessionControlsState): string {
  const market = AMAZON_MARKETPLACES.find((item) => item.id === value.marketplaceId);
  const output = value.plannerMode === "listing"
    ? `${value.listingImageCount} 张`
    : `${getAPlusContentTypeLabel(value.aPlusType)} · ${expectedSlotCount(value)} 个模块`;
  return `${market?.label ?? value.marketplaceId} · ${output} · ${value.sizeTier}`;
}

export function amazonControlsMatchPlan(
  state: AmazonSessionControlsState,
  plan?: PlatformPlan | null,
): boolean {
  const session = plan?.amazonSession;
  if (!session || session.plannerMode === "legacy-combined") return false;
  if (state.plannerMode !== session.plannerMode) return false;
  if (state.marketplaceId !== session.marketplaceId || state.sizeTier !== (session.sizeTier ?? "2K")) {
    return false;
  }
  if (state.plannerMode === "listing") {
    return state.listingImageCount === (session.listingImageCount ?? DEFAULT_LISTING_IMAGE_COUNT);
  }
  if (state.aPlusType !== (session.aPlusType ?? DEFAULT_A_PLUS_CONTENT_TYPE)) return false;
  return areAPlusModuleSpecsEquivalent(
    effectiveAPlusModuleSpecs(state),
    normalizeAPlusModuleSpecs(state.aPlusType, session.aPlusModuleSpecs),
  );
}

function APlusModuleArrange({
  aPlusType,
  specs,
  disabled,
  onChange,
}: {
  aPlusType: APlusContentType;
  specs: readonly AmazonAPlusModuleSpec[];
  disabled?: boolean;
  onChange: (next: readonly AmazonAPlusModuleSpec[] | null) => void;
}) {
  const defaults = getAPlusModuleSpecs(aPlusType);
  const isDefault = areAPlusModuleSpecsEquivalent(specs, defaults);
  const canAdd = specs.length < MAX_A_PLUS_MODULE_COUNT;
  const canRemove = specs.length > MIN_A_PLUS_MODULE_COUNT;

  return (
    <div className="aplus-module-arrange" aria-label="A+ 模块编排">
      <div className="aplus-module-arrange__header">
        <div>
          <strong>模块编排</strong>
          <span>
            {specs.length} / {MAX_A_PLUS_MODULE_COUNT} · 可增删同尺寸模块
          </span>
        </div>
        <Button
          variant="secondary"
          size="compact"
          disabled={disabled || isDefault}
          onClick={() => onChange(null)}
        >
          <RotateCcw size={15} />
          恢复默认
        </Button>
      </div>
      <ol className="aplus-module-arrange__list">
        {specs.map((spec, index) => (
          <li key={spec.slot} className="aplus-module-arrange__row">
            <div className="aplus-module-arrange__meta">
              <strong>
                {index + 1}. {spec.displayLabel || spec.label}
              </strong>
              <span>
                {spec.slot} · {getAPlusModuleUploadSize(spec)} · {spec.moduleType}
              </span>
            </div>
            <div className="aplus-module-arrange__actions">
              <IconButton
                label={`在第 ${index + 1} 行后添加同尺寸模块`}
                disabled={disabled || !canAdd}
                onClick={() => onChange(insertAPlusModuleSpecAfter(aPlusType, specs, index))}
              >
                <Plus size={15} />
              </IconButton>
              <IconButton
                label={`删除第 ${index + 1} 个模块`}
                disabled={disabled || !canRemove}
                onClick={() => onChange(removeAPlusModuleSpecAt(aPlusType, specs, index))}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AmazonSessionControls({
  value,
  disabled = false,
  hasPlan = false,
  industrySettings,
  planAction,
  onChange,
}: {
  value: AmazonSessionControlsState;
  disabled?: boolean;
  hasPlan?: boolean;
  /** Industry guidance rendered as a full-width strategy row. */
  industrySettings?: ReactNode;
  /** Primary plan/replan action displayed beside the current mode summary. */
  planAction?: {
    label: string;
    disabled?: boolean;
    title?: string;
    describedBy?: string;
    busy?: boolean;
    variant?: "primary" | "secondary";
    onClick: () => void;
  };
  onChange: (next: AmazonSessionControlsState) => void;
}) {
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [moduleDraft, setModuleDraft] = useState<AmazonAPlusModuleSpec[] | null>(null);
  useEffect(() => {
    setModuleDialogOpen(false);
    setModuleDraft(null);
  }, [hasPlan, value.aPlusType, value.plannerMode]);

  const aPlusSpecs = effectiveAPlusModuleSpecs(value);
  const openModuleDialog = () => {
    setModuleDraft(cloneSpecs(aPlusSpecs));
    setModuleDialogOpen(true);
  };
  const closeModuleDialog = () => {
    setModuleDialogOpen(false);
    setModuleDraft(null);
  };
  const applyModuleDraft = () => {
    const normalized = normalizeAPlusModuleSpecs(value.aPlusType, moduleDraft ?? aPlusSpecs);
    const nextSpecs = areAPlusModuleSpecsEquivalent(
      normalized,
      getAPlusModuleSpecs(value.aPlusType),
    )
      ? null
      : cloneSpecs(normalized);
    onChange({ ...value, aPlusModuleSpecs: nextSpecs });
    closeModuleDialog();
  };
  return (
    <>
    <section
      className="amazon-session-controls amazon-session-controls--chrome"
      aria-label="Amazon 策划模式"
    >
      <div className="amazon-session-controls__bar">
        <SegmentedControl
          className="amazon-session-controls__modes"
          ariaLabel="Listing 或 A+"
          value={value.plannerMode}
          disabled={disabled}
          options={[
            { value: "listing", label: "Listing 图" },
            { value: "aplus", label: "A+ 图" },
          ]}
          onChange={(plannerMode) => onChange({ ...value, plannerMode })}
        />
        <div className="amazon-session-controls__bar-actions">
          {value.plannerMode === "aplus" ? (
            <Button
              variant="secondary"
              size="compact"
              disabled={disabled}
              onClick={openModuleDialog}
            >
              A+模板编排
            </Button>
          ) : null}
          {planAction ? (
            <Button
              variant={planAction.variant ?? "primary"}
              size="compact"
              className="amazon-session-controls__plan"
              disabled={planAction.disabled || disabled}
              loading={planAction.busy}
              loadingLabel="策划中..."
              title={planAction.title}
              aria-describedby={planAction.describedBy}
              onClick={planAction.onClick}
            >
              {planAction.label}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="amazon-session-controls__params">
          <section className="planning-settings-group planning-settings-group--platform">
            <div className="planning-settings-group__heading">
              <strong>输出设置</strong>
              <span>决定站点、交付数量和生成画布规格。</span>
            </div>
            <div className="amazon-session-controls__fields">
            <Field label="目标站点" name="marketplaceId" className="amazon-session-controls__field">
              <Select
                aria-label="目标站点"
                value={value.marketplaceId}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    marketplaceId: event.target.value as AmazonMarketplaceId,
                  })
                }
              >
                {AMAZON_MARKETPLACES.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.label}（{market.domain}）
                  </option>
                ))}
              </Select>
            </Field>

            {value.plannerMode === "listing" ? (
              <Field label="Listing 张数" name="listingImageCount" className="amazon-session-controls__field">
                <Select
                  aria-label="Listing 张数"
                  value={value.listingImageCount}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      listingImageCount: Number(event.target.value),
                    })
                  }
                >
                  {LISTING_IMAGE_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} 张（{formatAmazonListingSlotRange(count)}）
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="A+ 类型" name="aPlusType" className="amazon-session-controls__field">
                <Select
                  aria-label="A+ 类型"
                  value={value.aPlusType}
                  disabled={disabled}
                  onChange={(event) => {
                    const aPlusType = event.target.value as APlusContentType;
                    onChange({
                      ...value,
                      aPlusType,
                      // Type change always resets to that type's default module list.
                      aPlusModuleSpecs: null,
                    });
                  }}
                >
                  {A_PLUS_CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getAPlusContentTypeLabel(type)}
                      {type === DEFAULT_A_PLUS_CONTENT_TYPE ? "（默认）" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="生成尺寸档" name="sizeTier" className="amazon-session-controls__field">
              <Select
                aria-label="生成尺寸档"
                value={value.sizeTier}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sizeTier: event.target.value as SizeTier,
                  })
                }
              >
                <option value="1K">1K</option>
                <option value="2K">2K（默认）</option>
                <option value="4K">4K</option>
              </Select>
            </Field>

          </div>
          </section>

          {industrySettings ? <div className="amazon-session-controls__industry">{industrySettings}</div> : null}

          {value.plannerMode === "aplus" ? (
            <>
              <Dialog
                open={moduleDialogOpen}
                title="编排 A+ 模块"
                className="aplus-module-dialog"
                onClose={closeModuleDialog}
                footer={
                  <>
                    <Button variant="secondary" onClick={closeModuleDialog}>
                      取消
                    </Button>
                    <Button onClick={applyModuleDraft}>应用编排</Button>
                  </>
                }
                >
                <APlusModuleArrange
                  aPlusType={value.aPlusType}
                  specs={moduleDraft ?? aPlusSpecs}
                  disabled={disabled}
                  onChange={(next) =>
                    setModuleDraft(
                      cloneSpecs(
                        next
                          ? normalizeAPlusModuleSpecs(value.aPlusType, next)
                          : getAPlusModuleSpecs(value.aPlusType),
                      ),
                    )
                  }
                />
              </Dialog>
            </>
          ) : null}

        </div>
    </section>
    </>
  );
}

export function useAmazonSessionControls(
  plan?: PlatformPlan | null,
  activeMode?: "listing" | "aplus",
) {
  const seed = useMemo(
    () => {
      const value = controlsFromPlan(plan);
      return activeMode ? { ...value, plannerMode: activeMode } : value;
    },
    [
      activeMode,
      plan?.amazonSession?.plannerMode,
      plan?.amazonSession?.marketplaceId,
      plan?.amazonSession?.listingImageCount,
      plan?.amazonSession?.aPlusType,
      plan?.amazonSession?.sizeTier,
      // eslint-disable-next-line react-hooks/exhaustive-deps -- serialize custom modules
      JSON.stringify(plan?.amazonSession?.aPlusModuleSpecs?.map((s) => s.slot) ?? null),
    ],
  );
  const [value, setValue] = useState(seed);
  const seedKey = `${seed.plannerMode}:${seed.marketplaceId}:${seed.listingImageCount}:${seed.aPlusType}:${seed.sizeTier}:${seed.aPlusModuleSpecs?.map((s) => s.slot).join(",") ?? "default"}`;
  useEffect(() => {
    setValue(seed);
  }, [seedKey]);
  return [value, setValue] as const;
}
