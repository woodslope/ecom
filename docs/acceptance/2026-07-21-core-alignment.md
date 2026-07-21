# 核心功能对齐验收记录

- 日期：2026-07-21
- 范围：GitHub Pages 发布合同、资料/Session/Run 解耦、本地批量任务、Amazon/淘宝工作区接线
- 运行方式：React + Vite，浏览器本地优先，无必需后端

## 已验收

- `ProductProject` 保存共享商品事实与参考素材；`PlatformSession` 保存平台和工作流上下文；`ProductionRun` 保存不可变生产记录。
- Amazon Listing、Amazon A+、淘宝商品生产包使用独立 Session，Session 的有效事实贯通到策划、生成、合规、历史恢复和 Copilot。
- `ExecutionJob` 独立于 Run，当前支持当前商品/当前工作流的剩余槽位批量生成，状态为 `queued / running / paused / completed / failed / canceled`，并支持进度、取消、失败重试和刷新恢复。
- 生产记录页展示本地任务面板；Amazon 和淘宝工作区都提供“批量生成剩余槽位”入口。
- Vite 子路径和 GitHub Actions Pages 部署合同可用，API Key 只保存在浏览器运行设置中。

## 验证命令

```text
pnpm check:ui
pnpm typecheck
pnpm test              # 74 个测试文件，387 项通过
pnpm build
VITE_BASE_PATH=/Ecom/ pnpm build
pnpm test:browser
```

## 浏览器证据

- 桌面端启动 Amazon 批量任务，6 个剩余槽位完成后，生产记录显示 `批量生成 · 已完成 · Amazon Listing · 6 / 6`，对应 Run 显示 `7 张输出 / 已完整`。
- 390px 视口显示既有桌面端门槛（至少 900px），没有重叠或不可见的关键操作。
- 当前页面控制台无 `warn/error`；浏览器冒烟测试保留一个被过滤的 404 资源提示，属于测试夹具噪声，不影响主流程。

## 未承诺边界

- 本地任务依赖浏览器运行，页面或浏览器关闭后不会继续执行。
- 当前不是跨商品批量 Agent、服务端 Worker，也不保证 Provider、CORS、配额、模型质量或平台最终审核。
