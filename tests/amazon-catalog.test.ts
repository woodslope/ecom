import { describe, expect, it } from "vitest";

import {
  AMAZON_MARKETPLACES,
  DEFAULT_AMAZON_MARKETPLACE_ID,
  getAmazonMarketplace,
  isAmazonMarketplaceId,
  normalizeAmazonMarketplaceId,
} from "../src/domain/platforms/amazon-marketplaces";
import {
  DEFAULT_A_PLUS_CONTENT_TYPE,
  DEFAULT_LISTING_IMAGE_COUNT,
  DEFAULT_SIZE_TIER,
  MAX_LISTING_IMAGE_COUNT,
  MIN_LISTING_IMAGE_COUNT,
  STANDARD_LARGE_A_PLUS_MODULE_SPECS,
  STANDARD_A_PLUS_MODULE_SPECS,
  PREMIUM_A_PLUS_MODULE_SPECS,
  MOBILE_A_PLUS_MODULE_SPECS,
  buildLegacyCombinedAmazonSlotRules,
  formatAmazonListingSlotRange,
  getAPlusContentTypeLabel,
  getAPlusModuleSpecs,
  getAmazonListingImageSlots,
  getDefaultAmazonPlanningSession,
  insertAPlusModuleSpecAfter,
  normalizeAPlusContentType,
  normalizeAPlusModuleSpecs,
  normalizeListingImageCount,
  removeAPlusModuleSpecAt,
  resolveAmazonPlanningSession,
} from "../src/domain/platforms/amazon-catalog";
import { amazonRulePack } from "../src/domain/platforms/amazon";

describe("amazon marketplaces (AIS-aligned catalog)", () => {
  it("defaults to us and exposes six marketplaces", () => {
    expect(DEFAULT_AMAZON_MARKETPLACE_ID).toBe("us");
    expect(AMAZON_MARKETPLACES.map((item) => item.id)).toEqual([
      "us",
      "jp",
      "de",
      "fr",
      "it",
      "es",
    ]);
    expect(getAmazonMarketplace("us").locale).toBe("en-US");
    expect(getAmazonMarketplace("jp").allowsCjkVisibleCopy).toBe(true);
  });

  it("normalizes missing marketplace ids to us", () => {
    expect(normalizeAmazonMarketplaceId(undefined)).toBe("us");
    expect(normalizeAmazonMarketplaceId("nope")).toBe("us");
    expect(isAmazonMarketplaceId("de")).toBe(true);
    expect(isAmazonMarketplaceId("uk")).toBe(false);
  });
});

describe("amazon listing / A+ catalog (AIS-aligned)", () => {
  it("uses AIS listing count defaults 7–12", () => {
    expect(DEFAULT_LISTING_IMAGE_COUNT).toBe(7);
    expect(MIN_LISTING_IMAGE_COUNT).toBe(7);
    expect(MAX_LISTING_IMAGE_COUNT).toBe(12);
    expect(normalizeListingImageCount(3)).toBe(7);
    expect(normalizeListingImageCount(20)).toBe(12);
    expect(getAmazonListingImageSlots(7)).toEqual([
      "MAIN",
      "PT01",
      "PT02",
      "PT03",
      "PT04",
      "PT05",
      "PT06",
    ]);
    expect(getAmazonListingImageSlots(9)).toEqual([
      "MAIN",
      "PT01",
      "PT02",
      "PT03",
      "PT04",
      "PT05",
      "PT06",
      "PT07",
      "PT08",
    ]);
    expect(formatAmazonListingSlotRange(7)).toBe("MAIN + PT01-PT06");
  });

  it("defaults A+ content type to standard-large (普通A+), not standard", () => {
    expect(DEFAULT_A_PLUS_CONTENT_TYPE).toBe("standard-large");
    expect(normalizeAPlusContentType(undefined)).toBe("standard-large");
    expect(getAPlusContentTypeLabel("standard-large")).toBe("普通A+");
    expect(getAPlusContentTypeLabel("standard")).toBe("标准A+");
    expect(STANDARD_LARGE_A_PLUS_MODULE_SPECS.map((spec) => spec.slot)).toEqual([
      "A+L01",
      "A+L02",
      "A+L03",
      "A+L04",
      "A+L05",
    ]);
    expect(STANDARD_A_PLUS_MODULE_SPECS).toHaveLength(8);
    expect(PREMIUM_A_PLUS_MODULE_SPECS[0]?.uploadWidth).toBe(1464);
    expect(MOBILE_A_PLUS_MODULE_SPECS).toHaveLength(5);
    expect(getAPlusModuleSpecs("mobile")).toHaveLength(5);
  });

  it("resolves listing-only and aplus-only sessions with AIS defaults", () => {
    const listing = getDefaultAmazonPlanningSession("listing");
    expect(listing.marketplaceId).toBe("us");
    expect(listing.plannerMode).toBe("listing");
    expect(listing.listingImageCount).toBe(7);
    expect(listing.slotKeys).toEqual(getAmazonListingImageSlots(7));
    expect(listing.sizeTier).toBe(DEFAULT_SIZE_TIER);
    expect(listing.slots.every((slot) => slot.group === "listing")).toBe(true);

    const aplus = resolveAmazonPlanningSession({
      plannerMode: "aplus",
      marketplaceId: "jp",
    });
    expect(aplus.marketplaceId).toBe("jp");
    expect(aplus.aPlusType).toBe("standard-large");
    expect(aplus.slotKeys[0]).toBe("A+L01");
    expect(aplus.slots.every((slot) => slot.group === "a-plus")).toBe(true);
    expect(aplus.slots[0]?.dimensions).toEqual({ width: 970, height: 300, unit: "px" });
  });

  it("clamps custom A+ module lists and rewrites sequential slot keys", () => {
    const base = getAPlusModuleSpecs("standard");
    const expanded = insertAPlusModuleSpecAfter("standard", base, 0);
    expect(expanded.length).toBe(base.length + 1);
    expect(expanded[0]?.slot).toBe("A+S01");
    expect(expanded[1]?.slot).toBe("A+S02");

    const reduced = removeAPlusModuleSpecAt("standard", expanded, 1);
    expect(reduced).toHaveLength(base.length);

    const normalized = normalizeAPlusModuleSpecs("premium", [
      { ...PREMIUM_A_PLUS_MODULE_SPECS[0]! },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.slot).toBe("A+P01");
  });

  it("keeps legacy combined baseline keys equal to current amazonRulePack", () => {
    const legacy = buildLegacyCombinedAmazonSlotRules();
    expect(legacy.map((slot) => slot.key)).toEqual(amazonRulePack.slots.map((slot) => slot.key));
    expect(legacy).toHaveLength(15);
  });
});
