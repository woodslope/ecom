import { indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createIndexedDbAssetRepository,
  createMemoryAssetRepository,
} from "../src/domain/assets/repository";

describe("asset repositories", () => {
  it("reports an actionable error when IndexedDB is unavailable", () => {
    expect(() => createIndexedDbAssetRepository({ indexedDB: undefined })).toThrow(
      "IndexedDB is not available",
    );
  });

  it("merges metadata for an existing asset without changing its Blob", async () => {
    const timestamps = ["2026-07-16T08:00:00.000Z", "2026-07-16T09:00:00.000Z"];
    const repository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => timestamps.shift()!,
    });
    const originalBytes = new Uint8Array([0, 255, 17, 33, 128]);
    const originalBlob = new Blob([originalBytes], { type: "image/png" });

    await repository.put({
      projectId: "project_01",
      blob: originalBlob,
      metadata: {
        name: "front-original.png",
        kind: "reference",
        role: "front",
        tags: ["original"],
        width: 1600,
        height: 1600,
      },
    });
    const updated = await repository.put({
      id: "asset_01",
      metadata: {
        name: "front-approved.png",
        tags: ["approved", "white-background"],
      },
    });

    expect(updated.metadata).toEqual({
      id: "asset_01",
      projectId: "project_01",
      name: "front-approved.png",
      kind: "reference",
      role: "front",
      tags: ["approved", "white-background"],
      width: 1600,
      height: 1600,
      mimeType: "image/png",
      size: originalBytes.byteLength,
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T09:00:00.000Z",
    });

    const restored = await repository.get("asset_01");
    expect(restored?.metadata).toEqual(updated.metadata);
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(originalBytes);
    expect(restored?.blob.type).toBe("image/png");
    expect(await repository.list("project_01")).toEqual([updated.metadata]);
  });

  it("preserves structured style-reference metadata", async () => {
    const repository = createMemoryAssetRepository({
      createId: () => "style_01",
      now: () => "2026-07-20T08:00:00.000Z",
    });
    const stored = await repository.put({
      projectId: "project_01",
      blob: new Blob(["board"], { type: "image/svg+xml" }),
      metadata: {
        name: "Clean retail",
        kind: "style-reference",
        tags: ["style"],
        styleReference: {
          name: "Clean retail",
          sourcePresetId: "clean-retail",
          palette: ["#ffffff", "#111827"],
          typography: "sans",
          lighting: "neutral",
          material: "clean",
          density: "balanced",
          promptGuidance: "Neutral clean retail direction",
        },
      },
    });

    expect((await repository.get(stored.metadata.id))?.metadata.styleReference).toEqual(
      stored.metadata.styleReference,
    );
  });

  it("clears stale dimensions when replacing a Blob without new dimensions", async () => {
    const repository = createMemoryAssetRepository({
      createId: () => "asset_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    await repository.put({
      projectId: "project_01",
      blob: new Blob(["original"], { type: "image/png" }),
      metadata: {
        name: "original.png",
        kind: "reference",
        width: 1600,
        height: 1200,
      },
    });

    const replaced = await repository.put({
      id: "asset_01",
      blob: new Blob(["replacement"], { type: "image/webp" }),
      metadata: { name: "replacement.webp" },
    });

    expect(replaced.metadata.width).toBeUndefined();
    expect(replaced.metadata.height).toBeUndefined();
    expect(replaced.metadata.mimeType).toBe("image/webp");
    expect(replaced.metadata.size).toBe(new Blob(["replacement"]).size);
  });

  it("removes one asset and clears only the requested project", async () => {
    const ids = ["asset_01", "asset_02", "asset_03"];
    const repository = createMemoryAssetRepository({
      createId: () => ids.shift()!,
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const blob = new Blob(["asset-bytes"], { type: "image/jpeg" });

    for (const [projectId, name] of [
      ["project_01", "front.jpg"],
      ["project_01", "detail.jpg"],
      ["project_02", "package.jpg"],
    ] as const) {
      await repository.put({
        projectId,
        blob,
        metadata: { name, kind: "reference" },
      });
    }

    await repository.remove("asset_01");
    expect((await repository.list("project_01")).map((asset) => asset.id)).toEqual([
      "asset_02",
    ]);
    expect(await repository.get("asset_01")).toBeNull();

    await repository.clearProject("project_01");
    expect(await repository.list("project_01")).toEqual([]);
    expect((await repository.list("project_02")).map((asset) => asset.id)).toEqual([
      "asset_03",
    ]);
  });

  it("preserves Blob data and concurrent patches across IndexedDB repository instances", async () => {
    const databaseName = `assets-cross-instance-${Date.now()}-${Math.random()}`;
    const firstRepository = createIndexedDbAssetRepository({
      indexedDB,
      databaseName,
      createId: () => "asset_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const secondRepository = createIndexedDbAssetRepository({
      indexedDB,
      databaseName,
      now: () => "2026-07-16T09:00:00.000Z",
    });
    const originalBytes = new Uint8Array([4, 8, 15, 16, 23, 42]);

    await firstRepository.put({
      projectId: "project_01",
      blob: new Blob([originalBytes], { type: "image/webp" }),
      metadata: {
        name: "front.webp",
        kind: "reference",
        tags: ["original"],
      },
    });

    const restored = await secondRepository.get("asset_01");
    expect(restored?.blob.type).toBe("image/webp");
    expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(originalBytes);

    await Promise.all([
      firstRepository.put({
        id: "asset_01",
        metadata: { role: "front" },
      }),
      secondRepository.put({
        id: "asset_01",
        metadata: { tags: ["approved"] },
      }),
    ]);

    expect((await firstRepository.get("asset_01"))?.metadata).toMatchObject({
      role: "front",
      tags: ["approved"],
    });

    await secondRepository.put({
      id: "asset_02",
      projectId: "project_01",
      blob: new Blob(["detail"], { type: "image/png" }),
      metadata: { name: "detail.png", kind: "reference" },
    });
    await secondRepository.put({
      id: "asset_03",
      projectId: "project_02",
      blob: new Blob(["package"], { type: "image/png" }),
      metadata: { name: "package.png", kind: "reference" },
    });

    await firstRepository.remove("asset_02");
    expect(await secondRepository.get("asset_02")).toBeNull();

    await firstRepository.clearProject("project_01");
    expect(await secondRepository.list("project_01")).toEqual([]);
    expect((await secondRepository.list("project_02")).map((asset) => asset.id)).toEqual([
      "asset_03",
    ]);
  });
});
