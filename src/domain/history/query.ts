import type { ProductProject } from "../projects/types";
import type {
  ProductionRunCursor,
  ProductionRunFilters as RepositoryFilters,
  RunRepository,
} from "../runs/repository";
import { normalizePlatformWorkflowId } from "../platforms/registry";
import { resolveRulePackForPlan } from "../platforms/resolve-rule-pack";
import type { PlatformId, PlatformWorkflowId } from "../platforms/types";
import type { ProductionRun } from "../workspace/project-workspace";

export type ProductionShape = "square" | "landscape" | "portrait";

export interface HistoryFilters {
  search?: string;
  projectId?: string;
  platformId?: PlatformId;
  workflowId?: PlatformWorkflowId;
  source?: ProductionRun["source"];
  status?: ProductionRun["status"];
  shape?: ProductionShape;
}

export interface HistoryRunRecord {
  project: ProductProject;
  run: ProductionRun;
}

export interface HistoryPage {
  items: HistoryRunRecord[];
  nextCursor?: ProductionRunCursor;
}

interface HistoryQueryDependencies {
  runRepository: RunRepository;
  getProject: (projectId: string) => Promise<ProductProject | null>;
  prepare?: () => Promise<void>;
}

export interface HistoryQueryService {
  query(
    filters?: HistoryFilters,
    cursor?: ProductionRunCursor,
    limit?: number,
  ): Promise<HistoryPage>;
}

function hasShape(run: ProductionRun, shape: ProductionShape): boolean {
  const slots = new Set(run.planSnapshot.slots.map((slot) => slot.slotKey));
  return resolveRulePackForPlan(run.platformId, run.planSnapshot).slots.some((slot) => {
    if (!slots.has(slot.key)) return false;
    const slotShape = slot.dimensions.width === slot.dimensions.height
      ? "square"
      : slot.dimensions.width > slot.dimensions.height ? "landscape" : "portrait";
    return slotShape === shape;
  });
}

function normalizedRun(run: ProductionRun): ProductionRun {
  const workflowId = normalizePlatformWorkflowId(run.workflowId) ?? run.workflowId;
  return workflowId === run.workflowId ? run : { ...structuredClone(run), workflowId };
}

function repositoryFilters(filters: HistoryFilters): RepositoryFilters {
  return {
    projectId: filters.projectId,
    platformId: filters.platformId,
    source: filters.source,
    status: filters.status,
  };
}

export function createHistoryQueryService(
  dependencies: HistoryQueryDependencies,
): HistoryQueryService {
  let prepared: Promise<void> | null = null;
  return {
    async query(
      filters: HistoryFilters = {},
      cursor?: ProductionRunCursor,
      limit = 50,
    ): Promise<HistoryPage> {
      prepared ??= dependencies.prepare?.() ?? Promise.resolve();
      await prepared;
      const pageLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
      const items: HistoryRunRecord[] = [];
      let repositoryCursor = cursor;
      let hasMore = false;
      do {
        const page = await dependencies.runRepository.query(
          repositoryFilters(filters),
          repositoryCursor,
          pageLimit,
        );
        for (const rawRun of page.items) {
          const run = normalizedRun(rawRun);
          if (filters.workflowId && run.workflowId !== filters.workflowId) continue;
          if (filters.shape && !hasShape(run, filters.shape)) continue;
          const project = await dependencies.getProject(run.projectId);
          if (!project) continue;
          const search = filters.search?.trim().toLocaleLowerCase();
          if (search) {
            const haystack = [project.name, project.facts.productName, project.facts.sku, run.id]
              .join(" ")
              .toLocaleLowerCase();
            if (!haystack.includes(search)) continue;
          }
          items.push({ project, run });
          if (items.length === pageLimit) break;
        }
        hasMore = Boolean(page.nextCursor);
        repositoryCursor = page.nextCursor;
      } while (items.length < pageLimit && repositoryCursor);

      const last = items.at(-1)?.run;
      return {
        items,
        ...(last && hasMore
          ? { nextCursor: { updatedAt: last.updatedAt, id: last.id } }
          : {}),
      };
    },
  };
}
