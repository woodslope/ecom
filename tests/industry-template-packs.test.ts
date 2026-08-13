import { describe, expect, it } from "vitest";

import {
  createGeneralIndustryTemplateSnapshot,
  deleteIndustryTemplatePack,
  getDefaultIndustryTemplatePackId,
  industryTemplateSnapshot,
  listIndustryTemplatePacks,
  normalizeIndustryTemplateSnapshot,
  saveIndustryTemplatePack,
  setDefaultIndustryTemplatePackId,
} from "../src/domain/prompt-templates/industry-template-packs";
import { getPlatformRulePack } from "../src/domain/platforms/registry";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("industry template packs", () => {
  const scope = { platformId: "taobao" as const, workflowId: "taobao-product" as const };
  const rulePack = getPlatformRulePack("taobao");

  it("builds a locked general snapshot from the active rule pack", () => {
    const snapshot = createGeneralIndustryTemplateSnapshot(scope, rulePack);
    expect(snapshot.source).toBe("system");
    expect(snapshot.slots).toHaveLength(rulePack.slots.length);
    expect(snapshot.slots[0]).toMatchObject({
      slotKey: rulePack.slots[0]?.key,
      label: rulePack.slots[0]?.label,
    });
  });

  it("saves versions, resolves defaults, and keeps snapshots self-contained", () => {
    const storage = memoryStorage();
    const general = createGeneralIndustryTemplateSnapshot(scope, rulePack);
    const first = saveIndustryTemplatePack(storage, {
      name: "家居饰品",
      description: "家居摆件行业方向",
      scope,
      brief: {
        industry: "家居软装",
        productTypes: "花瓶、摆件",
        targetAudience: "家居审美人群",
        stylePreference: "自然质感",
        extraRequirements: "保持商品为视觉中心",
        forbiddenContent: "固定具体尺寸",
      },
      slots: general.slots,
    });
    const firstSnapshot = industryTemplateSnapshot(first);
    const second = saveIndustryTemplatePack(storage, {
      id: first.id,
      name: first.name,
      description: first.description,
      scope,
      brief: firstSnapshot.brief,
      slots: general.slots.map((slot) => ({
        ...slot,
        guidance: `${slot.guidance}；第二版`,
      })),
    });

    expect(second.revisions.map((revision) => revision.version)).toEqual([1, 2]);
    expect(listIndustryTemplatePacks(storage, scope)).toHaveLength(1);
    const snapshot = industryTemplateSnapshot(second);
    expect(snapshot.version).toBe(2);
    expect(normalizeIndustryTemplateSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);

    setDefaultIndustryTemplatePackId(storage, scope, second.id);
    expect(getDefaultIndustryTemplatePackId(storage, scope)).toBe(second.id);
    deleteIndustryTemplatePack(storage, second.id);
    expect(listIndustryTemplatePacks(storage, scope)).toEqual([]);
    expect(getDefaultIndustryTemplatePackId(storage, scope)).toBeNull();
  });
});
