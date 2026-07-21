import type { PlatformId } from "../platforms/types";

export type ComplianceSeverity = "error" | "warning" | "info";

export interface ComplianceFinding {
  code: string;
  severity: ComplianceSeverity;
  checkType: "automatic";
  message: string;
  evidence: string[];
  userAction: string;
}

export interface ComplianceManualReview {
  required: true;
  reason: string;
  userAction: string;
}

export interface ComplianceResult {
  platformId: PlatformId;
  slotKey: string;
  severity: ComplianceSeverity;
  findings: ComplianceFinding[];
  manualReviewRequired: true;
  manualReview: ComplianceManualReview;
}
