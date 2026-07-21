import { useState } from "react";
import { Check, FolderOpen, MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";

import type { ProductProject, UpdateProductProjectInput } from "../domain/projects/types";
import type {
  PlatformSession,
  PlatformWorkflowId,
  ProductionRun,
} from "../domain/workspace/project-workspace";
import type { WorkbenchAsset } from "../store/workbench-store";
import { AssetLibrary } from "./AssetLibrary";
import {
  derivePlatformProgressSummaries,
  PlatformProgress,
} from "./PlatformProgress";
import { ProductSourcePanel } from "./ProductSourcePanel";
import { Button, EmptyState, IconButton, Panel, SegmentedControl } from "./ui";

type LibraryTab = "facts" | "assets" | "progress";

export function filterLibraryProjects(
  projects: readonly ProductProject[],
  query: string,
): ProductProject[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sorted = [...projects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  if (!normalizedQuery) return sorted;
  return sorted.filter((project) =>
    [project.name, project.facts.productName, project.facts.category]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}

export function LibraryView({
  projects,
  activeProject,
  assets,
  sessions = [],
  runs = [],
  loading,
  initialTab = "facts",
  onCreate,
  onSelectProject,
  onOpenWorkflow,
  onSave,
  onRemoveProject,
  onUpload,
  onRemove,
  onDirtyChange,
}: {
  projects: ProductProject[];
  activeProject: ProductProject | null;
  assets: WorkbenchAsset[];
  sessions?: PlatformSession[];
  runs?: ProductionRun[];
  loading: boolean;
  initialTab?: LibraryTab;
  onCreate: () => void;
  onSelectProject: (id: string) => void;
  onOpenWorkflow: (projectId: string, workflowId: PlatformWorkflowId) => void;
  onSave: (input: UpdateProductProjectInput) => Promise<boolean>;
  onRemoveProject: (id: string) => Promise<boolean>;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab);
  const [projectMenuOpen, setProjectMenuOpen] = useState<string | null>(null);
  const referenceAssets = assets.filter((asset) => asset.metadata.kind === "reference");
  const sortedProjects = filterLibraryProjects(projects, searchQuery);

  const firstRun = projects.length === 0;

  return (
    <div className="library-view">
      <div className="library-toolbar">
        <div className="library-toolbar__title-block">
          <h1>资料库</h1>
          <span>共享商品资料与参考素材</span>
        </div>
      </div>

      {firstRun ? (
        <Panel title="商品信息管理" className="library-first-run-panel">
          <EmptyState
            variant="setup"
            eyebrow="工作起点"
            icon={<FolderOpen size={24} />}
            title="先建立一份商品档案"
            description="这里保存各个平台共用的商品事实。完成后，再上传参考图并进入淘宝 / 天猫或 Amazon 工作区。"
            details={
              <ul className="empty-state__checklist">
                <li><Check size={15} />商品名称、品牌、品类与规格</li>
                <li><Check size={15} />主视图、细节、包装或使用场景</li>
                <li><Check size={15} />可被平台文案和 Prompt 引用的真实卖点</li>
              </ul>
            }
            action={<Button onClick={onCreate}><Plus size={16} />新建商品</Button>}
          />
        </Panel>
      ) : (
        <div className="library-layout">
          <Panel
            title="商品档案"
            className="library-list-panel"
            action={
              <div className="library-list-panel__actions">
                <span className="library-count">{projects.length}</span>
                <IconButton label="新建商品" disabled={loading} onClick={onCreate}>
                  <Plus size={17} />
                </IconButton>
              </div>
            }
          >
            <label className="library-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="搜索商品"
                type="search"
                placeholder="搜索商品或品类"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="library-search__clear"
                  aria-label="清除搜索"
                  title="清除搜索"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="library-project-list" role="list">
              {sortedProjects.length === 0 ? (
                <EmptyState
                  variant="selection"
                  icon={<Search size={22} />}
                  title="没有匹配的商品"
                  description="换一个商品名或品类关键词。"
                  action={
                    <Button variant="secondary" size="compact" onClick={() => setSearchQuery("")}>
                      清除搜索
                    </Button>
                  }
                />
              ) : sortedProjects.map((project) => {
                const selected = project.id === activeProject?.id;
                return (
                  <div
                    key={project.id}
                    role="listitem"
                    className={`library-project-card${selected ? " library-project-card--selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="library-project-card__select"
                      aria-pressed={selected}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <strong>{project.name}</strong>
                      <span>
                        {project.facts.productName || "未填商品名称"}
                        {project.facts.category ? ` · ${project.facts.category}` : ""}
                      </span>
                    </button>
                    <div className="library-project-menu">
                      <IconButton
                        label={`更多：${project.name}`}
                        aria-expanded={projectMenuOpen === project.id}
                        disabled={loading}
                        onClick={() =>
                          setProjectMenuOpen((open) => open === project.id ? null : project.id)
                        }
                      >
                        <MoreHorizontal size={17} />
                      </IconButton>
                      {projectMenuOpen === project.id ? (
                        <div className="library-project-menu__popover" role="menu">
                          <Button
                            variant="danger"
                            size="compact"
                            role="menuitem"
                            disabled={loading}
                            onClick={() => {
                              void onRemoveProject(project.id).finally(() =>
                                setProjectMenuOpen(null),
                              );
                            }}
                          >
                            <Trash2 size={14} />
                            删除商品
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="library-detail">
            {activeProject ? (
              <section className="library-detail-frame" aria-label={`档案详情：${activeProject.name}`}>
                <header className="library-detail-frame__header">
                  <div className="library-detail-frame__identity">
                    <span>当前档案</span>
                    <h2>{activeProject.name}</h2>
                  </div>
                  <SegmentedControl
                    ariaLabel="资料库详情"
                    className="library-tabs"
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                      { value: "facts", label: "商品资料" },
                      { value: "assets", label: "参考素材" },
                      { value: "progress", label: "平台进度" },
                    ]}
                  />
                </header>
                <div className="library-tab-content">
                  {activeTab === "facts" ? (
                    <ProductSourcePanel
                      project={activeProject}
                      assets={referenceAssets}
                      loading={loading}
                      showAssets={false}
                      onDirtyChange={onDirtyChange}
                      onSave={onSave}
                      onUpload={onUpload}
                      onRemove={onRemove}
                    />
                  ) : null}
                  {activeTab === "assets" ? (
                    <Panel title="参考素材" className="library-assets-panel">
                      <AssetLibrary
                        assets={referenceAssets}
                        loading={loading}
                        onUpload={onUpload}
                        onRemove={onRemove}
                      />
                    </Panel>
                  ) : null}
                  {activeTab === "progress" ? (
                    <Panel title="平台进度" className="library-progress-panel">
                      <PlatformProgress
                        summaries={derivePlatformProgressSummaries(
                          activeProject.id,
                          sessions,
                          runs,
                        )}
                        loading={loading}
                        onOpenWorkflow={(workflowId) =>
                          onOpenWorkflow(activeProject.id, workflowId)
                        }
                      />
                    </Panel>
                  ) : null}
                </div>
              </section>
            ) : (
              <Panel title="资料详情">
                <EmptyState
                  variant="selection"
                  icon={<FolderOpen size={24} />}
                  title="选择一份商品档案"
                  description="从左侧档案列表选择后，这里会显示商品事实和参考素材。"
                />
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
