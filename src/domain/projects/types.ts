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

export interface ProductProject {
  id: string;
  name: string;
  facts: ProductFacts;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductProjectInput {
  name: string;
  facts: ProductFacts;
}

export interface UpdateProductProjectInput {
  name?: string;
  facts?: Partial<ProductFacts>;
}
