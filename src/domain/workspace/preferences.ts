import type { PlatformId } from "../platforms/types";

// v2 resets the development baseline to Taobao without deleting platform tasks.
export const LAST_PLATFORM_STORAGE_KEY = "ecom-workbench.last-platform.v2";
export const LEGACY_LAST_PLATFORM_STORAGE_KEY = "ecom-workbench.last-platform.v1";
export const AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY =
  "ecom-workbench.amazon-draft-project-confirm-skip.v1";
// 淘宝是当前工作台的首要视觉与交互基准；Amazon 仍可从平台导航进入。
export const DEFAULT_FIRST_PLATFORM: PlatformId = "taobao";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readLastPlatform(storage: PreferenceStorage): PlatformId | null {
  try {
    const value = storage.getItem(LAST_PLATFORM_STORAGE_KEY);
    return value === "taobao" || value === "amazon" ? value : null;
  } catch {
    return null;
  }
}

export function readLastPlatformOrDefault(storage: PreferenceStorage): PlatformId {
  return readLastPlatform(storage) ?? DEFAULT_FIRST_PLATFORM;
}

export function writeLastPlatform(storage: PreferenceStorage, platform: PlatformId): void {
  try {
    storage.setItem(LAST_PLATFORM_STORAGE_KEY, platform);
  } catch {
    // Project work remains usable when preference persistence is unavailable.
  }
}

export function readAmazonDraftProjectConfirmSkip(storage: PreferenceStorage): boolean {
  try {
    return storage.getItem(AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAmazonDraftProjectConfirmSkip(
  storage: PreferenceStorage,
  skip: boolean,
): void {
  try {
    storage.setItem(AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY, skip ? "1" : "0");
  } catch {
    // Confirmation remains session-local when persistence is unavailable.
  }
}
