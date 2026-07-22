import { describe, expect, it } from "vitest";

import {
  readAmazonDraftProjectConfirmSkip,
  readDemoModeBannerDismissed,
  readLastPlatform,
  readLastPlatformOrDefault,
  writeAmazonDraftProjectConfirmSkip,
  writeDemoModeBannerDismissed,
  writeLastPlatform,
} from "../src/domain/workspace/preferences";

function createStorage(initial: Record<string, string | null> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, nextValue: string) => {
      values.set(key, nextValue);
    },
  };
}

describe("workspace platform preference", () => {
  it("defaults a new workspace to Amazon while preserving an explicit platform choice", () => {
    const storage = createStorage();
    expect(readLastPlatformOrDefault(storage)).toBe("amazon");

    writeLastPlatform(storage, "taobao");
    expect(readLastPlatformOrDefault(storage)).toBe("taobao");
  });

  it("restores only supported platforms and ignores malformed values", () => {
    const storage = createStorage();
    expect(readLastPlatform(storage)).toBeNull();

    writeLastPlatform(storage, "amazon");
    expect(readLastPlatform(storage)).toBe("amazon");

    storage.setItem("ecom-workbench.last-platform.v1", "pinduoduo");
    expect(readLastPlatform(storage)).toBeNull();
  });

  it("persists demo mode banner dismissal", () => {
    const storage = createStorage();
    expect(readDemoModeBannerDismissed(storage)).toBe(false);
    writeDemoModeBannerDismissed(storage, true);
    expect(readDemoModeBannerDismissed(storage)).toBe(true);
    writeDemoModeBannerDismissed(storage, false);
    expect(readDemoModeBannerDismissed(storage)).toBe(false);
  });

  it("persists Amazon draft-project confirmation skip", () => {
    const storage = createStorage();
    expect(readAmazonDraftProjectConfirmSkip(storage)).toBe(false);
    writeAmazonDraftProjectConfirmSkip(storage, true);
    expect(readAmazonDraftProjectConfirmSkip(storage)).toBe(true);
  });
});
