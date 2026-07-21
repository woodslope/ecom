import { describe, expect, it } from "vitest";

import { amazonRulePack } from "../src/domain/platforms/amazon";
import { getPlatformRulePack, platformRulePacks } from "../src/domain/platforms/registry";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import type { PlatformRulePack } from "../src/domain/platforms/types";

function assertRulePackReadonly(rulePack: PlatformRulePack): void {
  // @ts-expect-error Platform rule pack fields are immutable configuration.
  rulePack.locale = "mutated";
  // @ts-expect-error Slot collections cannot be extended by consumers.
  rulePack.slots.push(rulePack.slots[0]);
  // @ts-expect-error Slot dimensions cannot be changed through a shared slot.
  rulePack.slots[0].dimensions.width = 1;
  // @ts-expect-error Nested rule metadata is readonly as well.
  rulePack.slots[0].planningHints.push("mutated");
}

void assertRulePackReadonly;

describe("platform rule packs", () => {
  it("defines Taobao gallery and detail slots in delivery order", () => {
    expect(taobaoRulePack.slots.map((slot) => slot.key)).toEqual([
      "TB-HERO-01",
      "TB-HERO-02",
      "TB-HERO-03",
      "TB-HERO-04",
      "TB-HERO-05",
      "TB-DETAIL-01",
      "TB-DETAIL-02",
      "TB-DETAIL-03",
      "TB-DETAIL-04",
      "TB-DETAIL-05",
      "TB-DETAIL-06",
      "TB-DETAIL-07",
    ]);

    expect(taobaoRulePack.slots.slice(0, 5).every((slot) => slot.group === "gallery")).toBe(true);
    expect(
      taobaoRulePack.slots.slice(0, 5).every((slot) =>
        slot.dimensions.width === 800 && slot.dimensions.height === 800
      ),
    ).toBe(true);
    expect(taobaoRulePack.slots.slice(5).every((slot) => slot.group === "detail")).toBe(true);
    expect(
      taobaoRulePack.slots.slice(5).every((slot) =>
        slot.dimensions.width === 750 && slot.dimensions.height === 1000
      ),
    ).toBe(true);
  });

  it("defines Amazon listing and A+ slots with their distinct constraints", () => {
    expect(amazonRulePack.promptLanguage).toBe("en");
    expect(taobaoRulePack.promptLanguage).toBe("source");
    expect(amazonRulePack.slots.map((slot) => slot.key)).toEqual([
      "MAIN",
      "PT01",
      "PT02",
      "PT03",
      "PT04",
      "PT05",
      "PT06",
      "A+S01",
      "A+S02",
      "A+S03",
      "A+S04",
      "A+S05",
      "A+S06",
      "A+S07",
      "A+S08",
    ]);

    expect(amazonRulePack.slots.slice(0, 7).map((slot) => slot.dimensions)).toEqual(
      Array.from({ length: 7 }, () => ({ width: 2000, height: 2000, unit: "px" })),
    );
    expect(amazonRulePack.slots.slice(7).map((slot) => slot.dimensions)).toEqual([
      { width: 970, height: 300, unit: "px" },
      ...Array.from({ length: 3 }, () => ({ width: 970, height: 600, unit: "px" as const })),
      ...Array.from({ length: 4 }, () => ({ width: 220, height: 220, unit: "px" as const })),
    ]);

    const main = amazonRulePack.slots[0];
    expect(main.planningHints.join(" ")).toContain("纯白背景");
    expect(main.complianceReminders.join(" ")).toContain("不得出现文案");
    expect(amazonRulePack.complianceReminders.join(" ")).toContain("最终合规");
  });

  it.each([taobaoRulePack, amazonRulePack])(
    "$label gives every required slot actionable planning metadata",
    (rulePack) => {
      for (const slot of rulePack.slots) {
        expect(slot.required).toBe(true);
        expect(slot.order).toBeGreaterThan(0);
        expect(slot.purpose.length).toBeGreaterThan(0);
        expect(slot.planningHints.length).toBeGreaterThan(0);
        expect(slot.complianceReminders.length).toBeGreaterThan(0);
      }
    },
  );

  it("resolves every supported platform to its independent rule pack", () => {
    expect(platformRulePacks).toEqual({
      taobao: taobaoRulePack,
      amazon: amazonRulePack,
    });
    expect(getPlatformRulePack("taobao")).toBe(taobaoRulePack);
    expect(getPlatformRulePack("amazon")).toBe(amazonRulePack);
  });

  it.each([taobaoRulePack, amazonRulePack])(
    "$label deeply freezes shared rules and every nested collection",
    (rulePack) => {
      const firstSlot = rulePack.slots[0];
      const originalWidth = firstSlot.dimensions.width;
      const originalHint = firstSlot.planningHints[0];

      const changedWidth = Reflect.set(firstSlot.dimensions, "width", originalWidth + 1);
      const sharedWidthAfterAttack = getPlatformRulePack(rulePack.platformId).slots[0].dimensions.width;
      if (changedWidth) {
        Reflect.set(firstSlot.dimensions, "width", originalWidth);
      }

      const changedHint = Reflect.set(firstSlot.planningHints, "0", "polluted hint");
      const sharedHintAfterAttack = getPlatformRulePack(rulePack.platformId).slots[0].planningHints[0];
      if (changedHint) {
        Reflect.set(firstSlot.planningHints, "0", originalHint);
      }

      expect.soft(changedWidth).toBe(false);
      expect.soft(sharedWidthAfterAttack).toBe(originalWidth);
      expect.soft(changedHint).toBe(false);
      expect.soft(sharedHintAfterAttack).toBe(originalHint);
      expect.soft(Object.isFrozen(rulePack)).toBe(true);
      expect.soft(Object.isFrozen(rulePack.slots)).toBe(true);
      expect.soft(Object.isFrozen(rulePack.planningInstructions)).toBe(true);
      expect.soft(Object.isFrozen(rulePack.promptGuardrails)).toBe(true);
      expect.soft(Object.isFrozen(rulePack.complianceReminders)).toBe(true);

      for (const slot of rulePack.slots) {
        expect.soft(Object.isFrozen(slot)).toBe(true);
        expect.soft(Object.isFrozen(slot.dimensions)).toBe(true);
        expect.soft(Object.isFrozen(slot.planningHints)).toBe(true);
        expect.soft(Object.isFrozen(slot.complianceReminders)).toBe(true);
      }
    },
  );
});
