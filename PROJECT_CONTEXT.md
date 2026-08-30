# Ecom Project Context

> 当前真相源：项目起源、开源参考、领域边界、关键取舍和后续协作门禁。
> Updated: 2026-08-30

## 1. 项目目标

Ecom 是一个浏览器本地优先的电商 AI 图片生产工作台，面向没有专职电商设计师的独立店铺经营者。核心闭环是：

```text
建立商品资料与参考素材
→ 创建平台工作会话
→ AI 策划 Listing / A+ 或淘宝图组
→ 逐槽位生成，或创建当前工作流的本地批量任务
→ 编辑和切换版本
→ 查看合规提醒
→ 按生产 Run 恢复、复用和重新导出
```

产品帮助用户完成资料整理、图片策划、生成、局部修改和交付准备，但不承诺平台自动通过，也不替代经营者的事实核对和 Seller Central 最终审核。

## 2. 开源参考与边界

本项目参考：

- [ziguishian/MxPage](https://github.com/ziguishian/MxPage)
- [Ali-Aria/amazon-image-studio](https://github.com/Ali-Aria/amazon-image-studio)

Amazon Listing / A+ 的行为对齐真相源锁定为 AIS commit `bca89d728e415c453db363dcba30ac8ea243edaf`。实现方式是行为对齐：Ecom 保留自有 React/Vite/Zustand 壳、领域模型和本地存储，不整仓替换 AIS，也没有证据表明当前代码直接复制 AIS 或 MxPage 源文件。

若以后直接复用上游源文件或实质片段，必须保留相应许可证与版权文本，并在 `THIRD_PARTY_NOTICES.md` 记录文件范围。升级 AIS 对齐目标时必须显式更新 commit，禁止静默漂移。

## 3. 当前产品模型

### 3.1 ProductProject：共享商品事实

`ProductProject` 保存平台无关的商品名称、品类、品牌、型号、SKU、目标人群、描述、卖点、禁用声明和规格。参考素材以 project scope 保存。

- ProductProject 与参考素材仍按商品持久化；当前界面由平台新任务创建草稿，并从平台历史恢复或派生既有任务，不提供独立资料库导航。
- Amazon Listing 原文属于平台 session；当前工作台不会用解析结果静默覆盖共享事实。
- 平台工作区可以从直接输入原子创建 draft project/session，但不能静默覆盖已有事实。

### 3.2 PlatformSession：当前平台工作上下文

`PlatformSession` 保存一次可继续编辑的工作上下文：

- `projectId`、`platformId`、`workflowId`
- Listing 原文和所选参考素材
- 可选 `planningInput` 快照：来源、输入质量、缺项、本次文字、勾选商品图和资料库来源版本
- Amazon 站点、Listing/A+ 模式、数量/模块、尺寸档和风格
- 当前 plan、输入签名、选中槽位、不可变版本集合和当前 run

Amazon Listing、Amazon A+ 和淘宝商品生产包使用独立 session。切换模式或刷新会恢复各自上下文，不把另一模式的 plan 混入当前工作区。

两平台共用 `standard / image-only / facts-only / empty` 输入评估。只有空输入禁止策划；纯图片和纯资料均可生成策划草稿。策划、输入签名和恢复快照只消费本次勾选的商品参考图，风格参考图不计入商品图完整度。纯图片任务必须经过模型读图能力门禁，不能静默降级为忽略图片的文本策划。

### 3.3 ProductionRun：不可变生产记录

`ProductionRun` 保存一次完整制作过程的快照：

- session、platform、workflow 和固定为 `api` 的生产来源
- 输入、选项、参考素材和风格上下文快照
- 输入来源、质量、缺项、本次勾选商品图和来源项目版本快照
- plan、输入签名和槽位版本快照
- plan/generate/regenerate/edit/export 事件
- planned/producing/ready/partial/failed/canceled 状态

生产记录按 Run 筛选、展开、恢复、fork、复用图片和重新导出。恢复会回到对应平台工作上下文；fork 创建新 session/run；历史重导出读取原 run 快照，不切换当前任务。

```mermaid
flowchart LR
  P["ProductProject\n共享事实与素材"] --> S["PlatformSession\n当前可编辑上下文"]
  S --> R["ProductionRun\n不可变生产快照"]
  R --> E["ProductionEvent\n策划/生成/编辑/导出"]
```

## 4. Amazon 对齐结论

**Amazon 对齐阶段已完成。** 当前基线覆盖：

- 默认美国站，并支持 JP/DE/FR/IT/ES。
- Listing 默认 7 张，可选 7–12 张。
- A+ 默认 `standard-large`，支持四类 A+ 和模块编排。
- Listing 文本解析、共享事实显式同步和参考图选择。
- API 策划、Prompt Preview、逐槽生成、失败重试和不可变版本。
- 生成尺寸与平台上传建议尺寸分离。
- 参考图 16 张、1024/768 压缩降级和 8 MiB 请求负载边界。
- 项目风格预设、style asset、MAIN 排除和风格引用保护。
- 槽位级合规提醒、站点语言约束和人工复核边界。
- dual/single Provider、OpenRouter/DeepSeek 代表路径与能力门禁。
- ProductionRun 筛选/恢复/fork/复用/历史重导出；生产来源固定为 API。历史区另有一条只读“流程示例”，不属于生产记录。
- 遮罩局部编辑、图片工具、Provider mask、版本追加和失败回滚。

完整状态、证据和限制见 `AIS_ALIGNMENT_CHECKLIST.md`。这里的“完成”指锁定 AIS commit 下的行为对齐基线，不包括像素级视觉复制、真实外部模型质量或 Seller Central 最终批准。

## 5. 持久化与迁移决策

项目与素材使用 API-only 业务命名空间：

- 项目：`ecom-workbench.projects.v3`
- 素材数据库：`ecom-workbench-assets-v2`

当前可编辑会话使用 `ecom-workbench.workspace.api.v1.{projectId}`。V3 只保存 `currentSessions` 和 `updatedAt`；ProductionRun 独立保存在 IndexedDB `ecom-workbench-runs-api-v1`，不再依赖当前 session 存在。旧 workspace 在本次开发重置中直接失效，不由产品路径读取或迁移。

旧 v1 测试业务数据和旧运行设置均不迁移、不读取。运行设置以 API-only key `ecom-workbench.runtime-settings.api.v1` 保存；旧 v1/v2 key 过期。删除项目按 runs、assets、API workspace、项目元数据顺序清理，失败可重试；不调用 `localStorage.clear()`。

设置页支持导出和恢复单个 JSON 本地备份。备份覆盖商品、v2/v3 workspace、素材 Blob、ProductionRun、本地任务和界面偏好；恢复会替换这些业务数据，并在写入失败时尝试回滚。运行设置、API Key 和 Provider 地址不进入备份，恢复后保持当前浏览器配置不变。

## AI 链路三层边界

AI 相关代码按“提示词层 → 请求/Provider 层 → 应用层”组织：

- `src/domain/prompting/` 只维护源码提示词、输出契约、版本和来源，不访问网络。
- `src/domain/prompting/builders.ts` 是唯一 Prompt 入口；结构化任务参数统一由 `taskSettings` 进入应用层。
- `src/services/ai/transport/` 统一 endpoint、Chat/Responses、SSE、超时、取消、错误和图片响应；`adapters/` 只把领域请求转换为现有引擎接口。
- `src/services/ai/runtime-factory.ts` 根据命名服务配置组装 Runtime；Store 只调用 Runtime，不判断 Provider 协议。

每个新 ProductionRun 保存 Prompt 版本、行业模板/Profile 摘要和文本/图片 Provider 非敏感摘要；旧 Run 缺少这些字段时按历史记录正常恢复。核心系统提示词由源码维护，界面只展示版本和来源。

## 6. 产品与技术边界

### 当前支持

- 本地多商品资料与参考素材。
- Amazon 与淘宝均可从手动资料、纯商品图或两者组合开始；无档案提交时原子创建本地草稿，既有任务从平台历史恢复或派生。
- Amazon Listing / A+ 主路径和已可独立运行的淘宝 / 天猫商品生产包（次级 rule pack）。
- OpenAI-compatible API 是唯一生产运行时；产品不提供 Demo 运行模式。
- 可解释策划、Prompt 编辑、Copilot、图片生成、局部编辑和 ZIP 交付。
- 当前商品、当前平台工作流内的本地批量生成任务，支持进度、取消、失败重试和刷新后继续。
- 业务数据的本地 JSON 备份与恢复，API Key 和 Provider 设置除外。
- 淘宝商品分析、固定 5 张主图 + 7 张详情图、逐图生产、手机商品页预览、部分/完整导出和历史重导出。
- 桌面工作台：最低支持 `900px`；`899px` 及以下显示桌面门禁，不提供移动端生产工作台。`900–1099px` 保留槽位/检查器两栏，任务输入按需以浮层展开。
- 单一浅色主题：系统深色偏好不切换第二套视觉 Token。

### 当前不承诺

- Seller Central 自动获批或真实商品事实自动正确。
- 所有 Provider、网络、CORS、配额和模型质量都可用。
- 通用 Photoshop 画布、跨商品批量 Agent、网页搜索或全自动投放。
- 移动端生产工作台、PWA/Electron/私有化分发。
- 与 AIS 相同的视觉像素、DOM 或源码结构。

## 7. 验收与证据

产品体验、治理实现和工程运行必须分别下结论：

- 用户体验：真实浏览器中的任务可发现、状态可理解、主流程、滚动、遮挡和断点。
- 治理实现：Token、共享 UI、页面壳、状态和动作层级是否由同一套机制拥有。
- 工程运行：类型、测试、构建、Provider/存储契约和浏览器错误。

当前浏览器证据位于 `artifacts/cross-platform-ais/runs/<时间戳>/`，`latest.json` 指向最近一次运行，批次内 `manifest.json` 是判断本次命令、环境和截图归属的依据；目录根部旧图仅保留作历史证据。完整收口运行 `pnpm test:ui:acceptance`，覆盖 UI 治理、类型、单元测试、标准与 `/ecom/` 子路径构建、500 kB 业务入口块预算，以及 `1600×900 / 1366×768 / 1280×800 / 1200×800 / 900×800 / 900×650 / 899×800`、系统深色偏好、减少动效、强制色、DPR 2、125% 缩放等效 CSS 视口、双平台空态/历史、120 条历史分页与错误恢复、模态隔离、窄桌面任务输入浮层、淘宝固定 12 槽位预览、Amazon 本地化/A+、生产生命周期、失败恢复、遮罩编辑和版本切换。自动浏览器范围为 Playwright Chromium；Safari/Firefox、真实 Provider、平台上传审核与浏览器自身 UI 缩放行为仍需人工或外部环境验证。

## 8. 后续协作门禁

Amazon 对齐已从“实施阶段”切换为“维护基线”。后续改动分两类：

1. 修复或维护：不得破坏本文件、产品规格、AIS 清单、ADR 和 UI 规范中的现有合同。
2. 超越或扩张：跨商品批量 Agent、常驻后台执行、向导化简化、移动端、品牌视觉大改、更多 Provider 或 MxPage 能力必须单独做产品决策和计划，不能作为对齐缺陷偷偷加入。

## 9. 文档职责

- `PROJECT_CONTEXT.md`：起源、策略、三层领域边界和协作门禁。
- `PRODUCT_SPEC.md`：当前可交付产品行为和数据合同。
- `AIS_ALIGNMENT_CHECKLIST.md`：AIS 能力状态、证据和限制。
- `UI_STYLE_GUIDE.md`：前端视觉、组件、响应式和治理合同。
- `docs/adr/0001-product-session-run-boundaries.md`：三层领域与 API-only 存储决策。
- `docs/adr/0002-github-pages-local-first-runtime.md`：GitHub Pages、浏览器本地运行与 ExecutionJob 边界。
- `docs/acceptance/`：已完成阶段的验收证据和可复核记录。

当前目录包含 Git 元数据；改动审查以当前工作区 diff、验证命令和浏览器证据为准。本次收口未自动提交、推送或部署。
