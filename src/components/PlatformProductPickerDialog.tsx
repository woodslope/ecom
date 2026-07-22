import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, PackageOpen, Plus, Search } from "lucide-react";

import type { ProductProject } from "../domain/projects/types";
import { hasUsableProductFacts } from "../domain/projects/product-source-text";
import { Button, Dialog, EmptyState, StatusChip, StatusMessage } from "./ui";

export type PlatformProductPickerChoice =
  | { kind: "switch"; projectId: string }
  | { kind: "manual" }
  | { kind: "create" }
  | { kind: "library" };

export function filterPickerProjects(
  projects: readonly ProductProject[],
  query: string,
): ProductProject[] {
  const normalized = query.trim().toLocaleLowerCase();
  const sorted = [...projects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  if (!normalized) return sorted;
  return sorted.filter((project) =>
    [project.name, project.facts.productName, project.facts.category, project.facts.brand]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function PlatformProductPickerDialog({
  open,
  platformLabel,
  projects,
  activeProjectId,
  allowManualWithoutProject = false,
  loading = false,
  onClose,
  onChoose,
}: {
  open: boolean;
  platformLabel: string;
  projects: readonly ProductProject[];
  activeProjectId?: string | null;
  /** Amazon can continue without a project by pasting Listing. */
  allowManualWithoutProject?: boolean;
  loading?: boolean;
  onClose: () => void;
  onChoose: (choice: PlatformProductPickerChoice) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(activeProjectId ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedId(activeProjectId ?? projects[0]?.id ?? null);
    setBusy(false);
  }, [activeProjectId, open, projects]);

  const filtered = useMemo(() => filterPickerProjects(projects, query), [projects, query]);
  const selected = filtered.find((project) => project.id === selectedId) ??
    projects.find((project) => project.id === selectedId) ??
    null;

  const run = async (choice: PlatformProductPickerChoice) => {
    setBusy(true);
    try {
      await onChoose(choice);
    } finally {
      setBusy(false);
    }
  };

  const switchSelected = () => {
    if (!selected) return;
    void run({ kind: "switch", projectId: selected.id });
  };

  return (
    <Dialog
      open={open}
      title={`切换 ${platformLabel} 商品`}
      eyebrow="商品工作上下文"
      variant="sidebar"
      className="platform-product-picker-dialog"
      onClose={busy || loading ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy || loading} onClick={onClose}>
            取消
          </Button>
          {allowManualWithoutProject ? (
            <Button
              variant="secondary"
              disabled={busy || loading}
              onClick={() => void run({ kind: "manual" })}
            >
              手动填写 / 粘贴
            </Button>
          ) : null}
          <Button
            disabled={busy || loading || !selected}
            title={!selected ? "请先选择一个商品档案" : undefined}
            onClick={switchSelected}
          >
            <PackageOpen size={15} />
            {busy || loading
              ? "切换中…"
              : selected?.id === activeProjectId
                ? "继续当前商品"
                : "切换并恢复"}
          </Button>
        </>
      }
    >
      <p className="platform-product-picker__lead">
        选择要继续制作的商品。切换后会恢复该商品在 {platformLabel} 的已有草稿、策划和生成进度；
        当前商品的进度仍会保留。
      </p>

      {projects.length === 0 ? (
        <EmptyState
          variant="setup"
          icon={<FolderOpen size={24} />}
          title="还没有商品档案"
          description={
            allowManualWithoutProject
              ? "可以先手动粘贴 Listing 开始，也可以新建资料库档案后再载入。"
              : "淘宝生产需要商品档案。请先新建档案，或打开资料库维护。"
          }
          action={
            <div className="platform-product-picker__empty-actions">
              <Button disabled={busy || loading} onClick={() => void run({ kind: "create" })}>
                <Plus size={15} />
                新建商品
              </Button>
              {allowManualWithoutProject ? (
                <Button
                  variant="secondary"
                  disabled={busy || loading}
                  onClick={() => void run({ kind: "manual" })}
                >
                  手动填写
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy || loading}
                  onClick={() => void run({ kind: "library" })}
                >
                  打开资料库
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="platform-product-picker__layout">
          <div className="platform-product-picker__list-pane">
            <label className="platform-product-picker__search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="搜索商品档案"
                placeholder="搜索名称、品类或品牌"
                value={query}
                disabled={busy || loading}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="platform-product-picker__list" role="listbox" aria-label="商品档案列表">
              {filtered.length === 0 ? (
                <StatusMessage>没有匹配的商品，试试其他关键词。</StatusMessage>
              ) : (
                filtered.map((project) => {
                  const selectedProject = project.id === selectedId;
                  const usable = hasUsableProductFacts(project.facts);
                  const active = project.id === activeProjectId;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="option"
                      aria-selected={selectedProject}
                      className={`platform-product-picker__item${
                        selectedProject ? " platform-product-picker__item--selected" : ""
                      }`}
                      disabled={busy || loading}
                      onClick={() => setSelectedId(project.id)}
                      onDoubleClick={() => void run({ kind: "switch", projectId: project.id })}
                    >
                      <span className="platform-product-picker__item-icon" aria-hidden="true">
                        <FileText size={16} />
                      </span>
                      <span className="platform-product-picker__item-copy">
                        <strong>{project.name}</strong>
                        <em>{project.facts.productName || "未填商品名称"}</em>
                      </span>
                      <StatusChip tone={active && usable ? "info" : usable ? "success" : "warning"}>
                        {active ? (usable ? "当前" : "当前 · 待补资料") : usable ? "可继续" : "待补资料"}
                      </StatusChip>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="platform-product-picker__detail-pane" aria-live="polite">
            {selected ? (
              <>
                <h3>{selected.name}</h3>
                <dl>
                  <div>
                    <dt>商品名称</dt>
                    <dd>{selected.facts.productName || "—"}</dd>
                  </div>
                  <div>
                    <dt>品类 / 品牌</dt>
                    <dd>
                      {[selected.facts.category, selected.facts.brand].filter(Boolean).join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>卖点</dt>
                    <dd>
                      {selected.facts.sellingPoints.length > 0
                        ? selected.facts.sellingPoints.join("、")
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <StatusMessage>
                  切换只会改变当前工作商品，不会把这份资料覆盖到当前商品。若该商品已有
                  {platformLabel} 进度，将从原位置继续。
                </StatusMessage>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={busy || loading}
                  onClick={() => void run({ kind: "create" })}
                >
                  <Plus size={14} />
                  新建另一个商品
                </Button>
              </>
            ) : (
              <EmptyState
                variant="selection"
                icon={<PackageOpen size={22} />}
                title="选择左侧商品"
                description="选定后点「切换并恢复」。"
              />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
