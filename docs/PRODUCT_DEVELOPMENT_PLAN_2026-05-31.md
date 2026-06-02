# Nexusky 未来产品详细开发计划

> 日期：2026-05-31
> 依据：`docs/PRODUCT_DIRECTION_2026-05-31.md`
> 目标：把“本地 Markdown vault 的 AI 认知维护伙伴”拆成可排期、可验收、可回滚的开发计划。

## 1. 总体结论

未来 12 个月的开发不应该围绕“还能加什么功能”，而应该围绕一个可重复的产品闭环：

> 打开 vault -> 得到健康报告 -> 处理少量高价值维护任务 -> 向 AI 提问并看到来源和原因 -> 安全执行可预览的整理动作 -> 每周回来看知识库如何变好。

因此开发主线分为四个版本：

| 阶段 | 时间 | 版本目标 | 产品结果 |
| --- | --- | --- | --- |
| Phase 1 | 0-4 周 | v0.6 Trust & Activation | 新用户 10 分钟内看到 vault health 和一次有来源 AI 回答 |
| Phase 2 | 1-3 个月 | v0.7 Weekly Maintenance Loop | 用户每周回来处理知识库健康任务 |
| Phase 3 | 3-6 个月 | v0.8 Cognitive Partner MVP | 维护、记忆、图谱、Agent 形成一个可解释执行闭环 |
| Phase 4 | 6-12 个月 | v1.0 Commercial Readiness | 同步、发布、专业工作流和付费能力建立在核心闭环之上 |

北极星指标：

> Weekly useful maintenance actions per active vault.

这个指标比“笔记数量”“AI 调用次数”“图谱打开次数”更接近产品价值，因为 Nexusky 的差异不是记录更多，而是让长期知识库持续可维护、可连接、可被 AI 安全使用。

## 2. 开发原则

1. **默认不新增一线入口**
   Files、Search、AI Chat、Graph、Maintenance、Vault Health 是核心。新能力优先进入这些 surface 内，不新增 Calendar、Daily Note、Kanban、Generic Space 之类独立入口。

2. **AI 能力必须有来源、有原因、有边界**
   所有 AI 回答和建议尽量附 source、why this、可反馈入口。所有写入动作必须 preview-first，可撤销或可回滚。

3. **维护任务要减少负担**
   维护队列不是问题清单，而是“今天先做 3 件”。低价值、低置信度、高噪声建议宁愿不展示。

4. **先做激活，再做增长**
   没有稳定的首启价值和每周回访理由之前，不投入插件市场、团队协作、移动端、大型商业化平台。

5. **每个阶段都有退出标准**
   阶段完成不是“功能写完”，而是关键路径、错误状态、i18n、性能、测试和文档都能支撑真实 vault。

## 3. 目标用户与关键行为

### 3.1 第一阶段目标用户

优先服务这三类用户：

| 用户 | 现状 | Nexusky 要给的第一价值 |
| --- | --- | --- |
| Obsidian / Markdown vault 用户 | 笔记多，结构逐渐混乱 | 一份可执行的 vault health report |
| 研究 / 写作 / 开发知识工作者 | 资料多，找旧关系困难 | 带引用和原因的 AI 回答 |
| AI power user | 想让 AI 读自己的长期知识 | 可控 Provider、Context Pack、Memory Ledger |

暂不作为主目标：

- 只想要简单日记的用户。
- 主要需要团队协作和权限管理的组织。
- 主要使用移动端捕捉的用户。
- 完全不愿配置任何 AI Provider 的用户。

### 3.2 要培养的核心习惯

| 触发 | 行为 | 即时奖励 | 长期投入 |
| --- | --- | --- | --- |
| 打开 vault | 查看 Vault Health | 知道今天先做什么 | 健康分、历史趋势 |
| 写完或导入资料 | 处理 1-3 个维护任务 | 笔记变得更可找 | 链接、属性、记忆增长 |
| 提问 | 查看带来源的回答 | 得到可信结论 | Context Pack 更准 |
| 每周 | 打开 Weekly Review | 看到主题和关系变化 | Memory Ledger 越来越懂用户 |

行为设计重点：

- 降低开始成本：默认给 3 件事，不让用户面对 19 类问题。
- 强化损失感：展示“如果不维护，哪些链接、任务、记忆会继续腐烂”。
- 保持控制感：建议可跳过、可静默、可解释、可撤销。
- 建立积累感：让用户看到 Memory Ledger、健康趋势、已修复问题数量。

## 4. 阶段计划

## Phase 1：v0.6 Trust & Activation，0-4 周

目标：

> 用户敢打开真实 vault，并在 10 分钟内看到一份可执行的健康报告和一次有来源 AI 回答。

### P1-A. Vault Health 作为默认任务首页

产品范围：

- 打开 vault 后优先展示健康摘要。
- 健康摘要从“指标仪表盘”升级成“下一步任务面板”。
- 默认展示最多 3 个优先 action：修未解析链接、处理孤岛、补缺失属性、复查待办、生成/刷新记忆。
- 每个 action 需要说明：为什么重要、影响多少笔记、预计耗时、是否会写入文件。

工程入口：

- `packages/main/src/services/vault-health.ts`
- `packages/main/src/services/maintenance/queue-builder.ts`
- `packages/renderer/src/components/VaultHealthScreen.tsx`
- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`
- `packages/renderer/src/stores/vault-store.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| A1.1 | 定义 health summary 数据结构 | 返回 note/link/task/memory/maintenance 摘要和 top actions |
| A1.2 | 建立 action priority 规则 | 同一 vault 多次打开排序稳定，低价值项不抢首位 |
| A1.3 | 首页卡片改为任务导向 | 用户不读说明也能知道“下一步点哪里” |
| A1.4 | 增加空状态和错误状态 | 空 vault、索引失败、权限失败都有明确下一步 |
| A1.5 | 加入 7 天展示节奏 | 不是每次打断，但用户可手动打开 |

验收口径：

- 1k、10k、50k notes vault 的 health summary 能在可接受时间内出现。
- 没有 AI Provider 时仍可展示非 AI health report。
- 中英文 UI 全部走 i18n。
- 所有写入 action 都明确进入 preview。

### P1-B. Maintenance Queue 缓存和异步化

产品范围：

- 维护队列扫描不能拖慢打开 vault。
- 队列支持后台刷新、增量更新、手动刷新。
- UI 需要展示扫描状态、最后更新时间、部分结果可用状态。

工程入口：

- `packages/main/src/services/maintenance/queue-builder.ts`
- `packages/main/src/services/maintenance/apply-fix.ts`
- `packages/main/src/services/watcher.ts`
- `packages/main/src/services/db-query-cache.ts`
- `packages/main/src/ipc/db.ipc.ts`
- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| A2.1 | 为维护扫描设计 cache key | 基于 vault id、文件 mtime、扫描类型、语言、设置生成 |
| A2.2 | 支持按类型异步扫描 | 链接、任务、属性、记忆、桥接等可分批完成 |
| A2.3 | 文件 watcher 触发增量失效 | 单文件变更不导致全 vault 重扫 |
| A2.4 | UI 支持 partial results | 扫描中也能先展示已有高置信任务 |
| A2.5 | 加性能日志 | 记录扫描耗时、命中缓存比例、超时类型 |

验收口径：

- 10k notes vault 打开时 UI 不被维护扫描阻塞。
- 重复打开同一 vault 能命中缓存。
- 修改单个文件后只刷新相关维护项。
- apply-fix 后对应维护项消失或状态更新。

### P1-C. AI Provider 配置和无 AI 路径

产品范围：

- 首启时支持跳过 AI 配置，但明确说明哪些能力不可用。
- Provider 设置支持测试问题、错误解释、延迟显示。
- AI 回答默认带来源；没有来源时必须明确说明“未找到相关笔记”。

工程入口：

- `packages/main/src/services/ai/*`
- `packages/main/src/services/ai/base-provider.ts`
- `packages/main/src/ipc/ai.ipc.ts`
- `packages/renderer/src/components/settings/Settings.tsx`
- `packages/renderer/src/components/ai/ChatPanel.tsx`
- `packages/renderer/src/components/ai/MessageBubble.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| A3.1 | Provider setup checklist | 保存前可测试连接、模型、响应、错误 |
| A3.2 | 无 AI 模式说明 | Vault Health、Search、Graph、Maintenance 可继续使用 |
| A3.3 | 错误归因文案 | API key、模型名、网络、限流、上下文过长分别提示 |
| A3.4 | 首次来源问答引导 | 新用户能从 health 或 sample question 发起一次引用问答 |
| A3.5 | 当前语言传入 AI prompt | AI 生成内容跟随 UI 语言 |

验收口径：

- Provider 失败不会导致首启卡死。
- 测试问题失败时用户能知道下一步修什么。
- 中文 UI 下 AI 生成维护解释、Context Pack、归档摘要默认中文。

### P1-D. 安全、隐私和信任说明

产品范围：

- 用户必须知道哪些内容只在本地，哪些会发送给 Provider。
- 写入、同步、发布、导入都要有清晰边界。
- 隐私说明应出现在设置、首启、AI 回答来源附近，而不是只放文档。

工程入口：

- `packages/renderer/src/components/settings/Settings.tsx`
- `packages/renderer/src/components/Onboarding.tsx`
- `packages/renderer/src/components/ai/ChatPanel.tsx`
- `packages/renderer/src/components/ai/MessageBubble.tsx`
- `packages/main/src/services/redact.ts`
- `docs/PROJECT_OVERVIEW.md`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| A4.1 | 增加 data boundary 文案 | AI、Sync、Publish、Import 分别说明数据流向 |
| A4.2 | AI 请求前来源提示 | 用户知道本次会发送哪些 note snippets |
| A4.3 | 记录 provider failure | 可排查但不记录敏感正文 |
| A4.4 | 更新 docs | 文档和 UI 说法一致 |

验收口径：

- 用户不需要读源码也能理解 AI Provider 数据流。
- 写入和发送行为没有隐藏默认项。

### P1-E. 质量基线

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| A5.1 | 建立 3 个 fixture vault | tiny、medium、large，覆盖链接、任务、属性、记忆 |
| A5.2 | 增加核心 smoke | 打开 vault、索引、health、search、AI source、maintenance apply、undo |
| A5.3 | typecheck 必跑 | 每个功能提交后至少跑相关测试和 `pnpm typecheck` |
| A5.4 | 不把 ESLint 作为当前阻塞 | 延续当前约定，不跑 ESLint，除非单独修 lint |

Phase 1 退出标准：

- 新用户打开真实 vault 后 10 分钟内能完成：health report -> 一次引用问答 -> 一个可预览维护动作。
- 无 AI Provider 的用户仍能理解产品价值。
- 维护扫描不会明显阻塞大 vault。
- 所有新增用户可见文案完成中英文 i18n。

## Phase 2：v0.7 Weekly Maintenance Loop，1-3 个月

目标：

> 让用户每周回来处理少量高价值知识维护任务，并看到知识库正在变好。

### P2-A. Maintenance Task Surface

产品范围：

- Maintenance 不再像列表，而像任务工作台。
- 顶部固定“今天先做这 3 件”。
- 支持 done、skip、snooze、not relevant、show reason。
- 同类问题合并展示，减少重复噪声。

工程入口：

- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`
- `packages/main/src/services/maintenance/queue-builder.ts`
- `packages/main/src/services/maintenance/apply-fix.ts`
- `packages/main/src/services/database.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B1.1 | 维护项状态持久化 | done/skip/snooze 不因刷新丢失 |
| B1.2 | 维护项合并规则 | 50 个同类断链不会压垮用户 |
| B1.3 | 优先级理由展示 | 用户知道为什么排前 |
| B1.4 | 任务完成反馈 | 完成后 health summary 立即变化 |
| B1.5 | snooze 策略 | snooze 后不会当天再次出现 |

### P2-B. Memory Ledger 产品化

产品范围：

- Memory Ledger 从技术概念变成用户能管理的“AI 记得什么”。
- 用户可以查看、纠正、忘记、刷新、导出记忆。
- AI 回答和建议能说明引用了哪些长期记忆。

工程入口：

- `packages/main/src/services/memory.ts`
- `packages/main/src/services/memory-links.ts`
- `packages/main/src/services/long-context/*`
- `packages/renderer/src/components/long-context/*`
- `packages/renderer/src/components/ai/MessageBubble.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B2.1 | Memory Ledger 首页卡片 | 展示主题、关系、最近更新、置信度 |
| B2.2 | 记忆纠错和忘记 | 用户可修改错误记忆或标记不再使用 |
| B2.3 | Why remembered | 说明记忆来自哪些 notes 和历史行为 |
| B2.4 | Memory freshness | 过旧记忆进入维护任务 |
| B2.5 | 导出和清空 | 信任敏感用户可迁移或删除 |

### P2-C. Context Pack 和引用解释

产品范围：

- AI 回答不只展示 source，还展示“为什么看这些 source”。
- Context Pack 可归档、可复用、可反馈。
- 用户能对 source 标记 useful / not related / wrong reason。

工程入口：

- `packages/main/src/services/long-context/context-pack-builder.ts`
- `packages/main/src/services/long-context/relation-ranker.ts`
- `packages/renderer/src/components/long-context/RelatedContextPanel.tsx`
- `packages/renderer/src/components/ai/ChatMessages.tsx`
- `packages/renderer/src/components/ai/MessageBubble.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B3.1 | Context Pack card | 回答旁展示本轮看了什么 |
| B3.2 | Why this labels | source 级原因稳定可读 |
| B3.3 | 反馈写入 ranking | 用户反馈影响后续排序 |
| B3.4 | 归档语言跟随 UI | 中文界面归档内容默认中文 |
| B3.5 | source click analytics | 统计用户是否检查引用 |

### P2-D. Search + Graph + Maintenance 串联

产品范围：

- 搜索结果可以跳图谱。
- 图谱节点可以看到维护 action。
- 维护项可以打开相关搜索或局部图谱。

工程入口：

- `packages/renderer/src/components/SearchPanel.tsx`
- `packages/renderer/src/components/graph/GraphView.tsx`
- `packages/renderer/src/components/graph/GraphPanel.tsx`
- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`
- `packages/main/src/services/note-search.ts`
- `packages/main/src/services/database.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B4.1 | Search result -> Graph | 选中 note 后可打开局部关系 |
| B4.2 | Graph node -> Maintenance | 节点显示断链、孤岛、缺属性等 action |
| B4.3 | Maintenance -> Search | 维护项可打开相关笔记集合 |
| B4.4 | Bridge notes workflow | 识别可连接主题并引导创建 bridge note |

### P2-E. Reader / Clipper Digest

产品范围：

- 导入内容不再是独立收件箱，而进入 digest 和连接建议。
- 导入后自动建议：总结、链接到已有 note、补属性、加入 Memory Ledger。

工程入口：

- `packages/main/src/services/reader-importer.ts`
- `packages/main/src/services/web-clipper.ts`
- `packages/main/src/services/obsidian-importer.ts`
- `packages/main/src/services/notion-importer.ts`
- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B5.1 | Import digest item | 导入后生成一组待消化任务 |
| B5.2 | Suggested links | 新资料自动关联已有笔记 |
| B5.3 | Digest apply preview | 总结、链接、frontmatter 写入均可预览 |
| B5.4 | Duplicate detection | 避免重复导入污染 vault |

### P2-F. Proactive 低频建议

产品范围：

- 每天最多 1-3 条。
- 只展示高置信、可解释、可关闭的建议。
- 每条建议都支持 useful、not related、snooze。

工程入口：

- `packages/main/src/services/proactive/*`
- `packages/renderer/src/components/proactive/*`
- `packages/renderer/src/stores/proactive-store.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| B6.1 | 全局频控 | 默认每天不超过 3 条 |
| B6.2 | 建议原因 | 每条建议说明触发因素 |
| B6.3 | 反馈闭环 | 反馈影响后续触发 |
| B6.4 | 静默模式 | 用户可关掉 toast，只保留通知中心 |

Phase 2 退出标准：

- 活跃用户每周至少能完成 3 个 useful maintenance actions。
- Maintenance、Memory Ledger、Context Pack 之间有清晰跳转。
- Proactive 不造成明显打扰，dismiss 率可控。
- 维护反馈开始影响推荐质量。

## Phase 3：v0.8 Cognitive Partner MVP，3-6 个月

目标：

> Nexusky 从“工具集合”变成“可信的长期认知伙伴”，能解释、建议并安全执行整理动作。

### P3-A. Maintenance -> Agent Plan -> Preview -> Execute -> Undo

产品范围：

- 用户从维护任务点击“批量处理”。
- 系统生成 Agent plan。
- 用户可审查步骤、影响文件、写入 diff。
- 执行后可撤销单步或整次运行。

工程入口：

- `packages/main/src/services/agent/*`
- `packages/main/src/ipc/agent.ipc.ts`
- `packages/main/src/services/maintenance/apply-fix.ts`
- `packages/main/src/services/tool-surface/registry.ts`
- `packages/renderer/src/components/agent/AgentRunPanel.tsx`
- `packages/renderer/src/components/maintenance/MaintenanceQueuePanel.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| C1.1 | Maintenance batch action | 多个维护项可生成一份 plan |
| C1.2 | Plan impact summary | 显示将改哪些文件、为何修改、风险等级 |
| C1.3 | Step preview | 每个写入步骤都有 diff |
| C1.4 | Execute with checkpoints | 每步执行前后记录状态 |
| C1.5 | Run-level undo | 整次执行可回滚，失败可恢复 |
| C1.6 | Execution history | 用户能复查过去做过什么 |

### P3-B. Agent step kinds 扩展

建议新增 step kinds：

| step kind | 用途 | 安全要求 |
| --- | --- | --- |
| `move_file` | 整理目录 | 目标路径校验、冲突预览、undo |
| `rename_file` | 修重复标题或命名 | 更新链接预览、undo |
| `delete_file` | 清理空笔记或重复导入 | 默认移入 vault `.trash` |
| `apply_tag` | 补标签 | diff 预览 |
| `update_frontmatter` | 补属性 | 结构化 patch |
| `create_link` | 建立双链 | 检查重复链接 |
| `merge_notes` | 合并重复笔记 | 高风险，默认只生成 plan |

验收口径：

- 所有 step kind 都支持 dry run。
- 所有写入都有 rollback data。
- 高风险动作默认要求二次确认。

### P3-C. Weekly Cognitive Review

产品范围：

- 每周自动生成一份认知复盘。
- 内容包括：新增主题、变强关系、孤岛变化、待维护项、本周值得继续写的方向。
- 用户可保存为 Markdown note，或仅作为 app 内 review。

工程入口：

- `packages/main/src/services/long-context/cognitive-review.ts`
- `packages/main/src/services/long-context/theme-extractor.ts`
- `packages/main/src/services/memory.ts`
- `packages/renderer/src/components/long-context/*`
- `packages/renderer/src/components/VaultHealthScreen.tsx`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| C3.1 | Review generator | 基于本周变更和 Memory Ledger 生成 |
| C3.2 | Review screen | 展示主题、关系、任务、建议 |
| C3.3 | Save to note | 用户可预览保存为 Markdown |
| C3.4 | Weekly notification | 默认低频，可关闭 |
| C3.5 | Review feedback | 用户可标记有用或错误 |

### P3-D. 关系反馈进入 ranking

产品范围：

- 用户对关系、来源、建议的反馈影响后续推荐。
- 排名规则要可解释，避免变成不可控黑箱。

工程入口：

- `packages/main/src/services/long-context/relation-ranker.ts`
- `packages/main/src/services/long-context/relation-store.ts`
- `packages/main/src/services/long-context/relation-candidates.ts`
- `packages/main/src/services/database.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| C4.1 | Feedback schema | 存储 useful、not related、wrong reason、snooze |
| C4.2 | Ranking weight | 反馈影响排序但可回退 |
| C4.3 | Debug view | 高级用户可看推荐原因 |
| C4.4 | Regression fixtures | 固定 vault 下排序可预测 |

### P3-E. 语义检索路线评估

产品范围：

- 在真实语义检索前先做评估，不直接引入高成本依赖。
- 比较本地 embedding、远程 embedding、混合检索的隐私、成本、性能。

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| C5.1 | 检索评估文档 | 明确是否做、怎么做、默认是否开启 |
| C5.2 | embedding provider 抽象草案 | 不绑定单一厂商 |
| C5.3 | 小范围实验 | fixture vault 上比较关键词、FTS、embedding、hybrid |
| C5.4 | 隐私说明 | 用户知道哪些文本会发出 |

### P3-F. 大组件拆分与性能治理

重点对象：

- `packages/renderer/src/components/ai/ChatPanel.tsx`
- `packages/renderer/src/components/canvas/CanvasView.tsx`
- `packages/renderer/src/components/graph/GraphView.tsx`
- `packages/main/src/ipc/db.ipc.ts`

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| C6.1 | ChatPanel 拆分 | 消息列表、输入区、工具结果、上下文面板独立 |
| C6.2 | GraphView 拆分 | 数据加载、布局、渲染、交互、设置独立 |
| C6.3 | CanvasView 收口 | 只服务 Properties 和 Timeline，不重新变成空间入口 |
| C6.4 | db.ipc 分域 | maintenance、graph、search、vault、settings 分文件 |
| C6.5 | 性能预算 | 大 vault 下关键交互有耗时记录 |

Phase 3 退出标准：

- 至少一条 Maintenance -> Agent plan -> execute -> undo 路径稳定。
- Weekly Cognitive Review 能成为每周回访理由。
- 用户反馈能改善推荐排序。
- 大 vault 的图谱、维护、AI 上下文不会互相拖慢。

## Phase 4：v1.0 Commercial Readiness，6-12 个月

目标：

> 在核心闭环成立后，再做同步、发布、专业工作流和商业化。

### P4-A. Managed Sync / Backup

产品范围：

- 保留 bring-your-own-sync。
- 官方 managed sync 只在数据安全、冲突处理、恢复体验足够可信后推出。

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| D1.1 | 冲突恢复体验 | 用户能理解并解决冲突 |
| D1.2 | 版本恢复 | 能恢复误删或错误同步 |
| D1.3 | 同步健康状态 | 展示最后同步、失败原因、待上传/下载 |
| D1.4 | 付费边界 | 免费保留本地和 BYO，同步作为增值 |

### P4-B. Hosted Publish / Export

产品范围：

- Publish 不是 Notion 站点替代，而是 Markdown vault 的选定内容发布。
- 支持静态导出、托管发布、私密链接可作为商业方向。

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| D2.1 | 发布集合 | 用户选择 folder/tag/property 生成发布范围 |
| D2.2 | 发布预览 | 写出前看到导航、链接、缺失资源 |
| D2.3 | 增量发布 | 大 vault 不全量重发；只写入变更文件并清理过期输出 |
| D2.4 | 撤回和权限 | 能取消发布或更新访问 |

### P4-C. 专业工作流包

优先顺序：

1. Research vault：文献、资料、引用、digest、weekly review。
2. Writing vault：选题、草稿、素材、结构、发布。
3. Developer knowledge base：ADR、debug notes、API notes、项目复盘。
4. Learning vault：课程、摘录、练习、复盘。

开发任务：

| ID | 任务 | 验收标准 |
| --- | --- | --- |
| D3.1 | 示例 vault | 每个工作流有真实内容样例 |
| D3.2 | 模板和维护规则 | 不做花哨模板，重点是 health 和 review |
| D3.3 | 官网 demo | 直接展示“打开 vault 得到 health report” |
| D3.4 | 迁移指南 | Obsidian / Logseq / Notion 用户知道怎么来 |

### P4-D. 插件和高级自动化

只有满足以下条件才启动插件 marketplace：

- 核心闭环留存已经成立。
- Tool Surface 权限模型明确。
- 写入工具有 preview/undo 标准。
- 插件安装、签名、权限、崩溃隔离都有方案。

不满足前，插件只保留为高级实验能力，不作为增长叙事。

### P4-E. 商业模式

建议优先级：

| 方案 | 建议 | 原因 |
| --- | --- | --- |
| Pro license | 优先 | 本地软件适合一次性或年费 Pro |
| Managed sync / backup | 优先 | 与本地数据主权叙事兼容 |
| Hosted publish | 次优先 | 面向写作者和研究者 |
| Workflow packs | 次优先 | 可作为增长素材和增值包 |
| 团队协作 | 暂缓 | 会把产品带入 Notion 战场 |
| 插件市场抽成 | 暂缓 | 生态尚未成熟 |

Phase 4 退出标准：

- 核心免费/Pro/同步/发布边界清晰。
- 官网叙事能在 60 秒内讲清差异化。
- 至少一个专业 workflow pack 能带来高质量用户。

## 5. 跨阶段工程轨道

### 5.1 i18n 和 AI 语言契约

要求：

- 所有用户可见文案进入 i18n。
- 所有 AI prompt 传入当前 UI language。
- 所有旧存量英文内容在 UI 层有兜底格式化。
- 日期时间按 locale 友好显示，不直接显示 ISO string。

验收：

- 中文 UI 下不出现无意义英文硬编码。
- Context Pack、Memory Ledger、Maintenance、Agent plan 生成内容跟随当前语言。

### 5.2 Preview-first 写入标准

所有写入型能力必须满足：

| 标准 | 要求 |
| --- | --- |
| Preview | 写入前展示影响文件、diff、风险 |
| Confirm | 高风险动作二次确认 |
| Undo | 单步或整次操作可撤销 |
| Trash | 删除默认进 vault `.trash` |
| Audit | 执行历史可复查 |
| Language | 预览摘要跟随 UI 语言 |

### 5.3 性能预算

建议预算：

| 场景 | 目标 |
| --- | --- |
| 打开 1k notes vault | 首屏 3 秒内有可用信息 |
| 打开 10k notes vault | UI 不阻塞，health 可分批出现 |
| 维护队列刷新 | 缓存命中后 1 秒内显示 |
| 图谱打开 | 先显示聚合视图，再懒加载局部 |
| AI 回答 | source 检索先返回状态，不假死 |

### 5.4 测试策略

必测路径：

- 打开 vault -> 索引 -> Vault Health。
- Search -> AI Chat with sources。
- Maintenance item -> preview -> apply -> undo。
- Memory Ledger -> Context Pack -> Why this。
- Proactive suggestion -> feedback -> snooze。
- Agent plan -> dry run -> execute -> rollback。

建议测试层级：

| 层级 | 覆盖 |
| --- | --- |
| Unit | queue priority、ranking、date formatting、language prompt |
| Integration | IPC、database、maintenance apply、agent executor |
| Fixture smoke | tiny/medium/large vault |
| Manual QA | 首启、Provider 失败、同步冲突、发布预览 |

### 5.5 文档和决策记录

每个阶段必须更新：

- `PRODUCT.md`：只记录产品取舍和入口决策。
- `docs/PRODUCT_REWORK_PLAN_2026-05.md` 或后续月度计划：记录执行状态。
- `docs/PROJECT_OVERVIEW.md`：架构或能力变化后更新。
- 新增阶段复盘文档：记录完成、延期、删除、下阶段风险。

## 6. 立即可执行的两周 Sprint

## Sprint 1：2026-06-01 到 2026-06-07

目标：

> 建立 v0.6 的任务骨架和工程基线。

任务：

| ID | Owner | 内容 | 验收 |
| --- | --- | --- | --- |
| S1.1 | Product/FE | Vault Health 页面信息架构二次收束 | 首页明确 3 个 next actions |
| S1.2 | Main | Maintenance cache 方案设计 | 写出 cache key、失效策略、风险 |
| S1.3 | Main/FE | 扫描状态协议 | UI 能展示 pending/partial/complete/error |
| S1.4 | AI | Provider setup checklist 设计 | 每种 Provider 都有测试和错误分类 |
| S1.5 | QA | fixture vault 设计 | tiny/medium/large 三套内容草案 |
| S1.6 | Docs | 数据边界说明草稿 | AI、sync、publish、import 数据流清楚 |

不做：

- 不新增主导航入口。
- 不做语义 embedding。
- 不做插件和移动端。

## Sprint 2：2026-06-08 到 2026-06-14

目标：

> 让 health 和 maintenance 在大 vault 下开始可用。

任务：

| ID | Owner | 内容 | 验收 |
| --- | --- | --- | --- |
| S2.1 | Main | Maintenance queue cache MVP | 重复打开同 vault 命中缓存 |
| S2.2 | Main | 按类型分批扫描 | 链接/任务/属性/记忆至少两类可分批 |
| S2.3 | FE | Partial results UI | 扫描中展示已完成分组和 loading |
| S2.4 | FE | Top 3 tasks 卡片 | 能从 Vault Health 跳到具体维护项 |
| S2.5 | AI/FE | Provider test UI 收口 | 成功、失败、超时都有状态 |
| S2.6 | QA | 核心 smoke 初版 | 打开 vault、health、maintenance preview |

## Sprint 3：2026-06-15 到 2026-06-21

目标：

> 打通“10 分钟激活”的完整用户路径。

任务：

| ID | Owner | 内容 | 验收 |
| --- | --- | --- | --- |
| S3.1 | Product/FE | 首启路径整理 | 打开 vault 后能自然到 health |
| S3.2 | AI | 首次引用问答入口 | 从 health 发起问题并展示 source |
| S3.3 | Main | apply-fix 后状态刷新 | 应用修复后维护项和健康摘要同步更新 |
| S3.4 | FE | 错误状态打磨 | Provider、索引、权限错误都有下一步 |
| S3.5 | i18n | 中文硬编码巡检 | 核心路径无英文残留 |
| S3.6 | Docs | v0.6 使用说明 | 写清打开 vault、配置 AI、维护任务 |

## Sprint 4：2026-06-22 到 2026-06-28

目标：

> v0.6 Release Candidate。

任务：

| ID | Owner | 内容 | 验收 |
| --- | --- | --- | --- |
| S4.1 | QA | tiny/medium/large fixture smoke | 核心路径通过 |
| S4.2 | Main/FE | 性能回归修复 | 大 vault 不阻塞核心 UI |
| S4.3 | Product | 文案和节奏收尾 | health 不打扰但可发现 |
| S4.4 | Docs | Release notes | 说明新激活路径和已知限制 |
| S4.5 | Product/Eng | v0.7 backlog 锁定 | 根据 v0.6 反馈调整 Phase 2 |

## 7. Backlog 优先级

### P0：必须先做

| 项目 | 原因 | 目标阶段 |
| --- | --- | --- |
| Maintenance Queue 缓存和异步化 | 大 vault 卡顿会毁掉信任 | Phase 1 |
| Vault Health 默认任务首页 | 决定首启激活 | Phase 1 |
| Provider 配置和错误解释 | AI 配置是激活门槛 | Phase 1 |
| AI 语言契约 | 中文用户体验和信任基础 | Phase 1 |
| 核心 smoke | 后续改动风险高 | Phase 1 |

### P1：形成产品记忆点

| 项目 | 原因 | 目标阶段 |
| --- | --- | --- |
| Maintenance Task Surface | 每周回访主循环 | Phase 2 |
| Memory Ledger 管理界面 | 长期认知伙伴差异化 | Phase 2 |
| Context Pack + Why this | AI 可信度 | Phase 2 |
| Search/Graph/Maintenance 串联 | 让图谱变成行动工具 | Phase 2 |
| Proactive 低频建议 | 回访提醒和价值发现 | Phase 2 |

### P2：扩大能力但不抢心智

| 项目 | 原因 | 目标阶段 |
| --- | --- | --- |
| Maintenance -> Agent 执行 | 把 AI 从回答推进到可控执行 | Phase 3 |
| Weekly Cognitive Review | 每周回访理由 | Phase 3 |
| 语义检索评估 | 增强搜索但需控制隐私和成本 | Phase 3 |
| 大组件拆分 | 降低后续迭代风险 | Phase 3 |
| Sync / Publish 商业化 | 核心闭环验证后再推 | Phase 4 |

## 8. 明确暂缓或删除的方向

继续暂缓：

- Calendar / Daily Note 独立入口。
- Kanban 独立 surface。
- Flashcards 作为一线 AI 命令。
- Generic Knowledge Space / Canvas 入口。
- 团队协作。
- 移动端。
- 插件 marketplace 商业化。

判断标准：

> 不能增强“搜索、连接、维护、解释、执行”闭环的功能，默认不进入主计划。

## 9. 指标体系

### 9.1 激活指标

| 指标 | 目标 |
| --- | --- |
| Open vault -> first health report time | 越短越好，目标 10 分钟内 |
| First useful AI answer rate | 第一次 AI 回答带来源且被用户继续点击 |
| AI provider setup success | 配置并测试成功比例 |
| First maintenance action apply rate | 首个维护动作应用比例 |
| No-AI activation rate | 无 AI Provider 用户是否仍继续使用 |

### 9.2 留存指标

| 指标 | 目标 |
| --- | --- |
| Weekly active vaults | 每周至少打开一次 vault |
| Weekly useful maintenance actions | 北极星指标 |
| Maintenance done / snooze / dismiss ratio | 衡量任务质量 |
| Memory Ledger corrections | 有纠错说明用户在意记忆质量 |
| Weekly Review open rate | 复盘是否成为习惯 |

### 9.3 信任指标

| 指标 | 目标 |
| --- | --- |
| AI write preview -> apply rate | 预览后是否敢应用 |
| Undo / rollback rate | 过高说明建议不准或风险过高 |
| Source citation click rate | 用户是否检查来源 |
| Provider error rate | AI 路径稳定性 |
| Sync conflict recovery success | 商业化前必须可控 |

## 10. 主要风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 功能再次发散 | 新增多个入口抢心智 | 所有新能力进入现有核心 surface |
| 维护队列噪声过大 | 用户只看到问题，不看到价值 | 默认 3 件事、反馈闭环、低置信隐藏 |
| AI 不可信 | 回答无来源、原因不明、写入风险高 | source、why this、preview、undo |
| 大 vault 性能差 | 打开慢、扫描慢、图谱卡 | 缓存、异步、局部图谱、性能预算 |
| Provider 门槛高 | 新用户停在 API key | 可跳过、测试问题、错误解释、默认无 AI 价值 |
| 商业化过早 | 还没留存就做平台 | Phase 4 前不做团队协作和 marketplace |

## 11. 开发节奏建议

建议采用每周一个小版本、每 4 周一个阶段版本：

- 每周一锁定本周任务。
- 每周三做一次核心路径 smoke。
- 每周五合并、更新文档、写阶段记录。
- 每 4 周发布一个 v0.x 阶段版本。
- 每个阶段只允许一个主目标，其他需求进入 backlog。

提交和文档规则：

- 每完成一个独立修复或功能，单独提交。
- 用户可见产品取舍写入 `PRODUCT.md`。
- 阶段计划和进展写入 docs。
- 不跑 ESLint 作为默认流程；类型检查和相关测试按改动风险选择。

## 12. 最终落地顺序

如果只能按最小路径推进，建议顺序是：

1. Maintenance Queue 缓存和异步化。
2. Vault Health 首页三任务模型。
3. AI Provider 测试和无 AI 路径。
4. 核心 smoke 和 fixture vault。
5. Maintenance Task Surface 状态化。
6. Memory Ledger 管理和纠错。
7. Context Pack + Why this 深度进入 AI 回答。
8. Search + Graph + Maintenance 互跳。
9. Proactive 低频建议。
10. Maintenance -> Agent plan -> preview -> execute -> undo。
11. Weekly Cognitive Review。
12. Sync / Publish / workflow packs 商业化。

这条路线的关键是：先证明用户愿意把真实 vault 放进来，再证明用户愿意每周回来，最后再证明用户愿意为同步、发布和专业工作流付费。

## 13. 执行记录

| 日期 | 项目 | 状态 | 变更 | 验证 |
| --- | --- | --- | --- | --- |
| 2026-05-31 | A2.1 / S1.2 Maintenance cache key | 完成 | `gatherMaintenanceItems` 增加 60 秒结果缓存，cache key 包含 vault hash、索引文件签名（filePath / updatedAt / contentHash）、Memory Ledger 文件签名、扫描类型、UI 语言、当天日期、query hash、limit、`minCharacters`、`upcomingDays`、`requiredProperties`。失效依赖现有 `invalidateVaultQueryCache` 的索引/文件变更路径，memory 文件变化由 key 签名覆盖。 | `pnpm test -- tests/maintenance-cache-key.test.ts tests/db-query-cache.test.ts`；`pnpm typecheck` |
| 2026-05-31 | S1.3 Maintenance scan status protocol | 完成 | `maintenance:get-queue` 返回 `scan` 元数据，覆盖 `pending` / `partial` / `complete` / `error` 状态、已完成/待完成扫描类型、更新时间和耗时；维护队列 UI 在过滤器下方展示扫描状态，刷新时先进入 pending，成功后展示 complete，异常时展示 error，并为后续 partial results 预留 UI 协议。 | `pnpm test -- tests/maintenance-queue-ipc.test.ts tests/maintenance-cache-key.test.ts tests/db-query-cache.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A2.2 Maintenance scan groups | 完成 | `maintenance:get-queue` 支持 `scanGroups`，按 links / tasks / properties / memory / structure / bridge 归一扫描范围；`gatherMaintenanceItems` 只为请求的 group 准备对应索引资源，并在 `scan.completedGroups` / `pendingGroups` 回传分组状态；维护队列生成器增加 `enabledTypes` 裁剪，避免未扫描 group 的空 map 产生误报；cache key 纳入扫描 group，防止跨分组缓存串用。 | `pnpm test -- tests/maintenance-queue-ipc.test.ts tests/maintenance-cache-key.test.ts tests/ai-maintenance-queue.test.ts tests/db-query-cache.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A2.3 Watcher incremental cache invalidation | 完成 | `indexNote` / `removeNoteIndex` 改为调用 `invalidateVaultQueryCacheForIndexedFile`，文件 watcher 和 `db:index-file` 继承文件级失效路径；单文件变化只清理 all-notes / property-rows / recent / tag / graph / maintenance queue 与该 note 的 outgoing、全局 backlinks/unlinked 相关缓存，保留同 vault 非相关缓存和其他 vault 缓存，避免单文件索引清空整个 vault query cache。 | `pnpm test -- tests/db-query-cache.test.ts tests/maintenance-cache-key.test.ts tests/maintenance-queue-ipc.test.ts tests/ai-maintenance-queue.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A2.4 Maintenance partial results UI | 完成 | 维护队列 `all` 视图按 links / tasks / properties / memory / structure / bridge 逐组请求 `maintenance:get-queue`，每个 group 返回后立即合并、排序并展示已有结果，同时把扫描状态更新为 `partial`；单类型筛选只请求对应 scan group；刷新序号防止旧请求覆盖新状态，扫描状态条优先显示 completed/pending groups。 | `pnpm test -- tests/maintenance-partial-ui.test.ts tests/maintenance-queue-ipc.test.ts tests/maintenance-cache-key.test.ts tests/ai-maintenance-queue.test.ts tests/db-query-cache.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A2.5 Maintenance performance logging | 完成 | `getCachedVaultQueryWithStats` 返回 cache hit/miss 与读取耗时；`gatherMaintenanceItems` 记录维护扫描性能日志，包含 vault hash、cacheHit、累计 cacheHitRatio、request/cache/scan 耗时、slow/timeout 分类、notes/items 数量、scanType、scanGroups、语言、query hash 和 limit；失败路径记录同样的耗时与 timeoutType，但不写入原始 vault 路径或查询文本。 | `pnpm test -- tests/db-query-cache.test.ts tests/maintenance-cache-key.test.ts tests/maintenance-queue-ipc.test.ts tests/ai-maintenance-queue.test.ts tests/maintenance-partial-ui.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A3.1 / S2.5 Provider setup checklist | 完成 | Provider 编辑弹窗新增配置检查、连接测试、响应测试三步状态条；保存前可看到必填配置是否完整、连接测试是否通过、测试问题是否返回响应。失败结果会按 API key、模型名、网络、限流、上下文、超时和未知错误分类显示下一步提示；测试按钮保留为可选动作，不阻断离线保存或无 AI 路径。新增英文/中文 i18n 文案和错误分类测试。 | `pnpm test -- tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A3.2 No-AI mode explanation | 完成 | AI Provider 设置页在未配置 provider 时展示本地模式说明，明确 Files、Search、Graph、Vault Health、Maintenance 无需 AI 仍可使用，同时标出 Chat answers、AI edit、Agent actions、Memory generation 需要 provider；ChatPanel 的无 provider 阻断提示改为中英文 i18n，并说明非 AI 核心路径不受影响。新增无 AI 说明组件的覆盖测试。 | `pnpm test -- tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A3.3 Provider error attribution copy | 完成 | 新增 renderer 侧 `ai-provider-errors` 归因工具，统一识别 API key/权限、模型名、网络或 Base URL、限流或额度、上下文过长、超时和未知 provider 错误；Settings Provider 测试与 ChatPanel 流式错误共用中英文下一步文案，并对 provider 原始返回做路径/API key 脱敏和长度截断。 | `pnpm test -- tests/ai-provider-errors.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A3.4 First sourced AI question | 完成 | Vault Health 的 Ask AI action 不再只是打开聊天面板，而是预填一条带 health 摘要、要求使用本地搜索/工具、引用来源并明确无结果状态的全库导览问题；Chat 空状态首个提示改为“带来源提问”，中英文文案全部进入 i18n；Command Palette、Vault Health 和 Chat hint 共用 `queueAiCommandDraft`，通过本地暂存和事件双路径保证 ChatPanel 已挂载或未挂载时都能接收草稿。 | `pnpm test -- tests/ai-onboarding-prompts.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-05-31 | A3.5 AI prompt language contract | 完成 | 新增主进程 AI 输出语言 helper，Chat / Agent 默认系统 prompt、AI edit、批量笔记规划和生成、Mermaid 图谱生成、摘要、标签和闪卡生成都接入当前 UI 语言或主进程当前语言兜底；renderer 在 ChatPanel、GraphGenerator、CommandPalette 中把 `language` 传入对应 AI IPC，shared IPC 类型同步增加可选语言字段；新增测试覆盖语言指令和生成类 IPC payload。 | `pnpm test -- tests/ai-language-prompts.test.ts tests/ai-onboarding-prompts.test.ts`；`pnpm typecheck` |
| 2026-05-31 | C1.1-C1.6 Maintenance -> Agent execution loop | 完成 | Agent step kind 扩展到 `move_file` / `rename_file` / `delete_file` / `apply_tag` / `update_frontmatter` / `create_link` / `merge_notes`；所有新增写入支持 dry run 预览和 rollback data，高风险 `merge_notes` 默认要求显式确认；维护队列新增“批量计划”入口，把最高优先级维护项作为 preview-first Agent goal 交给执行历史面板。 | `pnpm test -- tests/agent-planner.test.ts tests/agent-executor.test.ts tests/maintenance-partial-ui.test.ts`；`pnpm typecheck` |
| 2026-05-31 | C3.1-C3.5 Weekly Cognitive Review | 完成 | 维护队列新增每周认知复盘入口，可预览或保存 `.nexusky/reviews/*-cognitive-review.md`；复盘基于关系、主题、重复问题、阻塞项和重新浮现上下文，保存后可直接打开笔记；后台 proactive review 触发、反馈和 review 生成记录沿用现有 long-context 事件链。 | `pnpm test -- tests/long-context-cognitive-review.test.ts tests/maintenance-partial-ui.test.ts`；`pnpm typecheck` |
| 2026-05-31 | C4.1-C4.4 Relation feedback ranking | 完成 | 长上下文反馈补齐 `snoozed` 类型，和 useful / not_related / wrong_reason / dismissed 一起写入 `relation_feedback`，并进入 ranking 降权；Related Context card 增加 snooze 控件，not related / dismissed / snoozed 立即从当前建议列表移除；调试信息继续显示 why this、evidence、score 和 confidence。 | `pnpm test -- tests/long-context-store.test.ts tests/long-context-ranker.test.ts tests/long-context-ui.test.ts`；`pnpm typecheck` |
| 2026-05-31 | C5.1-C5.4 Semantic search evaluation | 完成 | 新增 `docs/SEMANTIC_SEARCH_EVALUATION_2026-05-31.md`，明确 v0.8 不默认启用 embedding，先在 fixture vault 比较 keyword / FTS / local embedding / remote embedding / hybrid；草拟 provider 抽象，并写清 local 与 remote embedding 的文本外发边界。 | 文档审查；`pnpm typecheck` |
| 2026-05-31 | v0.8 release readiness | 完成 | `package.json` 版本号推进到 `0.8.0`；阶段记录、项目全景和产品决策文档同步补充 Phase 3 完成状态。 | `pnpm test`；`pnpm typecheck` |
| 2026-05-31 | v0.8.1 release CI fix | 完成 | 移除 GitHub Actions 中 `pnpm/action-setup` 的显式 `version: 10`，统一由 `package.json` 的 `packageManager: pnpm@10.30.3` 指定 pnpm 版本；`package.json` 版本号推进到 `0.8.1`，用于重新触发发布构建。 | workflow 配置审查；`pnpm typecheck` |
| 2026-06-01 | v0.8.2 unsigned release packaging | 完成 | mac release 恢复无 Developer ID 证书路径：关闭 notarize，使用 afterPack ad-hoc codesign；Windows release 关闭强制 Authenticode 签名和更新签名校验；GitHub Actions 不再要求 `MAC_CSC_*` / `WIN_CSC_*` secrets；`package.json` 版本号推进到 `0.8.2`。 | `pnpm test -- tests/workflow-config.test.ts` |
| 2026-06-01 | D1.3 同步健康状态 | 完成 | 新增 `cloud:get-sync-health` IPC 和 `CloudSyncHealth` 协议，`syncAll` / `pullAll` 无配置或异常失败时也会记录最后同步时间、方向、状态、失败原因、冲突数、推送/拉取数量和离线队列；Cloud Sync 设置页新增同步健康卡片，展示当前后端、配置状态、最后同步、失败原因、待上传/下载和离线队列，并提供手动刷新。 | `pnpm test -- tests/cloud-sync-health.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D1.1 冲突恢复体验 | 完成 | `SyncConflict` 增加本地修改时间，冲突面板从简单按钮列表升级为恢复卡片：展示冲突原因、文件路径、本地/远端修改时间、本地/远端哈希和操作含义；“保留本地”明确会推送当前 vault 文件，“拉取远端”明确会覆盖本地文件，解决成功后给出反馈并刷新同步健康。新增中英文 i18n 文案和组件测试。 | `pnpm test -- tests/sync-reconcile.test.ts tests/accessibility-components.test.ts tests/cloud-sync-health.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D1.2 版本恢复 | 完成 | 同步覆盖前会先保存 Markdown 当前版本到 `.history`，同步删除会先移入 `.trash` 并记录原始路径和删除原因；Cloud Sync 设置页补充恢复说明，回收站列表标出同步删除来源，用户可通过历史版本或回收站找回误删/错同步内容。 | `pnpm test -- tests/version-recovery.test.ts tests/sync-execute.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D1.4 付费边界 | 完成 | Cloud Sync 页面新增免费边界说明，明确本地 vault 和 BYO 同步继续免费可用，官方 managed sync / backup 作为未来增值能力；同步后端标题标出 BYO，避免把当前自带存储方案误读成托管订阅。 | `pnpm test -- tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D2.1 发布集合 | 完成 | Publish 命令改为先打开发布范围选择弹窗，用户可选择整个 vault、folder、tag 或 property 生成发布集合；`export:publish-vault` IPC 增加结构化 `PublishScope`，主进程按 folder/tag/property 过滤 Markdown 候选，并为 scoped publish 补入被选中笔记引用的本地图片/附件资源；发布索引页显示当前范围。 | `pnpm test -- tests/publish-wikilinks.test.ts tests/accessibility-components.test.ts`；`pnpm test -- tests/publish-wikilinks.test.ts tests/accessibility-components.test.ts`（全量 128 files / 752 tests passed）；`pnpm typecheck` |
| 2026-06-01 | D2.2 发布预览 | 完成 | `export:preview-publish-vault` 先返回发布预览结果，包含当前范围的导航笔记、资源、链接总数和缺失链接/缺失资源；发布弹窗改为先生成预览，再确认输出目录发布。主进程统一重写站点内 Markdown 链接、wiki 链接和本地资源路径，确保写出前看到的导航与实际导出一致。 | `pnpm test -- tests/publish-wikilinks.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D2.3 增量发布 | 完成 | 发布流程新增 `.nexusky-publish-manifest.json`，按输出文件 SHA-256 指纹对比上次发布结果，只写入新增/变更的 HTML、`site-data.js` 和资源文件，并清理 manifest 里已消失的旧输出；结果回传 updated/skipped/removed 统计，避免大 vault 每次全量重写。 | `pnpm test -- tests/publish-wikilinks.test.ts`；`pnpm typecheck` |
| 2026-06-01 | D2.4 撤回和权限 | 完成 | 发布弹窗新增公开/私有访问模式，私有模式会为静态站点写入 `robots.txt`、`access.json` 并在 HTML 注入 `noindex,nofollow`；发布结果保存上次输出目标、范围、访问模式和文件数，用户可从弹窗撤回上次发布，删除 manifest 追踪的生成文件并清除已保存目标。 | `pnpm test -- tests/publish-wikilinks.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-02 | D3.1 示例 vault | 完成 | 新增四个内置 workflow sample vault，分别覆盖 Research / Writing / Developer / Learning 四种专业工作流，内容包含真实的 Markdown 笔记、来源、草稿、ADR、调试记录、课程、练习和周复盘；`vault:create-sample` 会在用户选择目录下创建唯一命名的样例 vault，自动写入并索引这些文件；Welcome 屏新增样例入口，可直接从首屏创建。 | `pnpm test -- tests/workflow-samples.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |
| 2026-06-02 | D3.2 模板和维护规则 | 完成 | 四个 workflow sample vault 现在都带有 `.nexusky/templates/*.json` 模板包和 `Maintenance/Workflow Rules.md` 维护规则页，模板覆盖 research / writing / developer / learning 的 source、draft、ADR、debug、lesson、practice 和 review 笔记；每个样例 README 都直接链接维护规则，强调 health 和 review 而不是花哨模板。 | `pnpm test -- tests/workflow-samples.test.ts tests/accessibility-components.test.ts`；`pnpm typecheck` |

后续风险：A2 性能基础已覆盖缓存键、同步结果缓存、扫描状态协议、后端分组扫描、watcher/indexer 文件级 query-cache 失效、UI partial results 和性能日志；A3.1-A3.5 已完成 Provider 测试 UI、无 AI 路径说明、错误归因文案、首次来源问答引导和 AI 语言契约。Phase 3 已补齐 Maintenance -> Agent plan -> preview -> execute -> undo、Weekly Cognitive Review、反馈驱动 ranking 和语义检索评估。Phase 4 已补同步健康状态、冲突恢复说明、版本恢复、付费边界、发布集合范围选择、发布预览、增量发布、撤回/权限、示例 workflow vault、模板和维护规则；后续仍需继续 workflow pack 的商业化边界；进入更大 Phase 4 工作前仍应继续拆分 `ChatPanel` / `GraphView` / `db.ipc` 的大文件边界，并对真实 10k+ vault 做手动性能回归。
