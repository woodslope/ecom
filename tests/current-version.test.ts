import { describe, expect, it } from "vitest";

import {
  currentSlotVersion,
  isSlotVersionCurrent,
} from "../src/domain/generation/current-version";
import type { SlotVersion, SlotVersionState } from "../src/domain/generation/types";
import type { PlannedSlot } from "../src/domain/planning/types";

const slot: PlannedSlot = {
  slotKey: "PT01",
  visibleCopy: "Travel comfort",
  strategy: "Benefit proof",
  evidence: ["Product facts"],
  prompt: "A clear product composition",
  negativePrompt: "No unsupported claims",
};

function version(inputSignature: string): SlotVersion {
  return {
    id: "version_01",
    slotKey: slot.slotKey,
    assetId: "asset_01",
    createdAt: "2026-07-18T08:00:00.000Z",
    source: "demo",
    promptSnapshot: slot.prompt,
    visibleCopySnapshot: slot.visibleCopy,
    planningInputSignature: inputSignature,
    width: 2000,
    height: 2000,
    mimeType: "image/svg+xml",
    parameters: {},
  };
}

describe("current slot version", () => {
  it("treats an image from old product or reference inputs as an old version", () => {
    const oldVersion = version("input-v1");
    const state: SlotVersionState = {
      versions: [oldVersion],
      activeVersionId: oldVersion.id,
    };

    expect(isSlotVersionCurrent(slot, oldVersion, "input-v1")).toBe(true);
    expect(isSlotVersionCurrent(slot, oldVersion, "input-v2")).toBe(false);
    expect(currentSlotVersion(slot, state, "input-v2")).toBeUndefined();
  });
});
