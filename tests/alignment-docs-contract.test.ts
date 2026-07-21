// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("AIS alignment documentation contract", () => {
  it("keeps product truth documents aligned with the completed implementation", () => {
    const checklist = read("AIS_ALIGNMENT_CHECKLIST.md");
    const context = read("PROJECT_CONTEXT.md");
    const spec = read("PRODUCT_SPEC.md");
    const guide = read("UI_STYLE_GUIDE.md");
    const amazonSources = [
      "src/domain/planning/types.ts",
      "src/domain/platforms/amazon.ts",
      "src/domain/platforms/amazon-catalog.ts",
      "src/domain/platforms/amazon-marketplaces.ts",
      "src/domain/platforms/amazon-style-presets.ts",
      "src/domain/platforms/resolve-rule-pack.ts",
      "src/store/workbench-store.ts",
    ].map(read).join("\n");

    for (const stalePhrase of [
      "尚不能宣称“对齐完成”",
      "固定三栏",
      "第一步：管理商品",
      "ASCII characters only",
    ]) {
      expect(`${checklist}\n${context}\n${spec}\n${guide}`).not.toContain(stalePhrase);
    }

    expect(checklist).toContain("P0 项全部为「对齐」");
    expect(context).toContain("Amazon 对齐阶段已完成");
    expect(spec).toContain("Status: aligned baseline");
    expect(guide).toContain("artifacts/cross-platform-ais/");
    for (const staleSourcePhrase of [
      "Not yet passed through PlannerEngine.plan",
      "No UI wiring yet",
      "until Batch 1",
      "once Batch 1",
      "image assets are future work",
      "Batch 2: Amazon UI passes",
    ]) {
      expect(amazonSources).not.toContain(staleSourcePhrase);
    }

    for (const path of [
      "docs/adr/0001-product-session-run-boundaries.md",
      "tests/workspace-v2.test.ts",
      "tests/production-history.test.ts",
      "tests/run-export.test.ts",
      "tests/browser-smoke.mjs",
      "artifacts/cross-platform-ais/amazon-listing-1280.png",
      "artifacts/cross-platform-ais/production-history-900.png",
      "artifacts/cross-platform-ais/settings-single-1280.png",
      "artifacts/cross-platform-ais/task11-mask-saved-v2-900.png",
    ]) {
      expect(existsSync(new URL(`../${path}`, import.meta.url)), path).toBe(true);
    }
  });
});
