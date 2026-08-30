# Application Flow

The product has one production path: browser-configured API services produce a platform plan, images, and immutable `ProductionRun` history. API is the only production runtime.

```text
新建任务
  -> 填写商品资料和参考图
  -> 设置平台、工作流和任务参数
  -> 选择或生成行业模板
  -> API 策划
  -> 检查策略、证据和 Prompt
  -> API 逐图生成
  -> 人工调整、版本切换或遮罩编辑
  -> 合规检查
  -> 导出
  -> 保存历史
  -> 历史恢复或复制为新任务

ProductProject + selected references
  -> PlatformSession + taskSettings
  -> prompting/builders.ts (the only Prompt entry point)
  -> API runtime/transport
  -> ProductionRun (source: api) + ProductionEvent
```

`taskSettings` is the structured boundary for platform, workflow, marketplace, input, references, and generation options, and is the only structured task-settings entry into an API Prompt. Components do not assemble provider payloads or prompts directly.

For every planner request it is built from the current `PlatformSession.options` and includes `platformId`, `workflowId`, `marketplaceId`, `plannerMode`, `listingImageCount`, `aPlusType`, `aPlusModuleSpecs`, `sizeTier`, `stylePresetId`, and `selectedReferenceAssetIds` where applicable. `activeIndustryGuidance` is the selected template snapshot and replaces, rather than stacks with, the general industry guidance; platform slot, size, count, language, and compliance rules remain owned by `platformContract`.

未配置文本 API 时，策划、行业模板改造、Copilot 和商品本地化会明确阻断；未配置图片 API 时，逐图生成、批量生成和遮罩编辑会明确阻断。应用仍可打开、填写资料和保存设置。

Persistence uses API-only namespaces:

- Projects: `ecom-workbench.projects.v3`
- Current sessions: `ecom-workbench.workspace.api.v1.{projectId}`
- Production runs: IndexedDB `ecom-workbench-runs-api-v1`
- Runtime settings: `ecom-workbench.runtime-settings.api.v1`

Old v1/v2 settings and workspace data are not read or migrated by the product path. Local backup excludes runtime settings and API keys.
