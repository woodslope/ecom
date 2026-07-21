import { resolveRulePackForPlan } from "../platforms/resolve-rule-pack";
import type { PlatformId } from "../platforms/types";
import type { ProductProject } from "../projects/types";
import type { PlatformWorkflowId, ProductionRun } from "../workspace/project-workspace";

export type ProductionShape = "square" | "landscape" | "portrait";

export interface ProductionRunFilters {
  search?: string;
  projectId?: string;
  platformId?: PlatformId;
  workflowId?: PlatformWorkflowId;
  source?: ProductionRun["source"];
  status?: ProductionRun["status"];
  shape?: ProductionShape;
}

export interface ProductionRunRecord {
  project: ProductProject;
  run: ProductionRun;
}

function runShapes(run: ProductionRun): Set<ProductionShape> {
  const slotKeys = new Set(run.planSnapshot.slots.map((slot) => slot.slotKey));
  const rules = resolveRulePackForPlan(run.platformId, run.planSnapshot).slots.filter((slot) =>
    slotKeys.has(slot.key),
  );
  return new Set(rules.map((slot) => {
    if (slot.dimensions.width === slot.dimensions.height) return "square";
    return slot.dimensions.width > slot.dimensions.height ? "landscape" : "portrait";
  }));
}

export function queryProductionRuns(
  records: readonly ProductionRunRecord[],
  filters: ProductionRunFilters,
): ProductionRunRecord[] {
  const search = filters.search?.trim().toLocaleLowerCase() ?? "";
  return records
    .filter(({ project, run }) => {
      if (filters.projectId && run.projectId !== filters.projectId) return false;
      if (filters.platformId && run.platformId !== filters.platformId) return false;
      if (filters.workflowId && run.workflowId !== filters.workflowId) return false;
      if (filters.source && run.source !== filters.source) return false;
      if (filters.status && run.status !== filters.status) return false;
      if (filters.shape && !runShapes(run).has(filters.shape)) return false;
      if (search) {
        const haystack = [project.name, project.facts.productName, project.facts.sku, run.id]
          .join(" ")
          .toLocaleLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((left, right) => right.run.updatedAt.localeCompare(left.run.updatedAt));
}
