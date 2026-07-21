import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calculateConstrainedDimensions,
  compressImageFile,
} from "../src/domain/assets/compress";

describe("image compression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fits the longest image edge without enlarging smaller images", () => {
    expect(calculateConstrainedDimensions(4000, 3000, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(calculateConstrainedDimensions(1200, 2400, 1600)).toEqual({
      width: 800,
      height: 1600,
    });
    expect(calculateConstrainedDimensions(800, 600, 1600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("compresses a large browser image to the configured maximum edge", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn(
        (callback: BlobCallback, type?: string) =>
          callback(new Blob(["compressed"], { type })),
      ),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    const source = new File(["original-image-bytes"], "front.jpg", {
      type: "image/jpeg",
      lastModified: 1_721_116_800_000,
    });

    const compressed = await compressImageFile(source, {
      maxEdge: 1600,
      quality: 0.75,
    });

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(compressed).not.toBe(source);
    expect(compressed.name).toBe("front.jpg");
    expect(compressed.type).toBe("image/jpeg");
    expect(compressed.lastModified).toBe(1_721_116_800_000);
    expect(await compressed.text()).toBe("compressed");
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns the original file when browser compression fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("image decode failed");
      }),
    );
    const source = new File(["unreadable-image"], "broken.jpg", {
      type: "image/jpeg",
    });

    await expect(compressImageFile(source, { maxEdge: 1600 })).resolves.toBe(source);
  });
});
