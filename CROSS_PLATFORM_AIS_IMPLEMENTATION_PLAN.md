# 跨平台工作流重构与 AIS 核心对齐实施计划

> 状态：已完成（任务 1–13 与检查点 A–E 全部通过 · 2026-07-20）
> 编写日期：2026-07-20
> AIS 真相源：`Ali-Aria/amazon-image-studio@bca89d728e415c453db363dcba30ac8ea243edaf`
> 实现方式：行为对齐，保留 Ecom 自有 React/Vite 壳、平台规则包和本地优先架构

## 1. 目标

交付一个以共享商品资料为底座、以平台生产会话为工作单元、以生产记录为恢复入口的电商图片工作台；Amazon 页面使用阶段自适应流程，并补齐 AIS 对齐清单中的核心 P0、P1 与可达的遮罩/图片工具能力。

最终用户可观察闭环：

```text
共享商品资料与参考素材
→ 选择或直接开始 Amazon Listing / A+
→ 配置站点、数量/模块、尺寸和风格
→ 粘贴 Listing、上传参考图、AI 策划
→ 检查槽位、文案、Prompt 与合规提醒
→ 逐张生成、重生成、切换版本、局部编辑
→ 完整或部分交付
→ 在生产记录中按商品/平台/模式/状态筛选、恢复或复用
```

## 2. 背景与约束

- 当前底层已有平台无关 `ProductProject`、项目素材、按平台策划、不可变版本和任务记录，但界面职责没有真正解耦。
- 当前资料库被表现为强制“第一步”，Amazon 输入又直接写共享商品事实；任务历史按商品展示事件日志，无法表达一次完整生产过程。
- 当前 Amazon 功能虽大体具备，但被通用三栏 `PlatformWorkspace` 固定布局约束，流程状态还会在仅完成 1 个槽位时提前进入“交付”。
- 对齐以 AIS README 可达流程和 `AIS_ALIGNMENT_CHECKLIST.md` 为准，不做 AIS 像素级复刻。
- 历史商品、素材、策划、版本和任务均为测试数据，允许直接失效或清除；不实现 v1 业务数据迁移、双读或兼容 UI。
- `ecom-workbench.runtime-settings.v1` 中的 API/运行设置必须保留，不能因业务存储升级被清除。
- 保留 Demo 模式并明确标记；Demo 不得被展示为真实模型产物。
- 继续使用 React、Vite、Zustand、Lucide、IndexedDB/localStorage、现有 rule pack、planner/generator 服务和共享 UI 原语。
- 不改变账号、云同步、协作、计费、直接发布 Seller Central 等非目标范围。
- 不产品化 AIS 当前不可达的 Agent、网页搜索和批量生成入口。
- 产品继续按 `UI_STYLE_GUIDE.md` 的桌面工作台约束验收：首选 1100px 以上，最低 900px，899px 及以下显示桌面端门禁。

## 3. 推荐架构与领域边界

### 3.1 三层职责

1. **商品资料层**
   - 保存平台无关的真实商品事实与共享参考素材。
   - 不保存 Amazon 站点、Listing/A+、模块、Prompt 或生成进度。
   - 资料库是管理中心，但不再是进入 Amazon 的页面跳转硬门槛。

2. **平台生产会话层**
   - 一个商品按工作流拥有独立当前会话：`amazon-listing`、`amazon-aplus`、`taobao-detail`。
   - 保存平台输入、参数、选用素材、当前策划、槽位、版本、当前选择和新鲜度签名。
   - Amazon Listing 原文只属于 Amazon 会话；解析结果可用于首次建立商品事实，但不得静默覆盖已有共享事实。

3. **生产记录层**
   - 一次成功 AI 策划创建一个 `ProductionRun`；后续逐槽生成、重生成、局部编辑和导出归入同一 run。
   - 重新策划创建新 run，旧 run 保留为只读快照。
   - 生产记录默认按 run 展示，事件日志作为 run 的第二层详情。

### 3.2 计划中的核心接口

以下名称是实施计划的稳定目标；执行时只有发现与现有领域命名冲突才允许调整，并需同步本文件和测试：

```ts
type PlatformWorkflowId =
  | "amazon-listing"
  | "amazon-aplus"
  | "taobao-detail";

interface PlatformSession {
  id: string;
  projectId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  sourceInput: PlatformSourceInput;
  options: PlatformSessionOptions;
  selectedReferenceAssetIds: string[];
  plan?: PlatformPlan;
  planInputSignature?: string;
  selectedSlotKey?: string;
  slotVersions: Record<string, SlotVersionState>;
  activeRunId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductionRun {
  id: string;
  projectId: string;
  sessionId: string;
  platformId: PlatformId;
  workflowId: PlatformWorkflowId;
  source: "demo" | "api";
  status: "planned" | "producing" | "ready" | "partial" | "failed" | "canceled";
  contextSnapshot: PlatformRunContext;
  planSnapshot: PlatformPlan;
  events: ProductionEvent[];
  createdAt: string;
  updatedAt: string;
}
```

`PlatformSessionOptions` 使用平台判别联合类型，不建立通用 JSON 配置：Amazon 保存 marketplace、Listing 数量或 A+ 类型/模块、size tier、风格引用；淘宝保存其现有规则所需参数。

`ProductionEvent` 取代当前弱语义 `TaskRecord`，至少引用 `runId`、kind、status、slotKey、assetId、versionId、artifactFileName、missingSlots 和时间。旧 `batchId` 不继续承担伪批次语义。

### 3.3 存储切换

- 项目 localStorage key 升级为 `ecom-workbench.projects.v2`。
- 工作区 localStorage 前缀升级为 `ecom-workbench.workspace.v2.`。
- 素材 IndexedDB 使用新库名 `ecom-workbench-assets-v2`，不读取 v1 测试素材。
- 运行设置 key 保持 `ecom-workbench.runtime-settings.v1`。
- 最近平台偏好可保留；若指向不可达页面则回退 Amazon。
- 不在应用启动时扫描、搬运或删除 v1 数据；新版本直接忽略 v1，减少破坏性代码和迁移分支。

## 4. 页面与交互合同

### 4.1 资料库

屏幕合同：面向独立店铺经营者，资料库允许其管理一个商品的共享事实和参考素材，并查看/继续各平台生产进度，但不在这里编辑平台 Prompt。

- 顶部：搜索、最近使用/品类筛选、新建商品；不再显示“第一步”。
- 左侧：商品列表，显示商品名、品类、参考图数、最近更新时间；删除放入项目菜单并二次确认。
- 右侧：`商品资料`、`参考素材`、`平台进度`三个真实标签页。
- 平台进度以平台/工作流行展示状态、完成槽位数、最近 run 和“开始/继续制作”。
- Amazon 和淘宝入口消费同一商品与参考素材，但创建不同 `PlatformSession`。
- Generated 结果不混进共享参考素材列表；只在平台进度显示最近缩略图并链接到对应工作台/run。

### 4.2 Amazon 阶段自适应工作台

不是阻断式四步向导。用户可以回看资料和参数，但工作台根据状态改变主区域和唯一主动作。

1. **准备**：Listing/A+、站点、数量/模块、尺寸、Listing 原文、参考图、风格；主动作“生成图片策划”。
2. **策划检查**：槽位导航 + 当前槽位策略/文案/Prompt/合规；主动作“生成当前图片”。
3. **逐图生产**：槽位状态、当前大图与版本、Prompt/局部操作；主动作“生成下一张”或“重新生成”。
4. **交付检查**：仅全部必需槽位完成，或用户主动进入部分交付检查时出现；主动作“导出完整交付包”或“导出当前结果”。

阶段判定：

- 无 plan：`prepare`。
- 有 plan 且无有效当前版本：`review`。
- 有至少一个输出但未全部完成：`produce`，不得显示 4/4 交付。
- 全部必需槽位有当前有效版本：`deliver`。
- 部分导出是 `produce` 中的次级入口，不会改变阶段。

布局：

- 准备态使用聚焦的单/双区输入布局，不渲染空三栏。
- 策划和生产态：紧凑槽位导航、当前结果主舞台、Prompt/合规检查区；商品资料和参数进入抽屉或折叠摘要。
- A+ 模块编排在策划前与 A+ 类型相邻，不能藏在生成后的详情区。
- 同一决策范围只有一个 primary action；重新策划、历史、参数和部分导出为 secondary/quiet。
- 900–1099px 保留生产主任务，资料和参数走覆盖式抽屉；899px 以下保持桌面门禁。

### 4.3 生产记录

屏幕合同：生产记录允许用户按商品、平台和状态找到一次完整制作过程，查看事件、恢复当前任务、基于历史再做一版或重新导出。

- 默认以 `ProductionRun` 列表/分组呈现，不按商品卡片堆叠全部事件。
- 筛选：搜索商品、平台、工作流（Listing/A+/淘宝）、来源（Demo/API）、状态、形状/模块类型；筛选只作用于派生视图。
- 最新 run 默认展开；筛选后保留仍存在的展开项，否则展开最新匹配项。
- run 摘要显示商品、平台、站点、模式、完成度、最近时间和代表缩略图。
- 操作：查看记录、继续当前任务、基于此记录再做一版、重新导出；不可恢复时明确原因。
- 事件详情显示策划、每次生成/重生成/局部编辑、失败/取消和导出，不以摘要字符串代替关键引用。

## 5. AIS 核心能力闭环矩阵

| AIS 能力 | 当前状态 | 本计划任务 | 完成门槛 |
| --- | --- | --- | --- |
| 六站点与本地化可见文案 | 部分，存在 ASCII 冲突 | 任务 4 | US/JP/DE/FR/IT/ES 策划、Copilot、恢复、导出一致 |
| Listing 7–12 | 已有 | 任务 3/6 回归 | 默认 7，可选 8–12，key 与结果一致 |
| 四类 A+ 与 1–12 模块 | 已有主体 | 任务 5/6 回归 | 类型、增删、恢复、重新策划闭环 |
| A+ 小方块外部标题/正文 | 部分 | 任务 5 | 独立保存/复制/导出，不进入图片 Prompt |
| AIS 主流程 | 部分 | 任务 3/6 | 不离开 Amazon 即可走完 README 等价路径 |
| Listing 文本与参考图输入 | 已有但职责混合 | 任务 3 | 原文持久化于 session，解析不静默污染共享事实 |
| Prompt Preview、逐张生成、重试、版本 | 已有 | 任务 6 | 新布局下等价且失败不丢旧版 |
| 生成尺寸/上传建议尺寸 | 已有 | 任务 6 回归 | UI、Prompt、请求与 manifest 一致 |
| 参考图 16 张/1024-768/8 MiB | 已有 | 任务 3/7 回归 | 产品图+隐藏风格图共同受限并有本地错误 |
| 可编辑风格板与隐藏参考图 | 部分 | 任务 7 | 内置/自定义、MAIN 排除、附图/A+注入 guard |
| 按站点/模块合规提醒 | 部分 | 任务 4/5 | 高频禁用项与人工复核边界可见 |
| 历史筛选、复用、分类继承 | 部分 | 任务 9 | run 筛选、恢复、再做一版、图片复用 |
| 双配置/单连接/OpenRouter/DeepSeek | 部分 | 任务 8 | 模式可达并有真实请求契约测试 |
| 导出与交付 | 部分 | 任务 10 | 当前 workflow 槽位、外部文案、manifest 和缺失项一致 |
| 遮罩编辑/图片工具 | 缺口 | 任务 11 | 生成图可局部编辑并生成新不可变版本 |
| Demo 模式 | Ecom 特有，保留 | 全任务 | 默认/槽位/状态跟真实路径一致并清楚标注 |

不可达 Agent、网页搜索、批量入口不进入本矩阵。可选 Logo/Comparison A+ 模块只有在 AIS 锁定提交的公开 UI 可达且验收必要时追加，否则记录为非默认可选模块，不阻塞核心 DoD。

## 6. 全局验证

每个任务先运行其聚焦测试，全部任务完成后依次运行：

```bash
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

浏览器证据保存到 `artifacts/cross-platform-ais/`。必须记录 viewport、页面、状态、console error、横向溢出、滚动所有权和截图路径。

## 7. 分任务实施

### 任务 1：业务存储以 v2 空数据启动且保留运行设置（已完成 · 2026-07-20）

执行记录：
- TDD 红灯分别命中 v1 项目 key、v1 workspace 前缀、旧 IndexedDB 名称和 store 未恢复 session/run。
- 聚焦验证：`pnpm exec vitest run tests/workspace-v2.test.ts tests/projects.test.ts tests/assets.test.ts tests/settings-store.test.ts`，4 个文件、21 项测试通过。
- 附加验证：`pnpm typecheck` 通过；浏览器保存 API 模式后 reload，空 v2 业务首屏与“API 引擎”同时恢复，测试结束后恢复原演示模式。
- 审查：范围假设审查通过，无严重或主要问题；项目无 Git，范围固定为任务 1 列出的实现与测试文件。

目标：
用户首次打开新版本时看到空的商品/会话/生产记录，但此前保存的 API 与 Demo/API 运行模式仍可恢复。

文件：
- 修改 `src/domain/projects/repository.ts`
- 修改 `src/domain/assets/repository.ts`
- 修改 `src/domain/workspace/project-workspace.ts`
- 修改 `src/store/workbench-store.ts`
- 新建或重写 `tests/workspace-v2.test.ts`
- 更新 `tests/projects.test.ts`、`tests/assets.test.ts`、`tests/settings-store.test.ts`

接口：
- 依赖：现有 ProjectRepository、AssetRepository、RuntimeSettingsRepository。
- 产出：v2 项目/素材/workspace key；`ProjectWorkspaceDocument` 新结构；运行设置 key 不变。

测试：
- 先写测试：v1 项目和 workspace 存在时 v2 repository 返回空；v1 runtime settings 仍恢复。
- 测试新建商品、素材、session 和 run 在 reload 后可恢复。
- 测试删除项目会清除其 v2 素材与 workspace，不影响其他项目或运行设置。

实现步骤：
1. 将项目、workspace、IndexedDB 默认命名切换到 v2。
2. 在 `project-workspace.ts` 定义并归一化 `PlatformSession`、`ProductionRun`、`ProductionEvent`。
3. 删除 v1 业务数据兼容分支；保留损坏 v2 单项目隔离和安全空文档回退。
4. 更新 store 初始化、选择项目、删除项目和 reload 恢复逻辑。
5. 不调用 `localStorage.clear()`，不删除设置 key。

验证命令：
```bash
pnpm exec vitest run tests/workspace-v2.test.ts tests/projects.test.ts tests/assets.test.ts tests/settings-store.test.ts
```

预期失败：
测试首次因仍读取 v1 key、workspace 没有 sessions/runs、或设置被错误清空而失败。

预期通过：
v2 业务数据能独立恢复；v1 测试业务数据不可见；运行设置保持。

完成证据：
测试输出和一次浏览器 reload 记录，证明空业务首屏与已保存运行模式同时存在。

失败处理：
进入 `diagnose`；不得通过清空全部站点数据来掩盖 key 或恢复逻辑错误。

### 任务 2：用户可以在资料库管理共享商品并查看平台进度（已完成 · 2026-07-20）

执行记录：
- TDD 红灯分别命中重复空态动作/“第一步”文案、缺少派生搜索、缺少 workflow 进度、缺少真实 tabs、错误路由映射和常驻删除动作。
- 聚焦验证：`pnpm exec vitest run tests/library-workflow.test.ts tests/project-ui-contract.test.ts tests/platform-navigation.test.ts`，3 个文件、8 项测试通过；`pnpm check:ui` 与 `pnpm typecheck` 通过。
- 浏览器复测：1280px 验证空态、商品资料、平台进度、搜索无结果与 A+ 精确跳转；900px 无横向溢出，console error 为 0。
- 证据：`artifacts/cross-platform-ais/task2-library-empty-1280.png`、`task2-library-progress-1280.png`、`task2-library-search-empty-1280.png`、`task2-library-product-900.png`。
- 审查：范围假设审查通过，无严重或主要问题；主执行与独立复测无结论偏差。CloudRest 临时商品保留为任务 3 已有商品测试夹具。

目标：
资料库成为跨平台商品与参考素材中心；用户可搜索商品、编辑共享事实、上传素材，并从平台进度开始或继续 Amazon/淘宝生产。

文件：
- 重构 `src/components/LibraryView.tsx`
- 拆分/改造 `src/components/ProductSourcePanel.tsx`
- 修改 `src/components/AssetLibrary.tsx`
- 新建 `src/components/PlatformProgress.tsx`
- 修改 `src/App.tsx`、`src/components/PlatformRail.tsx`
- 修改 `src/styles.css`、`UI_STYLE_GUIDE.md`
- 新建 `tests/library-workflow.test.ts`
- 更新 `tests/project-ui-contract.test.ts`、`tests/platform-navigation.test.ts`

接口：
- 依赖：任务 1 的 v2 project/session/run repository。
- 产出：`LibraryView` 接收每个项目的 `PlatformProgressSummary[]`；平台入口以 projectId/workflowId 导航。

测试：
- 空资料库只有一个“新建商品”主动作。
- 商品列表搜索不修改持久化数据。
- `商品资料/参考素材/平台进度` tabs 均有真实内容和 `aria-selected`。
- Amazon Listing、A+ 和淘宝进度互不覆盖；点击继续进入准确 workflow。
- 删除操作不作为页面 primary，并需确认。

实现步骤：
1. 移除“第一步”及顶部并列的两个平台 primary 按钮。
2. 建立商品列表搜索和选中态；搜索无结果提供一键清除。
3. 将共享事实、参考素材和平台进度拆成三个 tab，共用现有 Panel/Field/MediaSlot/StatusChip。
4. 从 session/run 派生平台完成度、最近状态和最近输出，不复制状态到 ProductProject。
5. 平台进度行提供“开始制作/继续制作”，由 App 切换 project 和 workflow。

验证命令：
```bash
pnpm exec vitest run tests/library-workflow.test.ts tests/project-ui-contract.test.ts tests/platform-navigation.test.ts
pnpm check:ui
```

预期失败：
现有资料库没有 tabs、搜索和平台状态，且仍显示“第一步/用于 Amazon”。

预期通过：
用户不进入平台页即可判断共享资料是否齐备以及各平台进度，并能准确继续。

完成证据：
空资料库、已有多个商品、搜索无结果、平台进度四种状态的 DOM 断言与截图。

失败处理：
进入 `diagnose`；若平台状态需要遍历加载所有大图，先修正为只读 metadata/run 摘要，不在 Library 渲染时读取 Blob。

### 任务 3：用户可在 Amazon 直接准备并持久化 Listing/A+ 输入（已完成 · 2026-07-20）

执行记录：
- TDD 红灯分别命中 Amazon 依赖 active project、Listing 输入未进入独立 session、失败残留孤立业务记录、参考图负载未在 planner 前拦截，以及策划后 session 输入不可查看。
- 首次提交原子创建草稿商品、素材、Amazon session 与 run；planner 失败会回滚新建业务记录并保留页面 draft。
- 已有商品的 Listing 原文只写 session，planner 使用会话解析事实；只有用户点击“同步到共享商品资料”才更新共享 facts。
- Listing/A+、7–12 张、四类 A+、1–12 模块、站点、尺寸、风格和参考素材选择可恢复；策划后可展开“本次任务输入”核对原文与参数。
- 聚焦验证：`pnpm exec vitest run tests/amazon-intake.test.ts tests/listing-parse.test.ts tests/amazon-session-controls.test.ts tests/assets-compress.test.ts`，4 个文件、18 项测试通过；`pnpm check:ui` 与 `pnpm typecheck` 通过。
- 浏览器复测：Amazon 首次直达生成 7 槽计划；1280×720 展开 session 摘要无横向溢出，reload 后 Listing 原文与参数恢复，console error 为 0。
- diagnose 复测：独立 origin 使用不可达 planner 重现首次提交失败；修复后临时 project/session/素材仍回滚，Listing 与待上传 File 的 React draft 不再被中间状态清空。
- 证据：`artifacts/cross-platform-ais/task3-amazon-direct-planned-1280.png`、`task3-amazon-session-summary-1280.png`。
- 审查：范围假设审查通过，无严重或主要问题；项目无 Git，审查范围限于任务 3 实现、测试与共享接口。

目标：
用户无需先跳去资料库即可开始 Amazon 任务；Listing 原文、参考图选择和 Amazon 参数保存到独立 session，共享事实不会被静默覆盖。

文件：
- 新建 `src/components/AmazonWorkspace.tsx`
- 新建 `src/components/AmazonIntake.tsx`
- 重构 `src/components/AmazonSessionControls.tsx`
- 修改 `src/domain/planning/listing-parse.ts`
- 修改 `src/domain/workspace/project-workspace.ts`
- 修改 `src/store/workbench-store.ts`
- 修改 `src/App.tsx`
- 新建 `tests/amazon-intake.test.ts`
- 更新 `tests/listing-parse.test.ts`、`tests/amazon-session-controls.test.ts`

接口：
- 依赖：任务 1 的 `PlatformSession`，任务 2 的共享项目选择。
- 产出：`startAmazonSession({ projectId?, workflowId, listingText, files, options })`；失败时保留页面输入和待上传 File。

测试：
- 无 active project 时粘贴有效 Listing、选择参考图并策划，会原子创建草稿商品和 Amazon session。
- 已有商品时 Listing 原文只写 session；共享 facts 在用户明确确认前不变化。
- Listing/A+ mode、7–12、四类 A+、1–12 module specs、marketplace、size tier、style selection reload 后恢复。
- 参考图超过 16 张或 8 MiB 时在调用 planner 前失败并保留输入。

实现步骤：
1. App 对 Amazon 使用专属 `AmazonWorkspace`，淘宝暂继续现有平台工作台。
2. 准备态首先呈现模式、参数、Listing 文本、参考图和风格，不渲染空 slots/inspector。
3. 无项目时由第一次策划提交原子创建草稿项目、上传暂存文件、创建 session；任一步失败则回滚新建业务记录并保留 React draft。
4. 已有项目时保存 Amazon sourceInput；解析结果仅显示差异摘要，提供明确“同步到共享商品资料”次级动作。
5. session 输入变化更新 input signature 并标记旧 plan 过期。

验证命令：
```bash
pnpm exec vitest run tests/amazon-intake.test.ts tests/listing-parse.test.ts tests/amazon-session-controls.test.ts tests/assets-compress.test.ts
```

预期失败：
现有流程要求 activeProject，Listing paste 只存在组件 state，并直接写共享 facts。

预期通过：
Amazon 可独立开始任务；返回或 reload 后输入、素材选择和参数都恢复；共享 facts 的变化始终需要明确动作。

完成证据：
首次直达 Amazon、从资料库继续 Amazon、刷新恢复三条行为测试及浏览器截图。

失败处理：
进入 `diagnose`；原子创建失败不得留下无 session 的孤立草稿项目或无 project 的素材。

### 任务 4：六个 Amazon 站点获得真实本地化策划与合规闭环（已完成 · 2026-07-20）

执行记录：
- TDD 红灯依次命中 Demo 仅返回英文槽位标签、API planner/Copilot 的全局 ASCII 合同、日德法意西高频促销词漏检，以及 manifest 缺少 marketplace/copyLanguage。
- marketplace catalog 统一拥有 copyLanguage、locale、模型指导、站点合规策略、禁用词和六站确定性 Listing/A+ 示例；planner、Copilot、compliance、session rule pack 与 export 共同消费该真相源。
- MAIN 仍强制空文案；API 只验证结构、明确禁用规则与 Prompt 模板边界，不做脆弱的整段语言识别。run 通过 session options/plan snapshot 保留 marketplace，manifest 显式输出 marketplaceId/locale/copyLanguage。
- 聚焦验证：`pnpm exec vitest run tests/amazon-localization.test.ts tests/openai-planner.test.ts tests/copilot-demo.test.ts tests/compliance.test.ts`，4 个文件、51 项测试通过；`pnpm typecheck`、`pnpm check:ui` 通过。
- 独立复测：`pnpm exec vitest run tests/amazon-catalog.test.ts tests/batch3-alignment.test.ts tests/export.test.ts tests/workspace-v2.test.ts`，4 个文件、20 项测试通过；主执行与复测无结论偏差。
- 浏览器复测：1280×800 完成 US/JP 直达 Amazon、站点选择、Demo 策划与 PT01 文案核对；无横向溢出，console error 为 0。诊断并修复“目标站点”Select 缺少稳定可访问名称；同步 Demo planner 不作为 loading 证据，loading 留由任务 6 真实异步生成路径覆盖。
- 证据：`artifacts/cross-platform-ais/task4-us-localized-1280.png`、`artifacts/cross-platform-ais/task4-jp-localized-1280.png`。
- 审查：范围假设审查覆盖任务 4 实现/测试/浏览器脚本与计划要求；首轮发现 Demo 只有 PT01 本地化的主要缺口，修复后复审无严重或主要问题。真实外部模型的语言质量不在确定性验收范围内。

目标：
US、JP、DE、FR、IT、ES 不只可选，而且策划、Copilot、校验、历史和导出都遵循当前站点的可见文案语言。

文件：
- 修改 `src/domain/platforms/amazon-marketplaces.ts`
- 修改 `src/services/openai-planner.ts`、`src/services/demo-planner.ts`
- 修改 `src/services/openai-copilot.ts`、`src/services/demo-copilot.ts`
- 修改 `src/domain/compliance/*`
- 修改 run/export context 类型
- 新建 `tests/amazon-localization.test.ts`
- 更新 `tests/openai-planner.test.ts`、`tests/copilot-demo.test.ts`、`tests/compliance.test.ts`

接口：
- 依赖：任务 3 持久化 marketplace。
- 产出：每个 marketplace 的 copyLanguage、locale、prompt instruction、合规策略；不使用全局 ASCII 限制。

测试：
- OpenAI planner system/user prompt 包含站点目标语言。
- JP 日文、DE/FR/IT/ES Unicode 可见文案不被格式校验拒绝。
- MAIN visibleCopy 始终为空。
- Demo 六站输出使用可识别的目标语言样例；品牌、SKU、尺寸可原样保留。
- Copilot 改写遵守当前 marketplace；run/manifest 保留 marketplace。

实现步骤：
1. 删除 `openai-planner.ts` 的 Amazon 全局 ASCII prompt 和 post-parse rejection。
2. 将语言合同集中到 marketplace catalog，planner/copilot/compliance 消费同一来源。
3. API 结果只验证 MAIN 空文案、字段结构和明确禁用字符/声明，不做脆弱的整段语言识别。
4. 为 Demo 建立六站确定性 fixture，避免浏览器验收依赖外部 API。
5. 合规提醒按 MAIN/附图/A+ 和 marketplace 组合生成，继续声明需人工复核。

验证命令：
```bash
pnpm exec vitest run tests/amazon-localization.test.ts tests/openai-planner.test.ts tests/copilot-demo.test.ts tests/compliance.test.ts
```

预期失败：
JP/欧洲站非 ASCII 文案被当前校验拒绝，Demo/Copilot 未完整按站点输出。

预期通过：
六站点均可完成策划与改写；US + JP 代表路径可进入生成；站点元数据进入 run 和 manifest。

完成证据：
六站单测矩阵与 US/JP 浏览器截图；截图不包含真实 API key。

失败处理：
进入 `diagnose`；不得用“允许所有文本”绕开 MAIN 和 Amazon 禁用声明校验。

### 任务 5：A+ 类型、模块编排与外部文案完整对齐 AIS（已完成 · 2026-07-20）

执行记录：
- TDD 红灯依次命中 220×220 方块仍要求图片 visibleCopy、Demo/API 缺少 externalText、导出丢失外部文案、合规未检查外部标题/正文、检查器无独立编辑/复制，以及 active session 恢复旧 externalText。
- `PlannedSlot.externalText` 只允许标准 A+ 的 220×220 highlight-tile；title/body 必填、图片 visibleCopy 为空、normalizer 拒绝将外部文案写入 Prompt，也拒绝非文本模块携带该字段。
- 四类 A+ 默认 key/尺寸/数量与 1–12 增删边界已建立矩阵；已有 plan 的模块清单默认只读，调整动作进入共享 Dialog，修改后旧 plan 立即过期，页面唯一主动作回到“重新策划”。
- 外部标题/正文在 `SlotInspector` 使用共享 Field/Button/ActionBar 独立编辑、组合复制和保存；reload 后从 active session 恢复。manifest 保存 externalText，并额外输出 `external-copy.md`，不污染 `prompts.md` 或图片版本 promptSnapshot。
- 聚焦验证：`pnpm exec vitest run tests/amazon-aplus-workflow.test.ts tests/amazon-catalog.test.ts tests/amazon-session-planning.test.ts`，3 个文件、20 项测试通过；`pnpm typecheck`、`pnpm check:ui` 通过。
- 独立复测：store/OpenAI/compliance/export 4 个文件、52 项通过；planner/normalizer/UI/generation 5 个文件、49 项通过。两轮发现均为旧 legacy fixture 未补 externalText，更新 fixture 后原验证全绿，未放宽产品校验。
- 浏览器复测：1280×800 覆盖普通A+ 5 模块、标准A+ 8 模块、A+S05 外部文案复制/编辑/保存/reload、模块 Dialog、9 模块 stale 与重新策划入口；无横向溢出，console error 为 0。
- 证据：`artifacts/cross-platform-ais/task5-aplus-standard-large-prepare-1280.png`、`task5-aplus-standard-prepare-1280.png`、`task5-aplus-external-copy-1280.png`、`task5-aplus-module-dialog-1280.png`、`task5-aplus-modules-stale-1280.png`。
- 审查：范围假设审查覆盖任务 5 领域、store、UI、样式、导出、测试与浏览器脚本；修复了重复 freshness 文案、无参考图 Amazon 无法重新策划、长模块清单撑坏顶栏三项主要问题，复审无严重或主要问题。

目标：
用户可选择四类 A+，在 1–12 个模块间增删和恢复默认，并正确处理小方块模块的外部标题/正文。

文件：
- 修改 `src/domain/platforms/amazon-catalog.ts`
- 修改 `src/domain/planning/types.ts`、normalizer 和 planner services
- 修改 `src/components/AmazonIntake.tsx`、`AmazonSessionControls.tsx`
- 修改槽位检查/导出显示组件
- 新建 `tests/amazon-aplus-workflow.test.ts`
- 更新 `tests/amazon-catalog.test.ts`、`tests/amazon-session-planning.test.ts`

接口：
- 依赖：任务 3 的 `amazon-aplus` session，任务 4 的 marketplace。
- 产出：`PlannedSlot.externalText?: { title?: string; body?: string }`；只对 AIS 文本模块有效。

测试：
- 默认 `standard-large`；standard/premium/mobile 的 key、尺寸、默认数量一致。
- 每类可加、删到边界、恢复默认；模块改变使旧 plan 过期。
- 220x220 tile 的 title/body 归一化、复制、恢复和导出，不进入 image prompt。
- A+ 合规按模块类型和站点执行。

实现步骤：
1. 对照锁定 AIS catalog 复核四套默认 specs 和文本模块判定。
2. A+ 准备态把类型和模块编排放在同一区域；模块列表未策划时可编辑，策划后只读并提示重新策划入口。
3. 扩展 planner schema、normalizer、Demo/API fixtures 与 inspector。
4. externalText 使用独立字段和复制动作，不拼接到 visibleCopy 或 prompt。

验证命令：
```bash
pnpm exec vitest run tests/amazon-aplus-workflow.test.ts tests/amazon-catalog.test.ts tests/amazon-session-planning.test.ts
```

预期失败：
现有统一 slot 模型没有 externalText，或 UI 无法在准备态完整表达模块边界。

预期通过：
四套 A+ 均可从准备、策划、选模块、生成到导出；文本模块文案独立可用。

完成证据：
四类 A+ 测试矩阵和 standard-large/standard 代表截图。

失败处理：
进入 `diagnose`；不得把外部长文案写入 220x220 图片 Prompt 来规避模型扩展。

### 任务 6：Amazon 工作台按真实完成度完成策划检查与逐图生产（已完成 · 2026-07-20）

执行记录：
- TDD 红灯依次覆盖 0/7、1/7、6/7、7/7 阶段矩阵、旧签名不计完成、失败保留旧有效版本、成功后不自动跳槽、sessionId 选槽/生成、App 顶层 session 接线，以及活动版本切换后的 session/run 同步。
- `src/domain/workspace/amazon-stage.ts` 成为 Amazon 阶段和主动作唯一领域真相源；已删除会在 1/N 时误判 deliver 的旧 `getAmazonWorkflowStage` 出口。完成度只认当前 plan input signature、Prompt 与可见文案一致的活动版本。
- App 将 active `PlatformSession` 传入工作台；Amazon 选槽/生成走 `selectSessionSlot` / `generateSessionSlot`。生成成功在同一事务中同步 workspace、session、active run；切换版本也同步 session 与 run 状态，reload 后保持活动版本。
- 工作台在 0/7 显示 `2/4 · 策划检查` 和“生成图片”；1/7、6/7 显示 `3/4 · 逐图生产` 和“继续下一槽位”；7/7 显示 `4/4 · 交付检查` 和“导出完整交付包”。重生成、部分导出和重新策划不与当前主动作争抢 primary。
- `SlotInspector` 在当前有效版本存在时显示“已完成”，不再与策划阶段的“待补资料”同时冲突；旧草稿版本仍显示过期提示且不计入完成度。固定 ActionBar 保留独立滚动中区，版本条可横向访问 V1/V2/V3。
- 聚焦验证：`pnpm exec vitest run tests/amazon-stage.test.ts tests/generation-store.test.ts tests/platform-workspace-contract.test.ts`，3 个文件、33 项全部通过，无 skip；`pnpm check:ui`、`pnpm typecheck` 通过。
- 独立复测：`tests/generation-ui-contract.test.ts`、`current-version.test.ts`、`amazon-session-planning.test.ts`、`export.test.ts`、`workspace-v2.test.ts`，5 个文件、21 项通过；主执行与复测无结论偏差。最终 `pnpm test` 为 49 个文件、312 项通过，`pnpm build` 通过。
- 浏览器复测：1280×800 覆盖 0/7、loading、1/7、6/7、7/7、失败保留、失败重试成功、V3 切换、V1 reload 恢复；900×800 覆盖 1/7 紧凑桌面。阶段、完成数、选中槽位、Prompt、主动作、版本与交付条一致；无横向溢出，ActionBar 不遮挡滚动内容，console error 为 0。
- 证据：`artifacts/cross-platform-ais/task6-0-of-7-review-1280.png`、`task6-generation-loading-1280.png`、`task6-1-of-7-produce-1280.png`、`task6-1-of-7-produce-900.png`、`task6-6-of-7-produce-1280.png`、`task6-7-of-7-deliver-1280.png`、`task6-failure-keeps-old-version-1280.png`、`task6-failure-retry-success-1280.png`、`task6-old-version-restored-1280.png`。
- 审查：因项目无 Git 元数据，本轮为用户指定任务 6 文件范围的范围假设审查；需求与工程复审修复了 App 绕过 session、完成状态冲突、版本切换未同步 session/run 三项主要问题，最终无严重或主要问题。

目标：
用户在同一 Amazon 页面选槽、检查 Prompt、生成/重生成、切换版本并自然进入下一槽位；阶段和主动作始终准确。

文件：
- 完成 `src/components/AmazonWorkspace.tsx`
- 重构复用 `src/components/SlotBoard.tsx`、`SlotInspector.tsx`
- 修改 `src/components/GenerationActions.tsx`、`ExportPanel.tsx`
- 修改 `src/domain/generation/current-version.ts`
- 修改 `src/store/workbench-store.ts`
- 新建 `tests/amazon-stage.test.ts`
- 更新 `tests/generation-store.test.ts`、`tests/platform-workspace-contract.test.ts`

接口：
- 依赖：任务 3–5 的 session/plan。
- 产出：`getAmazonStage(session)` 和 `getAmazonPrimaryAction(session)` 纯函数；生成操作按 sessionId/slotKey。

测试：
- 0/7=`review`，1/7=`produce`，7/7=`deliver`；失败但有旧版本仍按有效完成度计算。
- 输入签名过期的版本不计完成；重新策划不误用旧 output。
- 选 MAIN/PT/A+ 模块时 Prompt、尺寸和版本同步切换。
- 生成 pending 阻止重复提交，取消/失败恢复可用状态且不丢旧版本。
- partial export 不改变 produce 阶段。

实现步骤：
1. 用 session 的 required slot 集合和 current-version 规则重写阶段判定。
2. 准备态之外切换为槽位导航 + 结果主舞台 + 检查区；商品资料进入抽屉。
3. 固定 ActionBar 只呈现当前阶段主动作；“重新策划”降为 secondary。
4. 成功后显示“继续下一槽位”；不自动跳转，避免用户未检查就改变上下文。
5. 保留现有生成尺寸/上传建议尺寸、版本不可变、恢复锁和 Copilot 锁。

验证命令：
```bash
pnpm exec vitest run tests/amazon-stage.test.ts tests/generation-store.test.ts tests/platform-workspace-contract.test.ts
pnpm check:ui
```

预期失败：
当前 `getAmazonWorkflowStage` 在任意一个槽位完成后进入 deliver，且布局仍由通用三栏所有状态共同承担。

预期通过：
阶段、完成度、主动作、结果和下一步一致；1/7 不再显示 4/4 交付。

完成证据：
0/7、1/7、6/7、7/7、失败重试、旧版本恢复六种状态测试与截图。

失败处理：
进入 `diagnose`；不要用截图条件或 CSS 隐藏掩盖错误的领域阶段。

### 任务 7：附图和 A+ 可使用可编辑风格板与隐藏风格参考图

目标：
用户可选择内置风格、派生并编辑“我的风格”，附图/A+生成携带隐藏风格参考，MAIN 保持排除。

文件：
- 扩展 `src/domain/platforms/amazon-style-presets.ts`
- 新建 `src/domain/assets/style-reference.ts`
- 新建 `src/components/StyleReferencePicker.tsx`
- 新建 `src/components/StyleReferenceEditorDialog.tsx`
- 修改 session、asset、reference-payload 和 generation request 组装
- 新建 `tests/style-reference.test.ts`
- 更新 `tests/batch3-alignment.test.ts`、`tests/assets.test.ts`

接口：
- 依赖：任务 3 的 session 素材选择和现有文本 preset。
- 产出：自定义风格描述、编辑状态和生成的隐藏 style asset；session 保存 selectedStyleReferenceId。

测试：
- 选择内置 preset 可生成/恢复 style reference；编辑色板、字体、光影、材质和密度后产生新自定义风格。
- MAIN 请求不带隐藏风格图；PT/A+带图和 `STYLE_REFERENCE_GUARD`。
- 风格图与产品图合计受 16 张/8 MiB 上限；超限有明确本地错误。
- 删除正在使用的风格时 session 降级并提示，不留下坏引用。

实现步骤：
1. 复用 AIS preset/guard 行为语义，避免复制其视觉布局。
2. 自定义风格存成 project scoped style asset，资料库参考素材不默认混显。
3. 编辑器使用 Dialog、共享 Field/SegmentedControl/MediaSlot；预览真实渲染风格板位图。
4. generation request 在 MAIN 之外按稳定顺序追加隐藏风格图，并写 run snapshot。

验证命令：
```bash
pnpm exec vitest run tests/style-reference.test.ts tests/batch3-alignment.test.ts tests/assets.test.ts
pnpm check:ui
```

预期失败：
当前只有文本 preset，没有可编辑风格资产和隐藏图引用。

预期通过：
内置/自定义风格可选择、编辑、恢复；MAIN 与 PT/A+请求差异可由测试证明。

完成证据：
风格选择、编辑 Dialog、MAIN 排除、A+注入和超限错误截图/请求断言。

失败处理：
进入 `diagnose`；风格预览失败不得阻止用户切回无隐藏图的文本 preset。

任务 7 执行记录（已完成 · 2026-07-20）：
- 功能流程：内置 preset 可物化并恢复为 project scoped 风格板；用户可编辑色板、字体、光影、材质、密度并保存“我的风格”；session/run snapshot 保存实际 `selectedStyleReferenceId`，删除使用中的风格后持久化降级到文本 preset。
- 请求机制：产品参考图与隐藏风格图统一进入 16 张 / 8 MiB payload；稳定顺序为产品图在前、风格图在后；MAIN 排除风格图与 guard，PT/A+ 注入隐藏图及 `STYLE_REFERENCE_PROMPT_GUARD`。
- 测试：`tests/style-reference.test.ts`、`tests/batch3-alignment.test.ts`、`tests/assets.test.ts` 与补充的 `tests/generation-store.test.ts` 共 29 项通过；MAIN、PT、A+、删除降级与 reload 均有请求/store 断言。
- 浏览器证据：`task7-style-editor-dialog-1280.png`、`task7-custom-style-selected-1280.png`、`task7-custom-style-selected-900.png`、`task7-style-delete-downgrade-900.png`；1280/900 无横向溢出，编辑 Dialog footer 与内容无覆盖，console error 为 0。

### 任务 8：设置支持 AIS 双配置、单连接、OpenRouter 与 DeepSeek 路径

目标：
用户可选择标准双配置或单连接模式，分别测试策划/生图；OpenRouter 图片 chat 路径和 DeepSeek 文本策划行为与 AIS 一致。

文件：
- 修改 `src/domain/settings/*`
- 修改 `src/components/SettingsDialog.tsx`
- 修改 `src/services/openai-planner.ts`、`openai-image-generator.ts`
- 新建或扩展 provider adapter 文件
- 新建 `tests/provider-modes.test.ts`
- 更新 `tests/settings.test.ts`、`tests/settings-store.test.ts`、`tests/openai-image-generator.test.ts`

接口：
- 依赖：现有 RuntimeSettingsRepository 和 request services。
- 产出：显式 `connectionMode: "dual" | "single"`；provider capability 判断；服务级连接测试结果。

测试：
- dual 模式分别使用 text/image profile；single 模式只显示/使用一个兼容连接。
- OpenRouter image profile 走 chat completions 并带最接近的 aspect ratio/image size。
- DeepSeek 官方 planner 只发送文本、明确跳过参考图；正式生成仍可使用产品参考图。
- API key 不进入日志、错误截图或非 password DOM。
- 旧 runtime settings v1 仍能归一化到 dual 默认，不清空凭据。

实现步骤：
1. Settings 使用 `SegmentedControl` 表达运行配置模式；日常字段在前，高级兼容配置折叠。
2. 将 provider 能力判断集中到 adapter/capabilities，不在组件内用 URL 散落判断。
3. 实现 OpenRouter chat image request/response 解析和 DeepSeek planner payload 分支。
4. 连接测试按策划、生图、单连接返回具体 endpoint/model/auth/CORS 错误。

验证命令：
```bash
pnpm exec vitest run tests/provider-modes.test.ts tests/settings.test.ts tests/settings-store.test.ts tests/openai-image-generator.test.ts tests/openai-planner.test.ts
pnpm check:ui
```

预期失败：
当前没有显式单连接模式，OpenRouter/DeepSeek 特殊契约未完整实现。

预期通过：
三种代表 provider payload 和 UI 模式均有确定测试；保存/reload 后模式不漂移。

完成证据：
双配置、单连接、DeepSeek 提示和连接失败恢复截图；请求体单测不包含真实 key。

失败处理：
进入 `diagnose`；best-effort provider 不得伪装成已连接，必须保留能力检测和可读失败。

任务 8 执行记录（已完成 · 2026-07-20）：
- 功能流程：设置提供 dual/single 分段模式；dual 分别显示并使用文本/图片 profile，single 只显示统一连接并复用根地址与密钥；旧 runtime settings v1 归一化为 dual 且保留凭据。
- Provider 机制：集中 capability 检测；OpenRouter 图片生成走 `chat/completions`，携带最近 aspect ratio 与 1K/2K/4K image size；DeepSeek 官方 planner 明确以文本字段记录参考图已跳过；single + DeepSeek 在请求前被拒绝并提示改用 dual。
- 凭据与错误：密钥输入仅使用 password 类型，provider/transport 错误继续脱敏；连接测试保留 endpoint/model/auth/quota/CORS 可读错误分类。
- 测试：任务 8 指定 5 个测试文件 58/58 通过；额外 UI 契约复测 14/14 通过；`pnpm check:ui`、`pnpm typecheck` 通过；最终全量 51 文件、323/323 与 `pnpm build` 通过（仅保留约 516 kB 主 JS chunk 非阻断警告）。
- 浏览器证据：`task8-settings-dual-1280.png`、`task8-settings-single-deepseek-1280.png`、`task8-connection-failure-1280.png`、`task8-settings-reload-1280.png`；single 仅一个 password 密钥输入、图片配置组为 0、DeepSeek 阻断提示可见；本机不可达 endpoint 的失败反馈、保存/reload 与恢复 Demo 均通过，无横向溢出且 console error 为 0。
- 批次结论：任务 7–8 已完成并暂停；检查点 C 依赖任务 9–10，当前不得宣布完成。

### 任务 9：生产记录按 run 筛选、恢复和复用跨平台任务

目标：
用户可从生产记录找到一次完整制作过程，查看事件、继续当前任务或基于历史创建新 run；Amazon 与淘宝共享记录框架。

文件：
- 重构 `src/components/TaskHistory.tsx` 为 `ProductionHistory`
- 新建 `src/components/ProductionRunCard.tsx`、`ProductionHistoryFilters.tsx`
- 修改 `src/domain/tasks/*`、`src/domain/workspace/project-workspace.ts`
- 修改 plan/generate/export 的事件写入
- 修改 `src/App.tsx` 深链接恢复
- 新建 `tests/production-history.test.ts`
- 更新 store/planning/generation/export 测试

接口：
- 依赖：任务 1 的 run/event，任务 3–8 的上下文快照。
- 产出：`queryProductionRuns(filters)` 派生查询；`resumeRun(runId)`；`forkRun(runId)`。

测试：
- 一次 plan + 多次 generate + export 归入同一 run；replan 创建新 run。
- 商品、平台、workflow、source、status、形状筛选正确且不改原数据。
- 最新 run 默认展开；过滤后展开行为稳定；无匹配有一键清除。
- resume 打开准确 project/workflow/slot；fork 继承商品、站点、模式、参数、参考图分类，不继承完成状态。
- 生成事件引用 asset/version，可显示缩略图；失败/取消事件仍属于 run。

实现步骤：
1. 将 `TaskRecord` 调用点改为 run event；plan 成功创建 run，生成/编辑/导出追加事件。
2. 生产记录默认显示 run 摘要，事件只在展开后渲染。
3. 筛选栏使用共享输入/Select/SegmentedControl，筛选结果来自 memoized derived view。
4. resume 只恢复仍是当前 session 的 run；历史 run 默认只读。fork 创建新 active run 并保留旧 run。
5. “使用此图继续编辑/用作参考图”保留 product、platform、workflow 和 slot 分类。

验证命令：
```bash
pnpm exec vitest run tests/production-history.test.ts tests/planning-store.test.ts tests/generation-store.test.ts tests/export-store.test.ts
pnpm check:ui
```

预期失败：
当前历史按项目卡片列事件，`batchId` 不连接完整工作流，也不能精确恢复。

预期通过：
历史默认以真实 run 呈现；筛选、展开、resume、fork 和图片复用均可验证。

完成证据：
跨 Amazon Listing/A+ 和淘宝的三组 run、筛选无结果、恢复和 fork 截图及测试。

失败处理：
进入 `diagnose`；不得通过把历史 run 直接写回当前 session 来实现查看，避免覆盖当前工作。

任务 9 执行记录（已完成 · 2026-07-20）：
- 功能流程：策划统一创建 `ProductionRun`，生成/重生成/失败/取消事件归入 active run；重新策划保留旧 run；resume 只允许当前 run，历史 run 通过 fork 创建空完成度的新 session/run；历史输出可复制为带来源分类的 reference asset。
- 前端呈现：生产记录以 run 卡片为主，最新 run 默认展开；支持商品/Run 搜索、平台、workflow、状态、来源和画面形状筛选，无匹配提供一键清除；当前任务、继续、fork、事件缩略图与用作参考图均有明确层级。
- 测试与审查：`tests/production-history.test.ts`、`tests/planning-store.test.ts`、`tests/generation-store.test.ts`、`tests/export-store.test.ts` 共 34/34 通过，`pnpm check:ui`、`pnpm typecheck` 通过；范围假设审查发现并修复 run event 与 TaskRecord 共用 ID 工厂、失败/取消未归 run、fork 后多个 session 同时标记当前、直接替换旧 session 导致 normalizer 丢弃历史 run 四项主要问题，独立复测无偏差。
- 浏览器证据：`task9-production-runs-1280.png`、`task9-filter-empty-1280.png`、`task9-fork-restored-1280.png`、`task9-production-runs-900.png`；1280/900 无横向溢出或卡片内部重叠，console error 为 0。

### 任务 10：交付包与 run 快照一致并可从记录重新导出

目标：
完整/部分交付清楚区分，ZIP/manifest 与当前 workflow、marketplace、A+ 外部文案和活动版本一致；历史 run 可重新构建当时交付。

文件：
- 修改 `src/domain/export/*`
- 修改 `src/components/ExportPanel.tsx` 和生产记录操作
- 修改 ProductionRun export snapshot/event
- 更新 `tests/export.test.ts`、`tests/export-store.test.ts`
- 新建 `tests/run-export.test.ts`

接口：
- 依赖：任务 5 externalText、任务 6 completion、任务 9 run snapshot。
- 产出：`buildRunExportPackage(run, loadAsset)`；manifest 带 workflow、marketplace、options、slots、missingSlots、externalText 和 prompt snapshots。

测试：
- Listing/A+/淘宝使用各自当前 required slots 和文件命名。
- 1/7 只能“导出当前结果”，manifest `ready=false`；7/7 才“导出完整交付包”。
- 历史 run 在当前 session 已重策划后仍可按 snapshot 重导出。
- 缺 asset 或坏 Blob 时明确失败，不写成功 export event。

实现步骤：
1. export 只消费 run snapshot 和对应 version refs，不读取不相关的当前全局 plan。
2. manifest 写入 AIS 站点/模式/尺寸/外部文案语义并保留 Ecom 缺失项优势。
3. 成功导出追加 run event；历史重新导出不修改原 plan/versions。
4. ExportPanel 仅在有可用输出后出现，完整与部分动作按阶段分层。

验证命令：
```bash
pnpm exec vitest run tests/run-export.test.ts tests/export.test.ts tests/export-store.test.ts
```

预期失败：
当前导出依赖 active project/platform 全局状态，历史只有文件名，无法复建旧 run。

预期通过：
当前和历史 run 均能构建一致交付包，且 ready/missingSlots 语义准确。

完成证据：
解压 Listing、A+ 和部分交付 ZIP，核对 manifest、文件名、外部文案和缺失项。

失败处理：
进入 `diagnose`；任何 asset 读取或 ZIP 构建失败不得被记录为成功交付。

任务 10 执行记录（已完成 · 2026-07-20）：
- 功能流程：当前 run 支持 1/N 部分导出和 N/N 完整导出；生产记录可按旧 run 快照重新导出，成功/失败事件写回原 run，但不会切换当前 session、plan 或活动版本。
- 前端呈现：ExportPanel 仅在已有输出时出现，1/7 显示“导出当前结果”与 6 个缺失槽位；生产记录当前 run 显示唯一“继续当前任务”，有输出的 run 显示“重新导出”和缩略图复用入口；1280 无横向溢出。
- 实现机制：`buildRunExportPackage` 只消费 run 的 plan、input signature、slot version 和 options 快照；manifest 写入 run/workflow/options、活动版本、Prompt、外部文案和 missingSlots；缺 asset 或不支持 MIME 明确失败且不写成功事件。
- 测试结果：任务 10 聚焦测试 `tests/run-export.test.ts`、`tests/export.test.ts`、`tests/export-store.test.ts` 为 9/9；任务 9–10 联合聚焦复测为 34/34；`pnpm check:ui`、`pnpm typecheck` 通过。最终全量为 53 个文件、332/332，`pnpm build` 与 `pnpm test:browser` 通过，主 JS 533.72 kB 仅有非阻断体积警告。
- 浏览器证据：`task10-partial-export-1280.png`、`task10-history-reexport-1280.png`；真实页面写入成功 export event、ZIP 文件名可见、当前 run 卡片唯一、重新导出入口可达；ZIP 解压后的 manifest、文件名与缺失项由自动化测试核对。浏览器控制后端未捕获程序化 `<a>` 下载事件，不影响页面事件写入与 ZIP 内容证据。
- 审查：项目无 Git 元数据，按用户请求、任务 10 文件清单、`UI_STYLE_GUIDE.md` 与共享组件规范执行范围假设审查；未发现未处理的严重或主要问题。独立复测发现并修复 Amazon 切到尚无 session 的 A+ workflow 时 Intake 回退 Listing 的模式一致性缺陷，以及浏览器烟测的旧入口/事件文案契约漂移；复测结论与主执行结论无剩余偏差。

### 任务 11：生成图可通过遮罩和图片工具产生新版本

目标：
用户可从当前生成图或历史输出打开图片工具，下载、用作参考图、局部遮罩编辑，并把编辑结果保存为同槽位新不可变版本。

文件：
- 新建 `src/components/ImageTools.tsx`
- 新建 `src/components/MaskEditorDialog.tsx`
- 新建 `src/domain/generation/mask.ts`、`mask-preprocess.ts`
- 修改 generation request/provider adapters/store
- 修改 `SlotInspector`/Amazon 结果主舞台/生产记录
- 新建 `tests/mask-edit.test.ts`、`tests/image-tools.test.ts`
- 更新 `tests/openai-image-generator.test.ts`、`tests/generation-store.test.ts`

接口：
- 依赖：任务 6 版本系统、任务 8 provider capabilities、任务 9 历史输出引用。
- 产出：`MaskDraft`、`prepareMaskTarget`、`generateMaskedVersion(sessionId, slotKey, versionId, mask, prompt)`。

测试：
- 遮罩空、全涂、尺寸不匹配和目标图丢失均被本地拒绝。
- brush/erase、大小、undo/redo、reset、cancel/save 状态可测试。
- 支持 edit 的 provider 收到原图+mask；不支持时 UI 显示原因且不提交。
- 成功编辑创建 V(n+1)，旧版本仍可切换；失败保留当前版本。
- 历史“用作参考图”复制成新的 reference asset，不改变原 generated asset。

实现步骤：
1. 只实现 AIS 核心可达图片工具：下载、用作参考图、遮罩局部编辑；不扩张成通用 Photoshop 画布。
2. Canvas 编辑器提供稳定画布比例、画笔/橡皮、undo/redo/reset；Dialog footer 与内容滚动分离。
3. mask 与 target 预处理为匹配尺寸；请求前校验覆盖和 provider 能力。
4. Demo 生成明确标注的本地 edit mock，真实 API 走 images edit/provider adapter。
5. 编辑成功追加 version 和 run event。

验证命令：
```bash
pnpm exec vitest run tests/mask-edit.test.ts tests/image-tools.test.ts tests/openai-image-generator.test.ts tests/generation-store.test.ts
pnpm check:ui
```

预期失败：
当前没有 mask domain、编辑 Dialog 和版本写入路径。

预期通过：
遮罩操作、provider 请求、版本不覆盖、失败恢复和历史复用均通过。

完成证据：
Mask Dialog 默认/绘制/错误/保存状态截图，以及 V1↔V2 切换和请求测试。

失败处理：
进入 `diagnose`；不得在 provider 不支持遮罩时退化为普通生成却标记为局部编辑。

任务 11 执行记录（已完成 · 2026-07-20）：
- 功能流程：当前 Amazon 槽位的活动版本与历史版本均可下载、复制为新的 reference asset；支持的图片服务可打开局部编辑 Dialog，画笔/橡皮擦、大小、undo/redo/reset、取消和保存均可达；Demo 结果明确标记 `DEMO LOCAL EDIT`。
- 实现机制：`MaskDraft` 以 PNG、尺寸和覆盖率作为边界；`prepareMaskTarget` 在请求前拒绝目标图缺失、空遮罩、全涂和尺寸不匹配；`ImageGenerationRequest.edit` 将原图与 mask 分开传给标准 `/images/edits` multipart；OpenRouter chat-completions 和 DeepSeek 官方端点在提交前能力门禁，不会退化为普通生成。
- 版本与历史：`generateMaskedVersion(sessionId, slotKey, versionId, mask, prompt)` 在同一 workspace 写队列内追加 V(n+1) 与 `edit/success` 事件，旧版本仍可激活；provider 失败或持久化后取消会回滚工作区与临时 Blob，并写入 `edit/failed` 或恢复态；当前生成图复制为新的 reference asset，不修改 generated asset；历史资产缺失时不显示下载/复用工具。
- 测试结果：任务 11 聚焦测试与回滚回归通过；最终全量 `pnpm test` 为 55 个文件、341/341，`pnpm check:ui`、`pnpm typecheck`、`pnpm build` 和 `pnpm test:browser` 均通过；构建主 JS 550.74 kB，仅保留非阻断体积警告。
- 浏览器证据：`task11-mask-default-1280.png`、`task11-mask-drawn-1280.png`、`task11-mask-error-1280.png`、`task11-mask-saved-v2-1280.png`、`task11-mask-saved-v2-900.png`；专项脚本检查画布实际像素、空遮罩禁用、失败保留 V1、重试追加 V2、V1/V2 切换、900px 无横向溢出和 console/page error 为 0。
- 审查与诊断：范围假设审查覆盖任务 11 文件清单、实施计划、`UI_STYLE_GUIDE.md` 和相关领域测试。曾发现并修复“持久化后取消不回滚”的主要问题，以及跨项目生成图复用和历史缺失资产入口问题；回归测试与浏览器复测无剩余主要/严重问题。既有浏览器烟测仍报告一个未影响流程的 404 资源提示，待任务 12 统一处理或确认。

### 任务 12：跨页面视觉机制、响应式和浏览器证据完成收尾（已完成 · 2026-07-20）

目标：
资料库、Amazon、生产记录、设置和遮罩 Dialog 使用一致的壳、控件、状态与动作层级，并在目标断点无溢出、遮挡或滚动冲突。

文件：
- 修改 `src/styles.css`
- 修改 `src/components/ui.tsx`
- 修改 `UI_STYLE_GUIDE.md`
- 修改 `scripts/check-ui-governance.mjs`
- 重写/扩展 `tests/browser-smoke.mjs`
- 更新 `tests/ui-style-contract.test.ts`、`tests/shared-ui-contract.test.ts`

接口：
- 依赖：任务 2–11 的真实页面和状态。
- 产出：稳定页面壳、toolbar/filter row、drawer/dialog/action bar 视觉契约；浏览器证据目录。

测试：
- UI governance 检查仍保证单一 `:root`、共享 Button/StatusChip/SegmentedControl/MediaSlot/ActionBar、无末尾覆盖。
- 浏览器覆盖 1600/1280/1100/900/899，无水平溢出。
- 检查各任务区独立滚动、固定动作栏不遮 Prompt、Dialog footer 不遮最后一个控件。
- 检查一屏内同一决策范围只有一个 primary；删除不借用 primary。
- tab 使用 `aria-selected`，未知 icon 有 accessible name/tooltip。

实现步骤：
1. 先更新 `UI_STYLE_GUIDE.md` 的布局所有权：资料库不再“第一步”，Amazon 不再固定三栏，生产记录以 filter+run list 为主。
2. 在既有 `:root` 和共享原语上补真正重复的 Drawer、FilterBar 或 RunStatus 变体；不创建第二套 theme。
3. 删除被新页面壳替代的 Amazon 三栏/移动 pane CSS 和过时末尾规则，不追加高 specificity 收尾覆盖。
4. 扩展 browser smoke 创建本地 fixtures，不调用付费 API；覆盖首次、返回、失败、恢复和破坏性状态。
5. 证据写入 `artifacts/cross-platform-ais/`，文件名包含页面、状态和 viewport。

验证命令：
```bash
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

预期失败：
旧 governance 检查仍要求 Amazon 固定三栏，browser smoke 使用旧资料库前置路径和旧选择器。

预期通过：
所有工程检查通过；浏览器脚本输出截图清单、overflow/geometry/console 结果，899px 正确门禁。

完成证据：
- 资料库：空、已有商品、平台进度、搜索无结果，1280/900。
- Amazon：准备、Listing 策划、A+、1/N生产、全部完成、加载、错误、JP、本地风格、遮罩，1600/1280/1100/900。
- 生产记录：多平台、多 run、筛选无结果、展开、恢复，1280/900。
- 设置：dual/single、错误反馈，1280。
- 门禁：899。

失败处理：
进入 `diagnose`；浏览器证据缺失或默认态之外未覆盖时不得声明体验或治理完成。

任务 12 执行记录（已完成 · 2026-07-20）：
- 用户体验验收：资料库、Amazon、生产记录、设置、遮罩 Dialog 的主路径与关键空/加载/成功/失败/恢复状态均通过真实浏览器检查；资料库搜索无结果、平台进度、生产记录筛选无结果、设置双配置/单连接/错误反馈均有证据。
- 响应式与滚动：`1600/1280/1100/900` 工作台无横向溢出；`900px` 保留双栏与资料抽屉；`899px` 正确显示桌面门禁；窗口、资料、槽位、检查器的滚动职责和固定 ActionBar 均通过几何检查。
- 治理机制：删除 `PlatformWorkspace` 遗留 `mobilePane` 状态、隐藏移动 tab DOM、`data-mobile-pane` 和对应 CSS；`check-ui-governance.mjs` 增加防回归契约；`UI_STYLE_GUIDE.md` 明确资料库、Amazon、生产记录的页面结构所有权与证据目录。
- 工程验证：`pnpm check:ui`、`pnpm typecheck`、`pnpm test`（55 个文件、341/341）、`pnpm build`、`pnpm test:browser` 全部通过；构建保留约 549 kB 主 JS 体积警告。
- 浏览器证据：新增证据位于 `artifacts/cross-platform-ais/`，包含 `library-search-empty-1280.png`、`library-progress-1280.png`、`library-900.png`、`production-history-1280.png`、`production-history-filter-empty-1280.png`、`production-history-900.png`、`settings-single-1280.png`、`settings-error-1280.png`，并保留任务 11 遮罩、Amazon 和 899 门禁证据。
- 复测与残余风险：浏览器烟测唯一保留既有被过滤的 404 资源提示；真实外部 provider、Seller Central 最终审核和截图像素 diff 不属于本任务确定性范围。下一步仅进入任务 13 文档对齐与最终报告，不继续扩张任务 12。

### 任务 13：AIS 对齐 DoD、领域文档和最终报告关闭（已完成 · 2026-07-20）

目标：
代码、行为和文档对同一个产品状态作出一致声明，能明确回答哪些 AIS 核心功能已对齐、哪些非核心能力不在范围。

文件：
- 更新 `AIS_ALIGNMENT_CHECKLIST.md`
- 更新 `PROJECT_CONTEXT.md`
- 更新 `PRODUCT_SPEC.md`
- 更新 `UI_STYLE_GUIDE.md`
- 新建 `docs/adr/0001-product-session-run-boundaries.md`
- 更新本计划任务状态

接口：
- 依赖：任务 1–12 的测试与浏览器证据。
- 产出：对齐矩阵最终状态、三层领域边界 ADR、用户可核验的完成报告。

测试：
- 文档搜索无“固定三栏”“资料库第一步”“TaskRecord 按商品日志”“Amazon ASCII only”等过时真相。
- AIS P0 全部“对齐”；P1 核心行有实现和证据；P2 遮罩/图片工具标记可达。
- 文档中的命令、文件和截图路径实际存在。

实现步骤：
1. 按任务证据逐行刷新 AIS checklist，不因测试通过自动把未验收项标为对齐。
2. 在 PROJECT_CONTEXT 固化商品资料、平台 session、production run 三层关系及非目标。
3. PRODUCT_SPEC 更新对象、流程、持久化、历史恢复、Provider、mask 和导出契约。
4. ADR 记录选择三层结构、放弃 v1 业务迁移、保留运行设置、替代方案和后果。
5. 最终报告分别给出：呈现结果、实现机制、AIS 对齐、治理落地、覆盖页面/状态/视口、未覆盖与风险。

验证命令：
```bash
rg -n "固定三栏|第一步：管理商品|ASCII characters only|尚不能宣称.*对齐完成" PROJECT_CONTEXT.md PRODUCT_SPEC.md UI_STYLE_GUIDE.md AIS_ALIGNMENT_CHECKLIST.md
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

预期失败：
实施前文档仍描述旧三栏、旧资料库入口和部分对齐状态。

预期通过：
过时搜索只在历史背景/已废弃说明中出现并有明确标注；全部验证命令通过。

完成证据：
最终对齐表、ADR、浏览器证据索引和五类结论报告。

失败处理：
进入 `diagnose`；如果某项缺少真实浏览器或请求契约证据，将其保留为“部分”，不得用文档提前宣布完成。

任务 13 执行记录（已完成 · 2026-07-20）：
- 呈现结果：资料库、Amazon、生产记录、设置和遮罩 Dialog 的既有浏览器证据继续通过；本任务未改变产品 UI，只将文档结论校准到同一份已验收实现。
- 实现机制：`PROJECT_CONTEXT.md`、`PRODUCT_SPEC.md` 和 ADR 固化 ProductProject、PlatformSession、ProductionRun 三层边界，以及 v2 业务空启动、runtime settings v1 保留、历史快照和 Provider 能力门禁。
- AIS 对齐：`AIS_ALIGNMENT_CHECKLIST.md` 的 P0 全部标记“对齐”；P1 核心项有代码/测试/浏览器证据并解释外部限制；P2 遮罩与图片工具标记“可达”。
- 治理落地：`UI_STYLE_GUIDE.md` 增加对齐交接入口；新增 `tests/alignment-docs-contract.test.ts`，防止旧结论、关键 ADR、测试文件和浏览器证据路径漂移。
- 工程证据：过时文档搜索无命中；`pnpm check:ui`、`pnpm typecheck`、`pnpm test`（56 个文件、342/342）、`pnpm build`、`pnpm test:browser` 全部通过。
- 未覆盖与风险：真实外部 Provider、CORS/配额/模型质量、Seller Central 最终审核、像素 diff 和移动端工作台不属于确定性验收；构建保留约 549 kB 主 JS 体积警告，浏览器保留一个被过滤的既有 404 资源提示。

## 8. 执行顺序与检查点

```text
任务 1
→ 任务 2–3
→ 任务 4–5
→ 任务 6
→ 任务 7–8
→ 任务 9–10
→ 任务 11
→ 任务 12
→ 任务 13
```

检查点 A（任务 3 后，已通过 · 2026-07-20）：资料库和 Amazon 已通过新 session 连通，v2 reload 可恢复。

检查点 A 记录：
- v2 业务存储空启动与 reload 恢复、runtime settings v1 保留：4 个文件、21 项测试通过。
- 资料库共享商品/参考素材/平台进度与精确 workflow 导航：3 个文件、8 项测试通过。
- Amazon 直达、独立 session、原子失败回滚、显式 facts 同步与输入恢复：4 个文件、18 项测试通过。
- `pnpm check:ui`、`pnpm typecheck` 通过；1280/900 浏览器证据无横向溢出，console error 为 0。
- 附加严格验证：`pnpm test` 为 46 个文件、284 项通过、1 项跳过；`pnpm build` 通过；任务 3 失败 draft 风险经 diagnose 修复并完成浏览器红绿复测。
- 检查点结论：通过；未开始任务 4。

检查点 B（任务 6 后，已通过 · 2026-07-20）：Amazon 默认 Listing/A+ 主路径和六站点 P0 可完成。

检查点 B 记录：
- 功能和流程：US、JP、DE、FR、IT、ES 六站策划/Copilot/合规/导出合同通过；Listing 与四类 A+ 可直达策划，标准 A+ 外部文案可编辑、复制、恢复和导出；Amazon 0/N → 1/N → N/N 的逐图生产、重生成、版本切换、失败重试和交付闭环通过。
- 前端呈现与一致性：任务 4–6 均复用项目 Token、Panel、Field、Button、StatusChip、Dialog、MediaSlot、ActionBar 与既有壳；1280 和任务 6 的 900 风险断点无横向溢出、文字裁切或操作遮挡，每个决策范围只有一个 primary，loading/error/success/disabled/旧版本状态均有真实浏览器证据。
- 实现机制：marketplace catalog 统一拥有六站语言与合规合同；A+ catalog/normalizer 统一拥有模块与 externalText 合同；`PlatformSession + currentSlotVersion + amazon-stage` 统一拥有阶段、完成度和主动作，workspace 兼容镜像、session 与 active run 在持久化事务中同步。
- 测试、构建和浏览器证据：任务 6 指定聚焦测试 33/33、独立复测 21/21、`pnpm check:ui`、`pnpm typecheck`、最终全量 312/312 与 `pnpm build` 均通过；`tests/browser-checkpoint-b.mjs` 对任务 4–6 的真实页面流程通过，证据位于 `artifacts/cross-platform-ais/`。
- 未覆盖范围与风险：真实外部模型的自然语言质量、Seller Central 最终审核和网络/provider 波动不属于确定性测试；生产构建保留约 501 kB 主 JS chunk 的非阻断体积警告。任务 7 的隐藏风格参考图、任务 8 的双配置/provider 路径尚未开始。
- 检查点结论：通过；暂停在任务 6 后，未开始任务 7。
检查点 C（任务 10 后，已通过 · 2026-07-20）：P1 风格、Provider、历史、导出闭环可完成。

检查点 C 记录：
- 功能流程：隐藏风格参考、dual/single Provider、OpenRouter/DeepSeek 代表路径、生产 run 筛选/恢复/fork/图片复用、部分/完整导出和历史重导出形成闭环；Listing/A+ 切换会恢复各自 session，无 session 时 Intake 仍与目标模式一致。
- 前端呈现：设置、生产记录和导出继续复用 Token 与共享 UI；生产记录导航/H1 领域语言一致，唯一当前 run、最新默认展开、筛选空态和历史操作可达；900/1280 关键断点无横向溢出，固定 ActionBar 不遮挡输入或主动作。
- 实现机制：`PlatformSession` 保存当前工作上下文，`ProductionRun` 保存不可变策划/版本/选项快照，事件引用 asset/version/export；派生查询不改持久化数据，历史导出不读取不相关的当前全局状态。
- 测试结果：任务 7–10 聚焦测试与独立复测全部通过；最终 `pnpm check:ui`、`pnpm typecheck`、53 个测试文件 332/332、`pnpm build`、`pnpm test:browser` 均通过。浏览器烟测覆盖 Intake、Listing/A+、失败重试、版本恢复、部分导出、生产记录、900/899 断点和 console 过滤后的未解释 error 为 0。
- 浏览器证据：证据位于 `artifacts/cross-platform-ais/`，任务 9/10 主证据为 `task9-production-runs-1280.png`、`task9-filter-empty-1280.png`、`task9-fork-restored-1280.png`、`task9-production-runs-900.png`、`task10-partial-export-1280.png`、`task10-history-reexport-1280.png`；当前生产记录页为 1280px、1 个 current run、1 个重新导出入口、无横向溢出，console error 为 0。
- 剩余风险：真实 Seller Central 上传与外部 provider 不在确定性测试范围；程序化 `<a>` 下载无法由当前浏览器控制后端直接捕获；任务 9 前缺少 `slotVersionsSnapshot` 的老 run 会明确拒绝历史重导出；主 JS 533.72 kB 保留非阻断体积警告。
- 检查点结论：通过；暂停在任务 10 后，未开始任务 11。

检查点 D（任务 11 后，已通过 · 2026-07-20）：AIS 核心可达图片编辑能力补齐。
检查点 D 记录：
- 局部编辑、最小图片工具、provider mask 合同、不可变版本、失败回滚、历史参考图复用均有定向测试与真实 Demo 浏览器证据。
- 任务 11 不扩张为通用 Photoshop 画布；历史快照不直接改写，需先恢复或基于记录新建后在槽位检查器编辑。
- 检查点结论：通过；下一步进入任务 12，集中处理跨页面视觉/响应式治理与浏览器证据索引。

检查点 E（任务 13 后，已通过 · 2026-07-20）：视觉、工程、对齐和治理分别验收。
检查点 E 记录：
- 用户体验：任务 12 的同一代码、状态和视口证据再次通过完整浏览器烟测；未用测试替代视觉结论。
- 工程运行：治理检查、类型、56 个测试文件 342/342、生产构建和浏览器烟测通过。
- AIS 对齐：P0 全部对齐；P1 核心证据与限制已记录；P2 遮罩可达；AIS commit 保持 `bca89d728e415c453db363dcba30ac8ea243edaf`。
- 治理机制：三层领域 ADR、当前产品规格、UI 规范和文档契约测试共同作为后续真相源。
- 检查点结论：通过；本实施计划完成，后续超越或扩张需新计划。

每个检查点失败时先进入 `diagnose`，不跨批次继续堆 UI 或兼容分支。

## 9. 最终完成定义

同时满足以下条件才能声明计划完成：

1. 资料库保存平台无关事实/素材，并能显示、开始或继续不同平台会话。
2. Amazon 不依赖资料库页面跳转，可完成 AIS README 等价主路径。
3. Amazon 1/N 完成时仍处于逐图生产，只有 N/N 或明确部分交付检查才进入交付。
4. 六站点的可见文案、Copilot、合规、历史和导出上下文一致，不存在全局 ASCII 冲突。
5. Listing 7–12、四类 A+、1–12 模块、A+外部文案、尺寸、负载、Prompt 和版本行为均可验收。
6. 可编辑风格板与隐藏风格图在附图/A+生效，MAIN 排除。
7. dual/single/OpenRouter/DeepSeek 代表请求路径有契约测试和可读 UI 状态。
8. 生产记录按真实 run 组织并支持筛选、恢复、fork、图片复用和历史重导出。
9. 遮罩局部编辑和最小图片工具可达，结果创建新不可变版本。
10. v1 测试业务数据不再读取，runtime settings 保留。
11. 所有验证命令通过，目标 viewport 无溢出/遮挡/滚动冲突，console 无未解释错误。
12. AIS_ALIGNMENT_CHECKLIST 的 P0 全部对齐，P1 核心能力有证据，P2 遮罩可达；非目标项有清晰说明。

## 10. 主要风险与控制

- **单个 store 改动面大**：保持现有 Zustand facade，先改变持久化文档和按 session 的操作参数；只有重复选择/拼装逻辑出现第二个真实消费者时再抽 hook/service。
- **平台抽象过度**：只为 Amazon Listing、Amazon A+、淘宝三个真实 workflow 建模，不建立插件系统或任意 JSON schema。
- **运行中上下文串线**：所有 async plan/generate/edit/export 都校验 projectId、sessionId、runId、requestId 和 lifecycle；切换项目或 fork run 必须取消旧 owner。
- **历史快照体积**：run 保存结构化 plan/context 和 asset/version 引用，不复制 Blob 或大段 data URL。
- **风格图与参考图超限**：统一走 reference payload 预算，不能在 provider adapter 中静默丢图。
- **Provider 能力差异**：capability gate 先于提交；unsupported 是可见状态，不冒充成功降级。
- **Mask Canvas 复杂度**：限制为单图局部遮罩，不引入图层、自由排版、批量画布或完整编辑器。
- **文档状态漂移**：任务 13 只能基于同一 commit 的新鲜测试/截图更新结论。
