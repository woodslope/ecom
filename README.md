# Ecom

浏览器本地优先的电商 AI 图片生产工作台。当前支持 Amazon Listing / A+ 和淘宝 / 天猫商品生产包，可使用本地 Demo 引擎，也可在浏览器中配置兼容 Provider。

## 本地运行

支持 Node.js `>=22.13 <25` 和 pnpm `>=10 <12`；仓库当前锁定 pnpm `11.9.0`。

```bash
pnpm install
pnpm dev
```

默认地址：`http://127.0.0.1:5192/`

## 验证与构建

```bash
pnpm check:ui
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
pnpm test:browser
pnpm test:browser:governance
pnpm test:ui:acceptance
```

`test:browser` 是双平台关键路径冒烟；`test:browser:governance` 追加 Amazon 本地化、A+、完整生命周期、失败恢复、遮罩编辑及版本切换。`test:ui:acceptance` 是完整收口入口，会依次运行 UI 治理、类型、单元测试、标准与子路径构建、500 kB 业务入口块预算和全部浏览器治理场景。

每次浏览器或完整验收都会写入独立的 `artifacts/cross-platform-ais/runs/<时间戳>/`，其中 `manifest.json` 记录 Git 状态、工具版本、命令结果、视口与环境条件、测试数量、构建大小和本次截图清单；`artifacts/cross-platform-ais/latest.json` 指向最近一次运行。目录根部的旧截图仅是历史证据，不能单独代表当前基线。

验证 GitHub Pages 子路径构建：

```bash
VITE_BASE_PATH=/ecom/ pnpm build
```

仓库名不是 `ecom` 时，将环境变量改为实际仓库名。GitHub Actions 部署工作流会自动使用当前仓库名，不需要手工修改。

## GitHub Pages 部署

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 `Settings > Pages` 中将 `Source` 设为 `GitHub Actions`。
3. 等待 `Deploy GitHub Pages` 工作流完成。
4. 打开工作流输出的 Pages 地址。

应用不依赖必需后端。商品资料、图片、Session、ProductionRun、本地任务和 API 配置保存在当前浏览器；API Key 不会写入仓库或静态构建。外部 Provider 必须支持 HTTPS 和浏览器 CORS。当前浏览器治理使用仓库锁定的 Playwright Chromium；Safari/Firefox 与真实外部 Provider 不在本地自动验收范围内。

更多架构和验收信息见 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)、[PRODUCT_SPEC.md](PRODUCT_SPEC.md) 和 [核心功能对齐验收记录](docs/acceptance/2026-07-21-core-alignment.md)。
