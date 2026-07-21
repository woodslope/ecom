import type {
  ExecutionJob,
  ExecutionJobItem,
  ExecutionJobKind,
  ExecutionJobTarget,
} from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function withProgress(job: ExecutionJob, now: string): ExecutionJob {
  const completed = job.items.filter((item) => item.status === "completed").length;
  return {
    ...clone(job),
    progress: { completed, total: job.items.length },
    updatedAt: now,
  };
}

function itemFor(job: ExecutionJob, itemId: string): ExecutionJobItem {
  const item = job.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Unknown execution job item: ${itemId}`);
  return item;
}

export function createExecutionJob(input: {
  id: string;
  kind: ExecutionJobKind;
  targets: readonly ExecutionJobTarget[];
  now: string;
}): ExecutionJob {
  const items = input.targets.map((target) => ({
    id: target.id,
    target: clone(target),
    status: "pending" as const,
    attempts: 0,
  }));
  return {
    id: input.id,
    kind: input.kind,
    status: "queued",
    items,
    progress: { completed: 0, total: items.length },
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function claimNextExecutionJobItem(
  job: ExecutionJob,
  now: string,
): { job: ExecutionJob; currentItem?: ExecutionJobItem } {
  const next = job.items.find((item) => item.status === "pending");
  if (!next) {
    return {
      job: withProgress({ ...clone(job), status: "completed", currentItemId: undefined }, now),
    };
  }
  const nextJob = withProgress({
    ...clone(job),
    status: "running",
    currentItemId: next.id,
    items: job.items.map((item) => item.id === next.id
      ? { ...item, status: "running" as const, attempts: item.attempts + 1, startedAt: now, error: undefined }
      : item),
  }, now);
  return {
    job: nextJob,
    currentItem: nextJob.items.find((item) => item.id === next.id),
  };
}

export function completeExecutionJobItem(
  job: ExecutionJob,
  itemId: string,
  now: string,
): ExecutionJob {
  itemFor(job, itemId);
  const next = withProgress({
    ...clone(job),
    currentItemId: undefined,
    items: job.items.map((item) => item.id === itemId
      ? { ...item, status: "completed" as const, completedAt: now, error: undefined }
      : item),
  }, now);
  return next.progress.completed === next.progress.total
    ? { ...next, status: "completed" }
    : { ...next, status: "running" };
}

export function failExecutionJobItem(
  job: ExecutionJob,
  itemId: string,
  error: string,
  now: string,
): ExecutionJob {
  itemFor(job, itemId);
  return withProgress({
    ...clone(job),
    status: "failed",
    currentItemId: undefined,
    error,
    items: job.items.map((item) => item.id === itemId
      ? { ...item, status: "failed" as const, error }
      : item),
  }, now);
}

export function retryExecutionJob(job: ExecutionJob, now: string): ExecutionJob {
  if (job.status !== "failed") throw new Error("Only failed execution jobs can be retried");
  return withProgress({
    ...clone(job),
    status: "queued",
    currentItemId: undefined,
    error: undefined,
    items: job.items.map((item) => item.status === "failed"
      ? { ...item, status: "pending" as const, error: undefined }
      : item),
  }, now);
}

export function recoverInterruptedExecutionJob(job: ExecutionJob, now: string): ExecutionJob {
  if (job.status !== "running") return clone(job);
  return withProgress({
    ...clone(job),
    status: "paused",
    currentItemId: undefined,
    error: "页面刷新后任务已暂停，可继续执行。",
    items: job.items.map((item) => item.status === "running"
      ? { ...item, status: "pending" as const }
      : item),
  }, now);
}

export function cancelExecutionJob(job: ExecutionJob, now: string): ExecutionJob {
  if (job.status === "completed" || job.status === "canceled") return clone(job);
  return withProgress({
    ...clone(job),
    status: "canceled",
    currentItemId: undefined,
    items: job.items.map((item) => item.status === "pending" || item.status === "running"
      ? { ...item, status: "canceled" as const }
      : item),
  }, now);
}
