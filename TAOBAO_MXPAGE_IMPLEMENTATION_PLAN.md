# 架构解耦、统一历史、淘宝功能与一致性治理实施计划

> 状态：任务 14–23 已完成 · 阶段 A、B、C 均已通过检查点（2026-07-21）
> 编写日期：2026-07-21
> 前置基线：`CROSS_PLATFORM_AIS_IMPLEMENTATION_PLAN.md` 任务 1–13 已完成；本计划只承接任务 14–23。
> 淘宝行为参考：`ziguishian/MxPage@188477164e81b6c323b73e6397980c7077ba2140`
> 实现方式：行为参考，不复制 MxPage 源码；继续保留 Ecom 自有 React/Vite/Zustand、本地优先存储和共享 UI 原语。

## 1. 目标

在不破坏 Amazon Listing/A+ 已完成行为对齐的前提下，完成三层领域边界的真正落地，并把淘宝/天猫从“平台入口和旧 rule pack”推进为可独立使用的商品素材生产工作流。

最终用户闭环：

```text
共享商品事实与参考素材
→ 选择平台工作流
→ 创建独立 PlatformSession
→ 商品分析与页面规划
→ 按槽位生成、编辑、切换版本
→ 统一 ProductionRun 历史恢复、复用和重导出
→ 淘宝手机商品页预览与部分/完整交付
```

## 2. 本阶段执行边界

阶段 A（任务 14–16）、阶段 B（任务 17–21）和阶段 C（任务 22–23）均已于 2026-07-21 完成。阶段 A 先完成多平台可复用的持久化、写入和历史查询基础；阶段 B 在此基础上完成淘宝商品生产 workflow；阶段 C 完成跨平台治理、文档和最终回归。

## 3. 已确认的架构硬约束

### 3.1 三层对象职责

- `ProductProject` 只拥有共享商品事实和项目级参考素材。
- `PlatformSession` 只拥有某个商品、平台、workflow 的当前可编辑状态。
- `ProductionRun` 拥有一次生产尝试的独立不可变快照和事件历史，不依赖当前 session 继续存在。

### 3.2 Workspace V3

`Workspace V3` 只保存当前 session 集合和迁移元数据：

```ts
WorkspaceV3 = {
  version: 3,
  projectId,
  currentSessions,
  migration,
  updatedAt,
}
```

V3 不保存 `runs`、`taskHistory`、顶层 `plans`、顶层 `slotVersions` 或 `amazonWorkspaces` 镜像。`Workspace V2` 保留原始读写和数据结构，不覆盖、不删除。

### 3.3 独立 RunRepository

ProductionRun 迁入独立 IndexedDB `RunRepository`，至少提供：

```ts
get(runId)
put(run)
remove(runId)
removeProject(projectId)
query(filters, cursor?, limit = 50)
```

分页使用 `updatedAt + id` 稳定游标。默认每页 50 条。历史图片只在 run 展开时读取，筛选、折叠和卸载时释放 object URL。

### 3.4 迁移和一致性

- v2→v3 迁移必须幂等。
- 所有旧 runs 成功写入 RunRepository 后才能写 `migration.completed`。
- 迁移失败可重试，不能留下“已完成但 runs 不完整”的状态。
- `TaskRecord` 停止新写入；旧 TaskRecord 保留为旧数据，不伪造为 ProductionRun。
- 跨 Project/Asset/Workspace/Run 写入失败时按逆序补偿，并保留定点恢复入口。
- 生成素材临时清理失败继续使用 `pending-cleanup` 标记，不静默丢失错误。

## 4. 平台边界

平台 Registry 登记：

- Amazon Listing
- Amazon A+
- 淘宝商品生产包

平台模块负责平台输入、规则、阶段判定和导出语义；生成、版本、合规、历史和导出只消费公共接口，不建立大型插件系统或任意 JSON schema。

旧 `taobao-detail` 读取时映射为 `taobao-product`，新写入统一使用 `taobao-product`。Amazon Listing 和 A+ 继续使用独立 session。

## 5. 执行与验证规则

每个任务按以下循环执行：

1. 读取任务目标、边界、文件和验收标准。
2. 使用 TDD，先写一个外部可观察行为的失败测试并确认红灯原因正确。
3. 写最小实现，确认聚焦测试转绿。
4. 运行 `pnpm check:ui`、`pnpm typecheck` 和任务聚焦测试。
5. 使用 review 做需求审查和工程审查；跨模块任务增加独立复测。
6. 立即更新本计划对应任务的执行记录、状态和验证证据。

可见体验、一致性治理和工程运行分别下结论。可见变化继续遵守 `UI_STYLE_GUIDE.md`、单一顶层 `:root`、`src/components/ui.tsx` 共享原语和浏览器断点 `1600/1280/1100/900/899`。

## 6. 任务分解

### 任务 14：Workspace V3 与独立 ProductionRunRepository

目标：建立 V3 Workspace 和独立 IndexedDB RunRepository，完成 v2→v3 幂等迁移，并证明 run 不依赖 session 存在。

主要文件：

- `src/domain/workspace/project-workspace.ts`
- `src/domain/workspace/*`
- 新建 `src/domain/runs/types.ts`
- 新建 `src/domain/runs/repository.ts`
- 新建 `src/domain/runs/migration.ts`
- `src/store/workbench-store.ts` 仅做最小接入
- 新建或更新 `tests/workspace-v3.test.ts`
- 新建 `tests/run-repository.test.ts`
- 新建 `tests/run-migration.test.ts`

行为测试：

- V3 载入时不返回 runs、taskHistory 或顶层镜像字段。
- v2 文档中的所有合法 runs 成功写入 RunRepository 后才标记迁移完成。
- 相同 v2 文档重复迁移不会产生重复 run，也不会重复事件。
- 中途写入失败时不标记完成，下一次可以从未完成状态重试。
- 迁移保留 v2 原文；删除当前 session 后仍可通过 RunRepository 读取 run。
- query 默认每页 50 条，使用稳定游标返回下一页，不重复、不遗漏。

实现顺序：

1. 先定义 V3 文档、迁移状态和 RunRepository 公共类型。
2. 用 fake IndexedDB 实现 put/get/remove/removeProject/query。
3. 将旧 Workspace V2 读取归一化为迁移输入，不修改 V2 原文。
4. 采用“写 run → 校验可读 → 最后写 completed”顺序实现幂等迁移。
5. 为旧 workflow `taobao-detail` 提供读取映射，保持旧历史可见。
6. 将 V3 repository 接入启动恢复，但暂不全面改造 Store 写入。

完成标准：

- V3 不再以 Workspace 作为历史数据库。
- 迁移成功、失败、重复执行和 session 删除场景均有专项测试。
- Run 分页查询有稳定排序、过滤和边界证据。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/workspace-v3.test.ts`、`tests/run-repository.test.ts` 和 `tests/run-migration.test.ts` 首次分别命中缺少 V3 repository、缺少独立 RunRepository 和缺少迁移协调器；均确认是预期红灯。
- 实现：新增 `workspace-v3.ts`、`runs/repository.ts`、`runs/migration.ts`；V3 仅保存 currentSessions/migration/updatedAt，RunRepository 独立使用 IndexedDB，支持 get/put/remove/removeProject/query；v2→v3 迁移在所有 run 写入并回读确认后才标记 completed，重复迁移幂等，v2 原文不改写。
- 边界修复：补充孤立 run 迁移测试后发现 v2 归一化错误依赖 sessionId，已移除该过滤，确保 ProductionRun 不依赖当前 session 存在。
- 聚焦验证：`pnpm exec vitest run tests/workspace-v3.test.ts tests/run-repository.test.ts tests/run-migration.test.ts tests/workspace-v2.test.ts tests/workspace-document.test.ts`，5 个文件、16 项通过；`pnpm check:ui` 通过；`pnpm typecheck` 通过。
- review：范围假设审查，范围为任务 14 新增 V3/Run/迁移模块及 workspace 归一化；需求与工程审查未发现严重或主要问题。独立复测复现并修复“孤立 run 在迁移入口被丢弃”，修复后无结论偏差。

### 任务 15：Store 与应用写入解耦

目标：将 Store 收敛为请求状态、取消、错误、恢复和 UI facade；session/run 拼装进入应用用例和纯 mutation。

稳定用例边界：

```ts
startSession
commitAnalysis
commitPlan
updateSlot
commitVersion
activateVersion
appendRunEvent
forkRun
```

主要文件：

- 新建 `src/application/*`
- 新建 `src/domain/workspace/mutations.ts`
- 新建或整理 `src/domain/runs/mutations.ts`
- 重构 `src/store/workbench-store.ts`
- 更新 `tests/planning-store.test.ts`
- 更新 `tests/generation-store.test.ts`
- 新建 `tests/application-mutations.test.ts`
- 新建 `tests/repository-compensation.test.ts`

行为测试：

- 用例按 sessionId/runId 更新，不再由 Store 多处手工同步 workspace 镜像。
- `commitPlan` 创建独立 run 快照；旧 run 保留，当前 session 只指向新 run。
- `commitVersion` 成功时先持久化资产和 run/session 变更，失败时按逆序补偿。
- workspace 写入失败时可定位恢复；资产清理失败会留下 pending-cleanup 标记。
- 新写入不产生 TaskRecord；旧 TaskRecord 仍可读取但不被转换为 run。
- fork 不改写来源 run，也不依赖来源 session 当前仍存在。
- 项目删除按 runs/assets/workspace/项目元数据顺序执行；中途失败时项目保持可见并可重试。

实现顺序：

1. 把现有写入动作抽成纯 mutation，并用现有领域类型作为输入输出。
2. 以 Repository 接口注入持久化依赖，应用用例负责协调多个仓库。
3. Store 保留 loading、AbortController、错误、恢复标记和 facade，不再构造历史镜像。
4. 将规划、生成、编辑、导出和 fork 的写入逐个迁移，保持 Amazon 行为不变。
5. 每迁移一个行为立即跑对应专项测试和全局类型检查。

完成标准：

- Store 不再拥有跨仓库写入编排的业务细节。
- Amazon Listing/A+ 规划、生成、版本、遮罩、fork、历史重导出全部回归通过。
- 跨仓库失败有逆序补偿和可见恢复状态。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/repository-compensation.test.ts` 首次命中缺少应用持久化适配器；`tests/task-record-retirement.test.ts` 首次证明规划仍追加 TaskRecord；`tests/project-delete-compensation.test.ts` 首次证明项目元数据在资产清理前被删除；`tests/application-mutations.test.ts` 首次命中缺少纯 mutation 模块。
- 实现：新增 `application/workspace-persistence.ts` 和 `application/production-mutations.ts`；默认浏览器依赖切换到 V3 Workspace + 独立 RunRepository；`startSession/commitAnalysis/commitPlan/updateSlot/commitVersion/activateVersion/appendRunEvent/forkRun` 建立纯 mutation 边界，Store 的首次 session、策划、槽位更新、生成/遮罩版本、版本激活、fork 和导出事件均已接入；TaskRecord 停止新写入；项目删除把项目元数据删除延后到 runs/assets/workspace 清理之后。
- 补偿：应用持久化适配器按 Run → V3 的逆序恢复，补偿步骤彼此独立执行；补偿失败抛出 `RepositoryRecoveryError` 并带 recoveryRequired；已有版本/资产失败回归保持旧版本和可重试状态。
- 聚焦验证：任务 15/16 联合相关测试 9 个文件、47 项通过；新增 TaskRecord 退役、项目删除恢复和 mutation 测试；`pnpm check:ui` 通过；`pnpm typecheck` 通过。
- review：范围假设审查覆盖应用持久化、Store 写入路径、删除流程和 Amazon 规划/生成/导出/历史回归；需求与工程审查未发现严重或主要问题。修复了更新已有 run 可能被旧快照覆盖的审查风险，并补充全项目历史迁移 prepare。

### 任务 16：平台 Registry 与统一历史查询

目标：统一平台 workflow 注册和历史查询服务，让历史页只消费 Run 查询结果，不遍历 workspace。

主要文件：

- `src/domain/platforms/types.ts`
- `src/domain/platforms/registry.ts`
- 新建 `src/domain/history/query.ts`
- 新建 `src/domain/history/types.ts`
- `src/components/TaskHistory.tsx`
- `src/components/ProductionHistoryFilters.tsx`
- 更新 `tests/platform-registry.test.ts`
- 更新 `tests/production-history.test.ts`

行为测试：

- Registry 可返回 Amazon Listing、Amazon A+、淘宝商品生产包的 label、输入能力、规则解析和阶段判定。
- 旧 `taobao-detail` 只在读取层映射，新写入为 `taobao-product`。
- 统一历史查询支持商品、平台、workflow、来源、状态和时间范围筛选。
- 历史列表使用 RunRepository 分页查询，UI 不直接扫描 workspace。
- 查询结果只带 run 摘要；展开详情才读取事件和图片，折叠/卸载释放 object URL。
- 平台模块决定槽位和阶段，公共历史层不写平台分支判断。

实现顺序：

1. 将 workflow 元数据和平台能力收敛到 Registry。
2. 定义 `HistoryQueryService`，封装分页、筛选和摘要映射。
3. 将生产记录页面切换到统一查询服务，保留现有 UI 结构和文案层级。
4. 接入历史懒加载、展开状态和 object URL 生命周期管理。
5. 增加 Amazon 与淘宝混合历史回归。

完成标准：

- 历史页可查询三种 workflow，默认分页 50 条。
- 不改变 Amazon 页面结构、文案和视觉层级。
- UI 治理检查和浏览器断点检查通过。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/platform-registry.test.ts` 首次命中缺少统一 workflow Registry 和 HistoryQueryService；`tests/history-asset-urls.test.ts` 首次命中缺少历史图片 URL 生命周期 helper。
- 实现：Registry 登记 Amazon Listing、Amazon A+、淘宝商品生产包；旧 `taobao-detail` 只在读取层映射为 `taobao-product`，Store 新写入统一使用 `taobao-product`；新增 `HistoryQueryService`，历史页默认通过 RunRepository 分页查询，默认每页 50 条，首次查询 prepare 全部项目的 v2→v3 数据；生产记录不再在正常 App 路径遍历 workspace。
- 懒加载：新增 `history/asset-urls.ts` 并接入 `TaskHistoryArchive`，图片只在展开 run 时读取，折叠、筛选、卸载时释放 object URL；缺失资产不影响 run 摘要和筛选。
- 聚焦验证：平台 Registry/统一历史测试、历史 URL 生命周期测试、生产记录和资料库回归通过；`pnpm check:ui` 通过；`pnpm typecheck` 通过。
- review：范围假设审查覆盖 Registry、workflow 兼容映射、HistoryQueryService、TaskHistoryArchive 和 UI 筛选；需求与工程审查未发现严重或主要问题。独立复测确认旧淘宝 run 在第二页仍能映射为新 workflow，prepare 只执行一次。

## 7. 阶段 A 检查点

阶段 A 必须完成任务 14–16 的任务级验证，并执行：

```bash
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

专项验证必须覆盖：

- v2→v3 重复迁移和失败重试。
- Amazon Listing/A+ session 恢复、fork、版本和历史重导出。
- ProductionRun 分页、筛选、懒加载和 object URL 释放。
- 跨仓库失败补偿、pending-cleanup 和定点恢复。
- `1600/1280/1100/900/899` 浏览器断点、无横向溢出、无固定操作区遮挡。

检查点 A 的三条结论分别记录：

1. 用户体验：历史和恢复工作流是否可发现、可理解、可完成。
2. 一致性治理：是否继续使用唯一视觉合同、共享原语和既有页面壳。
3. 工程运行：类型、测试、构建、存储迁移和浏览器验证是否通过。

只有三条结论和专项证据齐全，才能声明阶段 A 完成；完成后暂停，不执行任务 17–23。

检查点 A 执行记录（已通过 · 2026-07-21）：

- 完成范围：任务 14–16；任务 17–23 保持待执行，未提前实现淘宝页面、分析、规划、逐图生产、手机预览或最终治理收口。
- 数据迁移：Workspace V3 与独立 RunRepository 已落地；v2 原文保留；重复迁移、写入失败不标记 completed、孤立 run、稳定分页、筛选和项目级删除专项通过。
- Amazon 回归：Listing/A+ 独立恢复、首次输入、规划、生成/重生成、不可变版本、版本激活、遮罩编辑、fork、历史复用和历史重导出专项通过；陈旧版本继续按输入签名、Prompt 和可见文案判定，不误算 ready。
- 用户体验结论：通过。真实浏览器覆盖资料库、Amazon Listing/A+、生产记录筛选/展开/空态、设置和失败恢复；`1600/1280/1100/900/899` 无横向溢出，固定操作区和滚动所有权无回归。
- 一致性治理结论：呈现结果通过、实现机制通过、阶段 A 治理落地通过。`UI_STYLE_GUIDE.md` 仍是唯一视觉合同；`styles.css` 仍只有一个顶层 `:root`；未新增第二套按钮、Panel、状态色或页面壳；历史页继续消费共享 UI 原语。
- 工程运行结论：通过。`pnpm check:ui`、`pnpm typecheck`、`pnpm test`（65 个文件、360 项）、`pnpm build`、`pnpm test:browser` 全部通过；专项组合复测覆盖迁移、补偿、Amazon 和历史 URL 生命周期。
- review：项目无 Git 元数据，本轮为范围假设审查；范围固定为任务 14–16 新增/修改的 application、workspace、runs、history、registry、Store、历史 UI、测试和三份领域文档。需求审查与工程审查均无未处理的严重或主要问题。
- 独立复测偏差：浏览器复测发现并修复两个异步等待竞态和统一查询后的筛选空态回归；审查发现并修复孤立 run 过滤、跨仓库补偿继续执行、全项目首次历史迁移和陈旧版本完成度判定。最终主执行与复测结论无剩余偏差。
- 剩余风险：主 JS 558.85 kB 继续触发现有非阻断体积警告；浏览器烟测仍记录既有 404 资源提示；真实外部 Provider、实际用户大体量历史和 Seller Central 最终审核不在本地确定性范围。

## 8. 阶段 B–C 执行记录

### 任务 17：淘宝/天猫导航与 workflow 对齐

以 MxPage 行为为参考，建立淘宝商品生产包的入口、workflow 标识、独立 session 和页面上下文；不改变 Amazon 页面结构、文案和视觉层级。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/taobao-workflow.test.ts` 首次调用淘宝入口时命中 `startTaobaoSession is not a function`，确认当前实现缺少独立淘宝 session facade。
- 实现：新增 `startTaobaoSession`，统一创建/恢复 `taobao-product` session；导航进入淘宝和初始恢复时幂等启动草稿 session；淘宝 session 通过 `PlatformWorkspace` 独立传入，不回退 Amazon workflow。
- 数据边界：启动草稿只写 Workspace 的 session 集合，不创建 ProductionRun、不写 TaskRecord、不修改 ProductProject 共享事实；已有淘宝计划、版本和 activeRunId 会被保留。
- 聚焦验证：`pnpm exec vitest run tests/taobao-workflow.test.ts tests/platform-navigation.test.ts tests/library-workflow.test.ts`，3 个文件、7 项通过；`pnpm check:ui` 通过；`pnpm typecheck` 通过。
- review：项目无 Git 元数据，本轮为范围假设审查；范围覆盖淘宝入口、Store session facade、App 导航恢复和相关合同测试。需求审查与工程审查未发现严重或主要问题。
- 一致性结论：沿用现有导航、工作区壳、`PlatformWorkspace` 和共享 UI 原语；淘宝状态标识改为“商品生产包”，未新增 Token、按钮、Panel 或页面壳。

### 任务 18：淘宝商品分析输入

完成商品图/资料输入、商品事实引用、卖点/规格/禁用声明分析和可解释分析结果；分析只产出 session 草稿，不静默改写共享商品事实。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/taobao-workflow.test.ts` 首次导入 `taobao-analysis` 时失败，确认缺少独立淘宝商品分析接口。
- 实现：新增纯 `analyzeTaobaoProduct`，解析商品名称、卖点、规格和禁用声明，并合并共享商品事实；结果包含 `shared-product`、`analysis-input`、`reference-asset` 来源记录、缺失事实和风险提示。
- session 边界：新增 `analyzeTaobaoProduct` 应用 facade 和 `commitAnalysis` 持久化；商品文本、选中参考图和分析结果只写当前 `taobao-product` session，分析后、reload 后及 commitPlan/run context snapshot 中均可恢复，不调用 ProductRepository 更新。
- 可见体验：新增淘宝准备态和分析摘要，支持补充资料文本、已有商品图勾选和新图片输入；分析摘要展示卖点、规格、禁用声明、缺失项、参考图及可展开来源记录。
- 聚焦验证：`tests/taobao-workflow.test.ts`、`tests/taobao-intake.test.ts`、workspace/application/run-export 相关回归共 5 个文件、19 项通过；补充规划后分析快照仍保留的专项断言；`pnpm check:ui`、`pnpm typecheck` 通过。
- review：范围假设审查覆盖分析纯函数、session/run context、Store facade、淘宝准备态与样式。需求与工程审查未发现严重或主要问题；图片上传失败会终止分析，不保留“输入已完整”的错误状态。
- 一致性结论：继续复用共享 `Panel`、`Field`、`Button`、`StatusChip`、`StatusMessage` 与现有页面壳；未新增 Token、按钮或状态色。

### 任务 19：淘宝详情页规划与固定 Rule Pack

实现 5 张主图、7 张详情图的页面规划、槽位规则、顺序、尺寸、Prompt 和合规提醒；详情结构以固定 Rule Pack 为主，不由 AI 动态增删模块。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：淘宝分析后规划首图仍使用共享事实中的旧商品名，`tests/taobao-workflow.test.ts` 预期“旅行颈枕 Pro”时实际得到“云感旅行颈枕”，确认 session 分析没有进入 planner。
- 实现：新增共享 `applyTaobaoAnalysisToFacts`，Store 与 UI freshness 使用同一份“共享事实 + session 分析”规划输入；淘宝 plan 和 input signature 均基于该输入，ProductProject 本身保持不变。
- 固定 Rule Pack：继续由 `taobaoRulePack` 和 `normalizePlatformPlan` 强制 12 个必需槽位，顺序固定为 5 张 `800×800` 主图和 7 张 `750×1000` 详情图；缺失、重复或未知槽位继续直接拒绝，AI 无法动态增删模块。
- 可见体验：淘宝工作区新增固定图组摘要和独立策划动作，明确展示“5 张主图 + 7 张详情图”；空态与下一步文案不再引用 Amazon Listing/A+。
- 聚焦验证：淘宝分析/工作流、Rule Pack、normalizer、Demo/OpenAI planner 共 5 个文件、50 项通过；`pnpm check:ui`、`pnpm typecheck` 通过。
- review：范围假设审查覆盖规划输入、签名 freshness、固定槽位规范化、淘宝工作流提示和 Planner 回归。需求与工程审查未发现严重或主要问题；Amazon 规则解析、页面结构、文案和视觉层级未改变。
- 一致性结论：固定图组提示复用既有工作流 band、`StatusChip` 和按钮层级；未创建第二套规划页面或组件体系。

### 任务 20：淘宝逐图生产、编辑与版本

复用公共生成/编辑/版本接口，完成逐槽生成、重生成、遮罩、版本切换、失败恢复和历史复用。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/taobao-workflow.test.ts` 通过淘宝 session 选择 `TB-HERO-02` 时返回 `false`，确认 `selectSessionSlot` 和 `generateSessionSlot` 仍硬编码 Amazon。
- 实现：session 槽位选择与生成 facade 改为平台通用；Amazon 继续执行 Listing/A+ 当前模式校验，淘宝校验当前 `taobao-product` session；生成只读取该 session 的参考图和分析合并商品名。
- 生产闭环：淘宝支持逐槽生成、Prompt/可见文案保存、同槽重生成、不可变版本列表、活动版本切换和遮罩编辑；App 已为淘宝接入与 Amazon 相同的图片编辑能力检测、遮罩入口和失败提示。
- 历史与恢复：版本提交继续通过 `commitVersion/activateVersion` 更新 session 与独立 ProductionRun 事件；失败、取消、回滚、pending-cleanup、历史复用和 fork 继续消费公共路径，不新增 TaskRecord。
- 聚焦验证：淘宝工作流、generation store、planning store、current-version、mask 和 production-history 共 6 个文件、43 项通过；专项断言覆盖 `generate/regenerate/edit`、旧版保留、版本激活和 run 事件；`pnpm check:ui`、`pnpm typecheck` 通过。
- review：范围假设审查覆盖 Store session facade、freshness、生成上下文、版本 mutation、遮罩 UI 接线和相关共享回归。需求与工程审查未发现严重或主要问题；Amazon 模式校验和页面结构保持不变。
- 一致性结论：淘宝复用现有 `SlotBoard`、`SlotInspector`、`MaskEditorDialog`、版本控件和状态反馈，未复制第二套逐图生产 UI。

### 任务 21：淘宝手机商品页预览与导出

实现手机商品页整页预览、单图/整包导出、缺失槽位提示和历史 run 重导出；预览只消费当前 session 或历史 snapshot。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：`tests/taobao-preview.test.ts` 首次导入 `taobao-preview` 时失败，确认缺少可同时消费 session/run snapshot 的淘宝预览模型。
- 预览模型：新增 `createTaobaoPreviewModel`，固定输出 5 个主图位和 7 个详情位；只将匹配 plan/input signature/Prompt/文案且资产 URL 可读的活动版本计为完成，缺图保留槽位占位并列出 missingSlots。
- 当前与历史：当前工作区预览读取 `PlatformSession` plan/slotVersions；生产记录预览读取 `ProductionRun.planSnapshot/slotVersionsSnapshot`。历史折叠时自动关闭预览，继续沿用统一历史懒加载和 object URL 释放生命周期。
- 可见体验：新增手机商品页 Dialog、5 图切换、7 张详情纵向预览、缺失槽位提示、单图下载和部分/完整整包导出；历史卡片提供手机预览和重新导出入口。
- 导出结果：淘宝当前部分包和历史 run 重导出均返回 12 槽 manifest、`taobao-product` run context 和准确 missingSlots；遮罩编辑版本修复为以当前槽位 Prompt 判定 freshness，并把本次编辑指令保存在 `parameters.editPrompt`。
- 聚焦验证：淘宝 preview/workflow、run-export、export-store、production-history、history URL 生命周期共 6 个文件、17 项通过；修复后 generation/current/export/preview 组合 6 个文件、33 项通过；`pnpm check:ui`、`pnpm typecheck` 通过。
- 浏览器验证：`pnpm test:browser` 通过，覆盖淘宝分析、固定 12 槽、生成首图、手机预览、缺 11 槽提示及 `1600/1280/1100/900/899` 断点；证据 `artifacts/cross-platform-ais/taobao-mobile-preview-1280.png` 已人工复核，无重叠或横向溢出。
- review：范围假设审查覆盖 preview model/Dialog、当前/历史接线、导出 facade、object URL 生命周期和浏览器证据。需求与工程审查未发现严重或主要问题。
- 一致性结论：复用共享 `Dialog`、`MediaSlot`、`Button`、`IconButton`、`StatusChip`、`StatusMessage`；手机框是实际预览工具，不是第二套页面壳，未新增 Token 或状态色。

### 任务 22：跨平台一致性治理与体验收尾

对淘宝、Amazon、资料库、历史页和设置执行统一壳、Token、共享组件、状态、动作层级、滚动和断点治理；体验、治理和工程分别验收。

状态：已完成 · 2026-07-21

执行记录：

- TDD 红灯：新增 `tests/ui-style-contract.test.ts` 的未声明 Token 和统一生产壳契约；首次分别发现 `--border-subtle`、`--surface-raised`、`--accent`、`--surface-subtle`、`--surface-muted` 未在唯一 `:root` 中声明，以及生产工作台壳仍只挂在 Amazon 选择器上，均为预期红灯。
- 实现：将生产记录样式中的未定义变量收敛到现有 `--border`、`--surface`、`--primary`、`--surface-soft`；将固定高度、列内滚动和工作台面板边界选择器统一为 `platform-workspace-view--production-shell`，Amazon 与淘宝共同使用，Amazon 顶栏、页面结构、文案和视觉层级保持不变。
- 共享原语审计：资料库、生产记录、设置和淘宝新增界面继续使用 `ui.tsx` 的 `Button`、`Panel`、`Field`、`Select`、`SegmentedControl`、`StatusChip`、`StatusMessage`、`Dialog`、`MediaSlot` 和 `ActionBar`；未新增第二套按钮、Panel、状态色、页面壳或 Token，`styles.css` 仍只有一个顶层 `:root`。
- 体验治理：浏览器验证覆盖 `1600/1280/1100/900/899`；确认淘宝生产列、Amazon 检查器固定操作区、历史卡片和手机预览无横向溢出、文字裁切或操作区遮挡。证据更新至 `artifacts/cross-platform-ais/taobao-mobile-preview-1280.png`、`amazon-compact-900.png`、`production-history-1280.png`。
- 聚焦验证：`pnpm exec vitest run tests/ui-style-contract.test.ts tests/platform-workspace-contract.test.ts tests/taobao-intake.test.ts tests/production-history.test.ts`，4 个文件、25 项通过；`pnpm check:ui` 通过；`pnpm typecheck` 通过；`pnpm test:browser` 通过。浏览器仅保留既有 404 资源提示，无新增运行时错误。
- review：项目无 Git 元数据，本轮为范围假设审查；需求审查覆盖任务 22 的统一页面壳、Token、共享组件、Amazon 不变和断点验收，工程审查覆盖 CSS Token 引用、组件原语、滚动所有权、固定操作区和契约测试。未发现严重或主要问题；未处理项仅为已知体积警告、404 资源提示和外部服务未接入风险。
- 三条结论：用户体验通过；一致性治理机制和呈现结果通过；工程运行通过。任务 23 继续负责文档最终收口和全量专项回归。

### 任务 23：最终文档、专项回归与交付收口

更新产品规格、ADR、UI 规范、淘宝计划和验证索引；完成 Amazon 全量回归、淘宝主路径、迁移、历史、导出和浏览器证据收口。

状态：已完成 · 2026-07-21

执行记录：

- 文档收口：更新 `PROJECT_CONTEXT.md`、`PRODUCT_SPEC.md`、`UI_STYLE_GUIDE.md`、`docs/adr/0001-product-session-run-boundaries.md`、`AIS_ALIGNMENT_CHECKLIST.md` 和本计划；同步三层领域边界、`taobao-product` workflow、固定 5+7 Rule Pack、独立 RunRepository、TaskRecord 退役、统一生产壳和阶段 C 验收证据。未修改或覆盖 `CROSS_PLATFORM_AIS_IMPLEMENTATION_PLAN.md` 任务 1–13 历史记录。
- Amazon 回归：Listing/A+ 独立 session 恢复、站点/数量/模块、规划、生成/重生成、版本切换、遮罩、fork、历史复用和历史重导出继续通过；Amazon 页面结构、文案和视觉层级未改变。
- 淘宝回归：导航、分析输入、来源记录、固定 12 槽、逐图生成/编辑/版本、手机预览、缺失槽位、单图/部分/完整导出和历史重导出继续通过。
- 数据与历史回归：v2→v3 成功、失败重试和重复迁移通过；孤立 run 不依赖当前 session；RunRepository 分页/筛选、历史图片懒加载和 object URL 释放通过；新写入不产生 TaskRecord。
- 最终工程验证：`pnpm check:ui`、`pnpm typecheck`、`pnpm test`（74 个测试文件、387 项通过）、`pnpm build`、`VITE_BASE_PATH=/Ecom/ pnpm build`、`pnpm test:browser` 通过；浏览器断点覆盖 `1600/1280/1100/900/899`。主 JS 体积警告为非阻断项，浏览器仍有一个既有 404 资源提示。
- review：项目无 Git 元数据，本轮为范围假设审查；需求来源为任务 22–23、产品规格、ADR 和 UI 合同，工程范围为统一生产壳/Token 契约、最终文档及迁移/Amazon/淘宝/历史/导出回归。需求与工程审查未发现未处理的严重或主要问题；修正文档中的项目删除范围、淘宝验收覆盖和阶段 C 章节顺序后结论通过。
- 三条最终结论：用户体验通过；一致性治理通过；工程运行通过。外部 Provider、淘宝实际商家后台审核和大体量历史性能仍需真实环境验证。

## 9. 阶段 A 变更禁区（历史记录）

- 阶段 A 当时不执行任务 17–23；该边界已完成并保留为历史记录。
- 不删除或覆盖 `CROSS_PLATFORM_AIS_IMPLEMENTATION_PLAN.md` 任务 1–13 记录。
- 不改变 Amazon 当前页面结构、文案和视觉层级。
- 不把旧 TaskRecord 转成 ProductionRun。
- 不把 runs 或 history 镜像继续塞回 Workspace V3。
- 不创建第二套按钮、Panel、状态色或页面壳。
- 不执行 commit、branch、worktree 或任何 Git 操作；项目没有 Git 元数据。

## 10. 阶段 B 执行边界

- 当前只执行任务 17–21；任务 22–23 不提前实现。
- 淘宝新写入统一使用 `taobao-product`；旧 `taobao-detail` 只允许在读取层兼容。
- 一个淘宝 workflow 固定包含 5 张主图和 7 张详情图，AI 不得动态增删 Rule Pack 槽位。
- ProductProject 只保存共享商品事实；淘宝分析和规划结果写入独立 `PlatformSession` 草稿，再进入当前 session。
- 生产、版本、历史继续复用阶段 A 的公共接口和独立 `RunRepository`；不恢复 `TaskRecord` 新写入。
- Amazon 页面结构、文案和视觉层级保持不变。

## 11. 阶段 B 检查点

检查点 B 执行记录（已通过 · 2026-07-21）：

- 完成范围：任务 17–21；任务 22–23 保持待执行，未提前进行跨平台全局治理或最终文档收口。
- 架构结论：通过。淘宝新写入统一为 `taobao-product`；分析只写 PlatformSession 草稿，ProductProject 共享事实不被隐式改写；plan/version/event 继续写当前 session 与独立 ProductionRun，不恢复 TaskRecord；预览分别消费当前 session 或历史 run snapshot。
- 淘宝功能结论：通过。导航与独立 session、商品分析与来源记录、固定 5 张主图 + 7 张详情图、逐图生成/重生成/遮罩/版本切换、手机整页预览、单图下载、部分/完整整包导出和历史重导出均完成。
- Amazon 回归：通过。Listing/A+ 独立 session、输入、规划、生成、重生成、版本、遮罩、fork 和历史重导出专项 7 个文件、59 项通过；Amazon 页面结构、文案和视觉层级未调整。
- 用户体验结论：通过。浏览器主路径覆盖淘宝分析、固定 12 槽、首图生成、手机预览和缺失槽位提示；`1600/1280/1100/900/899` 无横向溢出，预览截图人工复核无空白、重叠或操作遮挡。
- 一致性治理结论：呈现结果通过、实现机制通过、阶段 B 局部治理通过。`UI_STYLE_GUIDE.md` 继续作为唯一视觉合同；`styles.css` 只有一个顶层 `:root`；所有新增界面复用 `ui.tsx` 共享原语，未创建第二套按钮、Panel、状态色或页面壳。
- 工程运行结论：通过。`pnpm check:ui` 通过；`pnpm typecheck` 通过；`pnpm test` 为 68 个文件、371 项通过；`pnpm build` 通过；`pnpm test:browser` 通过；架构/迁移/Amazon/淘宝/历史专项 10 个文件、34 项通过。
- review：项目无 Git 元数据，本轮为范围假设审查；范围固定为任务 17–21 修改的 App、Store、production mutations、workspace session/run context、淘宝分析/预览领域模块、淘宝 UI、历史卡片、样式、浏览器烟测和相关测试。需求审查与工程审查均无未处理的严重或主要问题。
- 独立复测偏差：复审发现并修复导航重复启动覆盖淘宝参考图选择、淘宝历史 fork 输入签名不一致、遮罩编辑版本误判 stale 三项问题；完整包专项补证 12/12 文件顺序、ready 状态和 TaskRecord 零写入。最终主执行与复测结论无剩余偏差。
- 剩余风险：主 JS 579.84 kB，继续触发现有非阻断体积警告，较阶段 A 增加约 21 kB；浏览器烟测仍记录既有 404 资源提示；真实外部 Provider、淘宝实际商家后台规则和大体量历史性能不在本地确定性验证范围。

## 12. 阶段 C 检查点

检查点 C 已通过（2026-07-21）：任务 22–23 完成，任务 1–23 全部完成。阶段 C 没有新增淘宝业务范围，没有改变 Amazon 页面结构、文案或视觉层级，也没有执行 Git 操作。
