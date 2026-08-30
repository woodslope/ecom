import { describe, expect, it } from "vitest";

import {
  readAmazonDraftProjectConfirmSkip,
  readLastPlatform,
  readLastPlatformOrDefault,
  writeAmazonDraftProjectConfirmSkip,
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
  it("defaults a new workspace to Taobao while preserving an explicit platform choice", () => {
    const storage = createStorage();
    expect(readLastPlatformOrDefault(storage)).toBe("taobao");

    writeLastPlatform(storage, "taobao");
    expect(readLastPlatformOrDefault(storage)).toBe("taobao");
  });

  it("restores only supported platforms and ignores malformed values", () => {
    const storage = createStorage();
    expect(readLastPlatform(storage)).toBeNull();

    writeLastPlatform(storage, "amazon");
    expect(readLastPlatform(storage)).toBe("amazon");

    storage.setItem("ecom-workbench.last-platform.v2", "pinduoduo");
    expect(readLastPlatform(storage)).toBeNull();
  });

  it("persists Amazon draft-project confirmation skip", () => {
    const storage = createStorage();
    expect(readAmazonDraftProjectConfirmSkip(storage)).toBe(false);
    writeAmazonDraftProjectConfirmSkip(storage, true);
    expect(readAmazonDraftProjectConfirmSkip(storage)).toBe(true);
  });
});
