import { compressImageFile } from "../../domain/assets/compress";
import {
  createIndexedDbAssetRepository,
  createMemoryAssetRepository,
} from "../../domain/assets/repository";
import {
  createIndexedDbRunRepository,
  createMemoryRunRepository,
} from "../../domain/runs/repository";
import {
  createIndexedDbExecutionJobRepository,
  createMemoryExecutionJobRepository,
} from "../../domain/jobs/repository";
import {
  createBrowserExecutionJobCoordinator,
  createMemoryExecutionJobCoordinator,
  type ExecutionJobCoordinator,
} from "../../domain/jobs/execution-coordinator";
import { createV3WorkspacePersistence } from "../../application/workspace-persistence";
import {
  createLocalStorageProjectRepository,
  createMemoryProjectRepository,
} from "../../domain/projects/repository";
import {
  createLocalStorageSettingsRepository,
  createMemorySettingsRepository,
  testApiConnection,
  type SettingsRepository,
} from "../../domain/settings";
import { createAiRuntimeFactory } from "../../services/ai/runtime-factory";
import { browserStorage, hydrateBrowserStorage } from "../../application/browser-storage";
import {
  createLocalStorageWorkspaceV3Repository,
  createMemoryWorkspaceV3Repository,
  type ProjectWorkspaceV3Repository,
} from "../../domain/workspace/workspace-v3";
import type { WorkbenchStoreDependencies } from "./types";
import type { ProjectRepository } from "../../domain/projects/repository";
import type { AssetRepository } from "../../domain/assets/repository";
import type { RunRepository } from "../../domain/runs/repository";
import type { ExecutionJobRepository } from "../../domain/jobs/repository";
import type { ProjectWorkspaceRepository } from "../../domain/workspace/project-workspace";

export function createDefaultWorkbenchDependencies(): WorkbenchStoreDependencies {
  const warnings: string[] = [];
  let projectRepository: ProjectRepository;
  let assetRepository: AssetRepository;
  let workspaceRepository: ProjectWorkspaceRepository;
  let workspaceV3Repository: ProjectWorkspaceV3Repository;
  let runRepository: RunRepository;
  let executionJobRepository: ExecutionJobRepository;
  let executionJobCoordinator: ExecutionJobCoordinator = createMemoryExecutionJobCoordinator();
  let settingsRepository: SettingsRepository;

  if (typeof window === "undefined") {
    projectRepository = createMemoryProjectRepository();
    assetRepository = createMemoryAssetRepository();
    workspaceV3Repository = createMemoryWorkspaceV3Repository();
    runRepository = createMemoryRunRepository();
    executionJobRepository = createMemoryExecutionJobRepository();
    workspaceRepository = createV3WorkspacePersistence({ v3Repository: workspaceV3Repository, runRepository });
    settingsRepository = createMemorySettingsRepository();
    warnings.push("当前为非浏览器环境，项目与素材仅保存在内存中。");
  } else {
    projectRepository = createLocalStorageProjectRepository({ storage: browserStorage });
    try {
      assetRepository = createIndexedDbAssetRepository({ indexedDB: window.indexedDB });
    } catch {
      assetRepository = createMemoryAssetRepository();
      warnings.push("IndexedDB 不可用，素材仅在当前会话保存在内存中。");
    }
    workspaceV3Repository = createLocalStorageWorkspaceV3Repository({ storage: browserStorage });
    try {
      runRepository = createIndexedDbRunRepository({ indexedDB: window.indexedDB });
    } catch {
      runRepository = createMemoryRunRepository();
      warnings.push("IndexedDB 不可用，生产记录仅在当前会话保存在内存中。");
    }
    try {
      executionJobRepository = createIndexedDbExecutionJobRepository({ indexedDB: window.indexedDB });
    } catch {
      executionJobRepository = createMemoryExecutionJobRepository();
      warnings.push("IndexedDB 不可用，本地任务仅在当前会话保存在内存中。");
    }
    if (window.navigator.locks) {
      executionJobCoordinator = createBrowserExecutionJobCoordinator(window.navigator.locks);
    } else {
      warnings.push("当前浏览器不支持跨标签页任务锁，请勿在多个标签页同时生成图片。");
    }
    workspaceRepository = createV3WorkspacePersistence({ v3Repository: workspaceV3Repository, runRepository });
    settingsRepository = createLocalStorageSettingsRepository(browserStorage);
  }

  const defaultAiRuntimeFactory = createAiRuntimeFactory();
  return {
    projectRepository,
    assetRepository,
    workspaceRepository,
    runRepository,
    executionJobRepository,
    executionJobCoordinator,
    settingsRepository,
    aiRuntimeFactory: defaultAiRuntimeFactory,
    testTextConnection: (settings) => defaultAiRuntimeFactory.testTextConnection(settings),
    testImageConnection: (settings) => defaultAiRuntimeFactory.testImageConnection(settings),
    testConnection: testApiConnection,
    compressImageFile,
    createObjectURL(blob) {
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        throw new Error("当前环境无法创建素材预览 URL");
      }
      return URL.createObjectURL(blob);
    },
    revokeObjectURL(url) {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
    },
    warning: warnings.length > 0 ? warnings.join(" ") : null,
    prepareStorage: hydrateBrowserStorage,
  };
}
