import type { StoredAsset } from "../assets/types";
import type { ComplianceResult } from "../compliance";
import type { SlotVersion, SlotVersionState } from "../generation/types";
import type { PlannedSlot, PlatformPlan } from "../planning/types";
import type { PlatformRulePack, SlotDimensions } from "../platforms/types";
import type { ProductProject } from "../projects/types";
import type { AmazonMarketplaceId } from "../platforms/amazon-marketplaces";
import type { PlatformSessionOptions, ProductionRun } from "../workspace/project-workspace";

export interface ExportManifestVersion {
  id: string;
  createdAt: string;
  source: SlotVersion["source"];
  promptSnapshot: string;
  visibleCopySnapshot: string;
  width: number;
  height: number;
  mimeType: string;
  parameters: Record<string, string | number | boolean>;
}

export interface ExportManifestSlot {
  slotKey: string;
  label: string;
  order: number;
  dimensions: SlotDimensions;
  fileName: string | null;
  version: ExportManifestVersion | null;
  externalText?: PlannedSlot["externalText"];
  compliance: ComplianceResult;
}

export interface ExportManifest {
  schemaVersion: 1;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    productName: string;
    sku: string;
  };
  platform: {
    id: PlatformRulePack["platformId"];
    label: string;
    locale: string;
    marketplaceId?: AmazonMarketplaceId;
    copyLanguage?: string;
  };
  run?: {
    id: string;
    sessionId: string;
    workflowId: ProductionRun["workflowId"];
    source: ProductionRun["source"];
  };
  options?: PlatformSessionOptions;
  ready: boolean;
  missingSlots: string[];
  manualReviewRequired: true;
  platformReminders: string[];
  slots: ExportManifestSlot[];
}

export interface BuildExportPackageInput {
  project: ProductProject;
  rulePack: PlatformRulePack;
  plan: PlatformPlan;
  planningInputSignature: string;
  slotVersions?: Record<string, SlotVersionState>;
  loadAsset: (id: string) => Promise<StoredAsset | null>;
  now?: () => string;
  runContext?: Pick<ProductionRun, "id" | "sessionId" | "workflowId" | "source"> & {
    options: PlatformSessionOptions;
  };
}

export interface BuildRunExportPackageInput {
  project: ProductProject;
  run: ProductionRun;
  loadAsset: (id: string) => Promise<StoredAsset | null>;
  now?: () => string;
}

export interface ExportPackage {
  blob: Blob;
  fileName: string;
  manifest: ExportManifest;
}
