import { resolveRulePackForPlan } from "../platforms/resolve-rule-pack";
import type { BuildRunExportPackageInput, ExportPackage } from "./types";
import { buildExportPackage } from "./build-export-package";

export function buildRunExportPackage({
  project,
  run,
  loadAsset,
  now,
}: BuildRunExportPackageInput): Promise<ExportPackage> {
  if (!run.planningInputSignatureSnapshot || !run.slotVersionsSnapshot) {
    throw new Error("生产记录缺少可重建的版本快照，无法重新导出。");
  }
  return buildExportPackage({
    project,
    rulePack: resolveRulePackForPlan(run.platformId, run.planSnapshot),
    plan: run.planSnapshot,
    planningInputSignature: run.planningInputSignatureSnapshot,
    slotVersions: run.slotVersionsSnapshot,
    loadAsset,
    ...(now ? { now } : {}),
    runContext: {
      id: run.id,
      sessionId: run.sessionId,
      workflowId: run.workflowId,
      source: run.source,
      options: run.contextSnapshot.options,
    },
  });
}
