# Nexusky 产品目标一致性亮点

> 日期：2026-06-04  
> 目的：在清理偏离点之后，记录当前已经符合“本地 Markdown vault + 维护层 + 可信 AI”目标的产品亮点，并标出下一步优化方向。  
> 结论：Nexusky 的强点不在横向堆模块，而在把真实 vault 的结构、来源、维护和 AI 写入边界连成可信闭环。

## 1. 当前最符合目标的亮点

| 亮点 | 为什么符合目标 | 证据面 |
| --- | --- | --- |
| Vault Health 作为进入 vault 后的第一价值点 | 不需要 AI Provider 也能给用户本地、可行动的健康反馈，直接服务“长期维护自己的 Markdown vault” | `VaultHealthScreen.tsx`、`vault-health.ts`、`tests/vault-health.test.ts` |
| 普通 Chat 默认有来源问答 | `ai:chat` 已经走本地检索、引用来源和长期上下文，适合可信 AI 主入口，不需要默认 Agent 化 | `ai.ipc.ts`、`ChatPanel.tsx`、`tests/ai-onboarding-prompts.test.ts` |
| 请求前外发预览 + 成本预算 | 用户能在发送前看到 Provider、片段、长期上下文、工具定义和成本，强化本地优先产品的边界透明 | `outbound-preview.ts`、`ChatPanel.tsx`、`tests/ai-outbound-preview.test.ts` |
| Maintenance Queue + feedback | 维护不是泛泛提醒，而是可完成、可跳过、可稍后和可标记不相关的任务流，避免“系统审判感” | `MaintenanceQueuePanel.tsx`、`maintenance-queue.ts`、`tests/maintenance-feedback.test.ts` |
| Workflow Rules 驱动维护 | 用户可以用 Markdown/本地规则塑造维护标准，继续保持 vault 文件是 source of truth | `workflow-rules.ts`、`workflow-sample-support.ts`、`tests/maintenance-workflow-rules.test.ts` |
| VaultMutation / file operation mutation | AI edit、维护修复和高风险文件操作都在走 hash、preview、apply、undo、history、trash/audit 边界 | `vault-mutation.ts`、`file-content-mutation.ts`、`file-operation-mutation.ts` |
| Memory Ledger / Context Pack | 长期上下文有 evidence、reason、confidence、feedback 和 Hot/Warm/Cold 层级，不只是黑盒 RAG | `context-pack-builder.ts`、Related Context UI、`tests/long-context-pack.test.ts` |
| Graph 维护任务化 | 图谱不只是装饰可视化，而能聚焦孤岛、桥接和推断关系，服务 vault 结构修复 | `GraphView.tsx`、`graph-maintenance.ts`、`tests/graph-ui.test.ts` |
| 10k vault 回归和同步灾难演练 | 目标用户有真实大 vault，性能和恢复能力比新增炫目功能更重要 | `large-vault-performance-smoke.test.ts`、`SYNC_DISASTER_RECOVERY_DRILL.md` |
| 本地内置插件/模板包边界 | 示例包帮助激活 workflow，但不承诺远程 marketplace、抽成或平台化生态 | `PLUGIN_COMMANDS.md`、`plugin.ipc.ts`、`tests/plugin-api.test.ts` |

## 2. 本轮顺手优化

本轮继续清理两个轻量但用户可见的措辞问题：

- Vault Health 的 Ask AI prompt 已经走普通 RAG chat，因此提示从“local search/tools”改为“local search and Context Pack / 本地搜索和上下文包”。
- No-AI 模式和无 Provider toast 不再说 “Agent actions”，改为 “Vault tools / 可审查执行”，让用户理解需要 Provider 的是 AI 工具和执行能力，而不是一个独立 Agent 主产品。
- Chat 的 `Vault 工具` 开关现在根据当前启用 Provider 的 `capabilities.toolCalling` 启用；不支持工具调用的 Provider 会停留在普通来源问答路径，不再等发送后才报错。
- Maintenance 的 Vault Health 趋势卡已接入维护反馈摘要，显示最近 7 天完成、延后/跳过和不相关的处理数量，让“维护行为”与“健康趋势”在同一张卡里可见。
- Chat 的 `Vault 工具` 开关旁现在展示工具清单边界摘要，区分只读、预览写入和执行型工具，避免用户把工具模式误解成静默自动写入。

## 3. 下一步优化候选

| 优先级 | 候选项 | 目标 |
| --- | --- | --- |
| P0 | Chat source 与 Context Pack 的解释合并 | 回答里不仅显示“用了哪些笔记”，还显示“为什么想起这些关系” |
| P0 | Maintenance 完成历史和健康趋势联动（第一版已完成） | 用户能看到本周处理了多少维护项；后续继续把具体修复类型与 Health Score 扣分因子关联 |
| P1 | Properties View 继续保持轻量 frontmatter 视角 | 避免发展成对象数据库，只做 Markdown/frontmatter 的浏览、筛选和补字段 |
| P1 | Vault tools 工具清单分级（第一版已完成） | 在开启工具前区分“只读工具 / 写入需编辑或维护预览”的边界；后续可展开到具体工具清单 |
| P1 | Workflow sample 的首启路径继续压缩 | 示例 vault 应直接导向 Vault Health、Ask with sources、Maintenance top 3 |

## 4. 保留原则

- 任何新增能力先问：是否强化本地 Markdown vault 的搜索、连接、维护、解释或安全执行。
- 任何 AI 写入都必须 preview-first，并能解释来源、影响和回滚路径。
- 任何平台化、团队化、对象数据库化、完整移动编辑器化的方向都不能进入当前主线。
