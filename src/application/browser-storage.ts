/**
 * Browser persistence facade for small JSON records.
 *
 * The public surface intentionally mirrors the synchronous subset of Storage
 * used by the existing domain modules. Values are kept in memory for reads
 * and serialized to IndexedDB in order, so callers do not need to become
 * async just because persistence moved off localStorage.
 */

export const BROWSER_STORAGE_DATABASE_NAME = "ecom-workbench-browser-v1";
export const BROWSER_STORAGE_DATABASE_VERSION = 1;
const BROWSER_STORAGE_STORE_NAME = "kv";

export interface BrowserStorage extends Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear" | "key"> {
  readonly length: number;
}

interface StoredValue {
  key: string;
  value: string;
  updatedAt: number;
}

const MIGRATABLE_EXACT_KEYS = new Set([
  "ecom-workbench.projects.v3",
  "ecom-workbench.runtime-settings.api.v1",
  "ecom-industry-template-packs-v1",
  "ecom-workbench.last-platform.v2",
  "ecom-workbench.last-platform.v1",
  "ecom-workbench.amazon-draft-project-confirm-skip.v1",
]);
const MIGRATABLE_PREFIXES = [
  "ecom-workbench.workspace.api.v1.",
];

let cache = new Map<string, string>();
let hydrated = false;
let indexedDbActive = false;
let storageWarning: string | null = null;
let hydrationPromise: Promise<string | null> | null = null;
let writeQueue = Promise.resolve();
let databasePromise: Promise<IDBDatabase> | null = null;

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function legacyStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isMigratableKey(key: string): boolean {
  return MIGRATABLE_EXACT_KEYS.has(key) || MIGRATABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (!canUseIndexedDb()) return Promise.reject(new Error("IndexedDB is not available"));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(BROWSER_STORAGE_DATABASE_NAME, BROWSER_STORAGE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BROWSER_STORAGE_STORE_NAME)) {
        request.result.createObjectStore(BROWSER_STORAGE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("IndexedDB 打开失败"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("IndexedDB 数据库升级被其他标签页阻塞"));
    };
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 写入失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 写入已中止"));
  });
}

async function readAll(database: IDBDatabase): Promise<StoredValue[]> {
  const transaction = database.transaction(BROWSER_STORAGE_STORE_NAME, "readonly");
  const completion = transactionDone(transaction);
  const records = await requestResult(
    transaction.objectStore(BROWSER_STORAGE_STORE_NAME).getAll() as IDBRequest<StoredValue[]>,
  );
  await completion;
  return records;
}

async function writeAll(database: IDBDatabase, records: StoredValue[]): Promise<void> {
  const transaction = database.transaction(BROWSER_STORAGE_STORE_NAME, "readwrite");
  const completion = transactionDone(transaction);
  const store = transaction.objectStore(BROWSER_STORAGE_STORE_NAME);
  records.forEach((record) => store.put(record));
  await completion;
}

async function writeOne(key: string, value: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(BROWSER_STORAGE_STORE_NAME, "readwrite");
  const completion = transactionDone(transaction);
  transaction.objectStore(BROWSER_STORAGE_STORE_NAME).put({ key, value, updatedAt: Date.now() } satisfies StoredValue);
  await completion;
}

async function removeOne(key: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(BROWSER_STORAGE_STORE_NAME, "readwrite");
  const completion = transactionDone(transaction);
  transaction.objectStore(BROWSER_STORAGE_STORE_NAME).delete(key);
  await completion;
}

function enqueueWrite(task: () => Promise<void>): void {
  writeQueue = writeQueue.then(task).catch(() => undefined);
}

export async function hydrateBrowserStorage(): Promise<string | null> {
  if (hydrated) return storageWarning;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    if (!canUseIndexedDb()) {
      indexedDbActive = false;
      hydrated = true;
      storageWarning = "当前浏览器不支持 IndexedDB，暂时回退到 localStorage。";
      return storageWarning;
    }
    try {
      const database = await openDatabase();
      const records = await readAll(database);
      const next = new Map(records.map((record) => [record.key, record.value]));
      const storage = legacyStorage();
      const migratedKeys: string[] = [];
      const legacyKeys: string[] = [];
      if (storage) {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key || !isMigratableKey(key)) continue;
          legacyKeys.push(key);
          if (next.has(key)) continue;
          const value = storage.getItem(key);
          if (value === null) continue;
          next.set(key, value);
          migratedKeys.push(key);
        }
      }
      if (migratedKeys.length > 0) {
        await writeAll(
          database,
          [...next.entries()].map(([key, value]) => ({ key, value, updatedAt: Date.now() })),
        );
      }
      // Remove legacy copies only after the IndexedDB transaction succeeds.
      legacyKeys.forEach((key) => {
        try {
          storage?.removeItem(key);
        } catch {
          // A read-only localStorage should not prevent the IndexedDB copy from being used.
        }
      });
      cache = next;
      indexedDbActive = true;
      hydrated = true;
      storageWarning = null;
      return storageWarning;
    } catch {
      const storage = legacyStorage();
      if (storage) {
        const fallback = new Map<string, string>();
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key || !isMigratableKey(key)) continue;
          const value = storage.getItem(key);
          if (value !== null) fallback.set(key, value);
        }
        cache = fallback;
      }
      indexedDbActive = false;
      hydrated = true;
      storageWarning = "IndexedDB 初始化失败，暂时使用 localStorage；当前会话仍可继续操作。";
      return storageWarning;
    }
  })();
  try {
    return await hydrationPromise;
  } finally {
    hydrationPromise = null;
  }
}

export function browserStorageReady(): boolean {
  return hydrated;
}

export const browserStorage: BrowserStorage = {
  getItem(key) {
    if (cache.has(key)) return cache.get(key)!;
    if (!hydrated) return legacyStorage()?.getItem(key) ?? null;
    return null;
  },
  setItem(key, value) {
    cache.set(key, value);
    if (!hydrated || !indexedDbActive) {
      legacyStorage()?.setItem(key, value);
      return;
    }
    enqueueWrite(() => writeOne(key, value));
  },
  removeItem(key) {
    cache.delete(key);
    if (!hydrated || !indexedDbActive) {
      legacyStorage()?.removeItem(key);
      return;
    }
    enqueueWrite(() => removeOne(key));
  },
  clear() {
    const keys = [...cache.keys()];
    cache.clear();
    if (!hydrated || !indexedDbActive) {
      legacyStorage()?.clear();
      return;
    }
    keys.forEach((key) => enqueueWrite(() => removeOne(key)));
  },
  key(index) {
    const key = [...cache.keys()][index];
    return key ?? null;
  },
  get length() {
    return cache.size;
  },
};
