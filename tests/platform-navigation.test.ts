import { describe, expect, it } from "vitest";

import { navigationItems, supportedPlatformIds } from "../src/domain/platforms/registry";

describe("platform navigation contract", () => {
  it("shows only implemented platforms and keeps global tools reachable", () => {
    expect(supportedPlatformIds).toEqual(["taobao", "amazon"]);
    expect(navigationItems.map((item) => item.id)).toEqual([
      "overview",
      "library",
      "taobao",
      "amazon",
      "history",
      "settings",
    ]);
    expect(navigationItems.find((item) => item.id === "library")?.label).toBe("资料库");
    expect(navigationItems.filter((item) => item.kind === "platform").map((item) => item.id)).toEqual([
      "taobao",
      "amazon",
    ]);
  });
});
