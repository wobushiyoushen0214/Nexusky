# Nexusky 产品目标偏离审查

> 日期：2026-06-04  
> 范围：此前 P1/P2 修复后仍暴露给用户的主入口、命令面板、AI Chat、设置页、插件/模板文案和当前产品文档。  
> 产品基线：Nexusky 是本地优先、个人 Markdown vault 的维护层和可信 AI 工作台。主线是 Files、Search、Chat、Graph、Maintenance、Vault Health；Agent、插件包、Reader、Kanban、Flashcards、Calendar、移动端、团队协作和对象数据库都不能抢主入口。

## 1. 修复前结论

本轮重新检查后，仍有三类未修复偏离点：

| ID | 偏离点 | 状态 | 影响面 |
| --- | --- | --- | --- |
| A1 | Chat / Vault Health / 来源问答默认或显式进入 Agent 工具调用路径 | 已修复 | `ChatPanel.tsx`、`CommandPalette.tsx`、`VaultHealthScreen.tsx`、`ai-command-draft.ts`、Reader 历史组件 |
| A2 | 用户可见文案仍使用“插件市场 / marketplace”描述本地内置包 | 已修复 | Settings 插件页、命令面板 i18n、插件文档、项目全景文档 |
| A3 | 旧产品战略分析文档仍像当前说明一样列出 Reader、Kanban、Agent、marketplace 等横向能力 | 已修复 | `docs/PRODUCT_STRATEGY_ANALYSIS.md` |

内部 IPC、类型名和函数名中的 `marketplace` 暂不作为偏离点处理，因为它们不是用户可见入口，立即重命名会扩大兼容和测试风险。后续如要清理，可在单独的内部命名迁移中处理。

## 2. A1：Agent 进入了默认问答路径

### 发现

- `ChatPanel` 的 `agentMode` 初始化逻辑是 `safeGet('nexusky-agent-mode') !== '0'`，新用户默认开启。
- 命令面板 “Ask from knowledge base / 基于知识库提问” 会传入 `agentMode: true`。
- Vault Health 的 “Ask AI” draft 会传入 `agentMode: true`。
- Chat 空状态第一条“有来源问题”也会传入 `agentMode: true`。
- 请求前外发预览将该路径显示为 `Agent` / `Agent 工具`。

### 为什么偏离

普通 `ai:chat` 已经会做本地检索、引用来源和长期上下文注入。把“有来源问答”默认绑定到 Agent，会让用户误以为核心 AI 入口就是 Agent 自动化，而不是可信、可解释、有来源的普通问答。

### 修复方案

- 新用户默认关闭 Agent 工具调用。
- 来源问答、Vault Health Ask AI、Chat 空状态第一问、Reader 历史 digest 都显式使用普通 chat。
- 命令面板的来源问答不再用 `agent` keyword 和 `agentMode: true`。
- UI 将聊天里的开关从 “Agent” 改为 “Vault 工具”，强调它是按需读取/搜索工具，不是主入口。
- 外发预览把 `Agent mode` 改为 `Vault tools` 描述。

## 3. A2：本地内置包被说成 marketplace

### 发现

- Settings 插件页标题是“精选插件市场”。
- 插件文档写“设置页里的‘精选插件市场’不是联网 marketplace”，虽然解释正确，但标题仍强化了市场心智。
- 命令面板模板包英文描述仍写 “built-in marketplace”，中文写“内置模板市场”。
- 项目全景文档写 `plugins:*` 是“本地内置 marketplace 元数据”。

### 为什么偏离

产品当前明确不做远程插件 marketplace、插件抽成或平台生态。本地内置示例包可以保留，但用户可见文案不应使用“市场”作为心智锚点。

### 修复方案

- Settings 插件页改为“本地内置插件包”。
- 命令面板模板/插件包文案改为“内置本地包”，关键词移除 `marketplace`。
- 插件文档改为“本地内置插件包目录/条目”。
- 项目全景文档改为“本地内置包元数据”。

## 4. A3：历史战略文档容易被误读为当前路线图

### 发现

`docs/PRODUCT_STRATEGY_ANALYSIS.md` 是 2026-05-28 的功能扫描，里面仍完整列出 Reader Inbox、Kanban、Flashcards、Agent、插件 marketplace 等能力和方向。它对历史判断有价值，但若被维护者或 AI agent 当成当前产品说明，会和 2026-06-03 之后的收束路线冲突。

### 为什么偏离

当前产品目标已明确收束到本地 Markdown vault、维护闭环、可信 AI 和 preview-first 执行。历史扫描应标记为“快照”，不能继续承担当前路线图职责。

### 修复方案

- 在文档顶部加历史快照提示。
- 明确当前权威产品边界以 `PRODUCT.md`、`docs/PROJECT_OVERVIEW.md` 和 `docs/PRODUCT_FUTURE_AND_UPGRADE_PLAN_2026-06-03.md` 为准。
- 不重写整份历史分析，避免抹掉当时功能扫描依据。

## 5. 验收

- 新用户 Chat 工具调用默认关闭。
- 来源问答和 Vault Health Ask AI 走普通 RAG chat。
- 用户可见 UI 不再把本地内置插件包称为“插件市场”。
- 历史策略分析文档不会被误读为当前路线图。
- Focused tests 覆盖 AI onboarding draft、外发预览文案和插件 API；TypeScript typecheck 通过。

## 6. 追加审查：属性视图和工具入口边界

2026-06-04 追加检查范围：属性视图、metadata / schema / collection / database 相关文案、Command Palette、官网能力区和当前路线图。

### 发现

- Properties View 的实际 UI 文案已主要收束到 frontmatter、属性、标签、别名和写回 Markdown。
- Command Palette 的 Properties View 隐藏关键词仍包含 `database`，会把属性视图带回数据库心智。
- 官网能力区把直接命令称为 `Tool Surface`，正文说 `high-value vault tools`，容易把工具入口抬成产品主能力。
- 未来路线图中 `Properties 变成轻量数据库视图` 的旧措辞与 Markdown/source-of-truth 边界冲突。

### 修复

- Properties View 命令关键词改为 `properties`、`frontmatter`、`metadata`、`obsidian`。
- 官网能力区标题改为 `Command Palette`，正文改为本地 vault 检查，保留无需 chat/token 的价值但不宣传工具平台。
- 路线图改为 `Properties 扩展为 Markdown 属性视图`。
- `PRODUCT.md` 追加记录这条产品边界。

## 7. 修复记录

2026-06-04 已完成：

- `ChatPanel` 新用户默认关闭工具调用；聊天开关改为“Vault 工具 / 工具”，外发预览显示 `Vault 工具`。
- Command Palette、Vault Health、Chat 空状态和 Reader 历史 digest 的来源问答 draft 显式使用普通 chat。
- Settings 插件页、命令面板 i18n、插件文档和项目全景文档改为“本地内置包”。
- `docs/PRODUCT_STRATEGY_ANALYSIS.md` 顶部标记为历史快照，不再承担当前路线图职责。
- Properties View、Command Palette、官网能力区和路线图文案已收束到 Markdown 属性视图与普通命令入口，不再使用数据库或 Tool Surface 心智锚点。

## 8. 追加审查：默认搜索命名边界

2026-06-04 追加检查范围：官网能力区、默认搜索实现、embedding 评估文档和当前路线图。

### 发现

- 路线图已明确默认搜索是 keyword/FTS/本地词法相关检索，真 embedding 检索仍是评估和未来 opt-in 方向。
- 官网能力区仍写 `Semantic search` 和 `local semantic ranking`，会让用户误以为默认搜索已经是 embedding 或 provider-backed 语义检索。

### 修复

- 官网能力区改为 `Local search`。
- 正文改为 full-text search + local relevance ranking，并明确不需要把 vault 发给 provider。
- `tests/website-homepage.test.ts` 增加合同断言，禁止首页重新出现 `Semantic search` 或 `semantic ranking`。
- `PRODUCT.md` 追加记录默认搜索命名边界。

## 9. 追加审查：公共元数据叙事边界

2026-06-04 追加检查范围：官网 metadata、root package metadata、首页叙事和当前路线图。

### 发现

- 官网 `<title>` 仍写 `Local-first AI knowledge base`。
- root `package.json` 仍写 `AI-powered knowledge base note-taking app`。
- 路线图已明确首页和 README 应减少抽象 `AI knowledge base`，优先讲 real Markdown vault、Vault Health、sources 和 preview-first writes。

### 修复

- 官网 title 改为 `Nexusky - Local Markdown vault workbench`。
- 官网 description 改为 Markdown vault health、sourced AI、graph 和 reviewable maintenance。
- root package description 改为 `Local-first Markdown vault workbench`。
- `tests/website-homepage.test.ts` 增加 metadata 合同断言，禁止回到 `Local-first AI knowledge base` 或 `AI-powered knowledge base`。
- `PRODUCT.md` 追加记录公共 metadata 边界。

## 10. 追加审查：Legacy Reader 英文文案中的 Knowledge Space 残留

2026-06-04 追加检查范围：Reader 兼容组件、英文/中文 locale 和已移除的 Generic Knowledge Space 入口。

### 发现

- 中文 Reader 文案已经把定位动作写成“在属性视图定位”。
- 英文 Reader 文案仍写 `Locate in knowledge space`。
- 英文 triage reason 仍说带标签条目可放入 `knowledge space`。

### 修复

- 英文 `reader.openInSpace` 改为 `Locate in properties view`。
- 英文 tagged triage reason 改为在 properties view 整理。
- 不改 Reader 兼容组件结构；本次只清理已经移除的 Generic Knowledge Space 用户心智残留。

## 11. 追加审查：Maintenance 执行入口文案

2026-06-04 追加检查范围：Maintenance handoff、Command Palette 的 Maintenance 描述、官网 migration guide 和 No-AI / Vault tools 边界。

### 发现

- Maintenance 批量入口仍写 `Send the top maintenance items to Agent...`，中文也直接写“交给 Agent”。
- Command Palette 的 Maintenance 描述写 `one-click fixes` / “可一键修复项”，弱化了 preview-first 写入边界。
- 官网 migration guide 仍写 `Chat or Agent`、`Agent tool hints`、`Maintenance and Agent writes`。

### 修复

- Maintenance 批量入口改为创建可审查执行计划，按钮改为规划执行。
- Command Palette 的 Maintenance 描述改为 previewable fixes / 可预览修复项。
- Migration guide 改为 Chat or reviewable execution、Vault tools hints 和 reviewable execution writes。
- `PRODUCT.md` 追加记录：Agent 是实现路径，用户承诺是 maintenance -> plan -> preview -> execute -> undo。

## 12. 追加审查：本地内置包内部命名

2026-06-04 追加检查范围：插件/模板 bundled pack IPC、shared IPC 类型、Settings 插件页、Command Palette 和插件 API 测试。

### 发现

- 用户可见文案已经改为本地内置包，但 canonical 类型、函数、renderer state 和 IPC 仍用 marketplace。
- 直接删除旧 IPC 可能影响历史调用和兼容性。

### 修复

- 新增 `PluginLocalPackItem` / `TemplateLocalPackItem` 作为 canonical shared 类型，旧 Marketplace 类型保留为 alias。
- 新增 `plugins:get-local-pack`、`plugins:install-local-pack`、`plugins:install-local-pack-bundle` 和对应 template local-pack IPC。
- Renderer 改用 local-pack IPC、state 和 i18n keys。
- 主进程保留旧 marketplace IPC handler，转发到 local-pack 实现。
- 插件 API 测试改用 local-pack 函数名。

## 13. 追加审查：维护反馈与健康趋势联动

2026-06-04 追加检查范围：Maintenance Queue feedback、Vault Health trend card 和 `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 的 P0 候选项。

### 发现

- Maintenance feedback 已经能持久化 `done`、`skipped`、`snoozed`、`not_relevant`，但 Health trend 卡只展示分数、周变化和扣分因子。
- 用户完成、延后或判定不相关的维护动作没有在趋势卡里可见，维护行为和 Vault Health 变化之间缺少产品层反馈。

### 修复

- 新增 `maintenance:get-feedback-summary` 只读 IPC，按最近 7 天和 30 天统计维护反馈状态。
- Maintenance 的 Vault Health trend 卡展示本周已审查数量、完成数量、延后/跳过数量和不相关数量。
- `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 将 `Maintenance 完成历史和健康趋势联动` 标记为第一版完成，并保留后续“按修复类型关联 Health Score 因子”的方向。

## 14. 追加审查：Vault tools 工具清单分级

2026-06-04 追加检查范围：Chat `Vault 工具` 开关、tool surface registry 和 `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 的 P1 候选项。

### 发现

- Chat 已经按 Provider 能力启用或禁用 `Vault 工具`，但开启前没有说明工具清单中哪些是只读、哪些是预览写入、哪些属于执行型边界。
- 用户可能把 Vault tools 模式误解成静默自动修改 vault，而不是“可调用工具读取上下文，写入仍走编辑、维护预览或可审查执行”。

### 修复

- ChatPanel 读取 `ai:list-tool-surface`，统计 `read_only`、`preview_write` 和 `agent_only` 工具数量。
- `Vault 工具` 开关旁展示紧凑边界摘要，tooltip 明确写入仍需编辑模式、维护预览或可审查执行。
- 新增纯 helper 测试，确保工具分级统计不会把 read-only 和 preview-write 混淆。

## 15. 追加审查：Properties View frontmatter 边界回归

2026-06-04 追加检查范围：Properties View、Command Palette 的 properties/bases 命令、英文/中文 locale 和 `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 的 P1 候选项。

### 发现

- 当前 Properties View 文案已经收束到 frontmatter、属性、标签、别名和 metadata。
- 这类边界容易在后续新增筛选、列配置或批量编辑时重新滑向 object database / supertag-first 叙事。

### 修复

- 新增 `tests/product-boundary-copy.test.ts`，直接检查 Properties View 命令关键词和核心文案。
- 测试要求该入口继续包含 frontmatter / metadata 语义，并禁止重新出现 database、object、supertag 作为 Properties View 心智锚点。

## 16. 追加审查：Chat source 与 Context Pack 解释合并

2026-06-04 追加检查范围：普通 `ai:chat` 来源、Context Pack sources、Chat source 行和 `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 的 P0 候选项。

### 发现

- `ai:chat` 已经会同时发送本地检索来源和 Context Pack sources，但前端来源行原本只显示笔记标题。
- Context Pack 的 reason、evidence、relation type 和 Hot/Warm/Cold 层级没有跟来源行合并展示，用户只能知道“用了哪些笔记”，不能直接知道“为什么想起这些关系”。

### 修复

- `ChatSource` 新增可选 `origins`、`explanation`、`evidence`、`relationType` 和 `memoryTier` 字段，不破坏历史 chat 记录。
- Context Pack 生成 sources 时附带 reason、evidence、关系类型和记忆层级；本地检索 sources 标记为 `local_search`。
- 新增 `mergeChatSources` 合并同一来源的本地搜索与 Context Pack provenance，保留检索 snippet，同时显示 Context Pack 解释。
- Chat source 行显示“本地搜索 + 上下文包”、关系类型、Hot/Warm/Cold 层级和 reason，展开后继续展示 evidence 与 Memory Ledger 关系。

## 17. 追加审查：Workflow sample 首启路径压缩

2026-06-04 追加检查范围：四个 workflow sample README、样例支持文件和 `PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md` 的 P1 候选项。

### 发现

- 四个样例 README 已有真实笔记、链接和 Workflow Rules，但 `Start here` 仍先引导用户阅读样例内容。
- 这会削弱当前主线：创建样例后应先体验 Vault Health、Ask with sources 和 Maintenance top 3，而不是把样例当成普通模板内容包。

### 修复

- Research / Writing / Developer / Learning 四个 README 的首启步骤统一改为：先打开 Vault Health、再 Ask with sources、然后审查 Maintenance 今日 top 3，最后再进入对应样例笔记。
- `tests/workflow-samples.test.ts` 增加合同断言，要求每个样例 README 保留这三步首启路径。
