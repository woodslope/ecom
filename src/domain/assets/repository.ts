import { createStableId } from "../shared/id";
import type {
  AssetMetadata,
  CreateAssetInput,
  PutAssetInput,
  StoredAsset,
} from "./types";

export interface AssetRepository {
  put(input: PutAssetInput): Promise<StoredAsset>;
  list(projectId: string): Promise<AssetMetadata[]>;
  get(id: string): Promise<StoredAsset | null>;
  remove(id: string): Promise<void>;
  clearProject(projectId: string): Promise<void>;
}

export interface AssetRepositoryOptions {
  createId?: () => string;
  now?: () => string;
}

export interface IndexedDbAssetRepositoryOptions extends AssetRepositoryOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
}

interface IndexedAssetRecord {
  id: string;
  projectId: string;
  metadata: AssetMetadata;
  blob: Blob;
}

export const DEFAULT_ASSET_DATABASE_NAME = "ecom-workbench-assets-v2";

const ASSET_DATABASE_VERSION = 1;
const ASSET_STORE_NAME = "assets";
const PROJECT_INDEX_NAME = "by-project";

function isCreateInput(input: PutAssetInput): input is CreateAssetInput {
  return "projectId" in input;
}

function cloneMetadata(metadata: AssetMetadata): AssetMetadata {
  return {
    ...metadata,
    tags: [...metadata.tags],
    ...(metadata.styleReference
      ? { styleReference: { ...metadata.styleReference, palette: [...metadata.styleReference.palette] } }
      : {}),
  };
}

function cloneAsset(asset: StoredAsset): StoredAsset {
  return { metadata: cloneMetadata(asset.metadata), blob: asset.blob };
}

function toIndexedRecord(asset: StoredAsset): IndexedAssetRecord {
  return {
    id: asset.metadata.id,
    projectId: asset.metadata.projectId,
    metadata: cloneMetadata(asset.metadata),
    blob: asset.blob,
  };
}

function fromIndexedRecord(record: IndexedAssetRecord): StoredAsset {
  return { metadata: cloneMetadata(record.metadata), blob: record.blob };
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

function openAssetDatabase(indexedDB: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, ASSET_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(ASSET_STORE_NAME)
        ? request.transaction!.objectStore(ASSET_STORE_NAME)
        : database.createObjectStore(ASSET_STORE_NAME, { keyPath: "id" });

      if (!store.indexNames.contains(PROJECT_INDEX_NAME)) {
        store.createIndex(PROJECT_INDEX_NAME, "projectId", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
  });
}

async function readIndexedAsset(database: IDBDatabase, id: string): Promise<StoredAsset | null> {
  const transaction = database.transaction(ASSET_STORE_NAME, "readonly");
  const completion = transactionDone(transaction);
  const request = transaction.objectStore(ASSET_STORE_NAME).get(id) as IDBRequest<
    IndexedAssetRecord | undefined
  >;
  const record = await requestResult(request);
  await completion;
  return record ? fromIndexedRecord(record) : null;
}

function mergeAsset(
  existing: StoredAsset | undefined,
  input: PutAssetInput,
  id: string,
  timestamp: string,
): StoredAsset {
  if (!existing) {
    if (!isCreateInput(input)) {
      throw new Error(`Cannot patch missing asset: ${id}`);
    }

    return {
      metadata: {
        id,
        projectId: input.projectId,
        ...input.metadata,
        tags: [...(input.metadata.tags ?? [])],
        mimeType: input.blob.type,
        size: input.blob.size,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      blob: input.blob,
    };
  }

  if (isCreateInput(input) && input.projectId !== existing.metadata.projectId) {
    throw new Error("An existing asset cannot move to another project");
  }

  const blob = input.blob ?? existing.blob;
  const metadata: AssetMetadata = {
    ...existing.metadata,
    ...input.metadata,
    id,
    projectId: existing.metadata.projectId,
    tags:
      input.metadata.tags === undefined
        ? [...existing.metadata.tags]
        : [...input.metadata.tags],
    mimeType: blob.type,
    size: blob.size,
    createdAt: existing.metadata.createdAt,
    updatedAt: timestamp,
  };

  if (input.blob !== undefined) {
    if (input.metadata.width === undefined) {
      delete metadata.width;
    }
    if (input.metadata.height === undefined) {
      delete metadata.height;
    }
  }

  return {
    metadata,
    blob,
  };
}

export function createMemoryAssetRepository(
  options: AssetRepositoryOptions = {},
): AssetRepository {
  const createId = options.createId ?? (() => createStableId("asset"));
  const now = options.now ?? (() => new Date().toISOString());
  const assets = new Map<string, StoredAsset>();

  return {
    async put(input) {
      const id = input.id ?? createId();
      const asset = mergeAsset(assets.get(id), input, id, now());
      assets.set(id, asset);
      return cloneAsset(asset);
    },

    async list(projectId) {
      return [...assets.values()]
        .filter((asset) => asset.metadata.projectId === projectId)
        .map((asset) => cloneMetadata(asset.metadata));
    },

    async get(id) {
      const asset = assets.get(id);
      return asset ? cloneAsset(asset) : null;
    },

    async remove(id) {
      assets.delete(id);
    },

    async clearProject(projectId) {
      for (const [id, asset] of assets) {
        if (asset.metadata.projectId === projectId) {
          assets.delete(id);
        }
      }
    },
  };
}

export function createIndexedDbAssetRepository(
  options: IndexedDbAssetRepositoryOptions = {},
): AssetRepository {
  const indexedDB = "indexedDB" in options ? options.indexedDB : globalThis.indexedDB;
  if (!indexedDB) {
    throw new Error("IndexedDB is not available in this environment");
  }

  const createId = options.createId ?? (() => createStableId("asset"));
  const now = options.now ?? (() => new Date().toISOString());
  const database = openAssetDatabase(
    indexedDB,
    options.databaseName ?? DEFAULT_ASSET_DATABASE_NAME,
  );

  return {
    async put(input) {
      const id = input.id ?? createId();
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(ASSET_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      const store = transaction.objectStore(ASSET_STORE_NAME);

      try {
        const record = await requestResult(
          store.get(id) as IDBRequest<IndexedAssetRecord | undefined>,
        );
        const existing = record ? fromIndexedRecord(record) : undefined;
        const asset = mergeAsset(existing, input, id, now());
        await requestResult(store.put(toIndexedRecord(asset)));
        await completion;
        return cloneAsset(asset);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be complete or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    },

    async list(projectId) {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(ASSET_STORE_NAME, "readonly");
      const completion = transactionDone(transaction);
      const request = transaction
        .objectStore(ASSET_STORE_NAME)
        .index(PROJECT_INDEX_NAME)
        .getAll(projectId) as IDBRequest<IndexedAssetRecord[]>;
      const records = await requestResult(request);
      await completion;
      return records.map((record) => cloneMetadata(record.metadata));
    },

    async get(id) {
      return readIndexedAsset(await database, id);
    },

    async remove(id) {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(ASSET_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      transaction.objectStore(ASSET_STORE_NAME).delete(id);
      await completion;
    },

    async clearProject(projectId) {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(ASSET_STORE_NAME, "readwrite");
      const completion = transactionDone(transaction);
      const store = transaction.objectStore(ASSET_STORE_NAME);
      const request = store.index(PROJECT_INDEX_NAME).openKeyCursor(projectId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      await completion;
    },
  };
}
