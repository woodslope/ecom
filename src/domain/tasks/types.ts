import type { PlatformId } from "../platforms/types";

export type TaskKind = "plan" | "generate" | "export";
export type TaskStatus = "success" | "failed" | "canceled";

export interface TaskRecord {
  id: string;
  batchId: string;
  kind: TaskKind;
  platformId: PlatformId;
  slotKey?: string;
  status: TaskStatus;
  startedAt: string;
  completedAt: string;
  summary: string;
  artifactFileName?: string;
  missingSlots?: string[];
}
