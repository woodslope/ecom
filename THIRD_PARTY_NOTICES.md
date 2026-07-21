# Ecom Third-Party Notices

> 本文记录 Ecom 已知的功能参考项目、上游来源链和直接依赖许可证。它不是法律意见，也不替代发布前的许可证复核。

## 1. 当前归属状态

Ecom 当前没有声明项目自身的许可证，`package.json` 也尚未填写 `license`、`repository`、`author` 或 `homepage`。

现有证据可以确认两个项目被列为功能参考，但不足以仅凭当前仓库断言具体复制了哪些源文件。若未来确认存在直接复制、改写或包含实质性代码片段，必须保留对应上游版权和许可文本，并在本文补充文件范围。

## 2. 原始功能参考项目

### ziguishian/MxPage

- 仓库：https://github.com/ziguishian/MxPage
- 角色：原始开发提示明确列出的功能参考项目之一。
- 核对快照：2026-07-19 核对官方仓库 `main` 提交 `188477164e81b6c323b73e6397980c7077ba2140`。
- 许可证：MIT License。
- 版权声明：`Copyright (c) 2026 灵矩绘境 · MxPage`。
- 核对依据：官方仓库根目录 `LICENSE`、`README.md` 和 `package.json`；固定快照许可证链接：https://github.com/ziguishian/MxPage/blob/188477164e81b6c323b73e6397980c7077ba2140/LICENSE
- 当前复用边界：没有逐文件记录，不能断言直接代码复用范围。
- 许可要求：若复制或改写了其软件的实质部分，应在分发副本中保留上述版权声明与 MIT 许可文本。
- 说明：本次核对同时确认其商品详情页、小红书图文、批量创建、图片生成 / 编辑、后台任务与导出能力，但功能核对不等于确认 Ecom 已复制其代码。

### Ali-Aria/amazon-image-studio

- 仓库：https://github.com/Ali-Aria/amazon-image-studio
- 本地副本：`../AI作图（开源+API）/amazon-image-studio`
- 核对快照：2026-07-19 核对本地干净工作树所跟踪的官方 `upstream/main` 提交 `bca89d728e415c453db363dcba30ac8ea243edaf`。
- 许可证：MIT License。
- 版权声明：`Copyright (c) 2026 CookSleep`，`Modifications Copyright (c) 2026 Ali-Aria`。
- 固定快照许可证链接：https://github.com/Ali-Aria/amazon-image-studio/blob/bca89d728e415c453db363dcba30ac8ea243edaf/LICENSE
- 角色：原始开发提示明确列出的功能参考项目之一；其 Amazon Listing / A+ 策划、参考图、逐图生成、合规提示、历史与导出能力与 Ecom 当前领域高度相关。
- 当前复用边界：没有逐文件记录，不能仅凭功能相似性断言直接代码复制范围。
- 许可要求：若复制或改写了其软件的实质部分，应在分发副本中保留 MIT 版权声明与许可文本。

本地核对资料：

- [Amazon Image Studio README](<../AI作图（开源+API）/amazon-image-studio/README.md>)
- [Amazon Image Studio LICENSE](<../AI作图（开源+API）/amazon-image-studio/LICENSE>)

## 3. 上游来源链

### CookSleep/gpt_image_playground

- 仓库：https://github.com/CookSleep/gpt_image_playground
- 本地副本：`../AI作图（开源+API）/gpt_image_playground`
- 许可证：MIT License。
- 版权声明：`Copyright (c) 2026 CookSleep`。
- 关系：Amazon Image Studio 的 README 明确说明其基于该项目修改。
- 当前复用边界：它不是 Ecom 原始提示列出的两个参考项目之一；当前只将其记录为 Amazon Image Studio 的上游来源链。若后续确认 Ecom 直接复用了其代码，需要补充直接复用范围。

本地核对资料：

- [GPT Image Playground README](<../AI作图（开源+API）/gpt_image_playground/README.md>)
- [GPT Image Playground LICENSE](<../AI作图（开源+API）/gpt_image_playground/LICENSE>)

## 4. 当前直接运行依赖

以下许可证来自各依赖当前已安装包自身的 `package.json`：

| 依赖 | 用途 | 许可证 |
| --- | --- | --- |
| React | 界面框架 | MIT |
| React DOM | 浏览器渲染 | MIT |
| Zustand | 状态管理 | MIT |
| fflate | ZIP 压缩与导出 | MIT |
| lucide-react | 图标组件 | ISC |

版本和完整依赖树以 `package.json`、`pnpm-lock.yaml` 和实际发布构建为准。开发依赖及其传递依赖应在正式分发或开源前使用自动化许可证清单再次核对。

## 5. 发布或开源前检查

1. 对 Ecom 与两个参考项目执行文件级来源审计，区分功能借鉴、重写和直接复用。
2. 若存在直接复用，按实际采用快照再次核对上游许可证，并保留对应版权声明、LICENSE 和必要 NOTICE。
3. 明确 Ecom 自身许可证，再填写 `package.json` 的项目元数据。
4. 生成当次发布依赖的完整许可证清单，不仅依赖本文的手工摘要。
5. 在 README 或“关于”页面公开来源说明，避免把参考项目贡献表述为完全原创。

## 6. 维护规则

- 新增开源代码、素材、字体、模型或规则库时，同步更新本文。
- 不确定许可证时写“待核实”，不要猜测。
- 功能相似不等于代码复制；直接复制也不能仅以“参考”概括。
- 本文记录可确认事实，具体法律风险在正式商业发布前应由合适的专业人员复核。
