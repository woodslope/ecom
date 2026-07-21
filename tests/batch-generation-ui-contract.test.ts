import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import workspaceSource from "../src/components/PlatformWorkspace.tsx?raw";

describe("batch generation UI contract", () => {
  it("exposes batch generation in platform workspaces and local jobs in production records", () => {
    expect(workspaceSource).toContain("onStartBatch");
    expect(workspaceSource).toContain("批量生成剩余槽位");
    expect(appSource).toContain("<ExecutionJobPanel");
    expect(appSource).toContain("startBatchGeneration");
    expect(appSource).toContain("jobs={jobs}");
  });
});
