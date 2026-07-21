import type { ProjectWorkspaceRepository } from "../workspace/project-workspace";
import type {
  ProjectWorkspaceV3Document,
  ProjectWorkspaceV3Repository,
} from "../workspace/workspace-v3";
import type { RunRepository } from "./repository";

export interface WorkspaceV2ToV3MigrationOptions {
  projectId: string;
  v2Repository: ProjectWorkspaceRepository;
  v3Repository: ProjectWorkspaceV3Repository;
  runRepository: RunRepository;
  now?: () => string;
}

export async function migrateWorkspaceV2ToV3(
  options: WorkspaceV2ToV3MigrationOptions,
): Promise<ProjectWorkspaceV3Document> {
  const existing = await options.v3Repository.load(options.projectId);
  if (existing.migration.status === "completed") return existing;

  const legacy = await options.v2Repository.load(options.projectId);
  for (const run of legacy.runs) {
    await options.runRepository.put(run);
    const persisted = await options.runRepository.get(run.id);
    if (!persisted || persisted.id !== run.id) {
      throw new Error(`ProductionRun migration verification failed: ${run.id}`);
    }
  }

  const completedAt = (options.now ?? (() => new Date().toISOString()))();
  const migrated: ProjectWorkspaceV3Document = {
    version: 3,
    projectId: options.projectId,
    currentSessions: structuredClone(legacy.sessions),
    migration: {
      sourceVersion: 2,
      status: "completed",
      completedAt,
    },
    updatedAt: completedAt,
  };
  await options.v3Repository.save(migrated);
  return migrated;
}
