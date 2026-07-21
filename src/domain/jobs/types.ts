import type { PlatformId, PlatformWorkflowId } from "../platforms/types";

export type ExecutionJobKind = "batch-generate" | "image-translate" | "workflow-plan";
export type ExecutionJobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "canceled";
export type ExecutionJobItemStatus = "pending" | "running" | "completed" | "failed" | "canceled";

export interface ExecutionJobTarget {
  id: string;
  projectId: string;
  sessionId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  slotKey: string;
}

export interface ExecutionJobItem {
  id: string;
  target: ExecutionJobTarget;
  status: ExecutionJobItemStatus;
  attempts: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionJobProgress {
  completed: number;
  total: number;
}

export interface ExecutionJob {
  id: string;
  kind: ExecutionJobKind;
  status: ExecutionJobStatus;
  items: ExecutionJobItem[];
  progress: ExecutionJobProgress;
  currentItemId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionJobFilters {
  kind?: ExecutionJobKind;
  status?: ExecutionJobStatus;
  projectId?: string;
}

export interface ExecutionJobPage {
  items: ExecutionJob[];
}
