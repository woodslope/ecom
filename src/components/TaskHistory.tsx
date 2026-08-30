import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";

import { getPlatformRulePack } from "../domain/platforms/registry";
import type { PlatformId } from "../domain/platforms/types";
import type { ProductProject } from "../domain/projects/types";
import type { TaskRecord } from "../domain/tasks";
import { queryProductionRuns, type ProductionRunFilters, type ProductionRunRecord } from "../domain/tasks";
import {
  type HistoryFilters,
  type HistoryPage,
  type HistoryQueryService,
} from "../domain/history/query";
import type { ProductionRunCursor } from "../domain/runs/repository";
import {
  loadHistoryAssetUrls,
  releaseHistoryAssetUrls,
} from "../domain/history/asset-urls";
import { createIndexedDbAssetRepository, type AssetRepository } from "../domain/assets/repository";
import {
  createLocalStorageWorkspaceRepository,
  type ProjectWorkspaceRepository,
} from "../domain/workspace/project-workspace";
import { Button, ConfirmDialog, EmptyState, StatusChip, StatusMessage } from "./ui";
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
        description="完成一次策划、图片生成或导出后，这里会自动保留当前商品的结果。"
      />
    );
  }
  return <TaskList tasks={tasks} />;
}

export function TaskHistoryArchive({
  projects,
  historyProjects,
  activeProjectId = null,
  workspaceRepository,
  assetRepository,
  activeRunIds = [],
  onOpenProject,
  onResumeRun,
  onForkRun,
  onExportRun,
  onDeleteRun,
  historyQueryService,
  platformId,
  compact = false,
  refreshKey,
}: {
  projects: ProductProject[];
  historyProjects?: ProductProject[];
  activeProjectId?: string | null;
  workspaceRepository?: ProjectWorkspaceRepository;
  assetRepository?: AssetRepository;
  activeRunIds?: string[];
  onOpenProject?: (projectId: string) => void;
  onResumeRun?: (record: ProductionRunRecord) => void;
  onForkRun?: (record: ProductionRunRecord) => void;
  onExportRun?: (record: ProductionRunRecord) => void;
  onDeleteRun?: (record: ProductionRunRecord) => Promise<boolean> | void;
  historyQueryService?: HistoryQueryService | null;
  platformId?: PlatformId;
  compact?: boolean;
  refreshKey?: string | number;
}) {
  const [records, setRecords] = useState<ProductionRunRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<ProductionRunCursor | undefined>();
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<ProductionRunFilters>(() =>
    platformId ? { platformId } : {},
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyErrorSource, setHistoryErrorSource] = useState<"query" | "load-more" | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ProductionRunRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const assetUrlsRef = useRef<Record<string, string>>({});
  const pendingAssetIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const queryVersionRef = useRef(0);

  const resolveAssetRepository = useCallback(() => assetRepository ?? (() => {
    try {
      return createIndexedDbAssetRepository();
    } catch {
      return null;
    }
  })(), [assetRepository]);

  const requestAssetUrls = useCallback((ids: readonly string[]) => {
    const missingIds = [...new Set(ids)].filter(
      (id) => !assetUrlsRef.current[id] && !pendingAssetIdsRef.current.has(id),
    );
    if (missingIds.length === 0 || typeof URL.createObjectURL !== "function") return;
    const repository = resolveAssetRepository();
    if (!repository) return;
    missingIds.forEach((id) => pendingAssetIdsRef.current.add(id));
    void loadHistoryAssetUrls(
      missingIds,
      (id) => repository.get(id),
      URL.createObjectURL,
    ).then((urls) => {
      missingIds.forEach((id) => pendingAssetIdsRef.current.delete(id));
      if (!mountedRef.current) {
        releaseHistoryAssetUrls(urls, URL.revokeObjectURL);
        return;
      }
      setAssetUrls((current) => {
        const next = { ...current, ...urls };
        assetUrlsRef.current = next;
        return next;
      });
    });
  }, [resolveAssetRepository]);

  const queryRecords = useCallback(async (
    cursor?: ProductionRunCursor,
  ): Promise<HistoryPage> => {
    if (historyQueryService) {
      return historyQueryService.query(filters as HistoryFilters, cursor, 50);
    }
    if (cursor) return { items: [] };
    const repository =
      workspaceRepository ??
      createLocalStorageWorkspaceRepository({
        storage: window.localStorage,
      });
    const loaded = await Promise.all(
      (historyProjects ?? projects).map(async (project) => {
        const workspace = await repository.load(project.id);
        return workspace.runs.map((run) => ({ project, run }));
      }),
    );
    return { items: queryProductionRuns(loaded.flat(), filters) };
  }, [filters, historyProjects, historyQueryService, projects, workspaceRepository]);

  useEffect(() => {
    let cancelled = false;
    const queryVersion = queryVersionRef.current + 1;
    queryVersionRef.current = queryVersion;
    void (async () => {
      setLoading(true);
      setLoadingMore(false);
      setHistoryError(null);
      setHistoryErrorSource(null);
      try {
        const page = await queryRecords();
        if (cancelled || queryVersionRef.current !== queryVersion) return;
        setRecords(page.items);
        setNextCursor(page.nextCursor);
      } catch (caught) {
        if (cancelled || queryVersionRef.current !== queryVersion) return;
        setHistoryError(caught instanceof Error ? caught.message : "读取任务历史失败，请重试。");
        setHistoryErrorSource("query");
      } finally {
        if (!cancelled && queryVersionRef.current === queryVersion) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryRecords, refreshKey, retryKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading || loadingMore) return;
    const queryVersion = queryVersionRef.current;
    setLoadingMore(true);
    setHistoryError(null);
    setHistoryErrorSource(null);
    try {
      const page = await queryRecords(nextCursor);
      if (!mountedRef.current || queryVersionRef.current !== queryVersion) return;
      setRecords((current) => {
        const knownIds = new Set(current.map(({ run }) => run.id));
        return [...current, ...page.items.filter(({ run }) => !knownIds.has(run.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (!mountedRef.current || queryVersionRef.current !== queryVersion) return;
      setHistoryError(caught instanceof Error ? caught.message : "加载更早记录失败，请重试。");
      setHistoryErrorSource("load-more");
    } finally {
      if (mountedRef.current && queryVersionRef.current === queryVersion) setLoadingMore(false);
    }
  }, [loading, loadingMore, nextCursor, queryRecords]);

  useEffect(() => {
    setFilters((current) => platformId
      ? current.platformId === platformId ? current : { ...current, platformId }
      : current.platformId
        ? { ...current, platformId: undefined }
        : current,
    );
  }, [platformId]);

  const filtered = useMemo(
    () => historyQueryService ? records : queryProductionRuns(records, filters),
    [historyQueryService, records, filters],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !onDeleteRun) return;
    setDeleting(true);
    try {
      const deleted = await onDeleteRun(deleteTarget);
      if (deleted) {
        setRecords((current) => current.filter(({ run }) => run.id !== deleteTarget.run.id));
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, onDeleteRun]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseHistoryAssetUrls(assetUrlsRef.current, URL.revokeObjectURL);
      assetUrlsRef.current = {};
      pendingAssetIdsRef.current.clear();
    };
  }, []);
  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => key !== "platformId" && Boolean(value),
  );
  if (loading && records.length === 0) {
    return <EmptyState variant="loading" eyebrow="正在同步" icon={<Archive size={24} />} title="正在读取任务历史" description="按商品汇总本地记录。" />;
  }

  if (historyError && records.length === 0) {
    return (
      <div role="alert" aria-live="assertive" aria-atomic="true">
        <EmptyState
          variant="result"
          eyebrow="读取失败"
          icon={<CircleAlert size={24} />}
          title="暂时无法读取任务历史"
          description={`${historyError} 已有记录仍保存在当前浏览器中。`}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>重试读取</Button>}
        />
      </div>
    );
  }

  if (records.length === 0 && !hasActiveFilters) {
    return (
      <div className={`production-history${compact ? " production-history--compact" : ""}`}>
        <ProductionHistoryFilters
          value={filters}
          onChange={setFilters}
          onClear={() => setFilters(platformId ? { platformId } : {})}
          hidePlatform={Boolean(platformId)}
          compact={compact}
        />
        <EmptyState
          variant="dependency"
          icon={<Archive size={24} />}
          title="还没有任务记录"
          description={`在${platformId ? getPlatformRulePack(platformId).label : "当前平台"}完成策划后，记录会自动保存在这里。`}
        />
      </div>
    );
  }

  return (
    <div className={`production-history${compact ? " production-history--compact" : ""}`}>
      <ProductionHistoryFilters
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters(platformId ? { platformId } : {})}
        hidePlatform={Boolean(platformId)}
        compact={compact}
      />
      {historyError ? (
        <StatusMessage
          tone="danger"
          live="assertive"
          actions={(
            <Button
              variant="secondary"
              size="compact"
              onClick={() => historyErrorSource === "load-more" ? void loadMore() : setRetryKey((value) => value + 1)}
              disabled={historyErrorSource === "load-more" ? !nextCursor || loadingMore : loading}
            >
              {historyErrorSource === "load-more" ? "重试加载" : "重试读取"}
            </Button>
          )}
        >
          <span>{historyError} 已加载的记录仍可继续使用。</span>
        </StatusMessage>
      ) : null}
      {filtered.length === 0 ? <EmptyState variant="result" eyebrow="没有匹配记录" icon={<Archive size={24} />} title="筛选条件没有结果" description="调整搜索或状态，也可清除筛选查看全部记录。" action={<Button onClick={() => setFilters(platformId ? { platformId } : {})}>清除筛选</Button>} /> : <div className="production-history__list">
        {filtered.map((record) => <ProductionRunCard key={record.run.id} record={record} compact={compact} current={activeProjectId === record.project.id && activeRunIds.includes(record.run.id)} assetUrls={assetUrls} onRequestPreviewAssets={requestAssetUrls} onResume={() => onResumeRun?.(record)} onFork={() => onForkRun?.(record)} onExport={onExportRun ? () => onExportRun(record) : undefined} onDelete={onDeleteRun ? () => setDeleteTarget(record) : undefined} />)}
      </div>}
      {nextCursor ? (
        <div className="production-history__load-more">
          <Button variant="secondary" loading={loadingMore} loadingLabel="正在加载更早记录" disabled={loading} onClick={() => void loadMore()}>
            加载更早记录
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除生产记录？"
        description={`将删除“${deleteTarget?.project.name ?? "当前任务"}”的这条历史生产记录，已生成的图片不会被删除。`}
        confirmLabel="删除记录"
        onCancel={() => deleting ? undefined : setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
