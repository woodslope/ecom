import { describe, expect, it } from "vitest";

import type { ImageGenerator } from "../src/domain/generation/types";
import {
  createFailOnceImageGenerator,
  demoImageGenerator,
} from "../src/services/demo-image-generator";

const request = {
  projectId: "project_01",
  productName: "云感旅行颈枕",
  platformId: "amazon" as const,
  slotKey: "PT01",
  prompt: "Use verified product facts in a clear benefit composition.",
  negativePrompt: "No unsupported claims.",
  uploadDimensions: { width: 2000, height: 2000, unit: "px" as const },
  dimensions: { width: 2000, height: 2000, unit: "px" as const },
  visibleCopy: "Travel comfort",
  referenceImages: [],
};

describe("demo image generator", () => {
  it("creates a deterministic labeled SVG mock with the requested slot dimensions", async () => {
    const generator: ImageGenerator = demoImageGenerator;

    const first = await generator.generate(request, new AbortController().signal);
    const second = await generator.generate(request, new AbortController().signal);

    expect(first).toMatchObject({
      width: 2000,
      height: 2000,
      mimeType: "image/svg+xml",
      source: "demo",
      parameters: { engine: "demo-svg-v1" },
    });
    expect(first.blob.type).toBe("image/svg+xml");
    expect(await first.blob.text()).toBe(await second.blob.text());
    expect(await first.blob.text()).toContain("DEMO MOCK");
    expect(await first.blob.text()).toContain("PT01");
    expect(await first.blob.text()).toContain("云感旅行颈枕");
  });

  it("rejects a pre-canceled request with the caller reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("用户取消生成", "AbortError");
    controller.abort(reason);

    await expect(demoImageGenerator.generate(request, controller.signal)).rejects.toBe(reason);
  });

  it("supports a local fail-once acceptance fixture without changing the default generator", async () => {
    const fixture = createFailOnceImageGenerator(demoImageGenerator, "模拟图片服务失败");

    await expect(fixture.generate(request, new AbortController().signal)).rejects.toThrow(
      "模拟图片服务失败",
    );
    await expect(
      fixture.generate(request, new AbortController().signal),
    ).resolves.toMatchObject({ source: "demo", width: 2000, height: 2000 });
    await expect(
      demoImageGenerator.generate(request, new AbortController().signal),
    ).resolves.toMatchObject({ source: "demo" });
  });
});
