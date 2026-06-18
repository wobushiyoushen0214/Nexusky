# Nexusky 产品改造路线图

> 最后更新：2026-06-11  
> 权威边界：`PRODUCT.md` 记录产品取舍，`docs/PROJECT_OVERVIEW.md` 记录系统结构，本文只记录下一阶段产品改造方向。

## 1. 结论

Nexusky 下一阶段不应继续横向增加主入口。产品应从“功能丰富的 Markdown + AI 桌面应用”继续收束为：

> 本地 Markdown vault 的可信维护工作台。

用户每次打开一个真实 vault 后，第一感受应是“我知道今天该处理哪几件事、AI 用了哪些来源、任何写入都可预览和撤销”，而不是“这里有很多面板可以探索”。

## 2. 当前判断

已经成立的基础：

- Markdown 文件仍是主数据，SQLite 只做索引和派生状态。
- Vault Health、Graph、Chat sources、Context Pack、`VaultMutation`、同步灾难恢复和 10k vault 回归已经构成可信闭环。
- Reader、Kanban、Flashcards、Calendar、Canvas（bases/timeline）、远程插件市场和对象数据库心智已从当前主线移除。
- ActivityBar 已收束到 Overview、Files、Search、Chat、Graph 五个核心入口。

主要风险：

- Vault Health 提供健康诊断，但缺少直接可操作的修复入口。
- Overview 目前更像统计页，下一步要承接 Vault Health、近期可信写入摘要，而不是变成装饰性仪表盘。
- 部分代码和文案仍残留旧入口名，需要继续清理保存布局、命令和测试。
- `ChatPanel.tsx`、`GraphView.tsx`、`db.ipc.ts`、`execute-tool-call.ts` 仍是高风险巨石模块。
- 分发信任仍未闭环，签名、公证、可信更新链路是 v1.0 前的商业化前置条件。

## 3. 改造主线

### 3.1 Overview 成为工作台首页

Overview 应整合四类信息：

- Vault Health：健康分、扣分原因、趋势。
- Quick Actions：从 Vault Health 诊断直接跳转到 AI Chat 修复对话、Graph 孤岛定位、搜索断链等。
- Recent Trust：最近应用、撤销、恢复、同步冲突处理记录。
- Usage Boundary：AI 用量、预算、外发边界摘要。

不要做复杂 BI 仪表盘，也不要新增”Dashboard”产品心智。Overview 是打开 vault 后的工作台首页。

### 3.2 Vault Health 从诊断到修复

Vault Health 扫描出问题后，应提供直接跳转：

- **断链** → Chat "帮我修复这些断链"或 Graph 定位缺失节点
- **孤岛笔记** → Graph 高亮孤立节点，建议桥接
- **缺失属性/标签** → 批量编辑或 AI 推断补全
- **过期内容** → 搜索匹配，AI 总结近期变化

不要构建独立的"维护队列"UI，而是让 Vault Health 诊断结果能一键跳转到现有工具（Chat/Graph/Search）完成修复。

### 3.3 Chat 继续强化信任边界

下一步重点：

- 无来源时明确说明未找到证据。
- Source 点击要稳定定位到片段附近。
- Context Pack 来源要继续解释 reason、evidence、Hot/Warm/Cold 和关系类型。
- Vault tools 只在 Provider 支持工具调用时启用，写入仍必须走 preview-first。

不要把默认问答重新包装成 Agent 自动化。

### 3.4 Graph 从浏览图变成结构修复入口

Graph 的核心问题应是：

- 哪些笔记孤立？
- 哪些目录之间缺少桥？
- 哪些 AI 推断关系需要确认或降权？
- 哪些边来自 authored、inferred、imported、review-generated？

下一阶段应支持从 Graph 直接跳转 Chat 生成修复建议，或标记节点进入批量操作，但仍进入预览和撤销管道。

### 3.5 Properties 保持 Markdown 边界

Properties View 只扩展 frontmatter、tags、aliases、Dataview inline fields 等 Markdown 属性能力。可以做筛选、排序和批量补字段，但不引入对象数据库、supertag-first 或云端专有 schema。

### 3.6 商业化先卖信任，不卖功能堆叠

第一个付费方向应是 Managed backup，前提是本地恢复、版本历史、同步灾难恢复和加密边界足够可靠。Hosted publish 可以作为第二个方向。不要在 v1.0 前做团队协作、权限、评论或远程插件市场。

## 4. 近期优先级

### P0：立刻做

| ID | 事项 | 验收标准 |
| --- | --- | --- |
| P0-1 | Overview 接入 Vault Health 快速跳转 | 用户从 Overview 看到健康问题后可直接跳转到 Chat/Graph/Search 修复 |
| P0-2 | Vault Health 结果可操作化 | 每类健康问题（断链/孤岛/缺失属性）都有明确的下一步入口 |
| P0-3 | 旧文档和旧入口清理 | README 和 Overview 只链接当前路线图；一次性审查快照不再作为文档入口 |
| P0-4 | Typecheck + focused tests 恢复 | ActivityBar、UI store、Vault Health、docs links 测试通过 |

### P1：下一阶段

| ID | 事项 | 验收标准 |
| --- | --- | --- |
| P1-1 | Graph 跳转 Chat 修复 | 图谱中的孤岛、桥接、推断边可快速发起 Chat 对话请求修复建议 |
| P1-2 | 片段级 Source 定位加固 | Chat source 和工具结果能稳定回跳到 Markdown 片段附近 |
| P1-3 | Context Pack 反馈闭环可见 | 用户反馈后能看到关系已降权、隐藏或稍后再看 |
| P1-4 | 巨石模块拆分第一轮 | Chat、Graph、db IPC、tool executor 各拆出一个低风险子模块 |
| P1-5 | 发布/同步前 Health 风险复用 | Publish 和 Sync 前能复用断链、私有标签、冲突/恢复风险 |

### P2：可以等待

- Opt-in embedding / hybrid search。
- Workflow pack 导入和分享。
- 本地插件权限、隔离和签名。
- 移动端 capture companion。

## 5. 不做清单

未来 3 到 6 个月不要做：

- 新增一线 ActivityBar 入口。
- 恢复独立 Kanban、Reader Inbox、Flashcards、Calendar、Daily Note、Canvas（bases/timeline）或独立维护队列面板。
- 默认远程 embedding。
- 团队协作、团队权限、评论、实时协作。
- 对象化数据库系统、对象 OS、supertag-first。
- 远程插件 marketplace 或插件抽成。
- 没有预览和撤销的 AI 自动写入。

## 6. 指标

北极星指标：

> Weekly vault health improvement actions per active vault.

辅助指标：

- First Health Seen。
- First Useful Action：打开来源、跳转 Chat 修复或应用预览写入。
- Health Score Improvement Rate。
- Quick Action Click-through。
- Source Click-through。
- Preview Apply Rate。
- Undo / Rollback Success。
- Vault Open to Health Time。

## 7. 文档维护规则

- `README.md` 只保留入口级说明和当前文档索引。
- `PRODUCT.md` 只记录仍然有约束力的产品取舍。
- `docs/PROJECT_OVERVIEW.md` 只描述当前系统事实。
- 本文记录未来 3 到 6 个月路线图。
- 一次性审查、实现计划和已完成执行记录不要长期留在公开文档入口；必要信息合并进上述三类文档后删除。
