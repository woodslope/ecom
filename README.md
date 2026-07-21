# Ecom

浏览器本地优先的电商 AI 图片生产工作台。当前支持 Amazon Listing / A+ 和淘宝 / 天猫商品生产包，可使用本地 Demo 引擎，也可在浏览器中配置兼容 Provider。

## 本地运行

要求 Node.js 20 和 pnpm 10。

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
```

验证 GitHub Pages 子路径构建：

```bash
VITE_BASE_PATH=/Ecom/ pnpm build
```

仓库名不是 `Ecom` 时，将环境变量改为实际仓库名。GitHub Actions 部署工作流会自动使用当前仓库名，不需要手工修改。

## GitHub Pages 部署

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 `Settings > Pages` 中将 `Source` 设为 `GitHub Actions`。
3. 等待 `Deploy GitHub Pages` 工作流完成。
4. 打开工作流输出的 Pages 地址。

应用不依赖必需后端。商品资料、图片、Session、ProductionRun、本地任务和 API 配置保存在当前浏览器；API Key 不会写入仓库或静态构建。外部 Provider 必须支持 HTTPS 和浏览器 CORS。

更多架构和验收信息见 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)、[PRODUCT_SPEC.md](PRODUCT_SPEC.md) 和 [核心功能对齐验收记录](docs/acceptance/2026-07-21-core-alignment.md)。
