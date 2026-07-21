# AIS ↔ Ecom 能力对照清单

> Status: aligned baseline · reviewed 2026-07-21
> 真相源：Ali-Aria/amazon-image-studio @ `bca89d728e415c453db363dcba30ac8ea243edaf`
> 实现方式：A. 行为对齐；保留 Ecom 自有代码壳，不复制 AIS 源码。
> 浏览器证据：`artifacts/cross-platform-ais/`

本文只判断 Amazon Listing / A+ 的行为、默认值、规则语义和可交付路径。淘宝 / 天猫已完成独立商品生产 workflow，但仍不作为 Amazon 对齐对象；MxPage 能力、像素级视觉复刻和更激进的产品简化属于后续范围。

## 1. 状态与优先级

| 状态 | 含义 |
| --- | --- |
| **对齐** | Ecom 行为已覆盖 AIS 等价主路径，并有代码、测试或浏览器证据。 |
| **部分（已解释）** | 主路径可用，但保留 Ecom 形态或受外部能力限制；限制和证据已写明。 |
| **可达（P2）** | AIS 暴露的扩展能力已能从产品路径进入，仍不承诺与 AIS 编辑器完全同构。 |
| **N/A** | 不属于 Amazon 对齐对象。 |

- **P0**：Amazon 默认主路径不可缺失。
- **P1**：参数、负载、历史、Provider、合规或交付语义必须可解释且可验证。
- **P2**：扩展能力可分阶段补齐，但不能写成永久舍弃。

## 2. 总览

| # | 模块 | 当前状态 | 优先级 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 站点与本地化 | **对齐** | P0 | `amazon-marketplaces.ts`、站点契约测试、JP/多站点浏览器路径 |
| 2 | Listing 槽位与数量 | **对齐** | P0 | `resolveAmazonPlanningSession`、Listing 7–12 测试 |
| 3 | A+ 类型与模块编排 | **对齐** | P0 | A+ catalog、模块编排控件、A+ 浏览器证据 |
| 4 | 主流程与信息架构 | **对齐** | P0 | `PlatformWorkspace`、Listing/A+ 主路径烟测 |
| 5 | 输入模型与 Listing 解析 | **对齐** | P0 | `parseAmazonListingText`、资料区解析与同步测试 |
| 6 | 策划引擎与结果模型 | **对齐** | P0 | Demo/API planner、normalizer、session 输入签名 |
| 7 | Prompt Preview、选位、逐张生成 | **对齐** | P0 | SlotBoard/Inspector、版本和生成浏览器证据 |
| 8 | 生成尺寸与上传建议尺寸 | **对齐** | P0 | `generation-size.ts`、Prompt 双尺寸和导出契约 |
| 9 | 参考图压缩与请求负载 | **对齐** | P1 | 最多 16 张、1024/768 降级、8 MiB 上限测试 |
| 10 | 风格板与隐藏风格参考 | **部分（已解释）** | P1 | 三套文本预设、style asset 和 MAIN 排除规则；未承诺 AIS 同款编辑器 |
| 11 | 合规提醒 | **对齐** | P1 | 槽位级自动检查、站点 CJK warning、人工复核文案 |
| 12 | 历史、任务、复用 | **对齐** | P1 | `ProductionRun`、筛选/恢复/fork/复用/历史重导出 |
| 13 | API 配置与 Provider | **部分（已解释）** | P1 | dual/single、OpenRouter/DeepSeek 门禁和连接测试；真实 Provider 质量不由本地测试保证 |
| 14 | 导出与交付包 | **对齐** | P1 | 当前版本 ZIP、manifest、Prompt 快照、部分/完整导出 |
| 15 | 遮罩编辑与图片工具 | **可达（P2）** | P2 | Mask Dialog、Provider mask、不可变版本、失败回滚 |
| 16 | Demo 模式 | **保留** | — | Demo 输出显式标记，不伪装为真实模型 |
| 17 | 淘宝 / 天猫 | **N/A** | 非对齐验收 | 独立 `taobao-product` workflow 已完成，另有淘宝专项测试；不纳入 Amazon 对齐结论 |

## 3. P0 对齐结论

### 3.1 站点与本地化

默认站点为 `us` / `en-US`，支持 `jp`、`de`、`fr`、`it`、`es`。站点进入 session options、rule pack、Prompt 和可见文案规则；旧 session 缺站点时归一化到 `us`。JP 路径和跨站点语言约束有测试及浏览器证据。真实 Seller Central 的最终语言审核仍属于外部风险。

### 3.2 Listing 与 A+

Listing 默认 `MAIN + PT01–PT06` 共 7 张，可选 7–12 张。A+ 默认 `standard-large`，同时支持标准、普通、高级和手机 A+ 类型，以及模块数量和尺寸编排。计划由当前 session options 解析，不再依赖固定合并槽位。

### 3.3 主路径与输入

用户可以从 Amazon 直接进入或从资料库继续：选择 Listing/A+、站点和编排，粘贴 Listing 或维护共享事实，上传参考图，执行 AI 策划，选择槽位，查看/编辑 Prompt，逐槽生成并导出。Listing 解析结果只有在用户显式同步时才写回共享商品资料。

### 3.4 结果、版本与尺寸

每个槽位保持 Prompt、策略、依据、合规和当前版本上下文。生成尺寸与平台上传建议尺寸分开保存和显示；重生成、局部编辑和历史恢复追加不可变版本，失败不会覆盖旧版本。

## 4. P1 已解释结论

### 4.1 风格

Ecom 提供三套项目级文本风格预设，也允许项目范围的 style asset / 参考图参与附图与 A+；MAIN 明确不套用风格。当前不承诺 AIS 私有风格板编辑器的像素级同构，因此标为“部分（已解释）”，不影响默认主路径。

### 4.2 Provider

设置支持 Demo/API、双配置和单连接。OpenRouter、DeepSeek 的能力差异在请求前做门禁；不支持图片编辑的 Provider 不会静默退化为普通生成。连接测试、失败反馈、API Key 不回显和刷新恢复有浏览器证据。外部网络、CORS、账户额度和真实模型质量不属于本地确定性验收。

### 4.3 历史与导出

`ProductProject` 保存共享商品事实与素材；`PlatformSession` 保存一次平台工作上下文；`ProductionRun` 保存不可变策划/选项/版本快照和事件。生产记录按 Run 筛选、展开、恢复、fork、图片复用和历史重导出。当前导出使用 Ecom 的 ZIP/manifest 形态，但槽位、Prompt、版本和缺失项与 AIS 等价结果保持一致。

## 5. P2 可达能力

遮罩局部编辑从槽位当前版本进入 Mask Dialog，支持画笔、橡皮擦、大小、撤销/重做、重置、取消和保存。请求使用明确的 source image + PNG mask；目标缺失、空遮罩、全遮罩和尺寸不匹配会在本地拒绝。成功生成新不可变版本，Provider 失败或取消会回滚并保留旧版本。它是轻量图片工具，不宣称通用 Photoshop 画布。

## 6. 验收矩阵与证据

| 范围 | 证据 |
| --- | --- |
| Listing / A+、六站点、加载/失败/恢复、1/N/N/N | `tests/browser-smoke.mjs`、`artifacts/cross-platform-ais/amazon-*.png` |
| 资料库空态、搜索空态、平台进度、900px | `artifacts/cross-platform-ais/library-*.png` |
| 生产记录筛选、展开、恢复、历史导出、900px | `artifacts/cross-platform-ais/production-history-*.png`、`task9-*`、`task10-*` |
| 淘宝分析、固定 5+7 槽位、手机预览、部分/完整导出 | `tests/taobao-*.test.ts`、`artifacts/cross-platform-ais/taobao-mobile-preview-1280.png` |
| 设置 dual/single、连接错误、API 风险提示 | `artifacts/cross-platform-ais/settings-*.png`、`task8-*` |
| 遮罩默认、绘制、错误、保存版本、900px | `artifacts/cross-platform-ais/task11-mask-*.png` |
| 桌面门禁与滚动/溢出 | `desktop-gate-899.png`、`amazon-compact-900.png`、浏览器烟测几何断言 |

Amazon 对齐相关的最新工程证据：`pnpm check:ui`、`pnpm typecheck`、`pnpm test`（74 个文件、387/387）、`pnpm build`、`VITE_BASE_PATH=/Ecom/ pnpm build`、`pnpm test:browser` 均通过。浏览器仍有一个被过滤的既有 404 资源提示；没有未解释的 page error 或流程错误。淘宝任务 17–21、跨平台治理任务 22 和最终收口任务 23 的完整证据记录在 `TAOBAO_MXPAGE_IMPLEMENTATION_PLAN.md`。

## 7. 对齐完成定义

1. **P0 项全部为「对齐」**：已满足。
2. Listing 默认 7 张与普通 A+ 默认路径可从 Demo 浏览器流程走通：已满足。
3. 默认站点 `us`、Listing 7、A+ `standard-large`：已满足。
4. AIS commit `bca89d728e415c453db363dcba30ac8ea243edaf` 已锁定：已满足。
5. 未直接复制 AIS 源文件；如未来复用实质片段，必须补 `THIRD_PARTY_NOTICES.md`：当前满足。

**结论：Amazon 对齐基线已完成。** 后续可以单独讨论超越 AIS 的产品决策，但不能把真实 Provider 质量、Seller Central 最终审核或像素级视觉复刻写成已验证能力。

## 8. 非对齐范围

- 淘宝 / 天猫规则继续保留，但不作为 Amazon 对齐验收对象。
- MxPage 小红书工作流、批量商品主路径、不可达 Agent/网页搜索和分发形态不在本轮。
- 向导化简化、品牌视觉大改和移动端工作台需要新的产品决策，不能从本次对齐基线自动推导。
