import type { PlannedSlot } from "../planning/types";
import type { SlotVersion, SlotVersionState } from "./types";

export function activeSlotVersion(state?: SlotVersionState): SlotVersion | undefined {
  return state?.versions.find((version) => version.id === state.activeVersionId);
}

export function isSlotVersionCurrent(
  slot: PlannedSlot,
  version: SlotVersion,
  planningInputSignature?: string,
): boolean {
  return (
    Boolean(planningInputSignature) &&
    version.planningInputSignature === planningInputSignature &&
    version.promptSnapshot === slot.prompt &&
    version.visibleCopySnapshot === slot.visibleCopy
  );
}

export function currentSlotVersion(
  slot: PlannedSlot,
  state?: SlotVersionState,
  planningInputSignature?: string,
): SlotVersion | undefined {
  const activeVersion = activeSlotVersion(state);
  return activeVersion && isSlotVersionCurrent(slot, activeVersion, planningInputSignature)
    ? activeVersion
    : undefined;
}
