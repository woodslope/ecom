/**
 * Amazon Listing / A+ catalog aligned with Amazon Image Studio
 * (Ali-Aria/amazon-image-studio @ bca89d728e415c453db363dcba30ac8ea243edaf).
 *
 * Behavior mirror of AIS `src/lib/listingPlanner.ts` defaults and module specs.
 * Current Amazon sessions resolve their split Listing/A+ rule pack from this catalog.
 */

import type { AmazonMarketplaceId } from "./amazon-marketplaces";
import { DEFAULT_AMAZON_MARKETPLACE_ID, normalizeAmazonMarketplaceId } from "./amazon-marketplaces";
import type { PlatformSlotGroup, PlatformSlotRule, SlotDimensions } from "./types";

/**
 * `listing` / `aplus` = AIS split modes.
 * `legacy-combined` = pre-alignment Ecom pack (Listing7 + standard A+); kept for restore.
 */
export type AmazonPlannerMode = "listing" | "aplus" | "legacy-combined";

/** AIS A+ content types. Default UI type is `standard-large` (普通A+), not `standard`. */
export type APlusContentType = "standard" | "standard-large" | "premium" | "mobile";

export type APlusModuleKind =
  | "header-banner"
  | "single-image"
  | "highlight-tile"
  | "hero-banner"
  | "feature-image"
  | "brand-story"
  | "logo"
  | "comparison-thumbnail";

/** Provider generation tier mapped to concrete dimensions by `generation-size.ts`. */
export type SizeTier = "1K" | "2K" | "4K";

export const DEFAULT_SIZE_TIER: SizeTier = "2K";

export const A_PLUS_CONTENT_TYPES: readonly APlusContentType[] = Object.freeze([
  "standard-large",
  "standard",
  "premium",
  "mobile",
]);

export const DEFAULT_A_PLUS_CONTENT_TYPE: APlusContentType = "standard-large";

export const MIN_A_PLUS_MODULE_COUNT = 1;
export const MAX_A_PLUS_MODULE_COUNT = 12;

export const DEFAULT_LISTING_IMAGE_COUNT = 7;
export const MIN_LISTING_IMAGE_COUNT = 7;
export const MAX_LISTING_IMAGE_COUNT = 12;

export const LISTING_IMAGE_COUNT_OPTIONS: readonly number[] = Object.freeze(
  Array.from(
    { length: MAX_LISTING_IMAGE_COUNT - MIN_LISTING_IMAGE_COUNT + 1 },
    (_, index) => MIN_LISTING_IMAGE_COUNT + index,
  ),
);

const LISTING_UPLOAD: SlotDimensions = Object.freeze({
  width: 2000,
  height: 2000,
  unit: "px",
});

export interface AmazonAPlusModuleSpec {
  readonly contentType: APlusContentType | "optional";
  readonly slot: string;
  readonly label: string;
  readonly displayLabel: string;
  readonly moduleType: APlusModuleKind;
  readonly uploadWidth: number;
  readonly uploadHeight: number;
  readonly objective: string;
}

function freezeSpec(spec: AmazonAPlusModuleSpec): AmazonAPlusModuleSpec {
  return Object.freeze({ ...spec });
}

function freezeSpecs(specs: readonly AmazonAPlusModuleSpec[]): readonly AmazonAPlusModuleSpec[] {
  return Object.freeze(specs.map(freezeSpec));
}

export const STANDARD_A_PLUS_MODULE_SPECS: readonly AmazonAPlusModuleSpec[] = freezeSpecs([
  {
    contentType: "standard",
    slot: "A+S01",
    label: "Header Banner",
    displayLabel: "顶部横幅",
    moduleType: "header-banner",
    uploadWidth: 970,
    uploadHeight: 300,
    objective: "用横幅建立品牌质感和核心产品利益点。",
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: "standard" as const,
    slot: `A+S0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: "single-image" as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: "用单图模块讲清一个关键卖点或使用场景。",
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: "standard" as const,
    slot: `A+S0${index + 5}`,
    label: `Highlight Tile ${index + 1}`,
    displayLabel: `卖点方块 ${index + 1}`,
    moduleType: "highlight-tile" as const,
    uploadWidth: 220,
    uploadHeight: 220,
    objective: "用方形图块快速呈现一个产品亮点。",
  })),
]);

export const STANDARD_LARGE_A_PLUS_MODULE_SPECS: readonly AmazonAPlusModuleSpec[] = freezeSpecs([
  {
    contentType: "standard-large",
    slot: "A+L01",
    label: "Header Banner",
    displayLabel: "顶部横幅",
    moduleType: "header-banner",
    uploadWidth: 970,
    uploadHeight: 300,
    objective: "用横幅建立品牌质感和核心产品利益点。",
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: "standard-large" as const,
    slot: `A+L0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: "single-image" as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: "用整张大图讲清一个关键卖点、使用场景或细节证据。",
  })),
]);

export const PREMIUM_A_PLUS_MODULE_SPECS: readonly AmazonAPlusModuleSpec[] = freezeSpecs([
  {
    contentType: "premium",
    slot: "A+P01",
    label: "Hero Banner",
    displayLabel: "高级首屏横幅",
    moduleType: "hero-banner",
    uploadWidth: 1464,
    uploadHeight: 600,
    objective: "用高级横幅建立首屏视觉冲击和品牌氛围。",
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: "premium" as const,
    slot: `A+P0${index + 2}`,
    label: `Feature Image ${index + 1}`,
    displayLabel: `高级大图模块 ${index + 1}`,
    moduleType: "feature-image" as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: "用大图模块展示核心功能、材质或真实场景。",
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    contentType: "premium" as const,
    slot: `A+P0${index + 5}`,
    label: `Brand Story ${index + 1}`,
    displayLabel: `品牌故事 ${index + 1}`,
    moduleType: "brand-story" as const,
    uploadWidth: 463,
    uploadHeight: 625,
    objective: "用竖图讲述品牌故事、理念或系列定位。",
  })),
]);

export const MOBILE_A_PLUS_MODULE_SPECS: readonly AmazonAPlusModuleSpec[] = freezeSpecs([
  {
    contentType: "mobile",
    slot: "A+M01",
    label: "Mobile Hero",
    displayLabel: "手机首屏",
    moduleType: "hero-banner",
    uploadWidth: 600,
    uploadHeight: 450,
    objective: "用移动端首屏图建立产品核心卖点和清晰视觉吸引力。",
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: "mobile" as const,
    slot: `A+M0${index + 2}`,
    label: `Mobile Feature ${index + 1}`,
    displayLabel: `手机卖点图 ${index + 1}`,
    moduleType: "feature-image" as const,
    uploadWidth: 600,
    uploadHeight: 450,
    objective: "用移动端友好的 4:3 图片讲清一个关键卖点、细节证据或使用场景。",
  })),
]);

export const OPTIONAL_A_PLUS_MODULE_SPECS: readonly AmazonAPlusModuleSpec[] = freezeSpecs([
  {
    contentType: "optional",
    slot: "A+LOGO",
    label: "Logo Image",
    displayLabel: "品牌 Logo",
    moduleType: "logo",
    uploadWidth: 600,
    uploadHeight: 180,
    objective: "用于已有品牌标志素材，不默认生成虚构 Logo。",
  },
  {
    contentType: "optional",
    slot: "A+CMP",
    label: "Comparison Thumbnail",
    displayLabel: "对比缩略图",
    moduleType: "comparison-thumbnail",
    uploadWidth: 150,
    uploadHeight: 300,
    objective: "用于同品牌 SKU 对比，不默认生成不确定对比信息。",
  },
]);

const A_PLUS_SPECS_BY_TYPE: Readonly<Record<APlusContentType, readonly AmazonAPlusModuleSpec[]>> =
  Object.freeze({
    standard: STANDARD_A_PLUS_MODULE_SPECS,
    "standard-large": STANDARD_LARGE_A_PLUS_MODULE_SPECS,
    premium: PREMIUM_A_PLUS_MODULE_SPECS,
    mobile: MOBILE_A_PLUS_MODULE_SPECS,
  });

/** Session options for Amazon planning (AIS Listing | A+ split). */
export interface AmazonPlanningSessionOptions {
  readonly marketplaceId?: AmazonMarketplaceId;
  readonly plannerMode: AmazonPlannerMode;
  readonly listingImageCount?: number;
  readonly aPlusType?: APlusContentType;
  /** Custom module list for the current A+ type; omit to use the type default. */
  readonly aPlusModuleSpecs?: readonly AmazonAPlusModuleSpec[];
  readonly sizeTier?: SizeTier;
  readonly stylePresetId?: string | null;
}

export interface ResolvedAmazonPlanningSession {
  readonly marketplaceId: AmazonMarketplaceId;
  readonly plannerMode: AmazonPlannerMode;
  readonly listingImageCount: number;
  readonly aPlusType: APlusContentType;
  readonly aPlusModuleSpecs: readonly AmazonAPlusModuleSpec[];
  readonly sizeTier: SizeTier;
  readonly stylePresetId: string | null;
  readonly slotKeys: readonly string[];
  readonly slots: readonly PlatformSlotRule[];
}

export function normalizeListingImageCount(value: unknown): number {
  const count =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : DEFAULT_LISTING_IMAGE_COUNT;
  if (!Number.isFinite(count)) return DEFAULT_LISTING_IMAGE_COUNT;
  return Math.min(
    MAX_LISTING_IMAGE_COUNT,
    Math.max(MIN_LISTING_IMAGE_COUNT, Math.trunc(count)),
  );
}

export function getAmazonListingImageSlots(
  count: unknown = DEFAULT_LISTING_IMAGE_COUNT,
): readonly string[] {
  const normalizedCount = normalizeListingImageCount(count);
  return Object.freeze([
    "MAIN",
    ...Array.from(
      { length: normalizedCount - 1 },
      (_, index) => `PT${String(index + 1).padStart(2, "0")}`,
    ),
  ]);
}

export function formatAmazonListingSlotRange(
  count: unknown = DEFAULT_LISTING_IMAGE_COUNT,
): string {
  const slots = getAmazonListingImageSlots(count);
  const tailSlots = slots.slice(1);
  if (!tailSlots.length) return slots[0] ?? "MAIN";
  return `MAIN + ${tailSlots[0]}-${tailSlots[tailSlots.length - 1]}`;
}

export function isAmazonListingMainSlot(slot?: string | null): boolean {
  return slot?.trim().toUpperCase() === "MAIN";
}

export function isAPlusContentType(value: unknown): value is APlusContentType {
  return (
    value === "standard" ||
    value === "standard-large" ||
    value === "premium" ||
    value === "mobile"
  );
}

export function normalizeAPlusContentType(value: unknown): APlusContentType {
  return isAPlusContentType(value) ? value : DEFAULT_A_PLUS_CONTENT_TYPE;
}

export function getAPlusContentTypeLabel(type: APlusContentType): string {
  switch (type) {
    case "standard-large":
      return "普通A+";
    case "standard":
      return "标准A+";
    case "premium":
      return "高级A+";
    case "mobile":
      return "手机A+";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function getAPlusModuleSpecs(type: APlusContentType): readonly AmazonAPlusModuleSpec[] {
  return A_PLUS_SPECS_BY_TYPE[type];
}

export function findAPlusModuleSpec(slot: string): AmazonAPlusModuleSpec | undefined {
  const all = [
    ...STANDARD_A_PLUS_MODULE_SPECS,
    ...STANDARD_LARGE_A_PLUS_MODULE_SPECS,
    ...PREMIUM_A_PLUS_MODULE_SPECS,
    ...MOBILE_A_PLUS_MODULE_SPECS,
    ...OPTIONAL_A_PLUS_MODULE_SPECS,
  ];
  return all.find((spec) => spec.slot === slot);
}

export function getAPlusModuleUploadDimensions(
  spec: Pick<AmazonAPlusModuleSpec, "uploadWidth" | "uploadHeight">,
): SlotDimensions {
  return Object.freeze({
    width: spec.uploadWidth,
    height: spec.uploadHeight,
    unit: "px" as const,
  });
}

export function getAPlusModuleUploadSize(
  spec: Pick<AmazonAPlusModuleSpec, "uploadWidth" | "uploadHeight">,
): string {
  return `${spec.uploadWidth}x${spec.uploadHeight}`;
}

export function isAPlusExternalTextModuleSpec(
  spec: Pick<AmazonAPlusModuleSpec, "moduleType" | "uploadWidth" | "uploadHeight">,
): boolean {
  return spec.moduleType === "highlight-tile" && spec.uploadWidth === 220 && spec.uploadHeight === 220;
}

export function isAPlusExternalTextSlotRule(
  rule: Pick<PlatformSlotRule, "group" | "dimensions">,
): boolean {
  return rule.group === "a-plus" && rule.dimensions.width === 220 && rule.dimensions.height === 220;
}

/**
 * Normalize a custom A+ module list for one content type.
 * Clamps length to 1–12 and rewrites slot keys to the type's prefix sequence.
 */
export function normalizeAPlusModuleSpecs(
  type: APlusContentType,
  specs: readonly AmazonAPlusModuleSpec[] | undefined,
): readonly AmazonAPlusModuleSpec[] {
  const defaults = getAPlusModuleSpecs(type);
  const source = specs && specs.length > 0 ? specs : defaults;
  const clamped = source.slice(0, MAX_A_PLUS_MODULE_COUNT);
  const ensured =
    clamped.length >= MIN_A_PLUS_MODULE_COUNT
      ? clamped
      : defaults.slice(0, MIN_A_PLUS_MODULE_COUNT);

  const prefix =
    type === "standard-large"
      ? "A+L"
      : type === "standard"
        ? "A+S"
        : type === "premium"
          ? "A+P"
          : "A+M";

  return freezeSpecs(
    ensured.map((spec, index) => ({
      contentType: type,
      slot: `${prefix}${String(index + 1).padStart(2, "0")}`,
      label: spec.label,
      displayLabel: spec.displayLabel,
      moduleType: spec.moduleType,
      uploadWidth: spec.uploadWidth,
      uploadHeight: spec.uploadHeight,
      objective: spec.objective,
    })),
  );
}

export function insertAPlusModuleSpecAfter(
  type: APlusContentType,
  specs: readonly AmazonAPlusModuleSpec[],
  index: number,
): readonly AmazonAPlusModuleSpec[] {
  if (specs.length >= MAX_A_PLUS_MODULE_COUNT) {
    return normalizeAPlusModuleSpecs(type, specs);
  }
  const template = specs[index] ?? getAPlusModuleSpecs(type)[0];
  const next = [...specs];
  next.splice(index + 1, 0, { ...template });
  return normalizeAPlusModuleSpecs(type, next);
}

export function removeAPlusModuleSpecAt(
  type: APlusContentType,
  specs: readonly AmazonAPlusModuleSpec[],
  index: number,
): readonly AmazonAPlusModuleSpec[] {
  if (specs.length <= MIN_A_PLUS_MODULE_COUNT) {
    return normalizeAPlusModuleSpecs(type, specs);
  }
  const next = specs.filter((_, i) => i !== index);
  return normalizeAPlusModuleSpecs(type, next);
}

export function areAPlusModuleSpecsEquivalent(
  left: readonly AmazonAPlusModuleSpec[],
  right: readonly AmazonAPlusModuleSpec[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((spec, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      spec.slot === other.slot &&
      spec.moduleType === other.moduleType &&
      spec.uploadWidth === other.uploadWidth &&
      spec.uploadHeight === other.uploadHeight &&
      spec.label === other.label
    );
  });
}

const LISTING_SLOT_META: Readonly<
  Record<string, { label: string; purpose: string; planningHints: readonly string[] }>
> = Object.freeze({
  MAIN: Object.freeze({
    label: "Main image",
    purpose: "准确展示一个完整、可识别的在售商品主体。",
    planningHints: Object.freeze([
      "使用纯白背景",
      "仅展示一个在售商品",
      "主体完整且占据主要画面",
      "选择能准确识别商品的单一视角",
    ]),
  }),
  PT01: Object.freeze({
    label: "Core benefit",
    purpose: "用清晰的信息图说明最重要的产品利益点。",
    planningHints: Object.freeze(["只突出一个核心利益点", "使用短标题和可验证证据"]),
  }),
  PT02: Object.freeze({
    label: "Feature proof",
    purpose: "解释关键结构、功能或材质如何产生用户收益。",
    planningHints: Object.freeze(["用局部细节支撑功能", "将功能与用户收益配对"]),
  }),
  PT03: Object.freeze({
    label: "Lifestyle",
    purpose: "展示目标用户在真实环境中的典型使用场景。",
    planningHints: Object.freeze(["场景与目标市场匹配", "商品仍需清楚可见"]),
  }),
  PT04: Object.freeze({
    label: "Size and fit",
    purpose: "帮助买家理解尺寸、容量、适配关系或使用边界。",
    planningHints: Object.freeze(["标明单位", "使用清楚的尺寸参照"]),
  }),
  PT05: Object.freeze({
    label: "Detail and material",
    purpose: "通过细节、材质或工艺证据降低购买疑虑。",
    planningHints: Object.freeze(["使用真实质感的近景", "解释可见差异"]),
  }),
  PT06: Object.freeze({
    label: "Package and trust",
    purpose: "说明包装清单、使用准备或有依据的品牌信任信息。",
    planningHints: Object.freeze(["展示当前 SKU 实际包含内容", "仅使用已确认的品牌事实"]),
  }),
});

function listingSlotRule(key: string, order: number): PlatformSlotRule {
  const meta = LISTING_SLOT_META[key] ?? {
    label: key === "MAIN" ? "Main image" : `Listing image ${key}`,
    purpose: "展示与 Listing 序列互补的产品信息。",
    planningHints: ["保持与已有 Listing 图差异化", "事实来自商品资料"],
  };
  const complianceReminders =
    key === "MAIN"
      ? Object.freeze([
          "不得出现文案、徽章、价格、评分、水印、边框或类似 Amazon 的标记",
          "不得添加未随商品销售的道具或配件",
        ])
      : Object.freeze(["不得包含价格、促销、评分或无法证明的效果承诺"]);

  return Object.freeze({
    key,
    label: meta.label,
    group: "listing" as PlatformSlotGroup,
    order,
    required: true as const,
    dimensions: LISTING_UPLOAD,
    purpose: meta.purpose,
    planningHints: meta.planningHints,
    complianceReminders,
  });
}

function aPlusSlotRule(spec: AmazonAPlusModuleSpec, order: number): PlatformSlotRule {
  return Object.freeze({
    key: spec.slot,
    label: spec.label,
    group: "a-plus" as PlatformSlotGroup,
    order,
    required: true as const,
    dimensions: getAPlusModuleUploadDimensions(spec),
    purpose: spec.objective,
    planningHints: Object.freeze([spec.displayLabel, getAPlusModuleUploadSize(spec)]),
    complianceReminders: Object.freeze([
      "不得出现价格、促销、评论、联系方式或攻击性号召",
    ]),
  });
}

export function buildAmazonListingSlotRules(
  count: unknown = DEFAULT_LISTING_IMAGE_COUNT,
): readonly PlatformSlotRule[] {
  const keys = getAmazonListingImageSlots(count);
  return Object.freeze(keys.map((key, index) => listingSlotRule(key, index + 1)));
}

export function buildAmazonAPlusSlotRules(
  type: APlusContentType = DEFAULT_A_PLUS_CONTENT_TYPE,
  specs?: readonly AmazonAPlusModuleSpec[],
): readonly PlatformSlotRule[] {
  const normalized = normalizeAPlusModuleSpecs(type, specs);
  return Object.freeze(normalized.map((spec, index) => aPlusSlotRule(spec, index + 1)));
}

/**
 * Resolve AIS-aligned slot rules for one Amazon planning session.
 * Listing mode returns only listing slots; A+ mode returns only A+ modules.
 */
export function resolveAmazonPlanningSession(
  options: AmazonPlanningSessionOptions,
): ResolvedAmazonPlanningSession {
  const marketplaceId = normalizeAmazonMarketplaceId(options.marketplaceId);
  const plannerMode: AmazonPlannerMode =
    options.plannerMode === "aplus"
      ? "aplus"
      : options.plannerMode === "legacy-combined"
        ? "legacy-combined"
        : "listing";
  const listingImageCount = normalizeListingImageCount(options.listingImageCount);
  const aPlusType =
    plannerMode === "legacy-combined"
      ? "standard"
      : normalizeAPlusContentType(options.aPlusType);
  const aPlusModuleSpecs =
    plannerMode === "legacy-combined"
      ? getAPlusModuleSpecs("standard")
      : normalizeAPlusModuleSpecs(aPlusType, options.aPlusModuleSpecs);
  const sizeTier =
    options.sizeTier === "1K" || options.sizeTier === "2K" || options.sizeTier === "4K"
      ? options.sizeTier
      : DEFAULT_SIZE_TIER;
  const stylePresetId =
    typeof options.stylePresetId === "string" && options.stylePresetId.trim()
      ? options.stylePresetId.trim()
      : options.stylePresetId === null
        ? null
        : "clean-retail";

  const slots =
    plannerMode === "legacy-combined"
      ? buildLegacyCombinedAmazonSlotRules()
      : plannerMode === "listing"
        ? buildAmazonListingSlotRules(listingImageCount)
        : buildAmazonAPlusSlotRules(aPlusType, aPlusModuleSpecs);

  return Object.freeze({
    marketplaceId,
    plannerMode,
    listingImageCount,
    aPlusType,
    aPlusModuleSpecs,
    sizeTier,
    stylePresetId,
    slotKeys: Object.freeze(slots.map((slot) => slot.key)),
    slots,
  });
}

export function getDefaultAmazonPlanningSession(
  plannerMode: AmazonPlannerMode = "listing",
): ResolvedAmazonPlanningSession {
  return resolveAmazonPlanningSession({
    marketplaceId: DEFAULT_AMAZON_MARKETPLACE_ID,
    plannerMode,
    listingImageCount: DEFAULT_LISTING_IMAGE_COUNT,
    aPlusType: DEFAULT_A_PLUS_CONTENT_TYPE,
    sizeTier: DEFAULT_SIZE_TIER,
  });
}

/**
 * Legacy Ecom combined baseline: Listing 7 + standard A+ (A+S*).
 * Kept only to restore plans or callers that do not contain AIS session metadata.
 */
export function buildLegacyCombinedAmazonSlotRules(): readonly PlatformSlotRule[] {
  const listing = buildAmazonListingSlotRules(DEFAULT_LISTING_IMAGE_COUNT);
  const aPlus = buildAmazonAPlusSlotRules("standard");
  return Object.freeze([
    ...listing,
    ...aPlus.map((slot, index) =>
      Object.freeze({
        ...slot,
        order: listing.length + index + 1,
      }),
    ),
  ]);
}
