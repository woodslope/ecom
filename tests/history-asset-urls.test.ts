import { describe, expect, it } from "vitest";

import {
  loadHistoryAssetUrls,
  releaseHistoryAssetUrls,
} from "../src/domain/history/asset-urls";

describe("history asset URL lifecycle", () => {
  it("loads only expanded run assets and releases every created URL", async () => {
    const requested: string[] = [];
    const revoked: string[] = [];
    const urls = await loadHistoryAssetUrls(
      ["asset_expanded"],
      async (id) => {
        requested.push(id);
        return new Blob([id], { type: "image/png" });
      },
      (blob) => `blob:${blob.size}`,
    );

    expect(requested).toEqual(["asset_expanded"]);
    expect(urls).toEqual({ "asset_expanded": "blob:14" });
    releaseHistoryAssetUrls(urls, (url) => revoked.push(url));
    expect(revoked).toEqual(["blob:14"]);
  });
});
