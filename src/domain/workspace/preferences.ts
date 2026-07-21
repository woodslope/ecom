import type { PlatformId } from "../platforms/types";

export const LAST_PLATFORM_STORAGE_KEY = "ecom-workbench.last-platform.v1";
export const DEFAULT_FIRST_PLATFORM: PlatformId = "amazon";

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
