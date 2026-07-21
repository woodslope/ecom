import { describe, expect, it } from "vitest";

import {
  createLocalStorageProjectRepository,
  createMemoryProjectRepository,
} from "../src/domain/projects/repository";
import type { ProductFacts } from "../src/domain/projects/types";

const productFacts: ProductFacts = {
  productName: "轻量旅行保温杯",
  category: "户外水具",
  brand: "North Cup",
  model: "NC-500",
  sku: "NC-500-GR",
  targetAudience: "通勤与轻户外用户",
  description: "500ml 双层真空不锈钢保温杯",
  sellingPoints: ["12 小时保温", "杯盖防漏", "整杯 280g"],
  forbiddenClaims: ["行业第一", "永久保温"],
  specifications: {
    capacity: "500ml",
    material: "304 stainless steel",
  },
};

function createStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("project repositories", () => {
  it("creates a project with stable identity and restores it from the list", async () => {
    const repository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });

    const created = await repository.create({
      name: "保温杯夏季上新",
      facts: productFacts,
    });

    expect(created).toEqual({
      id: "project_01",
      name: "保温杯夏季上新",
      facts: productFacts,
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T08:00:00.000Z",
    });
    expect(await repository.list()).toEqual([created]);
  });

  it("keeps forbidden claims isolated from later form mutations", async () => {
    const repository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const submittedFacts: ProductFacts = {
      ...productFacts,
      sellingPoints: [...productFacts.sellingPoints],
      forbiddenClaims: [...productFacts.forbiddenClaims],
      specifications: { ...productFacts.specifications },
    };

    const created = await repository.create({ name: "保温杯夏季上新", facts: submittedFacts });
    submittedFacts.forbiddenClaims.push("零风险");

    expect(created.facts.forbiddenClaims).toEqual(["行业第一", "永久保温"]);
    expect((await repository.get(created.id))?.facts.forbiddenClaims).toEqual([
      "行业第一",
      "永久保温",
    ]);
  });

  it("updates only supplied scalar fields and replaces a supplied specification collection", async () => {
    const timestamps = ["2026-07-16T08:00:00.000Z", "2026-07-16T09:30:00.000Z"];
    const repository = createMemoryProjectRepository({
      createId: () => "project_01",
      now: () => timestamps.shift()!,
    });
    await repository.create({ name: "保温杯夏季上新", facts: productFacts });

    const updated = await repository.update("project_01", {
      name: "保温杯秋季上新",
      facts: {
        description: "升级陶瓷涂层内胆的 500ml 保温杯",
        sellingPoints: ["无金属味", "12 小时保温"],
        specifications: { lining: "ceramic coating" },
      },
    });

    expect(updated).toMatchObject({
      id: "project_01",
      name: "保温杯秋季上新",
      facts: {
        productName: productFacts.productName,
        category: productFacts.category,
        description: "升级陶瓷涂层内胆的 500ml 保温杯",
        sellingPoints: ["无金属味", "12 小时保温"],
        specifications: {
          lining: "ceramic coating",
        },
      },
      createdAt: "2026-07-16T08:00:00.000Z",
      updatedAt: "2026-07-16T09:30:00.000Z",
    });
    expect(await repository.get("project_01")).toEqual(updated);
  });

  it("persists specification deletion and rename across localStorage restoration", async () => {
    const storage = createStorage();
    const firstSession = createLocalStorageProjectRepository({
      storage,
      storageKey: "test.projects",
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    await firstSession.create({ name: "保温杯规格编辑", facts: productFacts });

    await firstSession.update("project_01", {
      facts: {
        specifications: {
          容量: "500ml",
          lining: "ceramic coating",
        },
      },
    });

    const restoredSession = createLocalStorageProjectRepository({
      storage,
      storageKey: "test.projects",
    });
    expect((await restoredSession.restoreActive())?.facts.specifications).toEqual({
      容量: "500ml",
      lining: "ceramic coating",
    });
  });

  it("tracks the active project and clears a removed active project", async () => {
    const ids = ["project_01", "project_02"];
    const repository = createMemoryProjectRepository({
      createId: () => ids.shift()!,
      now: () => "2026-07-16T08:00:00.000Z",
    });
    const first = await repository.create({ name: "第一款商品", facts: productFacts });
    const second = await repository.create({ name: "第二款商品", facts: productFacts });

    expect(await repository.getActiveId()).toBe(second.id);
    expect(await repository.restoreActive()).toEqual(second);

    await repository.setActiveId(first.id);
    expect(await repository.restoreActive()).toEqual(first);

    await repository.remove(first.id);
    expect(await repository.get(first.id)).toBeNull();
    expect(await repository.getActiveId()).toBeNull();
    expect(await repository.restoreActive()).toBeNull();
  });

  it("restores projects and the active id from localStorage in a new repository instance", async () => {
    const storage = createStorage();
    const firstSession = createLocalStorageProjectRepository({
      storage,
      storageKey: "test.projects",
      createId: () => "project_01",
      now: () => "2026-07-16T08:00:00.000Z",
    });
    await firstSession.create({ name: "保温杯夏季上新", facts: productFacts });
    await firstSession.update("project_01", {
      facts: { targetAudience: "城市骑行用户" },
    });

    const restoredSession = createLocalStorageProjectRepository({
      storage,
      storageKey: "test.projects",
    });

    expect(await restoredSession.getActiveId()).toBe("project_01");
    expect(await restoredSession.restoreActive()).toMatchObject({
      id: "project_01",
      name: "保温杯夏季上新",
      facts: { targetAudience: "城市骑行用户" },
    });
    expect(await restoredSession.list()).toHaveLength(1);
  });

  it("keeps valid projects when one stored record is damaged and normalizes legacy facts", async () => {
    const storage = createStorage();
    storage.setItem(
      "test.projects",
      JSON.stringify({
        version: 2,
        projects: [
          {
            id: "project_valid",
            name: "完整项目",
            facts: productFacts,
            createdAt: "2026-07-16T08:00:00.000Z",
            updatedAt: "2026-07-16T09:00:00.000Z",
          },
          {
            id: "project_legacy",
            name: "旧版项目",
            facts: {
              productName: "折叠伞",
              sellingPoints: ["轻量"],
            },
            createdAt: "2026-07-15T08:00:00.000Z",
          },
          {
            id: "project_damaged",
            name: "损坏项目",
            facts: null,
          },
        ],
        activeProjectId: "project_legacy",
      }),
    );

    const repository = createLocalStorageProjectRepository({
      storage,
      storageKey: "test.projects",
    });

    expect(await repository.list()).toEqual([
      {
        id: "project_valid",
        name: "完整项目",
        facts: productFacts,
        createdAt: "2026-07-16T08:00:00.000Z",
        updatedAt: "2026-07-16T09:00:00.000Z",
      },
      {
        id: "project_legacy",
        name: "旧版项目",
        facts: {
          productName: "折叠伞",
          category: "",
          brand: "",
          model: "",
          sku: "",
          targetAudience: "",
          description: "",
          sellingPoints: ["轻量"],
          forbiddenClaims: [],
          specifications: {},
        },
        createdAt: "2026-07-15T08:00:00.000Z",
        updatedAt: "2026-07-15T08:00:00.000Z",
      },
    ]);
    expect(await repository.getActiveId()).toBe("project_legacy");
  });
});
