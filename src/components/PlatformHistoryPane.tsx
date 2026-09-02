import { lazy, Suspense } from "react";

import type { HistoryQueryService } from "../domain/history/query";
import type { ExecutionJob } from "../domain/jobs/types";
import { getPlatformRulePack } from "../domain/platforms/registry";
import type { PlatformId } from "../domain/platforms/types";
import type { PlatformTask } from "../domain/projects/types";
import type { ProductionRunRecord } from "../domain/tasks";
import { ExecutionJobPanel } from "./ExecutionJobPanel";
import { Dialog, StatusMessage } from "./ui";

const TaskHistoryArchive = lazy(async () => {
  const module = await import("./TaskHistory");
  return { default: module.TaskHistoryArchive };
});

export interface PlatformHistoryPaneProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  platform: PlatformId;
  projects: PlatformTask[];
  historyProjects: PlatformTask[];
  activeProjectId?: string | null;
  activeRunIds: string[];
  jobs: ExecutionJob[];
  onResumeJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onResumeRun: (record: ProductionRunRecord) => void;
  onForkRun: (record: ProductionRunRecord) => void;
  onExportRun: (record: ProductionRunRecord) => void;
  onDeleteRun: (record: ProductionRunRecord) => Promise<boolean>;
  historyQueryService: HistoryQueryService | null;
  historyRefreshKey: string;
}

export function PlatformHistoryPane({
  id,
  open,
  onClose,
  platform,
  projects,
  historyProjects,
  activeProjectId,
  activeRunIds,
  jobs,
  onResumeJob,
  onRetryJob,
  onCancelJob,
  onResumeRun,
  onForkRun,
  onExportRun,
  onDeleteRun,
  historyQueryService,
  historyRefreshKey,
}: PlatformHistoryPaneProps) {
  const platformJobs = jobs.filter((job) =>
    job.items.some((item) => item.target.platformId === platform),
  );
  const activeJobCount = platformJobs.filter((job) =>
    job.status === "queued" || job.status === "running" || job.status === "paused"
  ).length;

  return (
    <Dialog
      id={id}
      open={open}
      title="历史记录"
      ariaLabel={`${getPlatformRulePack(platform).label}历史记录`}
      closeLabel="关闭历史记录"
      variant="sidebar"
      className="platform-history-pane"
      onClose={onClose}
    >
      {activeJobCount > 0 ? (
        <section className="platform-history-pane__active" aria-label="进行中任务">
          <h3>进行中 <span>{activeJobCount}</span></h3>
          <ExecutionJobPanel
            jobs={platformJobs.filter((job) => job.status === "queued" || job.status === "running" || job.status === "paused")}
            onResume={onResumeJob}
            onRetry={onRetryJob}
            onCancel={onCancelJob}
          />
        </section>
      ) : null}
      <section className="platform-history-pane__records" aria-label="生产记录">
        <Suspense fallback={<StatusMessage live="polite">正在载入历史记录...</StatusMessage>}>
          <TaskHistoryArchive
            projects={projects}
            historyProjects={historyProjects}
            activeProjectId={activeProjectId}
            activeRunIds={activeRunIds}
            platformId={platform}
            onResumeRun={onResumeRun}
            onForkRun={onForkRun}
            onExportRun={onExportRun}
            onDeleteRun={onDeleteRun}
            historyQueryService={historyQueryService}
            refreshKey={historyRefreshKey}
            compact
          />
        </Suspense>
      </section>
    </Dialog>
  );
}
