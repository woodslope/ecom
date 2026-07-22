import { normalizePlatformPlan } from "../domain/planning/normalizer";
import { resolvePlanningRulePack } from "../domain/planning/resolve-planning-pack";
import type {
  AmazonPlanningRequestOptions,
  PlannerEngine,
  PlanningProjectFacts,
  PlanningReferenceImage,
  PlatformPlan,
  PlatformPlanCandidate,
} from "../domain/planning/types";
import type { PlatformRulePack, PlatformSlotRule } from "../domain/platforms/types";
import type { PlanningInputAssessment } from "../domain/planning/input-assessment";
import { getAmazonMarketplaceByLocale } from "../domain/platforms/amazon-marketplaces";
import { isAPlusExternalTextSlotRule } from "../domain/platforms/amazon-catalog";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

interface SpecificationFact {
  label: string;
  evidence: string;
}

function specificationFacts(specifications: unknown): SpecificationFact[] {
  if (
    typeof specifications !== "object" ||
    specifications === null ||
    Array.isArray(specifications)
  ) {
    return [];
  }

  return Object.entries(specifications).flatMap(([label, value]) => {
    const normalizedLabel = text(label);
    const normalizedValue = text(value);
    return normalizedLabel && normalizedValue
      ? [{ label: normalizedLabel, evidence: `${normalizedLabel}：${normalizedValue}` }]
      : [];
  });
}

function fact(label: string, value: unknown): string | undefined {
  const normalizedValue = text(value);
  return normalizedValue ? `${label}：${normalizedValue}` : undefined;
}

function sellingPointEvidence(project: PlanningProjectFacts): string[] {
  return (project.sellingPoints ?? [])
    .map((item) => fact("卖点", item))
    .filter((item): item is string => Boolean(item));
}

function identityEvidence(project: PlanningProjectFacts): string[] {
  return [
    fact("商品", project.productName),
    fact("品牌", project.brand),
    fact("类目", project.category),
    fact("型号", project.model),
    fact("SKU", project.sku),
  ].filter((item): item is string => Boolean(item));
}

function sceneEvidence(project: PlanningProjectFacts): string[] {
  return [fact("目标人群", project.targetAudience)].filter(
    (item): item is string => Boolean(item),
  );
}

function withFallback(project: PlanningProjectFacts, evidence: readonly string[]): string[] {
  return evidence.length > 0
    ? [...evidence]
    : [fact("商品", project.productName) ?? "待补资料：商品名称"];
}

function withPending(evidence: readonly string[], missingLabel: string): string[] {
  return evidence.length > 0 ? [...evidence] : [`待补资料：${missingLabel}`];
}

function matchingSpecifications(
  specifications: readonly SpecificationFact[],
  pattern: RegExp,
): string[] {
  return specifications
    .filter((item) => pattern.test(item.label))
    .map((item) => item.evidence);
}

interface ProjectEvidenceGroups {
  identity: string[];
  sellingPoints: string[];
  scene: string[];
  painPoints: string[];
  sizeAndFit: string[];
  materialAndCraft: string[];
  packaging: string[];
  trust: string[];
  service: string[];
  features: string[];
}

function classifyProjectEvidence(project: PlanningProjectFacts): ProjectEvidenceGroups {
  const specifications = specificationFacts(project.specifications);
  const sellingPoints = sellingPointEvidence(project);
  const description = text(project.description);
  const painFromDescription = description &&
    /痛点|困扰|问题|不便|担心|需求|需要|pain|problem|need|challenge/i.test(description)
    ? [`用户痛点或需求：${description}`]
    : [];
  const matching = (pattern: RegExp) => matchingSpecifications(specifications, pattern);

  return {
    identity: identityEvidence(project),
    sellingPoints,
    scene: [
      ...sceneEvidence(project),
      ...matching(/场景|用途|适用场合|使用环境|scenario|use case|occasion|environment/i),
    ],
    painPoints: [
      ...painFromDescription,
      ...matching(/痛点|问题|需求|困扰|难题|pain|problem|need|challenge/i),
    ],
    sizeAndFit: matching(
      /尺寸|规格|尺码|长度|宽度|高度|厚度|直径|容量|重量|数量|适配|兼容|size|dimension|length|width|height|thickness|diameter|capacity|weight|quantity|fit|compat/i,
    ),
    materialAndCraft: matching(
      /材质|材料|面料|成分|工艺|结构|纹理|表面处理|material|fabric|composition|craft|construction|texture|finish/i,
    ),
    packaging: matching(
      /包装|清单|内含|配件|装箱|套装|package|included|contents?|accessor/i,
    ),
    trust: matching(
      /认证|证书|质保|保修|专利|奖项|测试报告|资质|certif|warranty|patent|award|test report/i,
    ),
    service: matching(
      /售后|退换|配送|物流|服务|质保|保修|return|shipping|service|support|warranty/i,
    ),
    features: [
      ...sellingPoints,
      ...matching(/功能|性能|特点|特色|feature|function|performance/i),
    ],
  };
}

function evidenceForRule(
  project: PlanningProjectFacts,
  rule: PlatformSlotRule,
  evidence: ProjectEvidenceGroups,
): string[] {
  switch (rule.key) {
    case "MAIN":
    case "TB-HERO-01":
    case "A+S01":
      return withFallback(project, evidence.identity);
    case "TB-HERO-02":
    case "PT01":
      return withPending(evidence.sellingPoints, "可验证核心卖点");
    case "TB-HERO-03":
    case "TB-DETAIL-04":
    case "PT03":
    case "A+S04":
      return withPending(evidence.scene, "目标人群与使用场景");
    case "TB-HERO-04":
    case "TB-DETAIL-05":
    case "PT05":
      return withPending(evidence.materialAndCraft, "材质、结构或工艺信息");
    case "TB-HERO-05":
    case "PT06":
      return [
        ...withPending(evidence.packaging, "包装清单与实际包含内容"),
        ...withPending(evidence.trust, "可验证的品牌信任信息"),
      ];
    case "TB-DETAIL-06":
      return [
        ...withPending(evidence.sizeAndFit, "尺寸、规格与适配参数"),
        ...withPending(evidence.packaging, "包装清单与实际包含内容"),
      ];
    case "PT04":
      return withPending(evidence.sizeAndFit, "尺寸、容量、适配或规格参数");
    case "TB-DETAIL-07":
      return [
        ...withPending(evidence.service, "售后、质保或物流服务政策"),
        ...withPending(evidence.trust, "可验证的信任信息"),
      ];
    case "TB-DETAIL-01":
      return [
        ...withFallback(project, evidence.identity),
        ...withPending(evidence.sellingPoints.slice(0, 1), "首屏核心价值或卖点"),
      ];
    case "TB-DETAIL-02":
    case "A+S02":
      return [
        ...withPending(evidence.painPoints, "用户痛点或明确需求"),
        ...withPending(evidence.sellingPoints.slice(0, 1), "对应解决方案或可验证卖点"),
      ];
    case "TB-DETAIL-03":
    case "PT02":
    case "A+S03":
      return withPending(evidence.features, "功能与事实证据");
    case "A+S05":
    case "A+S06":
    case "A+S07":
    case "A+S08": {
      const benefitIndex = Number(rule.key.slice(-1)) - 5;
      return withPending(
        evidence.sellingPoints.slice(benefitIndex, benefitIndex + 1),
        `第 ${benefitIndex + 1} 项可验证卖点`,
      );
    }
    default:
      return withFallback(project, evidence.identity);
  }
}

function visibleCopyFor(
  project: PlanningProjectFacts,
  rulePack: PlatformRulePack,
  rule: PlatformSlotRule,
  evidence: string,
): string {
  if (rule.key === "MAIN") {
    return "";
  }
  if (rulePack.platformId === "amazon") {
    if (isAPlusExternalTextSlotRule(rule)) return "";
    const demoCopy = getAmazonMarketplaceByLocale(rulePack.locale).demoCopy;
    const samples = rule.group === "a-plus" ? demoCopy.aPlus : demoCopy.listing;
    const sampleIndex = rule.group === "a-plus" ? rule.order - 1 : rule.order - 2;
    return samples[Math.max(0, sampleIndex) % samples.length] ?? rule.label;
  }
  if (rule.order === 1 || rule.key === "A+S01") {
    return project.productName.trim() || "待确认商品";
  }
  return evidence;
}

const amazonTaskDescriptions: Readonly<Record<string, string>> = Object.freeze({
  MAIN: "accurately show one complete, recognizable sold product",
  PT01: "explain the single most important verified product benefit",
  PT02: "show key structure, feature, or material evidence and connect it to a buyer benefit",
  PT03: "show the target customer using the product in a realistic setting",
  PT04: "make dimensions, capacity, fit, compatibility, and use boundaries easy to understand",
  PT05: "show close-up detail, material, or craftsmanship evidence that reduces purchase doubt",
  PT06: "show the actual package contents and supported brand-trust information",
  "A+S01": "open the brand and product story with a clear wide banner composition",
  "A+S02": "explain the customer problem, product solution, and supporting value evidence",
  "A+S03": "explain several key features with consistent product evidence",
  "A+S04": "show how the product fits into a realistic use scenario or sequence",
  "A+S05": "reinforce one verified purchase reason in a compact benefit tile",
  "A+S06": "reinforce one additional verified purchase reason in a compact benefit tile",
  "A+S07": "reinforce a distinct verified purchase reason in a compact benefit tile",
  "A+S08": "complete the A+ benefit sequence with one credible supporting reason",
});

const chineseStrategyLabels: Readonly<Record<string, string>> = Object.freeze({
  MAIN: "主图",
  PT01: "核心卖点",
  PT02: "功能证据",
  PT03: "使用场景",
  PT04: "尺寸与适配",
  PT05: "细节与材质",
  PT06: "包装与信任",
  "A+S01": "品牌开场",
  "A+S02": "价值故事",
  "A+S03": "功能系统",
  "A+S04": "使用故事",
  "A+S05": "利益点一",
  "A+S06": "利益点二",
  "A+S07": "利益点三",
  "A+S08": "利益点四",
});

const englishEvidenceLabels: Readonly<Record<string, string>> = Object.freeze({
  商品: "Product",
  品牌: "Brand",
  类目: "Category",
  型号: "Model",
  SKU: "SKU",
  卖点: "Selling point",
  目标人群: "Target audience",
  用户痛点或需求: "Customer pain point or need",
  待补资料: "Missing information",
  材质: "Material",
  材料: "Material",
  面料: "Fabric",
  成分: "Composition",
  工艺: "Craftsmanship",
  结构: "Structure",
  纹理: "Texture",
  表面处理: "Surface finish",
  尺寸: "Dimensions",
  规格: "Specifications",
  尺码: "Size",
  长度: "Length",
  宽度: "Width",
  高度: "Height",
  厚度: "Thickness",
  直径: "Diameter",
  容量: "Capacity",
  重量: "Weight",
  数量: "Quantity",
  适配: "Compatibility",
  兼容: "Compatibility",
  包装: "Package contents",
  清单: "Package contents",
  内含: "Included contents",
  配件: "Included accessories",
  装箱: "Package contents",
  套装: "Set contents",
  使用场景: "Use scenario",
  场景: "Use scenario",
  用途: "Use case",
  适用场合: "Use occasion",
  使用环境: "Use environment",
  功能: "Feature",
  性能: "Performance",
  特点: "Feature",
  特色: "Feature",
  认证: "Certification",
  证书: "Certificate",
  质保: "Warranty",
  保修: "Warranty",
  专利: "Patent",
  奖项: "Award",
  测试报告: "Test report",
  资质: "Qualification",
  售后: "After-sales service",
  退换: "Returns and exchanges",
  配送: "Shipping",
  物流: "Shipping",
  服务: "Service",
});

const englishMissingEvidence: Readonly<Record<string, string>> = Object.freeze({
  可验证核心卖点: "verified core product benefit",
  目标人群与使用场景: "target audience and use scenario",
  "材质、结构或工艺信息": "material, structure, or craftsmanship information",
  "包装清单与实际包含内容": "package contents and included items",
  "可验证的品牌信任信息": "verifiable brand-trust information",
  "尺寸、规格与适配参数": "dimensions, specifications, and compatibility parameters",
  "尺寸、容量、适配或规格参数": "dimensions, capacity, compatibility, or specification parameters",
  "售后、质保或物流服务政策": "after-sales, warranty, or shipping policy",
  "可验证的信任信息": "verifiable trust information",
  "首屏核心价值或卖点": "primary value or selling point",
  "用户痛点或明确需求": "customer pain point or stated need",
  "对应解决方案或可验证卖点": "corresponding solution or verifiable selling point",
  "功能与事实证据": "feature and factual evidence",
});

function englishEvidenceLabel(sourceLabel: string): string {
  const normalizedLabel = sourceLabel.trim();
  const bilingualLabel = normalizedLabel
    .split(/\s*\/\s*/)
    .find((part) => /^[\x20-\x7e]+$/.test(part) && /[A-Za-z]/.test(part));
  if (bilingualLabel) return bilingualLabel;
  if (englishEvidenceLabels[normalizedLabel]) return englishEvidenceLabels[normalizedLabel];

  const sellingPointMatch = /^第\s*(\d+)\s*项可验证卖点$/.exec(normalizedLabel);
  if (sellingPointMatch) return `Verified selling point ${sellingPointMatch[1]}`;

  return /^[\x20-\x7e]+$/.test(normalizedLabel) ? normalizedLabel : "Product fact";
}

function englishEvidenceItem(item: string): string {
  const separatorIndex = item.indexOf("：");
  if (separatorIndex < 0) return item;

  const sourceLabel = item.slice(0, separatorIndex);
  const sourceValue = item.slice(separatorIndex + 1).trim();
  const value = sourceLabel.trim() === "待补资料"
    ? englishMissingEvidence[sourceValue] ?? sourceValue
    : sourceValue;
  return `${englishEvidenceLabel(sourceLabel)}: ${value}`;
}

function strategyFor(
  rulePack: PlatformRulePack,
  rule: PlatformSlotRule,
): string {
  const label = rulePack.promptLanguage === "en"
    ? chineseStrategyLabels[rule.key] ?? rule.label
    : rule.label;
  return `${label}：${rule.purpose}`;
}

function amazonTaskDescription(rule: PlatformSlotRule): string {
  return (
    amazonTaskDescriptions[rule.key] ??
    (rule.group === "a-plus"
      ? "present one clear, evidence-based A+ message"
      : "present one clear, evidence-based product message")
  );
}

function amazonCompositionGuidance(rule: PlatformSlotRule): string {
  if (rule.key === "MAIN") {
    return "Use a pure white background, one sold product, full product visibility, and one clear product angle";
  }
  if (rule.group === "a-plus" && rule.key === "A+S01") {
    return "Use a wide composition, keep the brand-product relationship clear, and keep copy short and away from crop zones";
  }
  if (rule.group === "a-plus" && rule.dimensions.width === 220) {
    return "Use one compact benefit, keep text short, and preserve legibility at small size";
  }
  if (rule.group === "a-plus") {
    return "Use a coherent wide composition, connect visual evidence with one clear message, and keep headings consistent";
  }
  return "Keep the product as the primary visual subject, use clear information hierarchy, and show only verified facts";
}

function englishPromptFor(
  project: PlanningProjectFacts,
  rulePack: PlatformRulePack,
  rule: PlatformSlotRule,
  visibleCopy: string,
  evidence: readonly string[],
): string {
  const missingEvidence = evidence.filter((item) => item.startsWith("待补资料"));
  const missingInstruction = missingEvidence.length > 0
    ? `Missing product information: ${missingEvidence.map(englishEvidenceItem).join("; ")}. Do not invent missing product facts; keep the affected area neutral until the user confirms it.`
    : "";
  const copyInstruction = visibleCopy
    ? `Use concise customer-facing copy for ${rulePack.locale}: "${visibleCopy}". Keep the text short and readable.`
    : "Do not add visible copy, badges, or decorative marks.";

  return [
    `Create an Amazon ${rule.label.toLowerCase()} image (${rule.key}).`,
    `Canvas: ${rule.dimensions.width}x${rule.dimensions.height}px.`,
    `Target marketplace locale: ${rulePack.locale}.`,
    `Product name (preserve exactly): "${project.productName}".`,
    text(project.category) ? `Category: "${text(project.category)}".` : "",
    `Slot objective: ${amazonTaskDescription(rule)}.`,
    `Composition guidance: ${amazonCompositionGuidance(rule)}.`,
    `Verified product evidence (preserve supplied values): ${evidence.map(englishEvidenceItem).join("; ")}.`,
    missingInstruction,
    copyInstruction,
    "Write model instructions in natural English and show only product appearance, material, structure, accessories, and usage supported by the provided facts.",
  ]
    .filter(Boolean)
    .join(" ");
}

function promptFor(
  project: PlanningProjectFacts,
  rulePack: PlatformRulePack,
  rule: PlatformSlotRule,
  visibleCopy: string,
  evidence: readonly string[],
): string {
  if (rulePack.promptLanguage === "en") {
    return englishPromptFor(project, rulePack, rule, visibleCopy, evidence);
  }

  const copyInstruction = visibleCopy
    ? `可见文案：\"${visibleCopy}\"，文字简洁清楚。`
    : "画面中不叠加任何文字、徽章或装饰标记。";
  const missingEvidence = evidence.filter((item) => item.startsWith("待补资料"));
  const missingInstruction = missingEvidence.length > 0
    ? `资料缺口：${missingEvidence.join("；")}。禁止臆造缺失的商品事实，只保留待补信息位置。`
    : "";

  return [
    `为 ${rulePack.label} 制作 ${rule.label}（${rule.key}）。`,
    `画布 ${rule.dimensions.width}x${rule.dimensions.height}px。`,
    `输出语言与站点语境：${rulePack.locale}。`,
    `商品：${project.productName}。`,
    text(project.category) ? `类目：${text(project.category)}。` : "",
    `槽位任务：${rule.purpose}`,
    `画面要求：${rule.planningHints.join("；")}。`,
    `事实依据：${evidence.join("；")}。`,
    missingInstruction,
    copyInstruction,
    "只根据已提供的商品事实表现外观、材质、结构、配件和使用结果。",
  ]
    .filter(Boolean)
    .join(" ");
}

function negativePromptFor(
  project: PlanningProjectFacts,
  rulePack: PlatformRulePack,
  rule: PlatformSlotRule,
): string {
  if (rulePack.promptLanguage === "en") {
    const forbiddenClaims = (project.forbiddenClaims ?? []).map(
      (claim) => `Forbidden claim: ${claim}`,
    );
    const slotGuardrails = rule.key === "MAIN"
      ? [
          "Do not add visible copy, price, promotions, ratings, watermarks, borders, Amazon-like marks, or props not included with the product",
        ]
      : rule.group === "a-plus"
        ? [
            "Do not add price, promotions, reviews, contact details, competitor claims, unsupported guarantees, or aggressive calls to action",
          ]
        : [
            "Do not add price, promotions, reviews, competitor claims, contact details, unsupported guarantees, or unverified specifications",
          ];
    return [
      "Do not invent product facts, unsupported parameters, accessories, certifications, or usage results",
      ...slotGuardrails,
      ...forbiddenClaims,
    ].join("; ");
  }

  const forbiddenClaims = (project.forbiddenClaims ?? []).map((claim) => `禁用声明：${claim}`);
  return [...rulePack.promptGuardrails, ...rule.complianceReminders, ...forbiddenClaims].join("；");
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw new DOMException("策划已取消", "AbortError");
}

async function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class DemoPlanner implements PlannerEngine {
  constructor(private readonly delayMs = 0) {}

  async plan(
    project: PlanningProjectFacts,
    rulePack: PlatformRulePack,
    signal: AbortSignal,
    _referenceImages?: readonly PlanningReferenceImage[],
    amazonOptions?: AmazonPlanningRequestOptions,
    _inputAssessment?: PlanningInputAssessment,
  ): Promise<PlatformPlan> {
    throwIfAborted(signal);
    await waitForDelay(this.delayMs, signal);

    // Without amazonOptions, honor the caller rulePack (legacy combined baseline).
    // With options, rebuild slots from AIS session catalogs.
    let effectivePack = rulePack;
    let amazonSession = undefined as PlatformPlanCandidate["amazonSession"];
    if (rulePack.platformId === "amazon" && amazonOptions) {
      const resolved = resolvePlanningRulePack("amazon", amazonOptions);
      effectivePack = resolved.rulePack;
      amazonSession = resolved.amazonSession;
    } else if (rulePack.platformId === "amazon") {
      const legacy = resolvePlanningRulePack("amazon", { plannerMode: "legacy-combined" });
      amazonSession = legacy.amazonSession;
    }

    const evidenceGroups = classifyProjectEvidence(project);
    const candidate: PlatformPlanCandidate = {
      platformId: effectivePack.platformId,
      source: "demo",
      slots: effectivePack.slots.map((rule) => {
        const slotEvidence = evidenceForRule(project, rule, evidenceGroups);
        const visibleCopy = visibleCopyFor(project, effectivePack, rule, slotEvidence[0]);
        const externalText = effectivePack.platformId === "amazon" && isAPlusExternalTextSlotRule(rule)
          ? (() => {
              const copy = getAmazonMarketplaceByLocale(effectivePack.locale).demoCopy;
              const tileIndex = Math.max(1, rule.order - 4);
              return {
                title: `${copy.aPlus[4] ?? "Verified benefit"} ${tileIndex}`,
                body: copy.aPlusBody,
              };
            })()
          : undefined;
        return {
          slotKey: rule.key,
          visibleCopy,
          ...(externalText ? { externalText } : {}),
          strategy: strategyFor(effectivePack, rule),
          evidence: slotEvidence,
          prompt: promptFor(project, effectivePack, rule, visibleCopy, slotEvidence),
          negativePrompt: negativePromptFor(project, effectivePack, rule),
        };
      }),
      ...(amazonSession ? { amazonSession } : {}),
    };

    throwIfAborted(signal);
    return normalizePlatformPlan(candidate, effectivePack);
  }
}

export const demoPlanner = new DemoPlanner();
export const slowInteractiveDemoPlanner = new DemoPlanner(3_000);
