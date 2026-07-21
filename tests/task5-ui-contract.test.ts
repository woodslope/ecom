import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompliancePanel } from "../src/components/CompliancePanel";
import { ExportPanel } from "../src/components/ExportPanel";
import { TaskHistory } from "../src/components/TaskHistory";
import type { ComplianceResult } from "../src/domain/compliance";

describe("Task 5 UI contracts", () => {
  it("separates automatic compliance findings from mandatory manual review", () => {
    const result: ComplianceResult = {
      platformId: "amazon",
      slotKey: "MAIN",
      severity: "error",
      findings: [
        {
          code: "amazon-main-visible-copy",
          severity: "error",
          checkType: "automatic",
          message: "Amazon MAIN 不允许叠加可见文案。",
          evidence: ["Save 20%"],
          userAction: "删除全部可见文案。",
        },
      ],
      manualReviewRequired: true,
      manualReview: {
        required: true,
        reason: "自动检查不检查生成图片，也不代表平台最终批准。",
        userAction: "发布前人工复核。",
      },
    };

    const markup = renderToStaticMarkup(createElement(CompliancePanel, { result }));

    expect(markup).toContain("自动检查发现 1 项");
    expect(markup).toContain("Save 20%");
    expect(markup).toContain("仍需人工复核");
    expect(markup).toContain("不代表平台最终批准");
  });

  it("labels an incomplete package honestly and keeps export retry visible", () => {
    const markup = renderToStaticMarkup(
      createElement(ExportPanel, {
        platformLabel: "Amazon",
        completedSlots: 1,
        totalSlots: 15,
        exporting: false,
        error: "导出失败，请重试。",
        onExport: () => undefined,
        onClearError: () => undefined,
      }),
    );

    expect(markup).toContain("1/15 已生成 · 缺 14");
    expect(markup).toContain("导出当前结果");
    expect(markup).toContain("部分可导出");
    expect(markup).toContain("导出失败，请重试。");
  });

  it("renders restored task batches with platform, result, and artifact", () => {
    const markup = renderToStaticMarkup(
      createElement(TaskHistory, {
        tasks: [
          {
            id: "task_01",
            batchId: "task_01",
            kind: "export",
            platformId: "amazon",
            status: "success",
            startedAt: "2026-07-17T10:00:00.000Z",
            completedAt: "2026-07-17T10:00:01.000Z",
            summary: "已导出当前结果，缺少 14 个槽位。",
            artifactFileName: "旅行颈枕-amazon-2026-07-17.zip",
            missingSlots: ["PT01"],
          },
        ],
      }),
    );

    expect(markup).toContain("Amazon");
    expect(markup).toContain("导出交付包");
    expect(markup).toContain("缺少 14 个槽位");
    expect(markup).toContain("旅行颈枕-amazon-2026-07-17.zip");
  });
});
