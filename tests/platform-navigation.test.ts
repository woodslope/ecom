import { describe, expect, it } from "vitest";

import { navigationItems, supportedPlatformIds } from "../src/domain/platforms/registry";

describe("platform navigation contract", () => {
  it("shows only implemented platforms and keeps global tools reachable", () => {
    expect(supportedPlatformIds).toEqual(["taobao", "amazon"]);
    expect(navigationItems.map((item) => item.id)).toEqual(["amazon", "taobao", "settings"]);
    expect(navigationItems.filter((item) => item.kind === "platform").map((item) => item.id)).toEqual([
      "amazon",
      "taobao",
    ]);
  });
});
