import { describe, expect, it } from "vitest";

import {
  readLastPlatform,
  readLastPlatformOrDefault,
  writeLastPlatform,
} from "../src/domain/workspace/preferences";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
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

    storage.setItem("ignored", "pinduoduo");
    expect(readLastPlatform(storage)).toBeNull();
  });
});
