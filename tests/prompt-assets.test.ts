import { describe, expect, it } from "vitest";

import {
  deleteSlotPromptAsset,
  getDefaultSlotPromptAssetId,
  listSlotPromptAssets,
  saveSlotPromptAsset,
  setDefaultSlotPromptAssetId,
  slotPromptScopeKey,
} from "../src/domain/prompt-profiles/slot-prompt-assets";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const scope = {
  platformId: "amazon" as const,
  workflowId: "amazon-listing" as const,
  slotKey: "PT01",
};

describe("slot Prompt assets", () => {
  it("scopes templates by platform, workflow and slot", () => {
    expect(slotPromptScopeKey(scope)).toBe("amazon:amazon-listing:PT01");
  });

  it("keeps revisions and a per-slot default without affecting other scopes", () => {
    const storage = memoryStorage();
    const created = saveSlotPromptAsset(storage, {
      label: "旅行用品证据版",
      description: "强调材质和结构",
      scope,
      prompt: "version one",
    });
    const updated = saveSlotPromptAsset(storage, {
      id: created.id,
      label: created.label,
      description: created.description,
      scope,
      prompt: "version two",
    });

    expect(updated.revisions.map((revision) => revision.version)).toEqual([1, 2]);
    expect(updated.revisions.at(-1)?.prompt).toBe("version two");
    expect(listSlotPromptAssets(storage, scope)).toHaveLength(1);
    expect(
      listSlotPromptAssets(storage, { ...scope, slotKey: "PT02" }),
    ).toHaveLength(0);

    setDefaultSlotPromptAssetId(storage, scope, updated.id);
    expect(getDefaultSlotPromptAssetId(storage, scope)).toBe(updated.id);

    deleteSlotPromptAsset(storage, updated.id);
    expect(listSlotPromptAssets(storage, scope)).toHaveLength(0);
    expect(getDefaultSlotPromptAssetId(storage, scope)).toBeNull();
  });
});

