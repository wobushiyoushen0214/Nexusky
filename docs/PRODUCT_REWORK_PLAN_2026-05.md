# Nexusky 产品改造与调优计划

> 日期: 2026-05-30
> 目标: 把 Nexusky 从“功能完整的 AI 知识工作台”收束为“本地 Markdown vault 的可信 AI 认知伙伴”。
> 执行规则: 每完成一项调优，都要更新本文状态，并为该项单独提交代码。按用户要求，本轮不使用 ESLint。

## 1. 改造结论

Nexusky 的问题不是功能不足，而是用户进入产品后看见的入口、任务和 AI 能力过多，核心价值不够集中。下一阶段应围绕一个可重复闭环调优:

1. 打开或创建本地 Markdown vault。
2. 本地索引并展示 Vault Health。
3. 让用户在 5 分钟内得到第一次有来源的 AI 回答。
4. 把维护队列压缩成少数可完成的小任务。
5. 所有 AI 写入保持 preview-first、可撤销、可解释。
6. 长期上下文沉淀为用户能理解的“记忆”和“为什么推荐这个”。

一句话定位:

> Nexusky 把本地 Markdown 知识库变成一个可搜索、可连接、可维护、可被 AI 解释并有边界执行的认知伙伴。

## 2. 本轮执行范围

本轮只做能直接改善激活路径、入口清晰度和认知伙伴表达的调优。大型架构拆分、同步重构、移动端、协作、插件市场不纳入本轮。

| ID | 项目 | 状态 | 目标文件 | 验收方式 |
| --- | --- | --- | --- | --- |
| D0 | 建立本改造计划文档 | 完成 | `docs/PRODUCT_REWORK_PLAN_2026-05.md` | 文档存在，包含范围、优先级、验收和执行记录 |
| A1 | 默认 ActivityBar 入口收束 | 完成 | `activity-bar-registry.ts`, `PRODUCT.md` | 新用户默认只看到核心入口，旧用户配置不被强制清空 |
| A2 | Vault Health 改成启动后的任务首页 | 完成 | `VaultHealthScreen.tsx`, i18n | 扫描结果不只是指标，还给出“今天先做什么”的清晰节奏 |
| A3 | WelcomeScreen 首屏叙事收束 | 完成 | `WelcomeScreen.tsx`, i18n | 首屏表达本地 vault、AI 上下文、可控写入，不再只是“AI 知识库” |
| A4 | 维护队列从问题列表转成小任务 | 完成 | `MaintenanceQueuePanel.tsx`, i18n | 队列顶部出现优先 3 项，用户能快速开始 |
| A5 | 长期上下文用户化命名 | 待做 | long-context / observability 相关 UI | 将 debug 术语包装为 Memory Ledger、Context Pack、Why this |
| A6 | Agent 入口继续后置 | 待做 | Command / Chat / Maintenance 相关入口 | Agent 不作为普通用户首要入口，只在任务执行时出现 |

## 3. 优先级说明

### A1 默认 ActivityBar 入口收束

当前默认入口仍包含文件、搜索、聊天、图谱、知识空间、阅读、文档大纲、标签、维护等多个入口。对新用户来说，这会把“先做什么”变成选择题。

调整原则:

- 默认保留: Files、Search、AI Chat、Knowledge Graph、Knowledge Maintenance。
- 默认后置: Knowledge Space、Reader Inbox、Outline、Tags、Calendar、Daily Note。
- 后置不等于删除。用户仍可通过 More、命令面板或上下文入口访问。
- 旧用户已有 `activity-bar-store` 配置时，不强制重置。

验收:

- `ACTIVITY_BAR_REGISTRY` 的 `defaultVisible` 只保留核心入口。
- `PRODUCT.md` 的 Surface Decisions 追加决策记录。
- `pnpm typecheck` 通过。

### A2 Vault Health 改成启动后的任务首页

Vault Health 已经存在，但目前更像指标仪表盘。它应该成为激活路径的中心，让用户打开 vault 后立即知道下一步。

调整原则:

- 指标继续保留，但降低“报表感”。
- 下一步改为三类明确任务: Ask、Repair、Map。
- 文案强调本地索引、来源引用和可控维护。
- 错误、扫描中、空 vault 状态都要给出可行动方向。

验收:

- 英中 i18n 完整。
- 扫描中和错误状态不只显示裸文本。
- `pnpm typecheck` 通过。

### A3 WelcomeScreen 首屏叙事收束

欢迎页应成为第一次激活前的产品定位，而不是普通打开文件夹入口。

调整原则:

- 用三条短信号表达: Local Markdown、Long memory、Inspectable AI。
- 创建和打开 vault 的按钮保持主次清晰。
- 最近打开列表保持紧凑，不做装饰卡片。
- 继续使用产品 UI 的克制风格。

验收:

- 文案支持 i18n。
- 交互路径不变。
- `pnpm typecheck` 通过。

### A4 维护队列从问题列表转成小任务

维护队列已有能力，但用户感知容易变成“系统指出一堆问题”。本轮先在 UI 层加一个优先任务区，不改变底层队列生成。

调整原则:

- 顶部展示最多 3 个优先任务。
- 优先顺序: unresolved link、duplicate title、orphan、overdue/open task、memory refresh。
- 保留完整队列和过滤器。
- 所有写入仍走现有 preview/confirm/undo。

验收:

- 顶部优先任务可直接触发现有 action。
- 完整队列仍可访问。
- 相关测试或 typecheck 通过。

### A5 长期上下文用户化命名

长期上下文是差异化资产，但当前 UI 名称偏工程化。本轮先做命名和入口层调优，不改 ranker 或数据模型。

调整原则:

- Memory Ledger: AI 记得什么。
- Context Pack: 本轮回答看到了什么。
- Why this: 为什么推荐这个关系或内容。
- 保留 observability 给高级用户，但默认文案面向普通知识工作者。

验收:

- 用户可在界面理解来源、原因、置信度、反馈。
- 调试面板不再是唯一感知入口。
- `pnpm typecheck` 通过。

### A6 Agent 入口继续后置

Agent 是执行能力，不应成为新用户理解产品的入口。它应该藏在维护和聊天任务之后。

调整原则:

- Chat 中只保留自然的“转为计划/执行”路径。
- Maintenance 中的批量处理可以进入 Agent plan。
- ActivityBar、普通欢迎路径和首屏文案不突出 Agent。

验收:

- Agent 可达但不是主导航卖点。
- 对已有用户和命令面板不回归。
- `pnpm typecheck` 通过。

## 4. 验证策略

每项完成后至少执行:

```bash
pnpm typecheck
```

如果该项触及已有测试覆盖的服务、store 或纯函数，还要执行对应测试。按用户要求，不执行 ESLint。

## 5. 执行记录

| 日期 | 项目 | 状态 | 说明 |
| --- | --- | --- | --- |
| 2026-05-30 | D0 建立计划文档 | 完成 | 新增本文件，作为后续调优和回写的唯一执行跟踪入口 |
| 2026-05-30 | A1 默认 ActivityBar 入口收束 | 完成 | Canvas、Reader、Outline、Tags 改为默认隐藏，核心入口收束到 Files、Search、AI Chat、Graph、Maintenance；`PRODUCT.md` 已追加决策记录 |
| 2026-05-30 | A2 Vault Health 改成启动后的任务首页 | 完成 | 增加任务导向摘要、扫描/错误状态说明、Ask/Repair/Map 下一步标签；中英文 i18n 已补齐，`pnpm typecheck` 通过 |
| 2026-05-30 | A3 WelcomeScreen 首屏叙事收束 | 完成 | 欢迎页改为 i18n 文案，首屏突出 Local Markdown、Long memory、Reviewable AI；创建、打开、最近 vault 交互保持不变，`pnpm typecheck` 通过 |
| 2026-05-30 | A4 维护队列从问题列表转成小任务 | 完成 | 队列顶部新增“先做这几件”区域，复用现有优先级排序展示最多 3 项；剩余队列继续保留，中英文 i18n 已补齐，`pnpm typecheck` 通过 |
