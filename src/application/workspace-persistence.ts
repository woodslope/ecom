import type {
  AmazonModeWorkspaceSnapshot,
  AmazonWorkspaceMode,
  PlatformSession,
  ProductionRun,
  ProjectWorkspaceDocument,
  ProjectWorkspaceRepository,
} from "../domain/workspace/project-workspace";
import type {
  ProjectWorkspaceV3Document,
  ProjectWorkspaceV3Repository,
} from "../domain/workspace/workspace-v3";
import { migrateWorkspaceV2ToV3 } from "../domain/runs/migration";
import type { RunRepository } from "../domain/runs/repository";

export class RepositoryRecoveryError extends Error {
  readonly recoveryRequired = true;

  constructor(
    message: string,
    readonly originalError: unknown,
    readonly compensationError: unknown,
  ) {
    super(message);
    this.name = "RepositoryRecoveryError";
  }
}

interface WorkspacePersistenceOptions {
  legacyRepository: ProjectWorkspaceRepository;
  v3Repository: ProjectWorkspaceV3Repository;
  runRepository: RunRepository;
  now?: () => string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function readAllRuns(
  runRepository: RunRepository,
  projectId: string,
): Promise<ProductionRun[]> {
  const runs: ProductionRun[] = [];
  let cursor;
  do {
    const page = await runRepository.query({ projectId }, cursor, 50);
    runs.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return runs;
}

function latestBy<T extends { updatedAt: string }>(items: T[]): T | undefined {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function materializeLegacyDocument(
  v3: ProjectWorkspaceV3Document,
  runs: ProductionRun[],
  oldDocument: ProjectWorkspaceDocument,
): ProjectWorkspaceDocument {
  const plans: ProjectWorkspaceDocument["plans"] = {};
  const planInputSignatures: ProjectWorkspaceDocument["planInputSignatures"] = {};
  const selectedSlotKeys: ProjectWorkspaceDocument["selectedSlotKeys"] = {};
  const slotVersions: ProjectWorkspaceDocument["slotVersions"] = {};
  const amazonWorkspaces: ProjectWorkspaceDocument["amazonWorkspaces"] = {};
  const byPlatform = new Map<string, PlatformSession[]>();

  for (const session of v3.currentSessions) {
    const existing = byPlatform.get(session.platformId) ?? [];
    existing.push(session);
    byPlatform.set(session.platformId, existing);
    if (!session.plan) continue;
    const current = plans[session.platformId];
    if (!current || session.updatedAt >= (latestBy(byPlatform.get(session.platformId) ?? [])?.updatedAt ?? "")) {
      plans[session.platformId] = clone(session.plan);
      if (session.planInputSignature) {
        planInputSignatures[session.platformId] = session.planInputSignature;
      }
      if (session.selectedSlotKey) {
        selectedSlotKeys[session.platformId] = session.selectedSlotKey;
      }
      slotVersions[session.platformId] = clone(session.slotVersions);
    }
  }

  const amazonSessions = byPlatform.get("amazon") ?? [];
  for (const session of amazonSessions) {
    if (!session.plan) continue;
    const mode: AmazonWorkspaceMode = session.workflowId === "amazon-aplus" ? "aplus" : "listing";
    const snapshot: AmazonModeWorkspaceSnapshot = {
      plan: clone(session.plan),
      ...(session.planInputSignature ? { planInputSignature: session.planInputSignature } : {}),
      ...(session.selectedSlotKey ? { selectedSlotKey: session.selectedSlotKey } : {}),
    };
    amazonWorkspaces[mode] = snapshot;
  }
  const latestAmazon = latestBy(amazonSessions.filter((session) => Boolean(session.plan)));

  return {
    projectId: v3.projectId,
    sessions: clone(v3.currentSessions),
    runs: clone(runs),
    plans,
    planInputSignatures,
    selectedSlotKeys,
    amazonPlannerMode: latestAmazon?.workflowId === "amazon-aplus" ? "aplus" : "listing",
    amazonWorkspaces,
    slotVersions,
    taskHistory: clone(oldDocument.taskHistory),
    updatedAt: v3.updatedAt,
  };
}

async function restoreRuns(
  runRepository: RunRepository,
  before: ProductionRun[],
  after: ProductionRun[],
): Promise<void> {
  const beforeById = new Map(before.map((run) => [run.id, run]));
  const afterIds = new Set(after.map((run) => run.id));
  for (const run of after) {
    const original = beforeById.get(run.id);
    if (original) {
      await runRepository.put(original);
    } else {
      await runRepository.remove(run.id);
    }
  }
  for (const run of before) {
    if (!afterIds.has(run.id)) await runRepository.put(run);
  }
}

export function createV3WorkspacePersistence(options: WorkspacePersistenceOptions): ProjectWorkspaceRepository {
  const now = options.now ?? (() => new Date().toISOString());
  const ensureMigration = (projectId: string) => migrateWorkspaceV2ToV3({
    projectId,
    v2Repository: options.legacyRepository,
    v3Repository: options.v3Repository,
    runRepository: options.runRepository,
    now,
  });

  return {
    async load(projectId) {
      await ensureMigration(projectId);
      const [v3, runs, oldDocument] = await Promise.all([
        options.v3Repository.load(projectId),
        readAllRuns(options.runRepository, projectId),
        options.legacyRepository.load(projectId),
      ]);
      return materializeLegacyDocument(v3, runs, oldDocument);
    },
    async save(document) {
      await ensureMigration(document.projectId);
      const beforeV3 = await options.v3Repository.load(document.projectId);
      const beforeRuns = await readAllRuns(options.runRepository, document.projectId);
      const nextV3: ProjectWorkspaceV3Document = {
        version: 3,
        projectId: document.projectId,
        currentSessions: clone(document.sessions),
        migration: beforeV3.migration,
        updatedAt: document.updatedAt || now(),
      };
      try {
        await restoreRuns(options.runRepository, document.runs, beforeRuns);
        await options.v3Repository.save(nextV3);
      } catch (error) {
        const compensationErrors: unknown[] = [];
        try {
          await options.v3Repository.save(beforeV3);
        } catch (rollbackError) {
          compensationErrors.push(rollbackError);
        }
        try {
          await restoreRuns(options.runRepository, beforeRuns, document.runs);
        } catch (rollbackError) {
          compensationErrors.push(rollbackError);
        }
        if (compensationErrors.length > 0) {
          throw new RepositoryRecoveryError(
            `保存商品工作区失败，且补偿失败，请重试恢复：${error instanceof Error ? error.message : "未知错误"}`,
            error,
            compensationErrors,
          );
        }
        throw error;
      }
    },
    async remove(projectId) {
      await options.runRepository.removeProject(projectId);
      await options.v3Repository.remove?.(projectId);
    },
  };
}
