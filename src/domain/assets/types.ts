import type { StyleReferenceDefinition } from "./style-reference";

export type AssetKind = "reference" | "generated" | "style-reference";

export interface AssetMetadata {
  id: string;
  projectId: string;
  name: string;
  kind: AssetKind;
  role?: string;
  tags: string[];
  width?: number;
  height?: number;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  styleReference?: StyleReferenceDefinition;
}

export interface StoredAsset {
  metadata: AssetMetadata;
  blob: Blob;
}

export interface NewAssetMetadata {
  name: string;
  kind: AssetKind;
  role?: string;
  tags?: string[];
  width?: number;
  height?: number;
  styleReference?: StyleReferenceDefinition;
}

export type AssetMetadataPatch = Partial<NewAssetMetadata>;

export interface CreateAssetInput {
  id?: string;
  projectId: string;
  blob: Blob;
  metadata: NewAssetMetadata;
}

export interface PatchAssetInput {
  id: string;
  blob?: Blob;
  metadata: AssetMetadataPatch;
}

export type PutAssetInput = CreateAssetInput | PatchAssetInput;
