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

export type ProductFactsLocale = "zh-CN";

/**
 * Platform-owned task record. The legacy interface name remains for storage
 * and TypeScript compatibility while records are phased into per-platform ownership.
 */
export interface ProductProject {
  id: string;
  name: string;
  /** A task belongs to exactly one platform; old records may omit this field. */
  platformId?: "amazon" | "taobao";
  factsLocale?: ProductFactsLocale;
  facts: ProductFacts;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductProjectInput {
  name: string;
  platformId?: "amazon" | "taobao";
  factsLocale?: ProductFactsLocale;
  facts: ProductFacts;
}

export interface UpdateProductProjectInput {
  name?: string;
  facts?: Partial<ProductFacts>;
}

// UI and application code use task terminology. Persistence keeps the legacy
// project names and projectId fields so existing browser data remains readable.
export type PlatformTask = ProductProject;
export type CreatePlatformTaskInput = CreateProductProjectInput;
export type UpdatePlatformTaskInput = UpdateProductProjectInput;
