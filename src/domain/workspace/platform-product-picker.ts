import type { PlatformId } from "../platforms/types";
import type { PlatformSession } from "./project-workspace";

/**
 * Decide whether entering a platform should open the product picker dialog.
 * Skip when the current platform already has task work, or when the caller
 * already chose a product (e.g. 资料库「开始制作」).
 */
export function shouldPromptPlatformProductPicker(input: {
  platform: PlatformId;
  skipBecauseCallerChoseProduct?: boolean;
  projectCount: number;
  hasPlatformWork: boolean;
}): boolean {
  if (input.skipBecauseCallerChoseProduct) return false;
  if (input.hasPlatformWork) return false;
  // Always prompt so the user explicitly loads a product or chooses manual entry.
  // Zero projects still opens the dialog with create/manual options.
  return true;
}

export function hasPlatformTaskWork(input: {
  platform: PlatformId;
  hasPlan?: boolean;
  hasTaobaoAnalysis?: boolean;
  hasTaobaoDraft?: boolean;
  hasListingDraft?: boolean;
}): boolean {
  if (input.platform === "taobao") {
    return Boolean(input.hasTaobaoAnalysis || input.hasPlan || input.hasTaobaoDraft);
  }
  return Boolean(input.hasPlan || input.hasListingDraft);
}

/** Session already holds task-local copy the user may not want overwritten. */
export function hasUsablePlatformIntakeDraft(
  platform: PlatformId,
  session: PlatformSession | null | undefined,
): boolean {
  if (!session) return false;
  if (platform === "taobao") {
    return Boolean(session.sourceInput.taobaoProduct?.productText?.trim());
  }
  return Boolean(session.sourceInput.listingText?.trim());
}

/**
 * Auto-seed empty intake; ask before overwriting plan or an existing draft.
 * `force` skips the confirm gate (user already accepted overwrite).
 */
export function resolvePlatformIntakeSeedAction(input: {
  hasPlan: boolean;
  hasUsableDraft: boolean;
  force?: boolean;
}): "seed" | "needs-confirm" {
  if (input.force) return "seed";
  if (input.hasPlan || input.hasUsableDraft) return "needs-confirm";
  return "seed";
}
