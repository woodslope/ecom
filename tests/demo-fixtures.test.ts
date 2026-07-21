import { describe, expect, it } from "vitest";

import {
  cloneDemoProductFixture,
  demoProductFixtures,
} from "../src/domain/projects/demo-fixtures";

describe("Amazon demo product fixtures", () => {
  it("provides distinct complete, bilingual, and missing-facts samples without shared mutable data", () => {
    expect(demoProductFixtures.map((fixture) => fixture.id)).toEqual([
      "amazon-complete",
      "amazon-bilingual",
      "amazon-missing-facts",
    ]);

    const complete = cloneDemoProductFixture("amazon-complete");
    const bilingual = cloneDemoProductFixture("amazon-bilingual");
    const missing = cloneDemoProductFixture("amazon-missing-facts");

    expect(complete.facts.specifications).toMatchObject({
      Material: expect.any(String),
      Dimensions: expect.any(String),
      "Package contents": expect.any(String),
      Warranty: expect.any(String),
      "Customer support": expect.any(String),
    });
    expect(bilingual.facts.productName).toContain("/");
    expect(missing.facts.specifications).toEqual({});

    complete.facts.sellingPoints.push("mutated only in this clone");
    expect(cloneDemoProductFixture("amazon-complete").facts.sellingPoints).not.toContain(
      "mutated only in this clone",
    );
  });
});
