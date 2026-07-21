import { describe, expect, it } from "vitest";

import type { CopilotContext, CopilotEngine } from "../src/domain/copilot";
import { amazonRulePack } from "../src/domain/platforms/amazon";
import { taobaoRulePack } from "../src/domain/platforms/taobao";
import type { PlannedSlot } from "../src/domain/planning/types";
import type { ProductProject } from "../src/domain/projects/types";
import { demoCopilot } from "../src/services/demo-copilot";

const project: ProductProject = {
  id: "project_01",
  name: "旅行颈枕项目",
  facts: {
    productName: "云感旅行颈枕",
    category: "旅行用品",
    brand: "Northwind",
    model: "NW-P01",
    sku: "P01-GRAY",
    targetAudience: "经常乘坐飞机和高铁的通勤人群",
    description: "可折叠记忆棉颈枕，带可拆洗外套。",
    sellingPoints: ["慢回弹记忆棉", "可折叠收纳", "外套可拆洗"],
    forbiddenClaims: [],
    specifications: {
      材质: "记忆棉、聚酯纤维",
      尺寸: "28 x 25 x 12 cm",
    },
  },
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

const slot: PlannedSlot = {
  slotKey: "TB-HERO-02",
  visibleCopy: "慢回弹记忆棉带来轻盈贴合的旅途支撑体验",
  strategy: "突出核心卖点",
  evidence: ["卖点：慢回弹记忆棉", "材质：记忆棉、聚酯纤维"],
  prompt: "为旅行颈枕制作卖点图，突出慢回弹记忆棉。",
  negativePrompt: "不要虚构商品事实",
};

const context: CopilotContext = { project, rulePack: taobaoRulePack, slot };

describe("demo copilot", () => {
  it("returns a deterministic patch scoped to visibleCopy and prompt", async () => {
    const copilot: CopilotEngine = demoCopilot;
    const projectSnapshot = structuredClone(project);
    const slotSnapshot = structuredClone(slot);

    const first = await copilot.adjust(
      context,
      "shorten-copy",
      new AbortController().signal,
    );
    const second = await copilot.adjust(
      context,
      "shorten-copy",
      new AbortController().signal,
    );

    expect(first).toEqual(second);
    expect("prompt" in first).toBe(true);
    if (!("prompt" in first)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(Object.keys(first).sort()).toEqual(["prompt", "visibleCopy"]);
    expect(first.visibleCopy.length).toBeLessThan(slot.visibleCopy.length);
    expect(first.prompt).toContain(first.visibleCopy);
    expect(project).toEqual(projectSnapshot);
    expect(slot).toEqual(slotSnapshot);
  });

  it("keeps Amazon shorten-copy ASCII-safe when the draft copy is Chinese", async () => {
    const result = await demoCopilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...slot,
          slotKey: "PT01",
          visibleCopy: "慢回弹承托",
          prompt: "Create an Amazon core benefit image. Visible copy: \"慢回弹承托\".",
        },
      },
      "shorten-copy",
      new AbortController().signal,
    );

    expect("prompt" in result).toBe(true);
    if (!("prompt" in result)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(result.visibleCopy).toBe("Core benefit");
    expect(result.visibleCopy).toMatch(/^[\x20-\x7e]+$/);
    expect(result.prompt).not.toContain("慢回弹承托");
  });

  it("does not add visible-copy instructions when shortening Amazon MAIN", async () => {
    const prompt = "Create an Amazon main image with one sold product on a pure white background.";
    const result = await demoCopilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...slot,
          slotKey: "MAIN",
          visibleCopy: "",
          prompt,
        },
      },
      "shorten-copy",
      new AbortController().signal,
    );

    expect(result).toEqual({ visibleCopy: "", prompt });
  });

  it("strengthens the selected slot prompt with its existing evidence", async () => {
    const patch = await demoCopilot.adjust(
      context,
      "strengthen-evidence",
      new AbortController().signal,
    );

    expect("prompt" in patch).toBe(true);
    if (!("prompt" in patch)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(patch.visibleCopy).toBe(slot.visibleCopy);
    expect(patch.prompt).toContain("事实依据");
    expect(patch.prompt).toContain(slot.evidence[0]);
    expect(patch.prompt).toContain(slot.evidence[1]);
    expect(Object.keys(patch).sort()).toEqual(["prompt", "visibleCopy"]);
  });

  it("adapts the selected slot to its platform and explains the AI change", async () => {
    const result = await demoCopilot.adjust(
      context,
      "adapt-platform",
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      visibleCopy: expect.any(String),
      prompt: expect.stringContaining("淘宝 / 天猫"),
      message: expect.stringContaining("平台"),
    });
  });

  it("keeps Amazon MAIN free of visible-copy instructions during adaptation", async () => {
    const result = await demoCopilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...slot,
          slotKey: "MAIN",
          visibleCopy: "",
          prompt: "Show one product on a pure white background.",
        },
      },
      "adapt-platform",
      new AbortController().signal,
    );

    expect("prompt" in result).toBe(true);
    if (!("prompt" in result)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(result.visibleCopy).toBe("");
    expect(result.prompt).not.toContain("Visible copy");
    expect(result.prompt).toContain("Platform adaptation:");
    expect(result.prompt).not.toContain("平台适配");
  });

  it("keeps Amazon Copilot evidence additions in the model prompt language", async () => {
    const result = await demoCopilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...slot,
          slotKey: "PT01",
          visibleCopy: "Core benefit",
          prompt: "Create an Amazon core benefit image for the verified product facts.",
        },
      },
      "strengthen-evidence",
      new AbortController().signal,
    );

    expect("prompt" in result).toBe(true);
    if (!("prompt" in result)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(result.prompt).toContain("Source evidence:");
    expect(result.prompt).not.toContain("事实依据");
    expect(result.prompt).not.toContain("卖点：");
  });

  it("uses the Amazon slot label when the current copy has no ASCII text", async () => {
    const result = await demoCopilot.adjust(
      {
        ...context,
        rulePack: amazonRulePack,
        slot: {
          ...slot,
          slotKey: "PT01",
          visibleCopy: "慢回弹承托",
        },
      },
      "adapt-platform",
      new AbortController().signal,
    );

    expect("prompt" in result).toBe(true);
    if (!("prompt" in result)) throw new Error("预期 Copilot 返回槽位补丁");
    expect(result.visibleCopy).toBe("Core benefit");
  });

  it("checks prompt compliance without returning a slot patch", async () => {
    const result = await demoCopilot.adjust(
      context,
      "check-compliance",
      new AbortController().signal,
    );

    expect(result).toEqual({
      message: expect.stringContaining("人工复核"),
    });
  });

  it("explains the next action without modifying the slot", async () => {
    const result = await demoCopilot.adjust(
      context,
      "explain-next",
      new AbortController().signal,
    );

    expect(result).toEqual({
      message: expect.stringContaining("下一步"),
    });
  });
});
