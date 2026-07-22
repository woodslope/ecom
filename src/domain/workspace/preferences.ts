import type { PlatformId } from "../platforms/types";

export const LAST_PLATFORM_STORAGE_KEY = "ecom-workbench.last-platform.v1";
export const DEMO_MODE_BANNER_DISMISSED_KEY = "ecom-workbench.demo-mode-banner-dismissed.v1";
export const AMAZON_DRAFT_PROJECT_CONFIRM_SKIP_KEY =
  "ecom-workbench.amazon-draft-project-confirm-skip.v1";
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

export function readDemoModeBannerDismissed(storage: PreferenceStorage): boolean {
  try {
    return storage.getItem(DEMO_MODE_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDemoModeBannerDismissed(storage: PreferenceStorage, dismissed: boolean): void {
  try {
    storage.setItem(DEMO_MODE_BANNER_DISMISSED_KEY, dismissed ? "1" : "0");
  } catch {
    // Banner remains session-local when persistence is unavailable.
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
