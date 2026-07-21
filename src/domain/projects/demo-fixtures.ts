import type { ProductFacts } from "./types";

export interface DemoProductFixture {
  id: string;
  label: string;
  projectName: string;
  facts: ProductFacts;
}

const fixtureDefinitions: readonly DemoProductFixture[] = [
  {
    id: "amazon-complete",
    label: "完整英文资料 · CloudRest Travel Pillow",
    projectName: "Amazon US · CloudRest Travel Pillow",
    facts: {
      productName: "CloudRest Memory Foam Travel Pillow",
      category: "Travel Accessories",
      brand: "Northwind",
      model: "NW-P01",
      sku: "P01-GRAY",
      targetAudience: "Long-haul travelers and commuters",
      description:
        "A foldable memory foam travel pillow with a removable, machine-washable polyester cover. Designed for seated travel when users need compact neck support.",
      sellingPoints: [
        "Slow-rebound memory foam supports the neck",
        "Folds into a compact travel shape",
        "Removable polyester cover is machine washable",
      ],
      forbiddenClaims: [
        "Treats or prevents neck pain",
        "Guaranteed medical benefit",
        "Best seller or number-one claim",
      ],
      specifications: {
        Material: "Memory foam core; polyester cover",
        Dimensions: "28 x 25 x 12 cm",
        "Use scenario": "Airplane, high-speed train, and coach travel",
        "Package contents": "Travel pillow, removable cover, storage pouch",
        Warranty: "12-month limited warranty",
        "Customer support": "Seller support channel for product questions",
        Feature: "Foldable design with snap closure",
      },
    },
  },
  {
    id: "amazon-bilingual",
    label: "中英混合资料 · 云感旅行颈枕",
    projectName: "Amazon US · 云感旅行颈枕",
    facts: {
      productName: "云感旅行颈枕 / CloudRest Travel Pillow",
      category: "旅行用品 / Travel Accessories",
      brand: "Northwind",
      model: "NW-P01",
      sku: "P01-GRAY",
      targetAudience: "长途出行人群 / Long-haul travelers",
      description:
        "可折叠记忆棉旅行颈枕，配可拆洗涤纶外套。 Foldable memory foam travel pillow with a removable polyester cover.",
      sellingPoints: [
        "慢回弹颈部支撑 / Slow-rebound neck support",
        "可折叠收纳 / Compact foldable form",
        "外套可拆洗 / Removable washable cover",
      ],
      forbiddenClaims: ["治疗颈椎病 / Treats neck pain"],
      specifications: {
        "材质 / Material": "记忆棉和涤纶 / Memory foam and polyester",
        "尺寸 / Dimensions": "28 x 25 x 12 cm",
        "使用场景 / Use scenario": "飞机、高铁和长途客车 / Seated travel",
        "包装清单 / Package contents": "颈枕、外套、收纳袋 / Pillow, cover, pouch",
        "保修 / Warranty": "12个月有限保修 / 12-month limited warranty",
        "客服 / Customer support": "Seller support channel",
        "功能 / Feature": "按扣折叠结构 / Snap-closure foldable design",
      },
    },
  },
  {
    id: "amazon-missing-facts",
    label: "缺资料测试 · CloudRest 未完成档案",
    projectName: "Amazon US · 待补资料测试",
    facts: {
      productName: "CloudRest Travel Pillow",
      category: "Travel Accessories",
      brand: "Northwind",
      model: "NW-P01",
      sku: "P01-GRAY",
      targetAudience: "Travelers",
      description: "A compact travel pillow draft with incomplete product documentation.",
      sellingPoints: ["Compact foldable form"],
      forbiddenClaims: [],
      specifications: {},
    },
  },
];

export const demoProductFixtures: readonly DemoProductFixture[] = Object.freeze(
  fixtureDefinitions,
);

function cloneFacts(facts: ProductFacts): ProductFacts {
  return {
    ...facts,
    sellingPoints: [...facts.sellingPoints],
    forbiddenClaims: [...facts.forbiddenClaims],
    specifications: { ...facts.specifications },
  };
}

export function cloneDemoProductFixture(id: string): DemoProductFixture {
  const fixture = fixtureDefinitions.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`未知示例商品资料：${id}`);
  }

  return {
    ...fixture,
    facts: cloneFacts(fixture.facts),
  };
}
