import type { PlatformSession } from "./project-workspace";

export const PROJECT_WORKSPACE_V3_STORAGE_PREFIX = "ecom-workbench.workspace.v3.";

export interface WorkspaceMigrationState {
  sourceVersion: 2;
  status: "pending" | "completed";
  completedAt?: string;
}

export interface ProjectWorkspaceV3Document {
  version: 3;
  projectId: string;
  currentSessions: PlatformSession[];
  migration: WorkspaceMigrationState;
  updatedAt: string;
}

export interface ProjectWorkspaceV3Repository {
  load(projectId: string): Promise<ProjectWorkspaceV3Document>;
  save(document: ProjectWorkspaceV3Document): Promise<void>;
  remove?(projectId: string): Promise<void>;
}

interface WorkspaceV3RepositoryOptions {
  now?: () => string;
}

interface LocalStorageWorkspaceV3RepositoryOptions extends WorkspaceV3RepositoryOptions {
  storage: Pick<Storage, "getItem" | "setItem"> & {
    removeItem?: Storage["removeItem"];
  };
}

function defaultNow(): string {
  return new Date().toISOString();
}

function emptyDocument(
  projectId: string,
  now: () => string,
): ProjectWorkspaceV3Document {
  return {
    version: 3,
    projectId,
    currentSessions: [],
    migration: { sourceVersion: 2, status: "pending" },
    updatedAt: now(),
  };
}

function cloneDocument(
  document: ProjectWorkspaceV3Document,
): ProjectWorkspaceV3Document {
  return structuredClone(document);
}

function normalizeStoredDocument(
  value: unknown,
  projectId: string,
  now: () => string,
): ProjectWorkspaceV3Document {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== 3 ||
    (value as { projectId?: unknown }).projectId !== projectId
  ) {
    return emptyDocument(projectId, now);
  }
  const record = value as Record<string, unknown>;
  const migration = record.migration;
  if (
    typeof migration !== "object" ||
    migration === null ||
    Array.isArray(migration) ||
    (migration as { sourceVersion?: unknown }).sourceVersion !== 2 ||
    ((migration as { status?: unknown }).status !== "pending" &&
      (migration as { status?: unknown }).status !== "completed")
  ) {
    return emptyDocument(projectId, now);
  }
  const migrationRecord = migration as Record<string, unknown>;
  return {
    version: 3,
    projectId,
    currentSessions: Array.isArray(record.currentSessions)
      ? structuredClone(record.currentSessions) as PlatformSession[]
      : [],
    migration: {
      sourceVersion: 2,
      status: migrationRecord.status as WorkspaceMigrationState["status"],
      ...(typeof migrationRecord.completedAt === "string"
        ? { completedAt: migrationRecord.completedAt }
        : {}),
    },
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now(),
  };
}

export function createMemoryWorkspaceV3Repository(
  options: WorkspaceV3RepositoryOptions = {},
): ProjectWorkspaceV3Repository {
  const now = options.now ?? defaultNow;
  const documents = new Map<string, ProjectWorkspaceV3Document>();

  return {
    async load(projectId) {
      const document = documents.get(projectId);
      return document ? cloneDocument(document) : emptyDocument(projectId, now);
    },
    async save(document) {
      documents.set(document.projectId, cloneDocument(document));
    },
    async remove(projectId) {
      documents.delete(projectId);
    },
  };
}

export function createLocalStorageWorkspaceV3Repository(
  options: LocalStorageWorkspaceV3RepositoryOptions,
): ProjectWorkspaceV3Repository {
  const now = options.now ?? defaultNow;
  return {
    async load(projectId) {
      const value = options.storage.getItem(
        `${PROJECT_WORKSPACE_V3_STORAGE_PREFIX}${projectId}`,
      );
      if (!value) return emptyDocument(projectId, now);
      try {
        return normalizeStoredDocument(JSON.parse(value), projectId, now);
      } catch {
        return emptyDocument(projectId, now);
      }
    },
    async save(document) {
      const normalized = normalizeStoredDocument(document, document.projectId, now);
      options.storage.setItem(
        `${PROJECT_WORKSPACE_V3_STORAGE_PREFIX}${document.projectId}`,
        JSON.stringify(normalized),
      );
    },
    async remove(projectId) {
      options.storage.removeItem?.(`${PROJECT_WORKSPACE_V3_STORAGE_PREFIX}${projectId}`);
    },
  };
}
