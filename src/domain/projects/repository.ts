import { createStableId } from "../shared/id";
import type {
  CreateProductProjectInput,
  ProductProject,
  UpdateProductProjectInput,
} from "./types";

export interface ProjectRepository {
  create(input: CreateProductProjectInput): Promise<ProductProject>;
  update(id: string, input: UpdateProductProjectInput): Promise<ProductProject | null>;
  list(): Promise<ProductProject[]>;
  get(id: string): Promise<ProductProject | null>;
  remove(id: string): Promise<void>;
  setActiveId(id: string | null): Promise<void>;
  getActiveId(): Promise<string | null>;
  restoreActive(): Promise<ProductProject | null>;
}

export interface ProjectRepositoryOptions {
  createId?: () => string;
  now?: () => string;
}

export interface LocalStorageProjectRepositoryOptions extends ProjectRepositoryOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  storageKey?: string;
}

interface ProjectRepositoryState {
  version: 2;
  projects: ProductProject[];
  activeProjectId: string | null;
}

interface ProjectStateStore {
  read(): ProjectRepositoryState;
  write(state: ProjectRepositoryState): void;
}

export const DEFAULT_PROJECT_STORAGE_KEY = "ecom-workbench.projects.v2";

function emptyState(): ProjectRepositoryState {
  return { version: 2, projects: [], activeProjectId: null };
}

function cloneProject(project: ProductProject): ProductProject {
  return {
    ...project,
    facts: {
      ...project.facts,
      sellingPoints: [...project.facts.sellingPoints],
      forbiddenClaims: [...project.facts.forbiddenClaims],
      specifications: { ...project.facts.specifications },
    },
  };
}

function cloneState(state: ProjectRepositoryState): ProjectRepositoryState {
  return {
    version: 2,
    projects: state.projects.map(cloneProject),
    activeProjectId: state.activeProjectId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeSpecifications(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function normalizeStoredProject(value: unknown): ProductProject | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.facts)) {
    return null;
  }

  const facts = value.facts;
  const productName = normalizeString(facts.productName);
  const createdAt = normalizeString(value.createdAt) || normalizeString(value.updatedAt);

  return {
    id: value.id,
    name: normalizeString(value.name) || productName || "未命名项目",
    facts: {
      productName,
      category: normalizeString(facts.category),
      brand: normalizeString(facts.brand),
      model: normalizeString(facts.model),
      sku: normalizeString(facts.sku),
      targetAudience: normalizeString(facts.targetAudience),
      description: normalizeString(facts.description),
      sellingPoints: normalizeStringArray(facts.sellingPoints),
      forbiddenClaims: normalizeStringArray(facts.forbiddenClaims),
      specifications: normalizeSpecifications(facts.specifications),
    },
    createdAt,
    updatedAt: normalizeString(value.updatedAt) || createdAt,
  };
}

function createProjectRepository(
  store: ProjectStateStore,
  options: ProjectRepositoryOptions,
): ProjectRepository {
  const createId = options.createId ?? (() => createStableId("project"));
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async create(input) {
      const state = store.read();
      const timestamp = now();
      const project: ProductProject = {
        id: createId(),
        name: input.name,
        facts: {
          ...input.facts,
          sellingPoints: [...input.facts.sellingPoints],
          forbiddenClaims: [...input.facts.forbiddenClaims],
          specifications: { ...input.facts.specifications },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state.projects.push(project);
      state.activeProjectId = project.id;
      store.write(state);
      return cloneProject(project);
    },

    async update(id, input) {
      const state = store.read();
      const index = state.projects.findIndex((project) => project.id === id);
      if (index === -1) {
        return null;
      }

      const current = state.projects[index];
      const facts = input.facts;
      const updated: ProductProject = {
        ...current,
        ...(input.name === undefined ? {} : { name: input.name }),
        facts: facts
          ? {
              ...current.facts,
              ...facts,
              sellingPoints:
                facts.sellingPoints === undefined
                  ? [...current.facts.sellingPoints]
                  : [...facts.sellingPoints],
              forbiddenClaims:
                facts.forbiddenClaims === undefined
                  ? [...current.facts.forbiddenClaims]
                  : [...facts.forbiddenClaims],
              specifications:
                facts.specifications === undefined
                  ? { ...current.facts.specifications }
                  : { ...facts.specifications },
            }
          : cloneProject(current).facts,
        updatedAt: now(),
      };

      state.projects[index] = updated;
      store.write(state);
      return cloneProject(updated);
    },

    async list() {
      return store.read().projects.map(cloneProject);
    },

    async get(id) {
      const project = store.read().projects.find((candidate) => candidate.id === id);
      return project ? cloneProject(project) : null;
    },

    async remove(id) {
      const state = store.read();
      state.projects = state.projects.filter((project) => project.id !== id);
      if (state.activeProjectId === id) {
        state.activeProjectId = null;
      }
      store.write(state);
    },

    async setActiveId(id) {
      const state = store.read();
      state.activeProjectId =
        id !== null && state.projects.some((project) => project.id === id) ? id : null;
      store.write(state);
    },

    async getActiveId() {
      const state = store.read();
      return state.projects.some((project) => project.id === state.activeProjectId)
        ? state.activeProjectId
        : null;
    },

    async restoreActive() {
      const state = store.read();
      const project = state.projects.find((candidate) => candidate.id === state.activeProjectId);
      return project ? cloneProject(project) : null;
    },
  };
}

export function createMemoryProjectRepository(
  options: ProjectRepositoryOptions = {},
): ProjectRepository {
  let state = emptyState();
  return createProjectRepository(
    {
      read: () => cloneState(state),
      write: (nextState) => {
        state = cloneState(nextState);
      },
    },
    options,
  );
}

export function createLocalStorageProjectRepository(
  options: LocalStorageProjectRepositoryOptions = {},
): ProjectRepository {
  const storage = options.storage ?? globalThis.localStorage;
  const storageKey = options.storageKey ?? DEFAULT_PROJECT_STORAGE_KEY;

  return createProjectRepository(
    {
      read() {
        const serialized = storage.getItem(storageKey);
        if (!serialized) {
          return emptyState();
        }

        try {
          const parsed: unknown = JSON.parse(serialized);
          if (
            !isRecord(parsed) ||
            parsed.version !== 2 ||
            !Array.isArray(parsed.projects)
          ) {
            return emptyState();
          }

          const projects = parsed.projects
            .map(normalizeStoredProject)
            .filter((project): project is ProductProject => project !== null);

          return cloneState({
            version: 2,
            projects,
            activeProjectId:
              typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : null,
          });
        } catch {
          return emptyState();
        }
      },
      write(state) {
        storage.setItem(storageKey, JSON.stringify(state));
      },
    },
    options,
  );
}
