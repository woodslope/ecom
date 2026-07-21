import type { PlannedSlot } from "../planning/types";
import type { PlatformRulePack } from "../platforms/types";
import type { ProductProject } from "../projects/types";
import { getAmazonMarketplaceByLocale } from "../platforms/amazon-marketplaces";
import type { ComplianceFinding, ComplianceResult, ComplianceSeverity } from "./types";

const manualReview = {
  required: true,
  reason:
    "自动检查仅分析项目事实、可见文案和图片提示词，不检查生成图片，也不代表平台最终批准。",
  userAction: "发布前按商品类目、目标站点和平台后台的当前规则人工复核。",
} as const;

interface TextCheck {
  code: string;
  pattern: RegExp;
  message: string;
  userAction: string;
}

const amazonMainForbiddenChecks: readonly TextCheck[] = [
  {
    code: "amazon-main-promotion",
    pattern:
      /\b(?:sale|discount|coupon|deal|promotion|promo|limited[- ]time offer|free gift)\b|促销|优惠|折扣|满减|优惠券|领券|限时|赠品|立减/giu,
    message: "Amazon MAIN 的文字指令包含促销内容。",
    userAction: "删除促销、折扣、优惠券、赠品或限时活动相关内容。",
  },
  {
    code: "amazon-main-price",
    pattern:
      /(?:[$£€¥￥]\s*\d+(?:[.,]\d+)?)|(?:\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|cny|rmb)\b)|\b(?:price|pricing)\b|价格|售价/giu,
    message: "Amazon MAIN 的文字指令包含价格信息。",
    userAction: "删除价格、货币符号和售价说明。",
  },
  {
    code: "amazon-main-rating",
    pattern: /\b(?:rating|rated|review|testimonial|five[- ]star|\d(?:\.\d)?[- ]star)\b|评分|星级|五星|评论|好评/giu,
    message: "Amazon MAIN 的文字指令包含评分或评论信息。",
    userAction: "删除评分、星级、评论和用户背书。",
  },
  {
    code: "amazon-main-watermark",
    pattern: /\bwatermark\b|水印/giu,
    message: "Amazon MAIN 的文字指令包含水印。",
    userAction: "删除水印要求。",
  },
  {
    code: "amazon-main-badge",
    pattern: /\bbadge\b|徽章|角标/giu,
    message: "Amazon MAIN 的文字指令包含徽章或角标。",
    userAction: "删除徽章、角标和其他叠加装饰。",
  },
  {
    code: "amazon-main-border",
    pattern: /\b(?:border|frame)\b|边框/giu,
    message: "Amazon MAIN 的文字指令包含边框。",
    userAction: "删除边框或装饰画框要求。",
  },
  {
    code: "amazon-main-amazon-mark",
    pattern:
      /\bamazon[- ]?(?:logo|mark|badge|icon|wordmark|smile)\b|亚马逊(?:标记|徽标|标识|Logo|笑脸箭头)/giu,
    message: "Amazon MAIN 的文字指令包含 Amazon 标记。",
    userAction: "删除 Amazon 名称、Logo 或仿平台标记。",
  },
];

const amazonNonMainForbiddenChecks: readonly TextCheck[] = [
  {
    code: "amazon-promotion",
    pattern:
      /\b(?:sale|discount|coupon|deal|promotion|promo|limited[- ]time offer|free gift|save\s+\d+%)\b|促销|优惠|折扣|满减|优惠券|领券|限时|赠品|立减/giu,
    message: "Amazon 内容包含促销信息。",
    userAction: "删除促销、折扣、优惠券、赠品或限时活动相关内容。",
  },
  {
    code: "amazon-price",
    pattern:
      /(?:[$£€¥￥]\s*\d+(?:[.,]\d+)?)|(?:\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|cny|rmb)\b)|\b(?:price|pricing)\b|价格|售价/giu,
    message: "Amazon 内容包含价格信息。",
    userAction: "删除价格、货币符号和售价说明。",
  },
  {
    code: "amazon-review",
    pattern:
      /\b(?:rating|rated|review|testimonial|customer says|users? love|five[- ]star(?:s)?|\d(?:\.\d)?[- ]star(?:s)?)\b|评分|星级|五星|评论|评价|好评|用户背书/giu,
    message: "Amazon 内容包含评论、评分或用户背书。",
    userAction: "删除评论摘录、评分、星级和用户背书。",
  },
  {
    code: "amazon-competitor-claim",
    pattern:
      /\b(?:better than|worse than|superior to|compared (?:with|to)|versus|vs\.?|competitor|rival|outperform(?:s|ed)?)\b|优于|胜过|领先于|竞品|竞争对手|对比(?:其他|同类|品牌)/giu,
    message: "Amazon 内容包含竞品比较或贬损声明。",
    userAction: "删除竞品名称、直接比较、市场领先或贬损性表述。",
  },
  {
    code: "amazon-contact-details",
    pattern:
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+|\bwww\.[^\s]+|\b(?:contact|call|email|whatsapp|wechat)\b|(?:\+?\d[\d ()-]{7,}\d)|联系方式|联系电话|联系微信|微信公众号|客服QQ|邮箱|外部链接/giu,
    message: "Amazon 内容包含联系方式或外部链接。",
    userAction: "删除邮箱、电话、社交账号、网址和站外联系指引。",
  },
];

const guaranteePattern =
  /\b(?:(?:lifetime|money[- ]back|satisfaction|performance|result)\s+guarantee|guaranteed|risk[- ]free)\b|终身(?:质保|保修|保证)|永久(?:质保|保修|保证)|无条件退款|百分百(?:满意|保证)|保证(?:有效|满意|成功|见效)|零风险/giu;

const aggressiveCallToActionPattern =
  /\b(?:buy now|shop now|order now|add to cart|click here)\b|立即购买|马上下单|立即下单|点击购买|加入购物车/giu;

const taobaoAbsoluteClaimPattern =
  /全网最(?:好|佳|优|强|高|低|大|小|快|省|划算|先进|耐用|安全|舒适)|全球最(?:好|佳|优|强|高|低|大|小|快|先进)|行业最(?:好|佳|优|强|高|低|大|小|快|先进)|(?:最好|最佳|最优|最强|顶级|极品|绝对(?:安全|有效|可靠|无害)?|百分百(?:有效|安全|成功|保证)|100\s*%\s*(?:有效|安全|成功|保证)|销量第一|第一品牌|国家级|世界级|永久有效|零风险)|\b(?:best|number one|no\.?\s*1|#\s*1|ultimate|perfect|100\s*%\s*guaranteed)\b/giu;

const measurableClaimPattern =
  /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|km|mg|kg|ml|oz|lbs?|inches|inch|in|mah|kwh|wh|kw|°c|db|m|g|l|w|v)\b|\d+(?:[.,]\d+)?\s*(?:毫米|厘米|千米|毫克|千克|公斤|毫升|英寸|小时|分钟|秒|米|克|升|瓦|伏|件|个|片|只|套)/giu;

const proofClaimPattern =
  /\b(?:CE|FDA|FCC|ROHS|UL|CCC|ISO(?:\s*\d+)?)\b\s*(?:认证|[- ]?(?:certified|certification))?|(?:国家|国际|权威|专业|机构)?(?:认证|证书)|(?:国家|发明|实用新型|外观)?专利|检测报告|质检报告|测试报告|实验证明|临床证明|\b(?:certified|certification|patented|lab[- ]tested|clinically proven)\b/giu;

const pureWhiteBackgroundPattern = /\bpure white background\b|\bwhite background\b|纯白(?:色)?背景|纯白底|白底/iu;
const singleProductPattern =
  /\b(?:single|one)\s+(?:sold\s+)?(?:product|item|unit|piece|[a-z][a-z -]{1,30})\b|单个(?:商品|产品|主体)|单一(?:商品|产品|主体|视图)|仅(?:展示)?一个|唯一一个/iu;

function stripNegatedInstructions(text: string): string {
  return text.replace(
    /(?:\b(?:no|not|without|avoid|exclude|omit|do not|don't|must not)\b|不得|不要|禁止|避免|不含|去除|不(?:叠加|添加|展示|出现|使用|放置|包含|生成))[^.!?。！？\n]*/giu,
    " ",
  );
}

function customerVisibleText(slot: PlannedSlot): string {
  return [slot.visibleCopy, slot.externalText?.title, slot.externalText?.body]
    .filter(Boolean)
    .join("\n");
}

function checkableSlotText(slot: PlannedSlot): string {
  return [customerVisibleText(slot), stripNegatedInstructions(slot.prompt)].filter(Boolean).join("\n");
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean).filter(
    (match, index, matches) =>
      matches.findIndex((candidate) => candidate.toLocaleLowerCase() === match.toLocaleLowerCase()) ===
      index,
  );
}

function resolveSeverity(findings: readonly ComplianceFinding[]): ComplianceSeverity {
  if (findings.some((finding) => finding.severity === "error")) return "error";
  if (findings.some((finding) => finding.severity === "warning")) return "warning";
  return "info";
}

function projectFactCorpus(project: ProductProject): string {
  const facts = project.facts;
  return [
    facts.productName,
    facts.category,
    facts.brand,
    facts.model,
    facts.sku,
    facts.targetAudience,
    facts.description,
    ...facts.sellingPoints,
    ...Object.entries(facts.specifications).flatMap(([key, value]) => [key, value]),
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeForEvidence(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function unsupportedMatches(matches: readonly string[], factCorpus: string): string[] {
  const normalizedFacts = normalizeForEvidence(factCorpus);
  return matches.filter((match) => {
    const normalizedMatch = normalizeForEvidence(match);
    const supported = /^\d/u.test(normalizedMatch)
      ? ` ${normalizedFacts} `.includes(` ${normalizedMatch} `)
      : normalizedFacts.includes(normalizedMatch);
    return !supported;
  });
}

export function runCompliance(
  project: ProductProject,
  rulePack: PlatformRulePack,
  slot: PlannedSlot,
): ComplianceResult {
  const findings: ComplianceFinding[] = [];
  const checkableText = checkableSlotText(slot);
  const visibleText = customerVisibleText(slot);
  const normalizedSlotText = normalizeForEvidence(checkableText);
  const matchedForbiddenClaims = project.facts.forbiddenClaims
    .map((claim) => claim.trim())
    .filter(Boolean)
    .filter((claim) => normalizedSlotText.includes(normalizeForEvidence(claim)));
  const marketplace = rulePack.platformId === "amazon"
    ? getAmazonMarketplaceByLocale(rulePack.locale)
    : null;
  const marketplaceForbiddenTerms = marketplace?.forbiddenVisibleCopyTerms.filter((term) =>
    normalizedSlotText.includes(normalizeForEvidence(term)),
  ) ?? [];

  if (matchedForbiddenClaims.length) {
    findings.push({
      code: "project-forbidden-claim",
      severity: "error",
      checkType: "automatic",
      message: "槽位内容使用了项目明确禁止的宣称。",
      evidence: matchedForbiddenClaims,
      userAction: "删除这些宣称，或先更新项目资料中的禁用声明边界并重新检查。",
    });
  }

  if (marketplaceForbiddenTerms.length) {
    findings.push({
      code: "amazon-marketplace-forbidden-copy",
      severity: "error",
      checkType: "automatic",
      message: `${marketplace?.label ?? "当前 Amazon 站点"}内容包含高频禁用的促销文案。`,
      evidence: marketplaceForbiddenTerms,
      userAction: "删除促销、折扣、优惠券、赠品或限时活动相关内容。",
    });
  }


  if (rulePack.platformId === "amazon" && slot.slotKey !== "MAIN") {
    const allowsCjk =
      rulePack.locale === "ja-JP" ||
      rulePack.locale.startsWith("zh") ||
      rulePack.locale === "ko-KR";
    if (!allowsCjk && /[\u3400-\u9fff\uf900-\ufaff]/.test(visibleText)) {
      findings.push({
        code: "amazon-marketplace-cjk-visible-copy",
        severity: "warning",
        checkType: "automatic",
        message: `当前站点语境（${rulePack.locale}）下，可见文案含 CJK 字符，可能不符合该站展示习惯。`,
        evidence: [visibleText.trim()],
        userAction: "按目标站点语言改写可见文案，或切换到允许该文字的站点后重新策划。",
      });
    }
  }

  if (rulePack.platformId === "amazon" && slot.slotKey === "MAIN") {
    if (slot.visibleCopy.trim()) {
      findings.push({
        code: "amazon-main-visible-copy",
        severity: "error",
        checkType: "automatic",
        message: "Amazon MAIN 不允许叠加可见文案。",
        evidence: [slot.visibleCopy.trim()],
        userAction: "删除 MAIN 的全部可见文案，仅保留商品主体。",
      });
    }

    for (const check of amazonMainForbiddenChecks) {
      const evidence = uniqueMatches(checkableText, check.pattern);
      if (!evidence.length) continue;

      findings.push({
        code: check.code,
        severity: "error",
        checkType: "automatic",
        message: check.message,
        evidence,
        userAction: check.userAction,
      });
    }

    const affirmedPrompt = stripNegatedInstructions(slot.prompt);
    if (!pureWhiteBackgroundPattern.test(affirmedPrompt)) {
      findings.push({
        code: "amazon-main-white-background",
        severity: "warning",
        checkType: "automatic",
        message: "MAIN Prompt 未明确要求纯白背景。",
        evidence: [slot.prompt.trim() || "Prompt 为空"],
        userAction: "在 Prompt 中明确要求纯白背景，并在生成后人工检查背景像素。",
      });
    }

    if (!singleProductPattern.test(affirmedPrompt)) {
      findings.push({
        code: "amazon-main-single-product",
        severity: "warning",
        checkType: "automatic",
        message: "MAIN Prompt 未明确要求单个在售商品。",
        evidence: [slot.prompt.trim() || "Prompt 为空"],
        userAction: "在 Prompt 中明确仅展示单个在售商品，并人工核对包装内实际包含内容。",
      });
    }
  }

  if (rulePack.platformId === "amazon" && slot.slotKey !== "MAIN") {
    for (const check of amazonNonMainForbiddenChecks) {
      if (marketplaceForbiddenTerms.length && check.code === "amazon-promotion") continue;
      const evidence = uniqueMatches(checkableText, check.pattern);
      if (!evidence.length) continue;

      findings.push({
        code: check.code,
        severity: "error",
        checkType: "automatic",
        message: check.message,
        evidence,
        userAction: check.userAction,
      });
    }

    const unsupportedGuarantees = unsupportedMatches(
      uniqueMatches(checkableText, guaranteePattern),
      projectFactCorpus(project),
    );
    if (unsupportedGuarantees.length) {
      findings.push({
        code: "amazon-unsupported-guarantee",
        severity: "warning",
        checkType: "automatic",
        message: "Amazon 内容包含未在商品事实中找到依据的保证声明。",
        evidence: unsupportedGuarantees,
        userAction: "删除该保证，或先在商品事实中补充可追溯的政策与证明再人工复核。",
      });
    }

    const slotRule = rulePack.slots.find((candidate) => candidate.key === slot.slotKey);
    const aggressiveCallsToAction =
      slotRule?.group === "a-plus"
        ? uniqueMatches(checkableText, aggressiveCallToActionPattern)
        : [];
    if (aggressiveCallsToAction.length) {
      findings.push({
        code: "amazon-a-plus-aggressive-cta",
        severity: "error",
        checkType: "automatic",
        message: "Amazon A+ 内容包含攻击性购买号召。",
        evidence: aggressiveCallsToAction,
        userAction: "删除立即购买、加入购物车或点击跳转等直接购买号召。",
      });
    }
  }

  if (rulePack.platformId === "taobao") {
    const facts = projectFactCorpus(project);

    const absoluteClaims = uniqueMatches(checkableText, taobaoAbsoluteClaimPattern);
    if (absoluteClaims.length) {
      findings.push({
        code: "taobao-absolute-claim",
        severity: "error",
        checkType: "automatic",
        message: "淘宝内容包含绝对化或最高级宣称。",
        evidence: absoluteClaims,
        userAction: "删除绝对化、最高级、第一或百分百保证等表述，改为可验证的商品事实。",
      });
    }

    const unsupportedSpecifications = unsupportedMatches(
      uniqueMatches(checkableText, measurableClaimPattern),
      facts,
    );
    const specificationEvidence = unsupportedSpecifications.length
      ? unsupportedSpecifications
      : slot.slotKey === "TB-DETAIL-06" && !Object.keys(project.facts.specifications).length
        ? ["商品事实中的 specifications 为空"]
        : [];

    if (specificationEvidence.length) {
      findings.push({
        code: "taobao-missing-specification",
        severity: "warning",
        checkType: "automatic",
        message: "淘宝内容包含未在商品事实中找到依据的规格，或规格资料尚未提供。",
        evidence: specificationEvidence,
        userAction: "在商品事实中补充当前 SKU 的准确规格和单位，并在发布前逐项人工复核。",
      });
    }

    const unsupportedProofs = unsupportedMatches(
      uniqueMatches(checkableText, proofClaimPattern),
      facts,
    );
    if (unsupportedProofs.length) {
      findings.push({
        code: "taobao-missing-proof",
        severity: "warning",
        checkType: "automatic",
        message: "淘宝内容包含未在商品事实中找到依据的认证、专利或检测声明。",
        evidence: unsupportedProofs,
        userAction: "删除该声明，或在商品事实中补充可追溯的证明材料后再人工复核。",
      });
    }
  }

  return {
    platformId: rulePack.platformId,
    slotKey: slot.slotKey,
    severity: resolveSeverity(findings),
    findings,
    manualReviewRequired: true,
    manualReview,
  };
}
