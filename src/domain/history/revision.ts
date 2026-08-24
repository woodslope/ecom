import type { ProductionRun } from "../workspace/project-workspace";

/**
 * Covers every saved Run so an in-place update refreshes the open history view,
 * regardless of array order or which Run changed.
 */
export function productionHistoryRevision(runs: readonly ProductionRun[]): string {
  return JSON.stringify(
    runs
      .map((run) => [run.id, run.updatedAt, run.status, run.events.length] as const)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId)),
  );
}
