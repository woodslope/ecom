import { describe, expect, it } from "vitest";

import {
  OVERVIEW_EMPTY_STATUS,
  resolveOverviewNextAction,
} from "../src/domain/workspace/overview-guidance";

describe("overview next-action guidance", () => {
  it("routes empty workspaces to the library", () => {
    expect(
      resolveOverviewNextAction({
        hasActiveProject: false,
        assetCount: 0,
        preferredPlatform: "amazon",
      }),
    ).toEqual({
      title: "从资料库建立商品档案",
      actionLabel: "进入资料库",
      destination: "library",
    });
  });

  it("keeps Amazon as the default preferred platform while ready", () => {
    expect(
      resolveOverviewNextAction({
        hasActiveProject: true,
        assetCount: 2,
        preferredPlatform: "amazon",
      }).destination,
    ).toBe("amazon");
  });

  it("routes an explicit Taobao preference without Amazon-only copy", () => {
    const noAssets = resolveOverviewNextAction({
      hasActiveProject: true,
      assetCount: 0,
      preferredPlatform: "taobao",
    });
    expect(noAssets.destination).toBe("taobao");
    expect(noAssets.title).toContain("淘宝");
    expect(noAssets.title).not.toContain("Amazon");

    const ready = resolveOverviewNextAction({
      hasActiveProject: true,
      assetCount: 3,
      preferredPlatform: "taobao",
    });
    expect(ready.destination).toBe("taobao");
    expect(ready.actionLabel).toContain("淘宝");
  });

  it("keeps the empty status platform-neutral", () => {
    expect(OVERVIEW_EMPTY_STATUS).toContain("资料库建档");
    expect(OVERVIEW_EMPTY_STATUS).not.toContain("Amazon");
  });
});
