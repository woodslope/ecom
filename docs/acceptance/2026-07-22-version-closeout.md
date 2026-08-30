# 版本收口验收记录

- 日期：2026-07-28（在 2026-07-22 收口基线上补充复验）
- 状态：历史验收资料；当前状态以最新验收 manifest 为准。
- 范围：当前工作区内 Amazon、淘宝生产工作流，商品与平台上下文切换，生成/失败/恢复/导出闭环，本地数据备份，设置与 UI 治理
- 运行方式：React + Vite，浏览器本地优先，无必需后端
- 收口原则：只确认当前已实现范围，不扩展新功能，不以自动化测试替代真实浏览器体验验收

## 综合结论

当前版本可交付。核心路径、异常恢复、刷新持久化、交付包实物和多视口布局均已在真实浏览器中复验；类型检查、自动化测试、UI 治理检查和生产构建全部通过。未发现阻断交付的 P0/P1 问题。

本次仅完成工作区版本收口，未提交、未推送、未部署。

## 用户体验结论

- Amazon Listing、Amazon A+、淘宝三条主路径可以从资料准备进入策划、生成、失败重试、版本查看和恢复。
- 商品切换、平台切换、创建草稿商品、离开确认、风格板增删、A+ 模块编辑、设置保存均有明确反馈。
- 刷新后平台、文案、Prompt、活动版本与运行设置可以恢复。
- 1600、1280、1100、900px 桌面视口未发现横向溢出、弹窗裁切或关键操作不可达；899px 正确进入桌面端门禁。
- 899px 门禁会聚焦自身，并以 `inert` 与 `aria-hidden` 隔离底层工作台；恢复到 900px 后解除隔离。
- Amazon 与淘宝空输入时会直接显示禁用原因，并通过 `aria-describedby` 关联主操作。
- 淘宝手机预览在桌面工作台中可正常查看。
- 结论：体验闭环成立，无已知阻断问题。

## 结构与 Owner 结论

- 商品事实与素材、平台工作流上下文、生产运行记录继续由既有领域边界承载，没有引入第二套状态来源。
- 商品上下文栏、平台商品选择、流程步进、全局素材上传和离开确认均由独立组件承载，并由正式页面消费。
- 平台阶段、商品来源文本、工作区总览提示和平台商品选择规则归入对应领域模块，并有测试覆盖。
- 新增文件均有真实消费者或测试；临时体验审查脚本已移除。
- 本地备份沿用现有 localStorage 与 IndexedDB owner，不另建业务状态来源；恢复前校验文件并在写入失败时尝试回滚。
- 结论：状态与组件责任可辨认，未发现重复 owner 或临时旁路。

## 治理机制结论

- UI token、基础组件和骨架检查通过。
- 关键共享交互有契约测试，平台工作流有领域与界面测试，浏览器冒烟覆盖跨平台主路径。
- 未发现 `TODO`、`FIXME`、`HACK`、`debugger`、测试聚焦/跳过或业务代码 `console.log` 调试残留。
- favicon 和烟测连接失败夹具均使用真实资源路径；烟测会严格报告控制台错误与 HTTP 404 URL。
- `git diff --check` 通过，没有空白错误。
- 结论：当前规范已有自动化护栏，不依赖人工记忆维持。

## 真实浏览器验收

执行（完整烟测连续两次通过）：

```text
pnpm test:browser
node tests/browser-checkpoint-b.mjs
```

已覆盖：

- 新建商品、商品切换、恢复和 Amazon 草稿商品确认。
- Amazon Listing / A+，US / JP 本地化，A+ 标题、正文与模块 stale 状态。
- 自定义风格板创建、删除确认和 A+ 模块弹窗。
- 策划、生成、加载、失败、保留旧版本、重试、0/7 至 7/7 完整生产。
- 多版本切换、活动版本持久化与刷新恢复。
- Copilot、设置保存和刷新恢复。
- 淘宝分析、策划、生成和手机预览。
- 设置页本地数据备份入口、备份范围和 API Key 排除说明。
- 1600、1280、1100、900px 布局，899px 桌面门禁，横向溢出和控制台检查。

人工复核截图：

- `artifacts/cross-platform-ais/library-1280.png`
- `artifacts/cross-platform-ais/amazon-listing-1280.png`
- `artifacts/cross-platform-ais/amazon-aplus-module-dialog-1280.png`
- `artifacts/cross-platform-ais/generation-error-1280.png`
- `artifacts/cross-platform-ais/production-history-900.png`
- `artifacts/cross-platform-ais/settings-api-1280.png`
- `artifacts/cross-platform-ais/taobao-review-1280.png`
- `artifacts/cross-platform-ais/taobao-mobile-preview-1280.png`
- `artifacts/cross-platform-ais/desktop-gate-899.png`

## ZIP 交付包实物验证

浏览器测试完成真实 ZIP 下载与解压，确认：

- 包内存在 `manifest.json`。
- ZIP 文件名日期与 manifest 一致。
- 当前 Prompt 进入 manifest。
- 部分交付正确标记 `ready=false`，缺失槽位记录正确。

## 最终工程检查

```text
pnpm typecheck           # 通过
pnpm test                # 88 个测试文件、455 项测试通过；UI 治理检查通过
pnpm build               # 通过；最大业务块 452.31 kB，无 500 kB 警告
VITE_BASE_PATH=/ecom/ pnpm build  # 通过
pnpm test:browser        # 连续两次通过，无意外 404 或控制台错误
git diff --check         # 通过
```

## 已知风险与未覆盖边界

- 本地备份文件包含素材二进制数据，大型素材库会产生较大的 JSON 文件；当前未提供云同步或增量备份。
- 恢复会替换当前业务数据，界面已要求显式确认；API Key 和 Provider 设置不会随备份迁移。
- 未验证真实外部 API / Provider 的在线可用性、配额、CORS、模型输出质量或平台最终审核结果。
- 未在真实部署环境执行发布后验收；本结论针对当前本地工作区和生产构建产物。
