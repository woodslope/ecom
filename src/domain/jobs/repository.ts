import type {
  ExecutionJob,
  ExecutionJobFilters,
  ExecutionJobPage,
} from "./types";

export const DEFAULT_EXECUTION_JOB_DATABASE_NAME = "ecom-workbench-jobs-v1";
const EXECUTION_JOB_DATABASE_VERSION = 1;
const EXECUTION_JOB_STORE_NAME = "execution-jobs";

export interface ExecutionJobRepository {
  get(jobId: string): Promise<ExecutionJob | null>;
  put(job: ExecutionJob): Promise<void>;
  remove(jobId: string): Promise<void>;
  list(filters?: ExecutionJobFilters): Promise<ExecutionJobPage>;
}

function clone(job: ExecutionJob): ExecutionJob {
  return structuredClone(job);
}

function matches(job: ExecutionJob, filters: ExecutionJobFilters): boolean {
  return (!filters.kind || job.kind === filters.kind) &&
    (!filters.status || job.status === filters.status) &&
    (!filters.projectId || job.items.some((item) => item.target.projectId === filters.projectId));
}

function listJobs(jobs: ExecutionJob[], filters: ExecutionJobFilters = {}): ExecutionJobPage {
  return {
    items: jobs
      .filter((job) => matches(job, filters))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
      .map(clone),
  };
}

export function createMemoryExecutionJobRepository(): ExecutionJobRepository {
  const jobs = new Map<string, ExecutionJob>();
  return {
    async get(jobId) {
      const job = jobs.get(jobId);
      return job ? clone(job) : null;
    },
    async put(job) {
      jobs.set(job.id, clone(job));
    },
    async remove(jobId) {
      jobs.delete(jobId);
    },
    async list(filters = {}) {
      return listJobs([...jobs.values()], filters);
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Execution job request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Execution job transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Execution job transaction failed"));
  });
}

function openDatabase(indexedDB: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, EXECUTION_JOB_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(EXECUTION_JOB_STORE_NAME)) {
        request.result.createObjectStore(EXECUTION_JOB_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open execution job database"));
    request.onblocked = () => reject(new Error("Execution job database upgrade is blocked"));
  });
}

export function createIndexedDbExecutionJobRepository(options: {
  indexedDB?: IDBFactory;
  databaseName?: string;
} = {}): ExecutionJobRepository {
  const indexedDB = "indexedDB" in options ? options.indexedDB : globalThis.indexedDB;
  if (!indexedDB) throw new Error("IndexedDB is not available in this environment");
  const database = openDatabase(indexedDB, options.databaseName ?? DEFAULT_EXECUTION_JOB_DATABASE_NAME);

  return {
    async get(jobId) {
      const opened = await database;
      const transaction = opened.transaction(EXECUTION_JOB_STORE_NAME, "readonly");
      const completion = transactionDone(transaction);
      const job = await requestResult(
        transaction.objectStore(EXECUTION_JOB_STORE_NAME).get(jobId) as IDBRequest<ExecutionJob | undefined>,
      );
      await completion;
      return job ? clone(job) : null;
    },
    async put(job) {
      const opened = await database;
      const transaction = opened.transaction(EXECUTION_JOB_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      transaction.objectStore(EXECUTION_JOB_STORE_NAME).put(clone(job));
      await completion;
    },
    async remove(jobId) {
      const opened = await database;
      const transaction = opened.transaction(EXECUTION_JOB_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      transaction.objectStore(EXECUTION_JOB_STORE_NAME).delete(jobId);
      await completion;
    },
    async list(filters = {}) {
      const opened = await database;
      const transaction = opened.transaction(EXECUTION_JOB_STORE_NAME, "readonly");
      const completion = transactionDone(transaction);
      const jobs = await requestResult(
        transaction.objectStore(EXECUTION_JOB_STORE_NAME).getAll() as IDBRequest<ExecutionJob[]>,
      );
      await completion;
      return listJobs(jobs, filters);
    },
  };
}
