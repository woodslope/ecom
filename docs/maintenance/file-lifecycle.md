# 文件生命周期与仓库卫生

## 文件分类

- **运行时**：`src/`、`index.html`、`public/` 和 Vite/TypeScript 配置。删除前必须确认入口、构建和运行时消费者。
- **质量门禁**：`scripts/check-*.mjs`、`scripts/run-ui-acceptance.mjs`、`tests/` 和测试夹具。删除前必须确认 `package.json`、CI、文档和验收覆盖。
- **产品与架构文档**：根目录规格、ADR、架构说明和验收记录。历史记录保留，但必须标注状态和日期。
- **生成物**：`dist/`、`artifacts/`、截图、manifest 和测试报告。不得提交到 Git；验收证据按保留策略归档。
- **本机文件**：`node_modules/`、`*.tsbuildinfo`、`.DS_Store`、`.claude/`、日志和环境文件。只在本机生成，不进入仓库。

## 脚本规则

持续门禁脚本必须有 `package.json`、CI 或验收入口消费者。浏览器场景脚本必须对应一个独立风险或用户流程；重复覆盖应先合并、验证，再删除旧入口。一次性迁移或修复脚本完成后删除，必要的操作步骤转入文档。

新增脚本、组件或领域模块时，在同一变更中说明用途、消费者和测试入口。没有消费者的文件由 `pnpm check:repo` 报告，人工确认后处理，不自动删除。

## 证据规则

仓库不保存构建目录和浏览器截图。本地保留最近 3–5 次验收运行、`latest.json` 和最新 manifest；更早批次移到仓库外归档，并保留 Git SHA、运行时间、命令结果和截图索引。

## 提交前检查

```text
pnpm check:repo
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
```

发布前或定期运行完整浏览器验收。删除文件时使用独立提交，避免与产品功能改动混合，确保可以按提交回滚。
