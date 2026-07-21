import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SlotInspector } from "../src/components/SlotInspector";
import { CopilotTaskStatus } from "../src/components/GenerationActions";
import { taobaoRulePack } from "../src/domain/platforms/taobao";

const slot = {
  slotKey: "TB-HERO-02",
  visibleCopy: "慢回弹记忆棉带来轻盈贴合的旅途支撑体验",
  strategy: "突出核心卖点",
  evidence: ["卖点：慢回弹记忆棉"],
  prompt: "为旅行颈枕制作卖点图，突出慢回弹记忆棉。",
  negativePrompt: "不要虚构商品事实",
};

describe("SlotInspector Copilot", () => {
  it("exposes scoped commands and visible success feedback", () => {
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: taobaoRulePack,
        slot,
        copilotMessage: "AI 建议：TB-HERO-02 已更新并保存。",
        onSave: async () => true,
        onCopilotCommand: () => undefined,
      }),
    );

    expect(markup).toContain("写入动作只调整当前槽位");
    expect(markup).toContain("检查与解释只返回建议");
    expect(markup).toContain("缩短文案");
    expect(markup).toContain("强化证据");
    expect(markup).toContain("适配平台");
    expect(markup).toContain("检查 Prompt");
    expect(markup).toContain("解释下一步");
    expect(markup).toContain("AI 建议：TB-HERO-02 已更新并保存。");
    expect(markup).toContain("status-message--neutral");
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*.*缩短文案/s);
  });

  it("shows one cancel route while Copilot is processing", () => {
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: taobaoRulePack,
        slot,
        copilotRunning: true,
        onSave: async () => true,
        onCopilotCommand: () => undefined,
        onCancelCopilot: () => undefined,
      }),
    );

    expect(markup).toContain("Copilot 正在处理当前槽位请求");
    expect(markup).not.toContain("Copilot 正在调整当前槽位");
    expect(markup).toContain("取消请求");
  });

  it("keeps the Copilot target and cancel action visible outside the inspector", () => {
    const markup = renderToStaticMarkup(
      createElement(CopilotTaskStatus, {
        target: { platformId: "amazon", slotKey: "PT01" },
        onCancel: () => undefined,
      }),
    );

    expect(markup).toContain("Amazon · PT01 Copilot 请求处理中");
    expect(markup).toContain("请求仅作用于目标槽位");
    expect(markup).not.toContain("只会保存目标槽位");
    expect(markup).toContain("取消 Copilot");
  });

  it("disables other slot Copilot actions while a global Copilot task is running", () => {
    const markup = renderToStaticMarkup(
      createElement(SlotInspector, {
        rulePack: taobaoRulePack,
        slot,
        copilotLocked: true,
        copilotLockReason: "Amazon · PT01 Copilot 请求处理中，请先等待或取消。",
        onSave: async () => true,
        onCopilotCommand: () => undefined,
      }),
    );

    expect(markup).toContain("Amazon · PT01 Copilot 请求处理中，请先等待或取消。");
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
