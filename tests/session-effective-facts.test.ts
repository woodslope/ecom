import { describe, expect, it } from "vitest";

import type { ProductProject } from "../src/domain/projects/types";
import type { PlatformSession } from "../src/domain/workspace/project-workspace";
import { resolveSessionEffectiveProject } from "../src/domain/workspace/effective-facts";

const project: ProductProject = {
  id: "project_context",
  name: "淘宝商品",
  facts: {
    productName: "旅行颈枕",
    category: "旅行用品",
    brand: "Northwind",
    model: "TP-01",
    sku: "TP-01-GRAY",
    targetAudience: "长途出行人群",
    description: "可折叠记忆棉颈枕",
    sellingPoints: ["慢回弹"],
    forbiddenClaims: [],
    specifications: { 材质: "记忆棉" },
  },
  createdAt: "2026-07-21T08:00:00.000Z",
  updatedAt: "2026-07-21T08:00:00.000Z",
};

const taobaoSession: PlatformSession = {
  id: "session_context",
  projectId: project.id,
  platformId: "taobao",
  workflowId: "taobao-product",
  sourceInput: { listingText: "" },
  options: { platformId: "taobao" },
  selectedReferenceAssetIds: [],
  taobaoAnalysis: {
    suggestedProductName: "旅行颈枕 Pro",
    sellingPoints: ["可折叠收纳"],
    specifications: { 尺寸: "28 x 25 x 12 cm" },
    forbiddenClaims: ["治疗失眠"],
    referenceAssets: [],
    citations: [],
    missingFacts: [],
    warnings: [],
  },
  slotVersions: {},
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};

describe("session effective product context", () => {
  it("uses platform-session analysis for compliance and assistant context without mutating shared facts", () => {
    const effective = resolveSessionEffectiveProject(project, taobaoSession);

    expect(effective.facts).toMatchObject({
      productName: "旅行颈枕 Pro",
      sellingPoints: ["可折叠收纳"],
      specifications: { 尺寸: "28 x 25 x 12 cm" },
      forbiddenClaims: ["治疗失眠"],
    });
    expect(project.facts.forbiddenClaims).toEqual([]);
  });

  it("keeps Amazon sessions on the shared product facts", () => {
    const session = { ...taobaoSession, platformId: "amazon", workflowId: "amazon-listing" as const };
    expect(resolveSessionEffectiveProject(project, session).facts).toEqual(project.facts);
  });
});
