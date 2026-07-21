import { describe, expect, it } from "vitest";

import {
  normalizePlatformPlan,
  PlanningNormalizationError,
} from "../src/domain/planning/normalizer";
import type { PlatformPlanCandidate } from "../src/domain/planning/types";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";

function completeCandidate(): PlatformPlanCandidate {
  return {
    platformId: "taobao",
    source: "api",
    slots: taobaoRulePack.slots.map((slot) => ({
      slotKey: slot.key,
      visibleCopy: `${slot.label}文案`,
      strategy: `${slot.label}策略`,
      evidence: [`${slot.label}证据`],
      prompt: `${slot.label}提示词`,
      negativePrompt: "不要虚构商品事实",
    })),
  };
}

function completeAmazonCandidate(): PlatformPlanCandidate {
  return {
    platformId: "amazon",
    source: "api",
    slots: amazonRulePack.slots.map((slot) => {
      const isExternalTextTile =
        slot.group === "a-plus" && slot.dimensions.width === 220 && slot.dimensions.height === 220;
      return {
        slotKey: slot.key,
        visibleCopy: slot.key === "MAIN" || isExternalTextTile ? "" : `${slot.label} copy`,
        ...(isExternalTextTile
          ? { externalText: { title: `${slot.label} title`, body: `${slot.label} body` } }
          : {}),
        strategy: `${slot.label} strategy`,
        evidence: [`${slot.label} evidence`],
        prompt: `${slot.label} prompt`,
        negativePrompt: "Do not invent product facts",
      };
    }),
  };
}

describe("platform plan normalization", () => {
  it("orders a complete candidate by the active rule pack", () => {
    const candidate = completeCandidate();
    candidate.slots.reverse();

    const plan = normalizePlatformPlan(candidate, taobaoRulePack);

    expect(plan.platformId).toBe("taobao");
    expect(plan.source).toBe("api");
    expect(plan.slots.map((slot) => slot.slotKey)).toEqual(
      taobaoRulePack.slots.map((slot) => slot.key),
    );
    expect(plan.slots[0]).toEqual({
      slotKey: "TB-HERO-01",
      visibleCopy: "首图文案",
      strategy: "首图策略",
      evidence: ["首图证据"],
      prompt: "首图提示词",
      negativePrompt: "不要虚构商品事实",
    });
  });

  it("rejects duplicate slots with a user-displayable error", () => {
    const candidate = completeCandidate();
    candidate.slots.push({ ...candidate.slots[0], evidence: [...candidate.slots[0].evidence] });

    expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrowError(
      expect.objectContaining({
        name: "PlanningNormalizationError",
        code: "duplicate_slot",
        userMessage: expect.stringContaining("TB-HERO-01"),
      }),
    );
    expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrow(
      PlanningNormalizationError,
    );
  });

  it("rejects slots that do not belong to the active platform", () => {
    const candidate = completeCandidate();
    candidate.slots.push({
      slotKey: "UNKNOWN-SLOT",
      visibleCopy: "未知文案",
      strategy: "未知策略",
      evidence: ["未知证据"],
      prompt: "未知提示词",
      negativePrompt: "",
    });

    expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrowError(
      expect.objectContaining({
        code: "unknown_slot",
        userMessage: expect.stringContaining("UNKNOWN-SLOT"),
      }),
    );
  });

  it("rejects incomplete plans and lists every missing required slot", () => {
    const candidate = completeCandidate();
    candidate.slots = candidate.slots.filter(
      (slot) => slot.slotKey !== "TB-HERO-02" && slot.slotKey !== "TB-DETAIL-07",
    );

    expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrowError(
      expect.objectContaining({
        code: "missing_slot",
        slotKeys: ["TB-HERO-02", "TB-DETAIL-07"],
        userMessage: expect.stringContaining("TB-HERO-02、TB-DETAIL-07"),
      }),
    );
  });

  it("turns malformed external payloads into a displayable validation error", () => {
    expect(() =>
      normalizePlatformPlan(
        { platformId: "taobao", source: "api", slots: "not-an-array" },
        taobaoRulePack,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_payload",
        userMessage: expect.stringContaining("格式不正确"),
      }),
    );
  });

  it.each(["strategy", "prompt", "negativePrompt"] as const)(
    "rejects %s when it is empty after trimming",
    (field) => {
      const candidate = completeCandidate();
      candidate.slots[0][field] = " \n\t ";

      expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrowError(
        expect.objectContaining({
          code: "invalid_payload",
          userMessage: expect.stringContaining(field),
        }),
      );
    },
  );

  it.each([
    { label: "empty", evidence: [] },
    { label: "blank", evidence: [" \n\t "] },
    { label: "partly blank", evidence: ["有效证据", " "] },
  ])("rejects $label evidence", ({ evidence }) => {
    const candidate = completeCandidate();
    candidate.slots[0].evidence = evidence;

    expect(() => normalizePlatformPlan(candidate, taobaoRulePack)).toThrowError(
      expect.objectContaining({
        code: "invalid_payload",
        userMessage: expect.stringContaining("evidence"),
      }),
    );
  });

  it("allows Amazon MAIN to omit visible copy", () => {
    const plan = normalizePlatformPlan(completeAmazonCandidate(), amazonRulePack);

    expect(plan.slots[0].slotKey).toBe("MAIN");
    expect(plan.slots[0].visibleCopy).toBe("");
  });

  it.each([
    {
      label: "Taobao gallery",
      rulePack: taobaoRulePack,
      candidate: completeCandidate(),
      slotKey: "TB-HERO-01",
    },
    {
      label: "Amazon non-MAIN",
      rulePack: amazonRulePack,
      candidate: completeAmazonCandidate(),
      slotKey: "PT01",
    },
  ])("rejects blank visible copy for $label slots", ({ rulePack, candidate, slotKey }) => {
    const slot = candidate.slots.find((item) => item.slotKey === slotKey)!;
    slot.visibleCopy = " \n\t ";

    expect(() => normalizePlatformPlan(candidate, rulePack)).toThrowError(
      expect.objectContaining({
        code: "invalid_payload",
        userMessage: expect.stringContaining("visibleCopy"),
      }),
    );
  });
});
