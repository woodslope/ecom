export interface ProductFacts {
  productName: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  targetAudience: string;
  description: string;
  sellingPoints: string[];
  forbiddenClaims: string[];
  specifications: Record<string, string>;
}

export type ProductProjectScope = "library" | "task-draft";
export type ProductFactsLocale = "zh-CN";

export interface ProductProject {
  id: string;
  name: string;
  /** Missing on legacy/in-memory records means library. Repositories always normalize it. */
  scope?: ProductProjectScope;
  /** Shared product facts are maintained in Simplified Chinese. Legacy records normalize to zh-CN. */
  factsLocale?: ProductFactsLocale;
  facts: ProductFacts;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductProjectInput {
  name: string;
  scope?: ProductProjectScope;
  factsLocale?: ProductFactsLocale;
  facts: ProductFacts;
}

export interface UpdateProductProjectInput {
  name?: string;
  facts?: Partial<ProductFacts>;
}
