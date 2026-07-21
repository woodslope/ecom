import { describe, expect, it } from "vitest";

import {
  listingParseToFactsPatch,
  parseAmazonListingText,
} from "../src/domain/planning/listing-parse";

const SAMPLE = `Title: Cloud Travel Neck Pillow

About this item
- Slow-rebound memory foam cradles the neck
- Folds flat for carry-on packing
- Removable, washable cover
- Adjustable support for long flights
- Soft breathable fabric against skin

A portable pillow designed for long-haul flights and trains.
`;

describe("parseAmazonListingText", () => {
  it("parses title, bullets, and description from AIS-style paste", () => {
    const parsed = parseAmazonListingText(SAMPLE);
    expect(parsed.title).toBe("Cloud Travel Neck Pillow");
    expect(parsed.bullets).toEqual([
      "Slow-rebound memory foam cradles the neck",
      "Folds flat for carry-on packing",
      "Removable, washable cover",
      "Adjustable support for long flights",
      "Soft breathable fabric against skin",
    ]);
    expect(parsed.description).toContain("portable pillow");
    expect(parsed.summary).toContain("标题");
    expect(parsed.summary).toContain("5 条卖点");
  });

  it("accepts Chinese bullets and bare first-line title", () => {
    const parsed = parseAmazonListingText(
      "云感旅行颈枕\n1. 慢回弹支撑\n2. 可折叠收纳\n适合长途飞行。",
    );
    expect(parsed.title).toBe("云感旅行颈枕");
    expect(parsed.bullets).toEqual(["慢回弹支撑", "可折叠收纳"]);
    expect(parsed.description).toContain("长途飞行");
  });

  it("maps to facts patch with fill-empty vs overwrite", () => {
    const parsed = parseAmazonListingText(SAMPLE);
    const fill = listingParseToFactsPatch(parsed, {
      overwriteEmptyOnly: true,
      current: {
        productName: "Existing",
        sellingPoints: [],
        description: "",
      },
    });
    expect(fill.productName).toBeUndefined();
    expect(fill.sellingPoints?.length).toBe(5);
    expect(fill.description).toContain("portable");

    const overwrite = listingParseToFactsPatch(parsed, {
      overwriteEmptyOnly: false,
      current: { productName: "Existing" },
    });
    expect(overwrite.productName).toBe("Cloud Travel Neck Pillow");
  });

  it("returns empty summary for blank paste", () => {
    const parsed = parseAmazonListingText("   \n  ");
    expect(parsed.title).toBe("");
    expect(parsed.bullets).toEqual([]);
    expect(parsed.summary).toContain("未识别");
  });
});
