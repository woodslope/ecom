import type {
  PlatformWorkflowId,
  ProductionRun,
} from "../workspace/project-workspace";
import type { PlatformId } from "../platforms/types";

export const DEFAULT_RUN_DATABASE_NAME = "ecom-workbench-runs-v1";
export const DEFAULT_RUN_QUERY_LIMIT = 50;

const RUN_DATABASE_VERSION = 1;
const RUN_STORE_NAME = "production-runs";
const PROJECT_INDEX_NAME = "by-project";

export interface ProductionRunFilters {
  projectId?: string;
  platformId?: PlatformId;
  workflowId?: PlatformWorkflowId;
  source?: ProductionRun["source"];
  status?: ProductionRun["status"];
  updatedFrom?: string;
  updatedTo?: string;
}

export interface ProductionRunCursor {
  updatedAt: string;
  id: string;
}

export interface ProductionRunPage {
  items: ProductionRun[];
  nextCursor?: ProductionRunCursor;
}

export interface RunRepository {
  get(runId: string): Promise<ProductionRun | null>;
  put(run: ProductionRun): Promise<void>;
  remove(runId: string): Promise<void>;
  removeProject(projectId: string): Promise<void>;
  query(
    filters?: ProductionRunFilters,
    cursor?: ProductionRunCursor,
    limit?: number,
  ): Promise<ProductionRunPage>;
}

export interface IndexedDbRunRepositoryOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
}

function cloneRun(run: ProductionRun): ProductionRun {
  return structuredClone(run);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openRunDatabase(
  indexedDB: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, RUN_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(RUN_STORE_NAME)
        ? request.transaction!.objectStore(RUN_STORE_NAME)
        : database.createObjectStore(RUN_STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains(PROJECT_INDEX_NAME)) {
        store.createIndex(PROJECT_INDEX_NAME, "projectId", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open run database"));
    request.onblocked = () => reject(new Error("Run database upgrade is blocked by another tab"));
  });
}

function compareNewestFirst(left: ProductionRun, right: ProductionRun): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

function isBeforeCursor(run: ProductionRun, cursor: ProductionRunCursor): boolean {
  return run.updatedAt < cursor.updatedAt ||
    (run.updatedAt === cursor.updatedAt && run.id < cursor.id);
}

function matchesFilters(run: ProductionRun, filters: ProductionRunFilters): boolean {
  return (!filters.projectId || run.projectId === filters.projectId) &&
    (!filters.platformId || run.platformId === filters.platformId) &&
    (!filters.workflowId || run.workflowId === filters.workflowId) &&
    (!filters.source || run.source === filters.source) &&
    (!filters.status || run.status === filters.status) &&
    (!filters.updatedFrom || run.updatedAt >= filters.updatedFrom) &&
    (!filters.updatedTo || run.updatedAt <= filters.updatedTo);
}

function paginateRuns(
  runs: ProductionRun[],
  filters: ProductionRunFilters,
  cursor: ProductionRunCursor | undefined,
  limit: number,
): ProductionRunPage {
  const normalizedLimit = Number.isInteger(limit) && limit > 0
    ? limit
    : DEFAULT_RUN_QUERY_LIMIT;
  const matching = runs
    .filter((run) => matchesFilters(run, filters))
    .filter((run) => !cursor || isBeforeCursor(run, cursor))
    .sort(compareNewestFirst);
  const items = matching.slice(0, normalizedLimit).map(cloneRun);
  const last = items.at(-1);
  return {
    items,
    ...(matching.length > items.length && last
      ? { nextCursor: { updatedAt: last.updatedAt, id: last.id } }
      : {}),
  };
}

export function createMemoryRunRepository(): RunRepository {
  const runs = new Map<string, ProductionRun>();
  return {
    async get(runId) {
      const run = runs.get(runId);
      return run ? cloneRun(run) : null;
    },
    async put(run) {
      runs.set(run.id, cloneRun(run));
    },
    async remove(runId) {
      runs.delete(runId);
    },
    async removeProject(projectId) {
      for (const [runId, run] of runs) {
        if (run.projectId === projectId) runs.delete(runId);
      }
    },
    async query(filters = {}, cursor, limit = DEFAULT_RUN_QUERY_LIMIT) {
      return paginateRuns([...runs.values()], filters, cursor, limit);
    },
  };
}

export function createIndexedDbRunRepository(
  options: IndexedDbRunRepositoryOptions = {},
): RunRepository {
  const indexedDB = "indexedDB" in options ? options.indexedDB : globalThis.indexedDB;
  if (!indexedDB) throw new Error("IndexedDB is not available in this environment");
  const database = openRunDatabase(
    indexedDB,
    options.databaseName ?? DEFAULT_RUN_DATABASE_NAME,
  );

  return {
    async get(runId) {
      const opened = await database;
      const transaction = opened.transaction(RUN_STORE_NAME, "readonly");
      const completion = transactionDone(transaction);
      const run = await requestResult(
        transaction.objectStore(RUN_STORE_NAME).get(runId) as IDBRequest<ProductionRun | undefined>,
      );
      await completion;
      return run ? cloneRun(run) : null;
    },
    async put(run) {
      const opened = await database;
      const transaction = opened.transaction(RUN_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      transaction.objectStore(RUN_STORE_NAME).put(cloneRun(run));
      await completion;
    },
    async remove(runId) {
      const opened = await database;
      const transaction = opened.transaction(RUN_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      transaction.objectStore(RUN_STORE_NAME).delete(runId);
      await completion;
    },
    async removeProject(projectId) {
      const opened = await database;
      const transaction = opened.transaction(RUN_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      const store = transaction.objectStore(RUN_STORE_NAME);
      const request = store.index(PROJECT_INDEX_NAME).openKeyCursor(projectId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      await completion;
    },
    async query(filters = {}, cursor, limit = DEFAULT_RUN_QUERY_LIMIT) {
      const opened = await database;
      const transaction = opened.transaction(RUN_STORE_NAME, "readonly");
      const completion = transactionDone(transaction);
      const store = transaction.objectStore(RUN_STORE_NAME);
      const request = filters.projectId
        ? store.index(PROJECT_INDEX_NAME).getAll(filters.projectId)
        : store.getAll();
      const runs = await requestResult(request as IDBRequest<ProductionRun[]>);
      await completion;
      return paginateRuns(runs, filters, cursor, limit);
    },
  };
}
