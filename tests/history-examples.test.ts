import { describe, expect, it } from "vitest";

import {
  createHistoryExampleRefillPayload,
  getHistoryProcessExamples,
} from "../src/domain/history/examples";

describe("history process examples", () => {
  it("keeps one read-only process example per supported platform", () => {
    expect(getHistoryProcessExamples("amazon")).toHaveLength(1);
    expect(getHistoryProcessExamples("taobao")).toHaveLength(1);
    expect(getHistoryProcessExamples()).toHaveLength(2);
    expect(getHistoryProcessExamples("amazon")[0].title).toBe("流程示例");
  });

  it("returns a detached refill payload with no run or execution data", () => {
    const example = getHistoryProcessExamples("amazon")[0];
    const payload = createHistoryExampleRefillPayload(example);

    expect(payload.platformId).toBe("amazon");
    expect(payload.workflowId).toBe("amazon-listing");
    expect(payload.selectedReferenceAssetIds).toEqual([]);
    expect(payload).not.toHaveProperty("run");
    expect(payload).not.toHaveProperty("plan");
    expect(payload).not.toHaveProperty("generate");

    payload.project.facts.sellingPoints.push("外部修改");
    expect(example.project.facts.sellingPoints).not.toContain("外部修改");
  });
});
