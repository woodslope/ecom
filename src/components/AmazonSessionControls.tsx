import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

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
import {
  AMAZON_STYLE_PRESETS,
  DEFAULT_AMAZON_STYLE_PRESET_ID,
} from "../domain/platforms/amazon-style-presets";
import { Button, Dialog, Field, IconButton, Select, SegmentedControl } from "./ui";

export interface AmazonSessionControlsState {
  marketplaceId: AmazonMarketplaceId;
  plannerMode: "listing" | "aplus";
  listingImageCount: number;
  aPlusType: APlusContentType;
  /** Custom A+ rows; null means “use type defaults”. */
  aPlusModuleSpecs: readonly AmazonAPlusModuleSpec[] | null;
  sizeTier: SizeTier;
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
  if (!session || session.plannerMode === "legacy-combined") {
    return {
      marketplaceId: session?.marketplaceId ?? DEFAULT_AMAZON_MARKETPLACE_ID,
      plannerMode: "listing",
      listingImageCount: session?.listingImageCount ?? DEFAULT_LISTING_IMAGE_COUNT,
      aPlusType: DEFAULT_A_PLUS_CONTENT_TYPE,
      aPlusModuleSpecs: null,
      sizeTier: session?.sizeTier ?? "2K",
      stylePresetId: session?.stylePresetId ?? DEFAULT_AMAZON_STYLE_PRESET_ID,
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
    stylePresetId: session.stylePresetId ?? DEFAULT_AMAZON_STYLE_PRESET_ID,
  };
}

export function expectedSlotCount(state: AmazonSessionControlsState): number {
  if (state.plannerMode === "listing") return state.listingImageCount;
  return effectiveAPlusModuleSpecs(state).length;
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
  if (state.stylePresetId !== (session.stylePresetId ?? DEFAULT_AMAZON_STYLE_PRESET_ID)) {
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
          <li key={`${spec.slot}-${index}`} className="aplus-module-arrange__row">
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
      <p className="aplus-module-arrange__hint">
        策划结果按当前清单校验。改数量或顺序后请重新策划；可选 Logo/对比模块不在此默认列表中。
      </p>
    </div>
  );
}

export function AmazonSessionControls({
  value,
  disabled = false,
  hasPlan = false,
  preferCollapsed = false,
  embedded = false,
  additionalSettings,
  planAction,
  onChange,
}: {
  value: AmazonSessionControlsState;
  disabled?: boolean;
  hasPlan?: boolean;
  /** When true (e.g. a plan already exists), start with params folded so the slot board stays primary. */
  preferCollapsed?: boolean;
  /** Render as part of edge-to-edge workbench chrome (no outer card chrome). */
  embedded?: boolean;
  /** Advanced settings that belong to this same planning decision domain. */
  additionalSettings?: ReactNode;
  /** Primary plan CTA embedded in chrome (shell v1). */
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
  const [paramsOpen, setParamsOpen] = useState(!preferCollapsed);
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  useEffect(() => {
    setParamsOpen(!preferCollapsed);
  }, [preferCollapsed]);
  useEffect(() => {
    setModuleDialogOpen(false);
  }, [hasPlan, value.aPlusType]);

  const slotCount = expectedSlotCount(value);
  const aPlusSpecs = effectiveAPlusModuleSpecs(value);
  const modeDescription =
    value.plannerMode === "listing"
      ? `Listing ${formatAmazonListingSlotRange(value.listingImageCount)}（${slotCount} 张）`
      : `${getAPlusContentTypeLabel(value.aPlusType)} · ${slotCount} 个模块`;
  const marketShort =
    AMAZON_MARKETPLACES.find((item) => item.id === value.marketplaceId)?.shortLabel ?? "US";
  const styleShort =
    AMAZON_STYLE_PRESETS.find((item) => item.id === value.stylePresetId)?.shortLabel ?? "零售";

  return (
    <section
      className={`amazon-session-controls amazon-session-controls--chrome${embedded ? " amazon-session-controls--embedded" : ""}`}
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
        <p className="amazon-session-controls__chip-summary">
          {modeDescription} · {marketShort} · {value.sizeTier} · {styleShort}
        </p>
        <div className="amazon-session-controls__bar-actions">
          <Button
            variant="secondary"
            size="compact"
            className="amazon-session-controls__toggle"
            aria-expanded={paramsOpen}
            disabled={disabled}
            onClick={() => setParamsOpen((open) => !open)}
          >
            {paramsOpen ? "收起参数" : "调整参数"}
          </Button>
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

      {paramsOpen ? (
        <>
      <div className="amazon-session-controls__fields">
        <Field label="目标站点" className="amazon-session-controls__field">
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
          <Field label="Listing 张数" className="amazon-session-controls__field">
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
          <Field label="A+ 类型" className="amazon-session-controls__field">
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

        <Field label="生成尺寸档" className="amazon-session-controls__field">
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

        <Field label="视觉风格" className="amazon-session-controls__field">
          <Select
            aria-label="视觉风格"
            value={value.stylePresetId}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                stylePresetId: event.target.value,
              })
            }
          >
            {AMAZON_STYLE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
                {preset.id === DEFAULT_AMAZON_STYLE_PRESET_ID ? "（默认）" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {additionalSettings ? (
        <div className="amazon-session-controls__additional">{additionalSettings}</div>
      ) : null}

      {value.plannerMode === "aplus" ? (
        hasPlan ? (
          <>
            <div className="aplus-module-readonly" aria-label="A+ 模块编排只读摘要">
              <div>
                <strong>模块编排</strong>
                <span>{aPlusSpecs.length} / {MAX_A_PLUS_MODULE_COUNT} · 当前策划模块只读</span>
              </div>
              <Button
                variant="secondary"
                size="compact"
                disabled={disabled}
                onClick={() => setModuleDialogOpen(true)}
              >
                <Pencil size={14} />
                调整模块
              </Button>
            </div>
            <Dialog
              open={moduleDialogOpen}
              title="调整 A+ 模块"
              eyebrow={`${getAPlusContentTypeLabel(value.aPlusType)} · ${aPlusSpecs.length} 个模块`}
              className="aplus-module-dialog"
              onClose={() => setModuleDialogOpen(false)}
              footer={
                <Button
                  onClick={() => {
                    setModuleDialogOpen(false);
                    setParamsOpen(false);
                  }}
                >
                  完成调整
                </Button>
              }
            >
              <APlusModuleArrange
                aPlusType={value.aPlusType}
                specs={aPlusSpecs}
                disabled={disabled}
                onChange={(next) =>
                  onChange({
                    ...value,
                    aPlusModuleSpecs: next
                      ? cloneSpecs(normalizeAPlusModuleSpecs(value.aPlusType, next))
                      : null,
                  })
                }
              />
            </Dialog>
          </>
        ) : (
          <APlusModuleArrange
            aPlusType={value.aPlusType}
            specs={aPlusSpecs}
            disabled={disabled}
            onChange={(next) =>
              onChange({
                ...value,
                aPlusModuleSpecs: next
                  ? cloneSpecs(normalizeAPlusModuleSpecs(value.aPlusType, next))
                  : null,
              })
            }
          />
        )
      ) : null}

      <p className="amazon-session-controls__summary">
        站点 {marketShort} · {value.sizeTier} 生成画布 · 风格 {styleShort}
        {value.plannerMode === "listing" ? " · MAIN 不套用风格" : " · 改模块后请重新策划"}
        。左侧可粘贴 Listing；完整档案在「资料库」。
      </p>
        </>
      ) : null}
    </section>
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
      plan?.amazonSession?.stylePresetId,
      // eslint-disable-next-line react-hooks/exhaustive-deps -- serialize custom modules
      JSON.stringify(plan?.amazonSession?.aPlusModuleSpecs?.map((s) => s.slot) ?? null),
    ],
  );
  const [value, setValue] = useState(seed);
  const seedKey = `${seed.plannerMode}:${seed.marketplaceId}:${seed.listingImageCount}:${seed.aPlusType}:${seed.sizeTier}:${seed.stylePresetId}:${seed.aPlusModuleSpecs?.map((s) => s.slot).join(",") ?? "default"}`;
  useEffect(() => {
    setValue(seed);
  }, [seedKey]);
  return [value, setValue] as const;
}
