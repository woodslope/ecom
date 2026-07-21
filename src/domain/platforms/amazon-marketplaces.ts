/**
 * Amazon marketplace catalog aligned with Amazon Image Studio
 * (Ali-Aria/amazon-image-studio @ bca89d728e415c453db363dcba30ac8ea243edaf).
 *
 * Behavior mirror of AIS `src/lib/amazonMarketplaces.ts`, consumed by session controls,
 * planners, Copilot, compliance, history, and export.
 */

export type AmazonMarketplaceId = "us" | "jp" | "de" | "fr" | "it" | "es";

export interface AmazonMarketplaceConfig {
  readonly id: AmazonMarketplaceId;
  readonly label: string;
  readonly shortLabel: string;
  readonly domain: string;
  readonly locale: string;
  readonly copyLanguage: string;
  readonly onImageCopyLanguage: string;
  readonly localGuidance: readonly string[];
  readonly compliancePolicy: readonly string[];
  readonly forbiddenVisibleCopyTerms: readonly string[];
  readonly demoCopy: Readonly<{
    listing: readonly string[];
    aPlus: readonly string[];
    aPlusBody: string;
  }>;
  readonly allowsCjkVisibleCopy: boolean;
}

export const DEFAULT_AMAZON_MARKETPLACE_ID: AmazonMarketplaceId = "us";

export const AMAZON_MARKETPLACES: readonly AmazonMarketplaceConfig[] = Object.freeze([
  Object.freeze({
    id: "us",
    label: "美国站",
    shortLabel: "US",
    domain: "Amazon.com",
    locale: "en-US",
    copyLanguage: "US English",
    onImageCopyLanguage: "US-English",
    localGuidance: Object.freeze([
      "Use concise US-English customer-facing copy with natural American spelling, phrasing, and units.",
      "Avoid machine-translated phrasing, Chinese copy, and non-US marketplace wording in visible text.",
    ]),
    compliancePolicy: Object.freeze([
      "美国站可见文案应使用自然的美式英语，发布前需按 Amazon.com 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze([
      "limited-time deal",
      "discount",
      "coupon",
      "free gift",
    ]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["Core benefit", "Feature proof", "Lifestyle", "Size and fit", "Detail and material", "Package and trust"]),
      aPlus: Object.freeze(["Brand story", "Value story", "Feature system", "Usage story", "Verified benefit"]),
      aPlusBody: "A verified product benefit, presented clearly for quick comparison.",
    }),
    allowsCjkVisibleCopy: false,
  }),
  Object.freeze({
    id: "jp",
    label: "日本站",
    shortLabel: "JP",
    domain: "Amazon.co.jp",
    locale: "ja-JP",
    copyLanguage: "Japanese",
    onImageCopyLanguage: "Japanese",
    localGuidance: Object.freeze([
      "Use concise natural Japanese customer-facing copy suitable for Amazon.co.jp shoppers.",
      "Japanese visible text may use Japanese characters; avoid Simplified Chinese UI wording and awkward direct translation.",
    ]),
    compliancePolicy: Object.freeze([
      "日本站可见文案应使用自然日语，发布前需按 Amazon.co.jp 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze(["セール", "割引", "クーポン", "無料ギフト"]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["主な特長", "機能の根拠", "利用シーン", "サイズと適合", "素材とディテール", "セット内容"]),
      aPlus: Object.freeze(["ブランドストーリー", "価値の提案", "主な機能", "利用シーン", "確認済みの利点"]),
      aPlusBody: "確認済みの商品メリットを、比較しやすく分かりやすく説明します。",
    }),
    allowsCjkVisibleCopy: true,
  }),
  Object.freeze({
    id: "de",
    label: "德国站",
    shortLabel: "DE",
    domain: "Amazon.de",
    locale: "de-DE",
    copyLanguage: "German",
    onImageCopyLanguage: "German",
    localGuidance: Object.freeze([
      "Use concise natural German customer-facing copy suitable for Amazon.de shoppers.",
      "Use German spelling and units where relevant; avoid English, Chinese copy, and literal machine translation.",
    ]),
    compliancePolicy: Object.freeze([
      "德国站可见文案应使用自然德语，发布前需按 Amazon.de 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze(["rabatt", "gutschein", "gratisgeschenk", "sonderangebot"]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["Hauptvorteil", "Funktionsnachweis", "Anwendungsszene", "Größe und Passform", "Material und Details", "Lieferumfang"]),
      aPlus: Object.freeze(["Markengeschichte", "Wertversprechen", "Hauptfunktionen", "Anwendungsszene", "Bestätigter Vorteil"]),
      aPlusBody: "Ein bestätigter Produktvorteil, klar und leicht vergleichbar erklärt.",
    }),
    allowsCjkVisibleCopy: false,
  }),
  Object.freeze({
    id: "fr",
    label: "法国站",
    shortLabel: "FR",
    domain: "Amazon.fr",
    locale: "fr-FR",
    copyLanguage: "French",
    onImageCopyLanguage: "French",
    localGuidance: Object.freeze([
      "Use concise natural French customer-facing copy suitable for Amazon.fr shoppers.",
      "Use French accents, phrasing, and units where relevant; avoid English, Chinese copy, and literal machine translation.",
    ]),
    compliancePolicy: Object.freeze([
      "法国站可见文案应使用自然法语，发布前需按 Amazon.fr 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze(["réduction", "remise", "coupon", "cadeau gratuit"]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["Avantage principal", "Preuve fonctionnelle", "Mise en situation", "Taille et compatibilité", "Matière et détails", "Contenu de la boîte"]),
      aPlus: Object.freeze(["Histoire de la marque", "Proposition de valeur", "Fonctions principales", "Mise en situation", "Avantage vérifié"]),
      aPlusBody: "Un avantage produit vérifié, présenté clairement pour faciliter la comparaison.",
    }),
    allowsCjkVisibleCopy: false,
  }),
  Object.freeze({
    id: "it",
    label: "意大利站",
    shortLabel: "IT",
    domain: "Amazon.it",
    locale: "it-IT",
    copyLanguage: "Italian",
    onImageCopyLanguage: "Italian",
    localGuidance: Object.freeze([
      "Use concise natural Italian customer-facing copy suitable for Amazon.it shoppers.",
      "Use Italian phrasing and units where relevant; avoid English, Chinese copy, and literal machine translation.",
    ]),
    compliancePolicy: Object.freeze([
      "意大利站可见文案应使用自然意大利语，发布前需按 Amazon.it 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze(["sconto", "promozione", "coupon", "omaggio"]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["Vantaggio principale", "Prova funzionale", "Scenario d'uso", "Dimensioni e compatibilità", "Materiali e dettagli", "Contenuto della confezione"]),
      aPlus: Object.freeze(["Storia del marchio", "Proposta di valore", "Funzioni principali", "Scenario d'uso", "Vantaggio verificato"]),
      aPlusBody: "Un vantaggio verificato del prodotto, spiegato in modo chiaro e confrontabile.",
    }),
    allowsCjkVisibleCopy: false,
  }),
  Object.freeze({
    id: "es",
    label: "西班牙站",
    shortLabel: "ES",
    domain: "Amazon.es",
    locale: "es-ES",
    copyLanguage: "Spanish",
    onImageCopyLanguage: "Spanish",
    localGuidance: Object.freeze([
      "Use concise natural Spanish customer-facing copy suitable for Amazon.es shoppers.",
      "Use Spanish phrasing and units where relevant; avoid English, Chinese copy, and literal machine translation.",
    ]),
    compliancePolicy: Object.freeze([
      "西班牙站可见文案应使用自然西班牙语，发布前需按 Amazon.es 当前类目规则人工复核。",
    ]),
    forbiddenVisibleCopyTerms: Object.freeze(["descuento", "oferta", "cupón", "regalo gratis"]),
    demoCopy: Object.freeze({
      listing: Object.freeze(["Ventaja principal", "Prueba funcional", "Escena de uso", "Tamaño y compatibilidad", "Materiales y detalles", "Contenido de la caja"]),
      aPlus: Object.freeze(["Historia de la marca", "Propuesta de valor", "Funciones principales", "Escena de uso", "Ventaja verificada"]),
      aPlusBody: "Una ventaja verificada del producto, explicada de forma clara y fácil de comparar.",
    }),
    allowsCjkVisibleCopy: false,
  }),
]);

const MARKETPLACE_BY_ID = new Map(
  AMAZON_MARKETPLACES.map((marketplace) => [marketplace.id, marketplace]),
);

export function isAmazonMarketplaceId(value: unknown): value is AmazonMarketplaceId {
  return typeof value === "string" && MARKETPLACE_BY_ID.has(value as AmazonMarketplaceId);
}

/** Missing or invalid values default to the US marketplace (AIS restore rule). */
export function normalizeAmazonMarketplaceId(value: unknown): AmazonMarketplaceId {
  return isAmazonMarketplaceId(value) ? value : DEFAULT_AMAZON_MARKETPLACE_ID;
}

export function getAmazonMarketplace(value: unknown): AmazonMarketplaceConfig {
  return MARKETPLACE_BY_ID.get(normalizeAmazonMarketplaceId(value)) ?? AMAZON_MARKETPLACES[0];
}

export function getAmazonMarketplaceByLocale(locale: string): AmazonMarketplaceConfig {
  return AMAZON_MARKETPLACES.find((marketplace) => marketplace.locale === locale)
    ?? AMAZON_MARKETPLACES[0];
}

export function getAmazonMarketplaceLabel(value: unknown): string {
  return getAmazonMarketplace(value).label;
}
