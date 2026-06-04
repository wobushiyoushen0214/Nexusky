# Nexusky 产品目标偏离审查

> 日期：2026-06-04  
> 范围：此前 P1/P2 修复后仍暴露给用户的主入口、命令面板、AI Chat、设置页、插件/模板文案和当前产品文档。  
> 产品基线：Nexusky 是本地优先、个人 Markdown vault 的维护层和可信 AI 工作台。主线是 Files、Search、Chat、Graph、Maintenance、Vault Health；Agent、插件包、Reader、Kanban、Flashcards、Calendar、移动端、团队协作和对象数据库都不能抢主入口。

## 1. 修复前结论

本轮重新检查后，仍有三类未修复偏离点：

| ID | 偏离点 | 状态 | 影响面 |
| --- | --- | --- | --- |
| A1 | Chat / Vault Health / 来源问答默认或显式进入 Agent 工具调用路径 | 待修复 | `ChatPanel.tsx`、`CommandPalette.tsx`、`VaultHealthScreen.tsx`、`ai-command-draft.ts`、Reader 历史组件 |
| A2 | 用户可见文案仍使用“插件市场 / marketplace”描述本地内置包 | 待修复 | Settings 插件页、命令面板 i18n、插件文档、项目全景文档 |
| A3 | 旧产品战略分析文档仍像当前说明一样列出 Reader、Kanban、Agent、marketplace 等横向能力 | 待修复 | `docs/PRODUCT_STRATEGY_ANALYSIS.md` |

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
