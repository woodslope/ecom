import { ArrowRight, PackageCheck, ShoppingBag } from "lucide-react";

import type {
  PlatformSession,
  PlatformWorkflowId,
  ProductionRun,
} from "../domain/workspace/project-workspace";
import { Button, StatusChip } from "./ui";

export type PlatformProgressStatus =
  | "not-started"
  | "preparing"
  | "planned"
  | "producing"
  | "ready";

export interface PlatformProgressSummary {
  platformId: "amazon" | "taobao";
  workflowId: PlatformWorkflowId;
  label: string;
  description: string;
  status: PlatformProgressStatus;
  completedSlots: number;
  totalSlots: number;
  latestRunId?: string;
  updatedAt?: string;
}

const WORKFLOWS: readonly Pick<
  PlatformProgressSummary,
  "platformId" | "workflowId" | "label" | "description"
>[] = [
  {
    platformId: "amazon",
    workflowId: "amazon-listing",
    label: "Amazon Listing",
    description: "MAIN + PT 图片组",
  },
  {
    platformId: "amazon",
    workflowId: "amazon-aplus",
    label: "Amazon A+",
    description: "A+ 模块图片",
  },
  {
    platformId: "taobao",
    workflowId: "taobao-product",
    label: "淘宝 / 天猫",
    description: "头图与详情页",
  },
];

export function platformIdForWorkflow(
  workflowId: PlatformWorkflowId,
): "amazon" | "taobao" {
  return workflowId === "taobao-product" || workflowId === "taobao-detail" ? "taobao" : "amazon";
}

function latestByUpdatedAt<T extends { updatedAt: string }>(items: readonly T[]): T | undefined {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function completedSlotCount(session?: PlatformSession): number {
  if (!session?.plan) return 0;
  return session.plan.slots.filter((slot) => {
    const state = session.slotVersions[slot.slotKey];
    return Boolean(
      state?.activeVersionId &&
        state.versions.some((version) => version.id === state.activeVersionId),
    );
  }).length;
}

export function derivePlatformProgressSummaries(
  projectId: string,
  sessions: readonly PlatformSession[],
  runs: readonly ProductionRun[],
): PlatformProgressSummary[] {
  return WORKFLOWS.map((workflow) => {
    const session = latestByUpdatedAt(
      sessions.filter(
        (candidate) =>
          candidate.projectId === projectId && candidate.workflowId === workflow.workflowId,
      ),
    );
    const latestRun = latestByUpdatedAt(
      runs.filter(
        (candidate) =>
          candidate.projectId === projectId && candidate.workflowId === workflow.workflowId,
      ),
    );
    const totalSlots = session?.plan?.slots.length ?? 0;
    const completedSlots = completedSlotCount(session);
    const status: PlatformProgressStatus = !session
      ? "not-started"
      : totalSlots > 0 && completedSlots === totalSlots
        ? "ready"
        : completedSlots > 0 || latestRun?.status === "producing" || latestRun?.status === "partial"
          ? "producing"
          : session.plan
            ? "planned"
            : "preparing";

    return {
      ...workflow,
      status,
      completedSlots,
      totalSlots,
      ...(latestRun ? { latestRunId: latestRun.id } : {}),
      ...(session || latestRun
        ? { updatedAt: latestRun?.updatedAt ?? session?.updatedAt }
        : {}),
    };
  });
}

const statusLabel: Record<PlatformProgressStatus, string> = {
  "not-started": "未开始",
  preparing: "准备中",
  planned: "待生产",
  producing: "生产中",
  ready: "已完成",
};

export function PlatformProgress({
  summaries,
  loading,
  onOpenWorkflow,
}: {
  summaries: readonly PlatformProgressSummary[];
  loading: boolean;
  onOpenWorkflow: (workflowId: PlatformWorkflowId) => void;
}) {
  return (
    <div className="platform-progress" aria-label="平台进度">
      {summaries.map((summary) => {
        const Icon = summary.platformId === "amazon" ? PackageCheck : ShoppingBag;
        const started = summary.status !== "not-started";
        return (
          <article className="platform-progress__row" key={summary.workflowId}>
            <span className="platform-progress__icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div className="platform-progress__copy">
              <strong>{summary.label}</strong>
              <span>{summary.description}</span>
            </div>
            <div className="platform-progress__status">
              <StatusChip
                tone={summary.status === "ready" ? "success" : summary.status === "producing" ? "info" : "neutral"}
              >
                {statusLabel[summary.status]}
              </StatusChip>
              <span>{summary.totalSlots > 0 ? `${summary.completedSlots}/${summary.totalSlots}` : "--"}</span>
            </div>
            <Button
              variant={started ? "secondary" : "primary"}
              size="compact"
              disabled={loading}
              data-workflow-id={summary.workflowId}
              onClick={() => onOpenWorkflow(summary.workflowId)}
            >
              {started ? "继续制作" : "开始制作"}
              <ArrowRight size={14} />
            </Button>
          </article>
        );
      })}
    </div>
  );
}
