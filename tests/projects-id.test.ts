import { describe, expect, it } from "vitest";

import { createStableId } from "../src/domain/shared/id";

describe("stable ids", () => {
  it("falls back to unique local ids when randomUUID cannot be used", () => {
    const unavailableCrypto = {
      randomUUID: () => {
        throw new Error("secure random UUID is unavailable");
      },
    } as Pick<Crypto, "randomUUID">;
    const sources = {
      crypto: unavailableCrypto,
      now: () => 1_721_116_800_000,
      random: () => 0.25,
    };

    const first = createStableId("asset", sources);
    const second = createStableId("asset", sources);

    expect(first).toMatch(/^asset_[a-z0-9_]+$/);
    expect(second).toMatch(/^asset_[a-z0-9_]+$/);
    expect(second).not.toBe(first);
  });
});
