import { indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  cancelExecutionJob,
  claimNextExecutionJobItem,
  completeExecutionJobItem,
  createExecutionJob,
  failExecutionJobItem,
  recoverInterruptedExecutionJob,
  retryExecutionJob,
} from "../src/domain/jobs/state";
import {
  createIndexedDbExecutionJobRepository,
  createMemoryExecutionJobRepository,
} from "../src/domain/jobs/repository";
import { createMemoryExecutionJobCoordinator } from "../src/domain/jobs/execution-coordinator";

const firstTarget = {
  id: "target_amazon_main",
  projectId: "project_01",
  sessionId: "session_amazon",
  platformId: "amazon" as const,
  workflowId: "amazon-listing" as const,
  slotKey: "MAIN",
};
const secondTarget = {
  id: "target_taobao_hero",
  projectId: "project_02",
  sessionId: "session_taobao",
  platformId: "taobao" as const,
  workflowId: "taobao-product" as const,
  slotKey: "TB-HERO-01",
};

describe("local execution jobs", () => {
  it("tracks one resumable batch from queued items to completion", () => {
    const created = createExecutionJob({
      id: "job_batch",
      kind: "batch-generate",
      targets: [firstTarget, secondTarget],
      now: "2026-07-21T09:00:00.000Z",
    });
    expect(created).toMatchObject({
      status: "queued",
      progress: { completed: 0, total: 2 },
    });

    const first = claimNextExecutionJobItem(created, "2026-07-21T09:01:00.000Z");
    expect(first.currentItem?.target.slotKey).toBe("MAIN");
    expect(first.job.status).toBe("running");

    const afterFirst = completeExecutionJobItem(
      first.job,
      first.currentItem!.id,
      "2026-07-21T09:02:00.000Z",
    );
    expect(afterFirst.progress).toEqual({ completed: 1, total: 2 });

    const second = claimNextExecutionJobItem(afterFirst, "2026-07-21T09:03:00.000Z");
    const completed = completeExecutionJobItem(
      second.job,
      second.currentItem!.id,
      "2026-07-21T09:04:00.000Z",
    );
    expect(completed).toMatchObject({
      status: "completed",
      progress: { completed: 2, total: 2 },
    });
  });

  it("preserves completed items across failure, retry, cancellation, and refresh recovery", () => {
    const created = createExecutionJob({
      id: "job_recovery",
      kind: "batch-generate",
      targets: [firstTarget, secondTarget],
      now: "2026-07-21T10:00:00.000Z",
    });
    const first = claimNextExecutionJobItem(created, "2026-07-21T10:01:00.000Z");
    const afterFirst = completeExecutionJobItem(
      first.job,
      first.currentItem!.id,
      "2026-07-21T10:02:00.000Z",
    );
    const second = claimNextExecutionJobItem(afterFirst, "2026-07-21T10:03:00.000Z");
    const failed = failExecutionJobItem(
      second.job,
      second.currentItem!.id,
      "Provider unavailable",
      "2026-07-21T10:04:00.000Z",
    );
    expect(failed).toMatchObject({ status: "failed", progress: { completed: 1, total: 2 } });

    const retried = retryExecutionJob(failed, "2026-07-21T10:05:00.000Z");
    expect(retried.items.map((item) => item.status)).toEqual(["completed", "pending"]);

    const runningAgain = claimNextExecutionJobItem(retried, "2026-07-21T10:06:00.000Z").job;
    const recovered = recoverInterruptedExecutionJob(runningAgain, "2026-07-21T10:07:00.000Z");
    expect(recovered).toMatchObject({ status: "paused", progress: { completed: 1, total: 2 } });
    expect(recovered.items.map((item) => item.status)).toEqual(["completed", "pending"]);

    const canceled = cancelExecutionJob(recovered, "2026-07-21T10:08:00.000Z");
    expect(canceled.status).toBe("canceled");
    expect(canceled.items.map((item) => item.status)).toEqual(["completed", "canceled"]);
  });

  it("persists and filters jobs in memory and IndexedDB", async () => {
    const memory = createMemoryExecutionJobRepository();
    const database = createIndexedDbExecutionJobRepository({
      indexedDB,
      databaseName: "execution-job-repository-test",
    });
    const job = createExecutionJob({
      id: "job_persisted",
      kind: "batch-generate",
      targets: [firstTarget],
      now: "2026-07-21T11:00:00.000Z",
    });
    const otherProjectJob = createExecutionJob({
      id: "job_other_project",
      kind: "batch-generate",
      targets: [secondTarget],
      now: "2026-07-21T11:01:00.000Z",
    });

    for (const repository of [memory, database]) {
      await repository.put(job);
      await repository.put(otherProjectJob);
      await expect(repository.get(job.id)).resolves.toMatchObject({ id: job.id });
      await expect(repository.list({
        status: "queued",
        projectId: firstTarget.projectId,
      })).resolves.toMatchObject({
        items: [{ id: job.id }],
      });
      await repository.removeProject(firstTarget.projectId);
      await expect(repository.get(job.id)).resolves.toBeNull();
      await expect(repository.get(otherProjectJob.id)).resolves.toMatchObject({
        id: otherProjectJob.id,
      });
      await repository.remove(otherProjectJob.id);
    }
  });

  it("serializes shared execution, rejects non-waiting competitors, and releases after failure", async () => {
    const coordinator = createMemoryExecutionJobCoordinator();
    let cancellationRequested = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = coordinator.runExclusive(async () => {
      await gate;
      return "first";
    }, {
      ownerId: "job-first",
      onCancel: () => {
        cancellationRequested = true;
      },
    });

    await expect(coordinator.isLocked()).resolves.toBe(true);
    await expect(coordinator.activeOwnerId()).resolves.toBe("job-first");
    coordinator.requestCancellation("job-other");
    expect(cancellationRequested).toBe(false);
    coordinator.requestCancellation("job-first");
    expect(cancellationRequested).toBe(true);
    await expect(coordinator.runExclusive(async () => "second")).resolves.toEqual({
      acquired: false,
    });
    let waitedOperationStarted = false;
    const waited = coordinator.runExclusive(async () => {
      waitedOperationStarted = true;
      return "waited";
    }, { wait: true });
    await Promise.resolve();
    expect(waitedOperationStarted).toBe(false);

    release();
    await expect(first).resolves.toEqual({ acquired: true, value: "first" });
    await expect(waited).resolves.toEqual({ acquired: true, value: "waited" });
    await expect(coordinator.isLocked()).resolves.toBe(false);
    await expect(coordinator.activeOwnerId()).resolves.toBeNull();

    await expect(coordinator.runExclusive(async () => {
      throw new Error("generation failed");
    })).rejects.toThrow("generation failed");
    await expect(coordinator.runExclusive(async () => "recovered")).resolves.toEqual({
      acquired: true,
      value: "recovered",
    });
  });
});
