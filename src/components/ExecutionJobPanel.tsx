import { ListTodo, Play, RotateCcw, Square } from "lucide-react";

import type { ExecutionJob } from "../domain/jobs/types";
import { getPlatformWorkflow } from "../domain/platforms/registry";
import { Button, Panel, StatusChip } from "./ui";

const statusLabel: Record<ExecutionJob["status"], string> = {
  queued: "排队中",
  running: "执行中",
  paused: "已暂停",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const kindLabel: Record<ExecutionJob["kind"], string> = {
  "batch-generate": "批量生成",
  "image-translate": "图片翻译",
  "workflow-plan": "批量策划",
};

function toneFor(job: ExecutionJob): "neutral" | "info" | "success" | "warning" | "danger" {
  if (job.status === "completed") return "success";
  if (job.status === "running" || job.status === "queued") return "info";
  if (job.status === "failed") return "danger";
  if (job.status === "paused") return "warning";
  return "neutral";
}

export function ExecutionJobPanel({
  jobs,
  onResume,
  onRetry,
  onCancel,
}: {
  jobs: readonly ExecutionJob[];
  onResume: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  return (
    <Panel
      title="本地任务"
      className="execution-job-panel"
      action={<StatusChip tone={jobs.some((job) => job.status === "running") ? "info" : "neutral"}>{jobs.length}</StatusChip>}
    >
      {jobs.length === 0 ? (
        <div className="execution-job-empty">
          <ListTodo size={18} aria-hidden="true" />
          <span>暂无批量任务</span>
          <small>在平台工作区批量生成后，这里会显示进度和恢复操作。</small>
        </div>
      ) : (
        <div className="execution-job-list">
          {jobs.map((job) => {
            const workflowId = job.items[0]?.target.workflowId;
            const workflowLabel = workflowId ? getPlatformWorkflow(workflowId).label : "工作流";
            return (
              <article className="execution-job-row" key={job.id}>
                <div className="execution-job-row__identity">
                  <span>
                    <strong>{kindLabel[job.kind]}</strong>
                    <StatusChip tone={toneFor(job)}>{statusLabel[job.status]}</StatusChip>
                  </span>
                  <small>{workflowLabel} · {job.progress.completed} / {job.progress.total}</small>
                  {job.error ? <p>{job.error}</p> : null}
                </div>
                <div className="execution-job-row__actions">
                  {job.status === "paused" || job.status === "queued" ? (
                    <Button size="compact" onClick={() => onResume(job.id)}>
                      <Play size={14} />继续任务
                    </Button>
                  ) : null}
                  {job.status === "failed" ? (
                    <Button size="compact" onClick={() => onRetry(job.id)}>
                      <RotateCcw size={14} />重试失败任务
                    </Button>
                  ) : null}
                  {job.status === "running" || job.status === "paused" || job.status === "queued" ? (
                    <Button variant="secondary" size="compact" onClick={() => onCancel(job.id)}>
                      <Square size={13} />取消
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
