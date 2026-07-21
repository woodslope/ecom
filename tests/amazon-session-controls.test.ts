import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AmazonSessionControls,
  amazonOptionsFromControls,
  controlsFromPlan,
  effectiveAPlusModuleSpecs,
  expectedSlotCount,
} from "../src/components/AmazonSessionControls";
import {
  getAPlusModuleSpecs,
  insertAPlusModuleSpecAfter,
  MAX_A_PLUS_MODULE_COUNT,
} from "../src/domain/platforms/amazon-catalog";
import { resolvePlanningRulePack } from "../src/domain/planning/resolve-planning-pack";
import type { PlatformPlan } from "../src/domain/planning/types";

describe("AmazonSessionControls", () => {
  it("defaults controls to AIS listing when plan is missing or legacy", () => {
    const defaults = controlsFromPlan(null);
    expect(defaults.plannerMode).toBe("listing");
    expect(defaults.listingImageCount).toBe(7);
    expect(defaults.aPlusType).toBe("standard-large");
    expect(defaults.marketplaceId).toBe("us");
    expect(expectedSlotCount(defaults)).toBe(7);

    const legacyPlan = {
      platformId: "amazon",
      source: "demo",
      slots: [],
      amazonSession: {
        marketplaceId: "us",
        plannerMode: "legacy-combined",
        listingImageCount: 7,
        aPlusType: "standard",
        sizeTier: "2K",
        slotKeys: [],
      },
    } as PlatformPlan;
    expect(controlsFromPlan(legacyPlan).plannerMode).toBe("listing");
    expect(controlsFromPlan(legacyPlan).aPlusType).toBe("standard-large");
  });

  it("maps controls to planner amazonOptions", () => {
    const options = amazonOptionsFromControls({
      marketplaceId: "jp",
      plannerMode: "aplus",
      listingImageCount: 9,
      aPlusType: "premium",
      sizeTier: "4K",
      stylePresetId: "soft-lifestyle",
      aPlusModuleSpecs: null,
    });
    expect(options).toEqual({
      marketplaceId: "jp",
      plannerMode: "aplus",
      listingImageCount: 9,
      aPlusType: "premium",
      sizeTier: "4K",
      stylePresetId: "soft-lifestyle",
    });
  });

  it("renders Listing / A+ mode switch and marketplace select", () => {
    const markup = renderToStaticMarkup(
      createElement(AmazonSessionControls, {
        value: {
          marketplaceId: "us",
          plannerMode: "listing",
          listingImageCount: 7,
          aPlusType: "standard-large",
          sizeTier: "2K",
          stylePresetId: "clean-retail",
          aPlusModuleSpecs: null,
        },
        onChange: () => undefined,
      }),
    );
    expect(markup).toContain("Listing 图");
    expect(markup).toContain("A+ 图");
    expect(markup).toContain("目标站点");
    expect(markup).toContain("Listing 张数");
    expect(markup).toContain("生成尺寸档");
    expect(markup).toContain("视觉风格");
    expect(markup).toContain("MAIN + PT01-PT06");
    expect(markup.includes("调整参数") || markup.includes("收起参数")).toBe(true);
  });

  it("passes custom A+ module specs into planner options and resolves slot count", () => {
    const defaults = getAPlusModuleSpecs("standard-large");
    const expanded = insertAPlusModuleSpecAfter("standard-large", defaults, 0);
    expect(expanded.length).toBe(defaults.length + 1);
    const options = amazonOptionsFromControls({
      marketplaceId: "us",
      plannerMode: "aplus",
      listingImageCount: 7,
      aPlusType: "standard-large",
      aPlusModuleSpecs: expanded,
      sizeTier: "2K",
      stylePresetId: "clean-retail",
    });
    expect(options.aPlusModuleSpecs?.length).toBe(expanded.length);
    const { rulePack } = resolvePlanningRulePack("amazon", options);
    expect(rulePack.slots).toHaveLength(expanded.length);
    expect(rulePack.slots.every((slot) => slot.group === "a-plus")).toBe(true);
    expect(expanded.length).toBeLessThanOrEqual(MAX_A_PLUS_MODULE_COUNT);
  });

  it("renders A+ module arrange when mode is aplus", () => {
    const markup = renderToStaticMarkup(
      createElement(AmazonSessionControls, {
        value: {
          marketplaceId: "us",
          plannerMode: "aplus",
          listingImageCount: 7,
          aPlusType: "standard-large",
          aPlusModuleSpecs: null,
          sizeTier: "2K",
          stylePresetId: "clean-retail",
        },
        onChange: () => undefined,
      }),
    );
    expect(markup).toContain("模块编排");
    expect(markup).toContain("恢复默认");
    expect(markup).toContain("A+L01");
    expect(effectiveAPlusModuleSpecs({
      aPlusType: "standard-large",
      aPlusModuleSpecs: null,
    })).toHaveLength(5);
  });
});
