import type { AssetMetadata } from "../domain/assets/types";
import { DEFAULT_ASSET_DATABASE_NAME } from "../domain/assets/repository";
import { DEFAULT_EXECUTION_JOB_DATABASE_NAME } from "../domain/jobs/repository";
import { DEFAULT_PROJECT_STORAGE_KEY } from "../domain/projects/repository";
import { DEFAULT_RUN_DATABASE_NAME } from "../domain/runs/repository";
import { RUNTIME_SETTINGS_STORAGE_KEY } from "../domain/settings/runtime-settings";
import { PROJECT_WORKSPACE_STORAGE_PREFIX } from "../domain/workspace/project-workspace";
import {
  AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY,
  DEMO_MODE_BANNER_DISMISSED_KEY,
  LAST_PLATFORM_STORAGE_KEY,
} from "../domain/workspace/preferences";
import { PROJECT_WORKSPACE_V3_STORAGE_PREFIX } from "../domain/workspace/workspace-v3";

export const LOCAL_BACKUP_FORMAT = "ecom-local-backup";
export const LOCAL_BACKUP_VERSION = 1;

type BackupStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export interface LocalBackupEnvironment {
  storage: BackupStorage;
  indexedDB: IDBFactory;
  now?: () => string;
}

export interface SerializedAssetRecord {
  id: string;
  projectId: string;
  metadata: AssetMetadata;
  dataUrl: string;
}

export interface LocalBackupFile {
  format: typeof LOCAL_BACKUP_FORMAT;
  version: typeof LOCAL_BACKUP_VERSION;
  exportedAt: string;
  storage: Record<string, string>;
  indexedDb: {
    assets: SerializedAssetRecord[];
    runs: unknown[];
    jobs: unknown[];
  };
}

export interface LocalBackupSummary {
  projectCount: number;
  assetCount: number;
  runCount: number;
  jobCount: number;
}

interface IndexedAssetRecord {
  id: string;
  projectId: string;
  metadata: AssetMetadata;
  blob: Blob;
}

interface DatabaseSpec {
  databaseName: string;
  storeName: string;
  indexes?: Array<{ name: string; keyPath: string }>;
}

const ASSET_DATABASE: DatabaseSpec = {
  databaseName: DEFAULT_ASSET_DATABASE_NAME,
  storeName: "assets",
  indexes: [{ name: "by-project", keyPath: "projectId" }],
};
const RUN_DATABASE: DatabaseSpec = {
  databaseName: DEFAULT_RUN_DATABASE_NAME,
  storeName: "production-runs",
  indexes: [{ name: "by-project", keyPath: "projectId" }],
};
const JOB_DATABASE: DatabaseSpec = {
  databaseName: DEFAULT_EXECUTION_JOB_DATABASE_NAME,
  storeName: "execution-jobs",
};

const PREFERENCE_STORAGE_KEYS = new Set([
  LAST_PLATFORM_STORAGE_KEY,
  DEMO_MODE_BANNER_DISMISSED_KEY,
  AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY,
]);
const EXACT_STORAGE_KEYS = new Set([
  DEFAULT_PROJECT_STORAGE_KEY,
  ...PREFERENCE_STORAGE_KEYS,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBusinessStorageKey(key: string): boolean {
  return EXACT_STORAGE_KEYS.has(key) ||
    key.startsWith(PROJECT_WORKSPACE_STORAGE_PREFIX) ||
    key.startsWith(PROJECT_WORKSPACE_V3_STORAGE_PREFIX);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地备份读取失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("本地备份事务已取消"));
    transaction.onerror = () => reject(transaction.error ?? new Error("本地备份事务失败"));
  });
}

function openDatabase(indexedDB: IDBFactory, spec: DatabaseSpec): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(spec.databaseName);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(spec.storeName)
        ? request.transaction!.objectStore(spec.storeName)
        : database.createObjectStore(spec.storeName, { keyPath: "id" });
      for (const index of spec.indexes ?? []) {
        if (!store.indexNames.contains(index.name)) {
          store.createIndex(index.name, index.keyPath, { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地备份数据库"));
    request.onblocked = () => reject(new Error("本地数据库被其他页面占用，请关闭其他标签页后重试"));
  });
}

async function readDatabase(indexedDB: IDBFactory, spec: DatabaseSpec): Promise<unknown[]> {
  const database = await openDatabase(indexedDB, spec);
  try {
    const transaction = database.transaction(spec.storeName, "readonly");
    const completion = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(spec.storeName).getAll() as IDBRequest<unknown[]>,
    );
    await completion;
    return records;
  } finally {
    database.close();
  }
}

async function replaceDatabase(
  indexedDB: IDBFactory,
  spec: DatabaseSpec,
  records: unknown[],
): Promise<void> {
  const database = await openDatabase(indexedDB, spec);
  try {
    const transaction = database.transaction(spec.storeName, "readwrite");
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(spec.storeName);
    store.clear();
    for (const record of records) store.put(record);
    await completion;
  } finally {
    database.close();
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("备份中的素材数据格式无效");
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] ?? "";
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function readBusinessStorage(storage: BackupStorage): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !isBusinessStorageKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

function clearBusinessStorage(storage: BackupStorage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isBusinessStorageKey(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

function projectCount(storage: Record<string, string>): number {
  try {
    const state = JSON.parse(storage[DEFAULT_PROJECT_STORAGE_KEY] ?? "null") as unknown;
    return isRecord(state) && Array.isArray(state.projects) ? state.projects.length : 0;
  } catch {
    return 0;
  }
}

export function summarizeLocalBackup(backup: LocalBackupFile): LocalBackupSummary {
  return {
    projectCount: projectCount(backup.storage),
    assetCount: backup.indexedDb.assets.length,
    runCount: backup.indexedDb.runs.length,
    jobCount: backup.indexedDb.jobs.length,
  };
}

export async function createLocalBackup(
  environment: LocalBackupEnvironment,
): Promise<LocalBackupFile> {
  const [assetRecords, runs, jobs] = await Promise.all([
    readDatabase(environment.indexedDB, ASSET_DATABASE),
    readDatabase(environment.indexedDB, RUN_DATABASE),
    readDatabase(environment.indexedDB, JOB_DATABASE),
  ]);
  const assets = await Promise.all(assetRecords.map(async (value) => {
    const record = value as IndexedAssetRecord;
    return {
      id: record.id,
      projectId: record.projectId,
      metadata: structuredClone(record.metadata),
      dataUrl: await blobToDataUrl(record.blob),
    } satisfies SerializedAssetRecord;
  }));

  return {
    format: LOCAL_BACKUP_FORMAT,
    version: LOCAL_BACKUP_VERSION,
    exportedAt: (environment.now ?? (() => new Date().toISOString()))(),
    storage: readBusinessStorage(environment.storage),
    indexedDb: {
      assets,
      runs: structuredClone(runs),
      jobs: structuredClone(jobs),
    },
  };
}

export function parseLocalBackup(serialized: string): LocalBackupFile {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("备份文件不是有效的 JSON");
  }
  if (
    !isRecord(value) ||
    value.format !== LOCAL_BACKUP_FORMAT ||
    value.version !== LOCAL_BACKUP_VERSION ||
    typeof value.exportedAt !== "string" ||
    !isRecord(value.storage) ||
    !isRecord(value.indexedDb) ||
    !Array.isArray(value.indexedDb.assets) ||
    !Array.isArray(value.indexedDb.runs) ||
    !Array.isArray(value.indexedDb.jobs)
  ) {
    throw new Error("备份文件版本或结构不受支持");
  }

  const storage = Object.fromEntries(Object.entries(value.storage).map(([key, item]) => {
    if (!isBusinessStorageKey(key) || key === RUNTIME_SETTINGS_STORAGE_KEY || typeof item !== "string") {
      throw new Error("备份文件包含不允许的本地设置");
    }
    try {
      JSON.parse(item);
    } catch {
      if (!PREFERENCE_STORAGE_KEYS.has(key)) throw new Error("备份中的业务数据无效");
    }
    return [key, item];
  }));

  const assets = value.indexedDb.assets.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.projectId !== "string" ||
      !isRecord(item.metadata) ||
      typeof item.dataUrl !== "string" ||
      !item.dataUrl.startsWith("data:")
    ) {
      throw new Error("备份中的素材记录无效");
    }
    return structuredClone(item) as unknown as SerializedAssetRecord;
  });
  for (const run of value.indexedDb.runs) {
    if (!isRecord(run) || typeof run.id !== "string" || typeof run.projectId !== "string") {
      throw new Error("备份中的生产记录无效");
    }
  }
  for (const job of value.indexedDb.jobs) {
    if (!isRecord(job) || typeof job.id !== "string" || !Array.isArray(job.items)) {
      throw new Error("备份中的本地任务无效");
    }
  }

  return {
    format: LOCAL_BACKUP_FORMAT,
    version: LOCAL_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    storage,
    indexedDb: {
      assets,
      runs: structuredClone(value.indexedDb.runs),
      jobs: structuredClone(value.indexedDb.jobs),
    },
  };
}

async function prepareAssetRecords(assets: SerializedAssetRecord[]): Promise<IndexedAssetRecord[]> {
  return assets.map((asset) => ({
    id: asset.id,
    projectId: asset.projectId,
    metadata: structuredClone(asset.metadata),
    blob: dataUrlToBlob(asset.dataUrl),
  }));
}

async function applyBackup(
  backup: LocalBackupFile,
  assetRecords: IndexedAssetRecord[],
  environment: LocalBackupEnvironment,
): Promise<void> {
  clearBusinessStorage(environment.storage);
  for (const [key, value] of Object.entries(backup.storage)) {
    environment.storage.setItem(key, value);
  }
  await replaceDatabase(environment.indexedDB, ASSET_DATABASE, assetRecords);
  await replaceDatabase(environment.indexedDB, RUN_DATABASE, backup.indexedDb.runs);
  await replaceDatabase(environment.indexedDB, JOB_DATABASE, backup.indexedDb.jobs);
}

export async function restoreLocalBackup(
  backup: LocalBackupFile,
  environment: LocalBackupEnvironment,
): Promise<LocalBackupSummary> {
  const assetRecords = await prepareAssetRecords(backup.indexedDb.assets);
  const before = await createLocalBackup(environment);
  const beforeAssetRecords = await prepareAssetRecords(before.indexedDb.assets);

  try {
    await applyBackup(backup, assetRecords, environment);
  } catch (error) {
    try {
      await applyBackup(before, beforeAssetRecords, environment);
    } catch {
      throw new Error(
        "恢复备份失败，且原数据回滚未完整完成。请保留备份文件，重新打开应用后再次尝试恢复，或手动清理浏览器数据后重新导入。",
      );
    }
    throw error;
  }

  return summarizeLocalBackup(backup);
}

export function localBackupFileName(exportedAt: string): string {
  return `ecom-local-backup-${exportedAt.slice(0, 10)}.json`;
}
