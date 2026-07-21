import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExecutionJobPanel } from "../src/components/ExecutionJobPanel";
import { createExecutionJob, failExecutionJobItem, claimNextExecutionJobItem } from "../src/domain/jobs/state";

const target = {
  id: "target_ui",
  projectId: "project_ui",
  sessionId: "session_ui",
  platformId: "amazon" as const,
  workflowId: "amazon-listing" as const,
  slotKey: "MAIN",
};

describe("execution job UI", () => {
  it("shows progress and the correct recovery action for failed local work", () => {
    const created = createExecutionJob({
      id: "job_ui",
      kind: "batch-generate",
      targets: [target],
      now: "2026-07-21T12:00:00.000Z",
    });
    const claimed = claimNextExecutionJobItem(created, "2026-07-21T12:01:00.000Z");
    const failed = failExecutionJobItem(
      claimed.job,
      claimed.currentItem!.id,
      "Provider unavailable",
      "2026-07-21T12:02:00.000Z",
    );
    const markup = renderToStaticMarkup(createElement(ExecutionJobPanel, {
      jobs: [failed],
      onResume: () => undefined,
      onRetry: () => undefined,
      onCancel: () => undefined,
    }));

    expect(markup).toContain("本地任务");
    expect(markup).toContain("批量生成");
    expect(markup).toContain("0 / 1");
    expect(markup).toContain("Provider unavailable");
    expect(markup).toContain("重试失败任务");
  });
});
