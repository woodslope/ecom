import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";

import { getPlatformRulePack } from "../domain/platforms/registry";
import type { ProductProject } from "../domain/projects/types";
import type { TaskRecord } from "../domain/tasks";
import { queryProductionRuns, type ProductionRunFilters, type ProductionRunRecord } from "../domain/tasks";
import {
  type HistoryFilters,
  type HistoryQueryService,
} from "../domain/history/query";
import {
  loadHistoryAssetUrls,
  releaseHistoryAssetUrls,
} from "../domain/history/asset-urls";
import { createIndexedDbAssetRepository, type AssetRepository } from "../domain/assets/repository";
import {
  createLocalStorageWorkspaceRepository,
  type ProjectWorkspaceRepository,
} from "../domain/workspace/project-workspace";
import { Button, EmptyState, StatusChip } from "./ui";
import { ProductionHistoryFilters } from "./ProductionHistoryFilters";
import { ProductionRunCard } from "./ProductionRunCard";

const taskLabels = {
  plan: "AI 策划",
  generate: "生成槽位图片",
  export: "导出交付包",
} as const;

export interface ProjectTaskArchive {
  project: ProductProject;
  tasks: TaskRecord[];
}

function TaskList({ tasks }: { tasks: TaskRecord[] }) {
  return (
    <ol className="task-history">
      {[...tasks].reverse().map((task) => (
        <li key={task.id} className="task-history__item">
          <span className={`task-history__icon task-history__icon--${task.status}`}>
            {task.status === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          </span>
          <span className="task-history__content">
            <span className="task-history__heading">
              <strong>{taskLabels[task.kind]}</strong>
              <StatusChip tone="neutral">{getPlatformRulePack(task.platformId).label}</StatusChip>
              {task.slotKey ? <StatusChip tone="info">{task.slotKey}</StatusChip> : null}
            </span>
            <span>{task.summary}</span>
            {task.artifactFileName ? <code>{task.artifactFileName}</code> : null}
            <time dateTime={task.completedAt}>
              {new Date(task.completedAt).toLocaleString("zh-CN")}
            </time>
          </span>
          {task.kind === "plan" ? <Sparkles size={15} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Flat list kept for unit contracts that pass tasks only. */
export function TaskHistory({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        variant="dependency"
        eyebrow="等待工作流产生结果"
        icon={<Archive size={24} />}
        title="还没有任务记录"
        description="完成一次策划、图片生成或导出后，这里会按商品档案归档结果。"
      />
    );
  }
  return <TaskList tasks={tasks} />;
}

export function TaskHistoryArchive({
  projects,
  activeProjectId = null,
  workspaceRepository,
  assetRepository,
  activeRunIds = [],
  onOpenProject,
  onOpenLibrary,
  onResumeRun,
  onForkRun,
  onReuseImage,
  onExportRun,
  historyQueryService,
}: {
  projects: ProductProject[];
  activeProjectId?: string | null;
  workspaceRepository?: ProjectWorkspaceRepository;
  assetRepository?: AssetRepository;
  activeRunIds?: string[];
  onOpenProject?: (projectId: string) => void;
  onOpenLibrary?: () => void;
  onResumeRun?: (record: ProductionRunRecord) => void;
  onForkRun?: (record: ProductionRunRecord) => void;
  onReuseImage?: (record: ProductionRunRecord, eventId: string) => void;
  onExportRun?: (record: ProductionRunRecord) => void;
  historyQueryService?: HistoryQueryService | null;
}) {
  const [records, setRecords] = useState<ProductionRunRecord[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<ProductionRunFilters>({});
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        let sorted: ProductionRunRecord[];
        if (historyQueryService) {
          const page = await historyQueryService.query(filters as HistoryFilters, undefined, 50);
          sorted = page.items;
        } else {
          const repository =
            workspaceRepository ??
            createLocalStorageWorkspaceRepository({
              storage: window.localStorage,
            });
          const loaded = await Promise.all(
            projects.map(async (project) => {
              const workspace = await repository.load(project.id);
              return workspace.runs.map((run) => ({ project, run }));
            }),
          );
          sorted = queryProductionRuns(loaded.flat(), filters);
        }
        if (cancelled) return;
        setRecords(sorted);
        setExpandedRunId((current) => current && sorted.some(({ run }) => run.id === current) ? current : sorted[0]?.run.id ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projects, workspaceRepository, historyQueryService, filters]);

  useEffect(() => {
    let cancelled = false;
    setAssetUrls((current) => {
      releaseHistoryAssetUrls(current, URL.revokeObjectURL);
      return {};
    });
    const record = records.find(({ run }) => run.id === expandedRunId);
    if (!record) return () => undefined;
    const resolvedAssetRepository = assetRepository ?? (() => {
      try {
        return createIndexedDbAssetRepository();
      } catch {
        return null;
      }
    })();
    if (!resolvedAssetRepository || typeof URL.createObjectURL !== "function") return () => undefined;
    const ids = record.run.events.flatMap((event) => event.assetId ? [event.assetId] : []);
    void loadHistoryAssetUrls(
      ids,
      (id) => resolvedAssetRepository.get(id),
      URL.createObjectURL,
    ).then((urls) => {
      if (cancelled) {
        releaseHistoryAssetUrls(urls, URL.revokeObjectURL);
        return;
      }
      setAssetUrls(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [expandedRunId, records, assetRepository]);

  const filtered = useMemo(
    () => historyQueryService ? records : queryProductionRuns(records, filters),
    [historyQueryService, records, filters],
  );
  const hasActiveFilters = Object.values(filters).some(Boolean);
  useEffect(() => {
    if (filtered.length === 0) return;
    if (!expandedRunId || !filtered.some(({ run }) => run.id === expandedRunId)) {
      setExpandedRunId(filtered[0]!.run.id);
    }
  }, [expandedRunId, filtered]);

  if (loading) {
    return <EmptyState variant="loading" eyebrow="正在同步" icon={<Archive size={24} />} title="正在读取任务历史" description="按商品档案汇总本地记录。" />;
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        variant="dependency"
        eyebrow="还没有商品资料"
        icon={<Archive size={24} />}
        title="还没有商品档案"
        description="先在资料库创建商品资料，并完成策划或生成后，这里会按档案归档。"
        action={onOpenLibrary ? <Button onClick={onOpenLibrary}>进入资料库</Button> : undefined}
      />
    );
  }

  return (
    <div className="production-history">
      <ProductionHistoryFilters value={filters} onChange={setFilters} onClear={() => setFilters({})} />
      {records.length === 0 && !hasActiveFilters ? (
        <EmptyState
          variant="result"
          eyebrow="商品档案已存在"
          icon={<Archive size={24} />}
          title="还没有生产记录"
          description="完成一次策划后会建立 Run，后续生成、编辑和导出都归入该 Run。"
        />
      ) : filtered.length === 0 ? <EmptyState variant="result" eyebrow="没有匹配记录" icon={<Archive size={24} />} title="筛选条件没有结果" description="调整筛选条件，或清除全部筛选查看现有 Run。" action={<Button onClick={() => setFilters({})}>清除筛选</Button>} /> : <div className="production-history__list">
        {filtered.map((record) => <ProductionRunCard key={record.run.id} record={record} expanded={expandedRunId === record.run.id} current={activeProjectId === record.project.id && activeRunIds.includes(record.run.id)} assetUrls={assetUrls} onToggle={() => setExpandedRunId((current) => current === record.run.id ? null : record.run.id)} onResume={() => onResumeRun?.(record)} onFork={() => onForkRun?.(record)} onReuse={(eventId) => onReuseImage?.(record, eventId)} onExport={onExportRun ? () => onExportRun(record) : undefined} />)}
      </div>}
    </div>
  );
}
