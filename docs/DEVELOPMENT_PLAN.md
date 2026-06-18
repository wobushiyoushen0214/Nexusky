# Nexusky 详细开发方案

> 最后更新：2026-06-17
> 上游依据：`PRODUCT.md` 记录产品取舍，`docs/PRODUCT_ROADMAP.md` 记录未来 3 到 6 个月路线图，本文只记录可执行开发拆分。

## 1. 目标

下一阶段开发目标不是继续增加功能入口，而是把 Nexusky 收束成：

> 本地 Markdown vault 的可信维护工作台。

用户打开一个真实 vault 后，应能在 1 到 3 分钟内完成一次有价值的维护动作：看见健康问题、理解原因、跳到 Chat / Graph / Search、预览改动、应用或放弃，并知道如何撤销。

北极星指标：

> Weekly vault health improvement actions per active vault.

## 2. 当前事实

已经具备的基础：

- `packages/main/src/services/vault-health.ts` 已经能用 SQL 聚合快速扫描健康分、断链、孤岛、任务、重复标题、记忆缺口和陈旧笔记。
- `packages/renderer/src/components/VaultHealthScreen.tsx` 已经有首次健康扫描和下一步建议 UI。
- `packages/renderer/src/components/overview/VaultOverview.tsx` 已经有 Overview 页面、健康分、token 用量和笔记构成图。
- `packages/renderer/src/components/graph/GraphView.tsx` 和 `GraphMaintenanceNudge.tsx` 已经能聚焦孤岛、桥接和推断关系。
- Chat sources、Context Pack、outbound preview、Agent preview / rollback 已经形成可信 AI 的技术基础。
- 同步灾难恢复、10k vault 性能回归、source navigation、vault mutation 等测试已经覆盖关键风险面。

主要缺口：

- ActivityBar 仍把 `memory` 默认展示为一线入口，和五入口路线不一致。
- Vault Health 下一步建议里，`fixLinks`、`reviewStructure`、`reviewTasks`、`reviewMemory`、`reviewStale` 目前没有实际跳转动作。
- Overview 目前偏统计页，缺少 Quick Actions、Recent Trust 和 Usage Boundary。
- Graph 只能过滤维护信号，还不能把信号带入 Chat 生成修复建议。
- 分发信任没有闭环：Windows 未签名，macOS 未签名/未公证，更新签名校验关闭。
- `ChatPanel.tsx`、`GraphView.tsx`、`db.ipc.ts`、`execute-tool-call.ts` 是高风险巨石模块。

## 3. 开发原则

- 不新增一线导航入口。默认只保留 Overview、Files、Search、Chat、Graph。
- 不恢复独立 Kanban、Reader Inbox、Flashcards、Calendar、Daily Note、Canvas 或独立维护队列。
- Vault Health 不做重分析，只做快速诊断和行动路由；重处理交给 Chat、Graph、Search、Agent preview / rollback。
- AI 默认是带来源问答，不默认进入 Agent / Vault tools。
- 所有写入继续走 preview-first、可取消、可撤销路径。
- Markdown 文件和附件是主数据，SQLite 仍只做索引和派生状态。
- 每个阶段都必须有可验证的验收标准和 focused tests。

## 4. 交付阶段

### Phase 0：基线与边界收束

目标：先把当前产品心智和代码默认状态对齐，避免后续开发继续扩散。

#### P0-0.1 ActivityBar 五入口对齐

涉及文件：

- `packages/renderer/src/components/sidebar/activity-bar-registry.ts`
- `packages/renderer/src/stores/activity-bar-store.ts`
- `packages/renderer/src/stores/ui-store.ts`
- `tests/activity-bar-registry.test.ts`
- `tests/activity-bar-store.test.ts`
- `tests/ui-store.test.ts`

任务：

- 将 `memory` 的 `defaultVisible` 改为 `false`。
- 确认已有用户自定义 visibleIds 不被强制清空。
- 如果默认布局版本需要刷新，更新 `WORKSPACE_DEFAULT_VERSION`，避免旧默认状态继续带出 Memory。
- 检查 ActivityBar 右键自定义列表仍可重新开启 Memory。
- 确认 `mainView === 'memory'` 的兼容路径保留。

验收标准：

- 新用户默认只看到 Overview、Files、Search、Chat、Graph。
- 老用户如果显式开启过 Memory，不被强制丢失设置。
- `activity-bar-registry`、`activity-bar-store`、`ui-store` focused tests 通过。

#### P0-0.2 产品文案边界清理

涉及文件：

- `packages/renderer/src/i18n/locales/zh-CN.json`
- `packages/renderer/src/i18n/locales/en.json`
- `packages/renderer/src/components/VaultHealthScreen.tsx`
- `packages/renderer/src/components/WelcomeScreen.tsx`
- `README.md`
- `docs/PRODUCT_ROADMAP.md`

任务：

- 把没有独立 UI 承接的“维护队列”文案改成 Chat / Graph / Search / Vault tools / reviewable execution。
- 修复 `docs/PRODUCT_ROADMAP.md` 中重复的 `3.2 Vault Health 从诊断到修复` 标题。
- 检查 README 文档入口只保留当前权威文档，不把一次性审查报告继续作为入口。

验收标准：

- 新用户不会看到“打开维护队列”但找不到入口的断裂文案。
- `tests/product-boundary-copy.test.ts` 和 `tests/docs-links.test.ts` 通过。

### Phase 1：Vault Health 到行动闭环

目标：用户从健康扫描结果直接进入修复动作。

#### P0-1.1 建立 Health Action Router

涉及文件：

- `packages/renderer/src/components/VaultHealthScreen.tsx`
- `packages/renderer/src/components/ai/ai-command-draft.ts`
- `packages/renderer/src/stores/ui-store.ts`
- `packages/renderer/src/stores/editor-store.ts`
- `packages/renderer/src/components/SearchPanel.tsx`
- 新增：`packages/renderer/src/utils/vault-health-actions.ts`
- 新增或扩展：`tests/vault-health.test.ts`

任务：

- 把 `buildVaultHealthNextSteps` 和跳转逻辑抽到 `vault-health-actions.ts`。
- 为每类健康信号定义动作：
  - `fixLinks`：打开 Chat，预填“帮我定位并修复未解析 wikilink，先列出来源和建议，不要直接写入”。
  - `reviewStructure`：打开 Graph，并聚焦孤岛或桥接信号。
  - `reviewTasks`：打开 Chat，预填“审查未完成 Markdown tasks，按来源笔记归类，建议保留/完成/归档”。
  - `reviewMemory`：打开 Chat，预填“找出缺少 Memory Ledger 的高价值笔记，解释优先级和证据”。
  - `reviewStale`：打开 Search 或 Chat，限定 60 天未更新笔记，生成更新/归档建议。
  - `browseGraph`：打开 Graph。
  - `askAi`：继续使用普通 RAG Chat，不进入 Agent 模式。
- 跳转动作只做路由和草稿，不自动执行写入。

验收标准：

- Vault Health 的每个可见下一步按钮都有明确动作。
- 点击任一按钮后用户能进入 Chat / Graph / Search 之一。
- Chat 草稿使用普通 RAG 模式，`agentMode: false`。
- 测试覆盖 next step 排序、草稿内容、路由目标。

#### P0-1.2 Graph 支持外部维护聚焦

涉及文件：

- `packages/renderer/src/components/graph/GraphView.tsx`
- `packages/renderer/src/components/graph/GraphMaintenanceNudge.tsx`
- `packages/renderer/src/stores/ui-store.ts`
- `packages/renderer/src/components/VaultHealthScreen.tsx`
- `tests/graph-ui.test.ts`

任务：

- 在 UI store 中新增 `pendingGraphMaintenanceFocus`，可取值 `orphans`、`bridges`、`inferred`、`all`。
- Vault Health 的结构问题跳转 Graph 时写入该 pending focus。
- GraphView 挂载后消费 pending focus，并同步：
  - `orphans`：打开孤岛显示，`minLinks = 0`。
  - `bridges`：打开显式边和推断边。
  - `inferred`：打开推断边。
- 保持当前 Graph 内部 nudge 点击行为不变。

验收标准：

- 从 Vault Health 点击结构问题后，Graph 自动进入对应焦点。
- 切回 Graph 或刷新 Graph 不会反复消费旧 pending focus。
- Graph focused tests 覆盖 pending focus。

#### P0-1.3 Search 支持 Health 预置查询

涉及文件：

- `packages/renderer/src/components/SearchPanel.tsx`
- `packages/renderer/src/stores/ui-store.ts`
- `packages/renderer/src/components/VaultHealthScreen.tsx`
- `tests/search-index.test.ts`
- `tests/ui-store.test.ts`

任务：

- 在 UI store 中新增 `pendingSearchQuery` 或复用已有搜索打开状态。
- 对 `reviewStale` 提供预置查询或筛选入口。
- 若 SearchPanel 当前不支持结构化筛选，先以 Chat 草稿承接 stale 审查，Search 作为 P1 扩展。

验收标准：

- 陈旧笔记动作不会空点击。
- 如果进入 Search，用户能看到查询条件或说明当前筛选。

### Phase 2：Overview 变成工作台首页

目标：Overview 从统计页变成“今天先处理哪三件事”的工作台。

#### P0-2.1 Overview Quick Actions

涉及文件：

- `packages/renderer/src/components/overview/VaultOverview.tsx`
- `packages/renderer/src/components/overview/VitalityCard.tsx`
- `packages/renderer/src/components/overview/hooks/useOverviewData.ts`
- `packages/renderer/src/utils/vault-health-actions.ts`
- `packages/renderer/src/i18n/locales/zh-CN.json`
- `packages/renderer/src/i18n/locales/en.json`
- 新增或扩展：`tests/vault-health.test.ts`

任务：

- 在 Overview 顶部或 VitalityCard 下方展示 Top 3 health actions。
- 复用 Phase 1 的 action router，不在 Overview 重写跳转逻辑。
- 每个 action 显示：
  - 信号类型。
  - 影响数量。
  - 建议入口：Chat、Graph 或 Search。
  - “不会自动写入”的边界提示。
- 保留图表，但把 Quick Actions 放在更高优先级。

验收标准：

- 用户打开 Overview 后能直接点击健康行动。
- Quick Actions 与 VaultHealthScreen 的排序和动作一致。
- Overview 不引入新的 Dashboard 心智。

#### P0-2.2 Usage Boundary

涉及文件：

- `packages/renderer/src/components/overview/VaultOverview.tsx`
- `packages/renderer/src/components/overview/hooks/useOverviewData.ts`
- `packages/main/src/services/ai/usage.ts`
- `packages/renderer/src/components/settings/AIProviderSettings.tsx`
- `tests/ai-usage.test.ts`

任务：

- 在 Overview 展示 AI 使用边界摘要：
  - 当前 provider。
  - 是否本地 provider。
  - 近 30 天 token / 估算成本。
  - 是否设置预算。
  - Vault tools 是否可用。
- 不展示复杂成本 BI，只告诉用户“本次使用边界是否清楚”。

验收标准：

- 无 provider 时显示“本地 Files / Search / Graph / Vault Health 可用，AI 需要 provider”。
- provider 不支持 tool calling 时，Overview 不暗示 Vault tools 可用。

#### P0-2.3 Recent Trust

涉及文件：

- `packages/renderer/src/components/overview/VaultOverview.tsx`
- `packages/main/src/ipc/agent.ipc.ts`
- `packages/main/src/services/agent/agent-store.ts`
- `packages/main/src/services/version-recovery.ts`
- `packages/main/src/services/cloud/manager.ts`
- `tests/agent-store.test.ts`
- `tests/version-recovery.test.ts`
- `tests/cloud-sync-health.test.ts`

任务：

- 第一版只展示最近可信事件的摘要，不做完整日志系统。
- 候选事件：
  - 最近 Agent run 状态：preview、applied、rolled back、failed。
  - 最近文件历史/恢复快照。
  - 最近同步冲突或恢复事件。
- 如果 IPC 尚不支持聚合，可先在 Overview 展示“最近无可审查写入记录”，并把聚合 IPC 放到 P1。

验收标准：

- 用户能知道最近是否有 AI 写入、撤销、恢复或同步风险。
- 没有记录时是明确空状态，不是空白区域。

### Phase 3：Chat 和 Source 信任加固

目标：继续强化“AI 用了什么证据”和“没证据时怎么说”。

#### P1-1.1 无来源回答边界

涉及文件：

- `packages/main/src/ipc/ai.ipc.ts`
- `packages/main/src/services/ai/system-context.ts`
- `packages/renderer/src/components/ai/ChatPanel.tsx`
- `tests/ai-system-context.test.ts`
- `tests/chat-panel.test.ts`

任务：

- 确认普通 RAG chat 在没有 retrieval sources 且没有 Context Pack sources 时，system prompt 明确要求说明“未在本地笔记找到证据”。
- 前端可在 sources 为空时展示轻量状态，避免用户误以为引用被隐藏。
- 不阻止模型使用通用知识，但必须区分“vault evidence”和“general knowledge”。

验收标准：

- 没有本地证据时，回答中必须明确说明。
- UI sources 区域不会误导用户。

#### P1-1.2 Source 点击定位加固

涉及文件：

- `packages/renderer/src/components/observability/ChatSourceRow.tsx`
- `packages/renderer/src/utils/source-navigation.ts`
- `packages/renderer/src/stores/editor-store.ts`
- `tests/source-navigation.test.ts`

任务：

- 继续优先使用 `line/endLine`，其次 `blockId`，其次 heading，最后 snippet 匹配。
- 对路径不存在、文件重命名、snippet 匹配失败提供 toast 或 fallback。
- 工具结果 sources 也尽量补充 line、heading 或 snippet。

验收标准：

- Chat source 和 Vault tools source 都能稳定回到片段附近。
- 找不到片段时打开文件顶部并说明原因。

#### P1-1.3 Context Pack 反馈可见

涉及文件：

- `packages/renderer/src/components/observability/ChatSourceRow.tsx`
- `packages/renderer/src/components/long-context/RelatedContextPanel.tsx`
- `packages/main/src/services/long-context/relation-store.ts`
- `packages/main/src/ipc/db.ipc.ts`
- `tests/long-context-ui.test.ts`
- `tests/maintenance-feedback.test.ts`

任务：

- 在 source popover 或 related context 面板中展示反馈入口：
  - 有用。
  - 降权。
  - 暂时隐藏。
  - 不是相关关系。
- 用户提交反馈后，UI 立即显示该关系的反馈状态。
- 后端继续把反馈纳入 relation ranker。

验收标准：

- 用户能看见自己的反馈已经生效。
- 后续 Context Pack 不继续强推被明确否定的关系。

### Phase 4：Graph 到修复建议

目标：让 Graph 不只是浏览结构，而是结构修复入口。

#### P1-2.1 Graph 信号发起 Chat

涉及文件：

- `packages/renderer/src/components/graph/GraphMaintenanceNudge.tsx`
- `packages/renderer/src/components/graph/GraphView.tsx`
- `packages/renderer/src/components/ai/ai-command-draft.ts`
- `packages/renderer/src/stores/ui-store.ts`
- `tests/graph-ui.test.ts`

任务：

- 在 GraphMaintenanceNudge 中为每类信号增加“Ask Chat”动作。
- Chat 草稿包含：
  - 当前 focus 类型。
  - 信号数量。
  - 示例节点或边。
  - 明确要求先给建议，不直接写入。
- 保持 Graph 原有 focus 按钮。

验收标准：

- 孤岛、桥接、推断关系都能一键发起 Chat 修复建议。
- 默认仍是普通 Chat，不默认 Agent。

#### P1-2.2 结构修复进入 preview-first

涉及文件：

- `packages/main/src/ipc/tools/agent-tools.ts`
- `packages/main/src/ipc/tools/execute-tool-call.ts`
- `packages/main/src/services/vault-mutation.ts`
- `packages/main/src/services/agent/executor.ts`
- `tests/vault-mutation.test.ts`
- `tests/agent-executor.test.ts`

任务：

- 对创建 wikilink、更新 frontmatter、补 tag、移动/合并笔记等写入继续使用 `VaultMutation` 或 Agent step rollback。
- Graph 发起 Chat 后，如果用户要求应用修复，必须进入 preview / diff / Agent reviewed execution。
- 明确普通 Agent chat 不能直接写文件。

验收标准：

- Graph 相关修复没有绕过 preview-first。
- 写入后能撤销或 rollback。

### Phase 5：发布、同步和商业化信任前置

目标：在付费 managed backup / hosted publish 前，把分发和恢复链路做可信。

#### P1-3.1 发布/同步前 Health 风险复用

涉及文件：

- `packages/main/src/ipc/export.ipc.ts`
- `packages/main/src/services/publish.ts`
- `packages/main/src/services/cloud/manager.ts`
- `packages/main/src/services/cloud/conflict-detection.ts`
- `packages/main/src/services/vault-health.ts`
- `tests/publish-wikilinks.test.ts`
- `tests/cloud-sync-health.test.ts`

任务：

- Publish preview 复用断链、私有标签、未发布附件、未解析 wikilink 风险。
- Sync 前复用冲突、离线队列、错误状态和恢复风险。
- UI 只展示阻断风险和建议，不做复杂审计报告。

验收标准：

- 发布前能看到会造成坏链接或泄露边界的风险。
- 同步前能看到冲突和恢复状态。

#### P1-3.2 分发信任闭环

涉及文件：

- `electron-builder.yml`
- `packages/main/src/services/updater.ts`
- `.github/workflows/*`
- `docs/MIGRATION_GUIDE.md`
- 新增：`docs/RELEASE_TRUST_CHECKLIST.md`

任务：

- Windows：
  - 配置代码签名证书。
  - 开启 update signature verification。
- macOS：
  - 配置 Developer ID Application。
  - 开启 notarization。
  - 验证 arm64/x64 DMG 和 zip。
- 更新：
  - GitHub release artifact hash / signature 校验。
  - 自动更新失败时给出可恢复提示。
- 文档：
  - 记录用户如何验证安装包来源。

验收标准：

- v1.0 前正式构建必须签名。
- 自动更新不再关闭签名校验。
- Release checklist 可复用。

#### P1-3.3 官网日志入口加固

涉及文件：

- `website/src/app/api/logs/route.ts`
- `website/src/lib/auth.ts`
- `website/README.md`
- `website/supabase-schema.sql`

任务：

- 给 `POST /api/logs` 增加 ingestion token 或 HMAC。
- 增加基础限流。
- 服务端脱敏后再入库。
- 收紧 CORS。
- 生产部署文档写清环境变量和轮换方式。

验收标准：

- 日志接口不能被任意公开写入。
- 管理后台继续通过 cookie 访问。

### Phase 6：巨石模块拆分

目标：降低后续迭代风险，不做大规模重写。

#### P1-4.1 ChatPanel 拆分

涉及文件：

- `packages/renderer/src/components/ai/ChatPanel.tsx`
- 新增：`packages/renderer/src/components/ai/useChatSessions.ts`
- 新增：`packages/renderer/src/components/ai/useOutboundPreview.ts`
- 新增：`packages/renderer/src/components/ai/useChatStreaming.ts`
- 新增：`packages/renderer/src/components/ai/useAiEditPreview.ts`
- `tests/chat-panel.test.ts`

任务：

- 第一轮只拆 hooks，不改变 UI。
- 先拆出 session 加载、outbound preview、streaming、edit preview。
- 每次拆分保持行为等价。

验收标准：

- `ChatPanel.tsx` 行数显著下降。
- focused chat tests 通过。
- 不改变用户可见行为。

#### P1-4.2 GraphView 拆分

涉及文件：

- `packages/renderer/src/components/graph/GraphView.tsx`
- 新增：`useGraphData.ts`
- 新增：`useGraphDisplayState.ts`
- 新增：`useGraphMaintenanceFocus.ts`
- 新增：`GraphCanvas.tsx`
- `tests/graph-ui.test.ts`

任务：

- 先拆数据加载、显示状态、维护焦点。
- Canvas 渲染拆分为独立组件，但不重写布局算法。

验收标准：

- Graph 行为保持一致。
- 新增 Health -> Graph pending focus 后仍稳定。

#### P1-4.3 db.ipc.ts 拆分

涉及文件：

- `packages/main/src/ipc/db.ipc.ts`
- 新增：`packages/main/src/ipc/db/search.ipc.ts`
- 新增：`packages/main/src/ipc/db/graph.ipc.ts`
- 新增：`packages/main/src/ipc/db/chat-history.ipc.ts`
- 新增：`packages/main/src/ipc/db/legacy-kanban.ipc.ts`
- 新增：`packages/main/src/ipc/db/legacy-flashcards.ipc.ts`

任务：

- 先把兼容性通道 Kanban / Flashcards 拆出。
- 再拆 Graph、Search、Chat history。
- 保持 `registerDbIPC()` 为聚合入口。

验收标准：

- IPC channel 名称不变。
- 历史兼容能力不丢失。
- `db.ipc.ts` 不再承载所有领域逻辑。

#### P1-4.4 execute-tool-call.ts 拆分

涉及文件：

- `packages/main/src/ipc/tools/execute-tool-call.ts`
- 新增：`packages/main/src/ipc/tools/read-tools.ts`
- 新增：`packages/main/src/ipc/tools/maintenance-tools.ts`
- 新增：`packages/main/src/ipc/tools/write-preview-tools.ts`
- 新增：`packages/main/src/ipc/tools/tool-result-sources.ts`

任务：

- 按 read-only、maintenance、preview-write 拆分。
- 抽出 sources 组装逻辑，保证 Chat source 和 tool source 格式一致。
- 保留外部 `executeToolCall` 调用入口。

验收标准：

- Tool behavior 不变。
- 工具来源更容易补 line / heading / snippet。

## 5. 测试策略

每个阶段至少运行对应 focused tests：

- ActivityBar / UI store：`tests/activity-bar-registry.test.ts`、`tests/activity-bar-store.test.ts`、`tests/ui-store.test.ts`
- Vault Health：`tests/vault-health.test.ts`、`tests/maintenance-cache-key.test.ts`
- Overview：新增 Overview action 测试或复用 vault health action helper 测试
- Graph：`tests/graph-ui.test.ts`、`tests/graph-modes.test.ts`
- Chat / sources：`tests/chat-panel.test.ts`、`tests/source-navigation.test.ts`、`tests/ai-system-context.test.ts`
- Mutation / rollback：`tests/vault-mutation.test.ts`、`tests/agent-executor.test.ts`
- Sync / publish：`tests/sync-disaster-recovery.test.ts`、`tests/cloud-sync-health.test.ts`、`tests/publish-wikilinks.test.ts`
- Docs：`tests/docs-links.test.ts`、`tests/product-boundary-copy.test.ts`

阶段完成前必须跑：

```bash
pnpm typecheck
pnpm test
```

如果本机无法运行完整测试，至少记录未运行原因，并跑可用的 focused tests。

## 6. 发布节奏

建议以小版本推进：

- `0.8.4`：ActivityBar 五入口、Vault Health action router、文案清理。
- `0.8.5`：Overview Quick Actions、Usage Boundary、Graph pending focus。
- `0.8.6`：Graph -> Chat 修复建议、Source 定位加固、Context Pack 反馈可见。
- `0.9.0`：发布/同步前 Health 风险复用、分发签名准备、日志入口加固。
- `1.0.0`：签名/公证/自动更新可信链路闭环，Managed backup 进入可售前置状态。

## 7. 不做清单

本方案执行期间不要做：

- 新增一线 ActivityBar 入口。
- 恢复独立维护队列、Kanban、Reader Inbox、Flashcards、Calendar、Daily Note、Canvas。
- 默认远程 embedding 或默认语义搜索。
- 团队协作、权限、评论、实时协作。
- 远程插件 marketplace。
- 绕过 preview / undo / rollback 的 AI 自动写入。
- 把 Overview 做成复杂 BI 仪表盘。

## 8. Definition of Done

一个阶段只有同时满足以下条件才算完成：

- 用户路径可完整走通，而不只是按钮存在。
- 文案和实际入口一致。
- 写入路径仍然可预览、可取消、可撤销。
- 有 focused tests 覆盖新逻辑。
- README / roadmap / 本文档的边界没有互相冲突。
- 没有引入新的默认主入口。

## 9. 实施记录

### 2026-06-17：Phase 0 / Phase 1 首轮落地

已完成：

- `P0-0.1 ActivityBar 五入口对齐`：`memory` 已从默认可见 ActivityBar 中移除，新默认入口为 Overview、Files、Search、Chat、Graph；Memory 仍可通过自定义显式开启。
- `P0-0.2 产品文案边界清理`：Vault Health 下一步描述不再提示“打开维护队列”，改为 Chat 草稿、Graph 聚焦等实际可达入口；README 当前能力文案改为“主动建议与健康行动”。
- `P0-1.1 Health Action Router`：新增 `packages/renderer/src/utils/vault-health-actions.ts`，集中处理 Vault Health next steps、普通 Chat 草稿和 Graph action target。
- `P0-1.2 Graph 支持外部维护聚焦`：UI store 新增 `pendingGraphMaintenanceFocus`，Vault Health 可打开 Graph 并聚焦孤岛；GraphView 挂载后消费 pending focus，避免重复 toggle。
- `P0-2.1 Overview Quick Actions`：Overview 复用 `vault-health-actions.ts` 展示 Top 3 health actions，点击后进入 Chat 草稿或 Graph 聚焦；不自动写入。
- 测试补充：
  - `tests/activity-bar-registry.test.ts`
  - `tests/activity-bar-store.test.ts`
  - `tests/ui-store.test.ts`
  - `tests/vault-health-actions.test.ts`
  - `tests/ai-onboarding-prompts.test.ts`

设计/实现约束：

- 所有 Health action 仍然是普通 Chat 或 Graph 路由，不默认启用 Agent / Vault tools。
- 修复类 Chat prompt 明确要求先列建议和来源，不直接写入文件。
- Overview Quick Actions 与 Vault Health 首屏使用同一套排序和 action target，避免两个入口逻辑分叉。
- 本轮没有新增一线导航入口，也没有恢复独立维护队列 UI。

已验证：

- 中英文 locale JSON 通过 `python3 -m json.tool` 校验。

验证尝试：

- 当前 shell 环境未暴露 `node` / `pnpm`。
- 已尝试 `node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`，失败原因：`node: not found`。
- 已尝试 `node_modules/.bin/vitest run tests/activity-bar-registry.test.ts tests/activity-bar-store.test.ts tests/ui-store.test.ts tests/vault-health-actions.test.ts tests/ai-onboarding-prompts.test.ts`，失败原因：`node: not found`。

待验证：

- 恢复 Node / pnpm PATH 后优先运行：
  - `pnpm test -- tests/activity-bar-registry.test.ts tests/activity-bar-store.test.ts tests/ui-store.test.ts tests/vault-health-actions.test.ts tests/ai-onboarding-prompts.test.ts`
  - `pnpm typecheck`

### 2026-06-17：后台 long-context 数据库连接竞态修复

触发问题：

- 用户报告主进程 `unhandledRejection TypeError: The database connection is not open`。
- 反查编译产物后定位到 `scheduleVaultLongContextMaintenance -> runVaultLongContextMaintenance -> runLongContextBackgroundCycle -> extractLongTermThemes -> upsertTheme`。
- 根因是后台 long-context 任务在 `await` provider / relation classifier 期间持有旧 `better-sqlite3` 连接；索引、同步、vault 切换或 runtime reset 关闭数据库后，任务继续用旧连接执行 `prepare()`，并且维护定时器入口没有 `.catch()`，异常升级为主进程 unhandled rejection。

已完成：

- `packages/main/src/services/database.ts`：新增 `isCurrentDatabaseConnection()`，用于判断已缓存的 SQLite 连接是否仍是当前 vault 的打开连接。
- `packages/main/src/services/long-context/theme-extractor.ts`：主题草稿异步生成后重新确认数据库连接；旧连接已关闭时重新获取当前 vault 连接；新增 `AbortSignal` 传递，取消后停止继续写主题。
- `packages/main/src/services/long-context/relation-discovery.ts`：候选关系分类循环中，每次读取候选快照前确认连接仍有效；分类返回后检查取消状态。
- `packages/main/src/services/long-context/background.ts`：队列和 vault 维护任务使用 `AbortController` 追踪运行中任务；取消时中止当前任务；定时器入口补 `.catch()` 并记录 warning，避免后台异常变成主进程 unhandled rejection。
- `packages/main/src/services/long-context/cognitive-review.ts`：兼容秒级历史测试数据和毫秒级后台事件，修正 review 日期格式和 resurfaced context 时间窗口换算。
- `packages/main/src/services/long-context/context-events.ts`：metrics 日桶按输入时间戳单位选择秒/毫秒跨度，但继续保持 `bucketSizeSec = 86400` 的对外契约。
- `packages/main/src/services/long-context/relation-ranker.ts`、`packages/main/src/services/long-context/relation-store.ts`：relation decay / archive 计算兼容秒级 fixture 和毫秒级运行时事件，避免旧数据导致衰减失效。
- `packages/main/src/ipc/vault.ipc.ts`：vault runtime reset 时显式取消 long-context 队列和维护定时器，再关闭数据库和清缓存。
- `tests/long-context-themes.test.ts`：新增回归测试，模拟 provider 等待期间关闭数据库，验证后续写主题不会复用已关闭连接。

设计/实现约束：

- 不改变同步和索引对 `closeDatabase()` 的现有行为。
- 不因为一次索引完成就取消同 vault 的维护计划；只在明确 vault runtime reset 时取消。
- 后台 long-context 仍然是非阻塞维护链路，失败只记录 warning，不打断编辑、保存或 Chat。
- 秒级历史测试数据与毫秒级运行时数据都继续兼容，不在本轮强迁移数据库内容。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/long-context-*.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/main/tsconfig.json --noEmit`
- `git diff --check`

验证备注：

- 直接使用 `node_modules/.bin/vitest` 会因本机 `better-sqlite3.node` ABI 与 Node 22 不一致失败；项目专用 `scripts/vitest-electron.mjs` 可匹配当前 native module ABI，focused tests 已通过。

下一步：

- `P0-2.2 Usage Boundary`：Overview 展示 provider、本地/远程、token/cost 和 Vault tools 可用性摘要。
- `P0-2.3 Recent Trust`：Overview 展示最近可审查写入、撤销、恢复和同步风险摘要。

### 2026-06-17：P0-2.2 Overview Usage Boundary

已完成：

- `packages/renderer/src/components/overview/usage-boundary.ts`：新增纯函数 `buildOverviewUsageBoundary()`，集中计算 active provider、本地/远程、近 30 天 token / 成本、预算状态和 Vault tools 可用性。
- `packages/renderer/src/components/overview/hooks/useOverviewData.ts`：Overview 数据加载新增 provider、active provider、cost budget 和 tool surface entries；失败时降级为空数据，不影响本地健康和图表。
- `packages/renderer/src/components/overview/VaultOverview.tsx`：Quick Actions 区域新增紧凑 AI 使用边界摘要。
- `packages/renderer/src/components/overview/vault-overview.css`：Usage Boundary 复用 Overview 的克制状态行风格，并补充中窄屏布局。
- `packages/renderer/src/i18n/locales/en.json`、`packages/renderer/src/i18n/locales/zh-CN.json`：新增 Usage Boundary 中英文文案。
- `tests/overview-usage-boundary.test.ts`：覆盖无 provider、provider 不支持 tool calling、本地 provider、预算和成本状态。

设计/实现约束：

- 无 provider 时明确显示 Files、Search、Graph、Vault Health 仍在本地可用，AI 行动需要 provider。
- Vault tools 只有在 active provider 支持 `toolCalling` 且工具清单非空时显示为可用。
- 不展示复杂成本 BI，只展示近 30 天 token / 估算成本和月预算边界。
- 不新增一线导航入口，不引入新的 Dashboard 心智。

已验证：

- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/overview-usage-boundary.test.ts tests/vault-health-actions.test.ts`
- `git diff --check`

### 2026-06-17：P0-2.3 Recent Trust

已完成：

- `packages/renderer/src/components/overview/recent-trust.ts`：新增纯函数 `buildOverviewRecentTrust()`，聚合 Agent run、Cloud Sync health 和 Trash entries，输出固定三类可信摘要。
- `packages/renderer/src/components/overview/hooks/useOverviewData.ts`：Overview 数据加载新增 `agent:list-runs`、`cloud:get-sync-health`、`file:list-trash`；所有新增 IPC 都有失败兜底。
- `packages/renderer/src/components/overview/VaultOverview.tsx`：Recent Trust 数据接入 Overview，并与 AI / Vault tools 合并到紧凑边界状态列，展示最近 Agent 执行、同步状态和可恢复删除。
- `packages/renderer/src/components/overview/vault-overview.css`：新增“行动 + 边界状态列”的 workbench；窄屏下自动堆叠，长错误和文件名可换行。
- `packages/renderer/src/i18n/locales/en.json`、`packages/renderer/src/i18n/locales/zh-CN.json`：新增 Recent Trust 中英文文案。
- `tests/overview-recent-trust.test.ts`：覆盖空状态、Agent preview/applied/failed、同步冲突/离线队列、远端删除和普通可恢复删除。

状态映射：

- Agent：
  - `completed + dryRun=true`：preview completed。
  - `completed + dryRun=false`：applied。
  - `failed`：需要审查。
  - `cancelled`、`awaiting_user`、`paused`：需要用户审查。
  - `pending`、`planning`、`running`：执行中。
- Sync：
  - `conflict`、`error`：风险。
  - `offlineQueueSize > 0`：离线队列待同步。
  - 未配置 provider：明确显示未配置，不作为风险。
  - `ok`：最近同步正常。
- Recovery：
  - `reason === sync_remote_delete`：远端同步删除，需要审查。
  - 其他 trash entry：显示可恢复历史。
  - 无 trash entry：明确空状态。

设计/实现约束：

- 第一版只做摘要，不做完整审计日志系统。
- 不新增一线导航入口，不提供自动写入动作。
- Recent Trust 不再作为首屏独立面板，避免 Overview 顶部超过一屏；首屏优先展示可执行的健康行动。
- “Recent Trust” 只告诉用户最近是否有 AI 写入、可恢复删除或同步风险；真正处理仍回到 Chat、Graph、Trash/Recovery、Sync 设置等既有路径。
- 没有记录时显示“最近没有需要审查的写入、恢复或同步风险”，避免空白区域。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/overview-recent-trust.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/overview-recent-trust.test.ts tests/overview-usage-boundary.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`
- `git diff --check`

### 2026-06-17：Overview 首屏密度修正

触发问题：

- 用户反馈 Overview 顶部同时展示 Quick Actions、AI Boundary、Recent Trust 三个完整区域，导致首屏超出一屏，信息优先级不清晰。

已完成：

- 保留 Quick Actions 作为首屏唯一行动块，继续服务“今天先处理哪三件事”的核心目标。
- 撤回 Overview 顶部的 AI provider / Vault tools / Recent Trust 状态 chips。用户反馈这组三条状态在首页右侧仍然显得突兀、拥挤，并且不服务“下一步行动”。
- 移除 Overview 对 provider、cost budget、tool surface、agent runs、sync health、trash entries 的额外加载；首页不再为已撤回的状态区发起 IPC。
- 保留 `usage-boundary.ts` 和 `recent-trust.ts` 的纯函数与 focused tests，作为后续设置页、诊断页或发布/同步风险复用的底层判断，不再在 Overview 首屏渲染。
- Quick Action 卡片高度从大卡片压缩为紧凑按钮，描述限制为一行。
- 二次修正：Quick Action 按钮固定为紧凑命令高度；描述文案不再占用桌面首屏高度。
- 三次修正：Quick Actions 从“卡片内嵌胶囊标签”降级为 34px 命令按钮，只保留动作标题和目标入口，避免下一步行动区域显得厚重或丑陋。
- 四次修正：取消左侧 Quick Actions 大容器和右侧状态大容器的并列结构，改为单个紧凑 workbench strip。原因是右侧三条状态会决定整行高度，左侧只有一行命令时会形成大面积空洞，视觉上像拼接的 dashboard。
- 五次修正：完全移除右侧状态 chips；Overview 顶部只保留摘要指标和健康行动，避免 AI/Trust 边界信息以小块堆叠的方式干扰首页扫描。

设计/实现约束：

- Overview 首屏优先级：指标摘要 -> 可执行健康行动 -> 图表。
- AI / Trust 信息不再放入 Overview 顶部；相关边界后续应放在 Chat、Settings、发布/同步预览或专门诊断入口中，而不是首页小 chip。
- 使用量类信息只在图表区域表达，避免首屏重复指标造成阅读负担。
- 顶部行动区不再使用“左大卡片 + 右大卡片”的布局；也不再使用右侧小状态 chip 占位。
- 不新增入口，不改变 Quick Actions 路由，不改变 preview-first / 不自动写入边界。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/overview-recent-trust.test.ts tests/overview-usage-boundary.test.ts tests/vault-health-actions.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`
- `git diff --check`

下一步：

- `P1-1.1 无来源回答边界`：继续加固 Chat 在无本地证据时的回答边界和 UI 提示。
- `P1-2.1 Graph 信号发起 Chat`：让 Graph 维护信号可一键生成普通 Chat 修复建议。

### 2026-06-17：P1-1.1 Chat 无来源回答边界

已完成：

- `packages/main/src/services/ai/system-context.ts`：新增无本地证据 system prompt 片段，要求模型开头说明未在本地笔记找到证据；允许继续使用通用知识，但必须标注为 general knowledge / 通用知识。
- `packages/main/src/ipc/ai.ipc.ts`：普通 `ai:chat` 在无 lexical retrieval 且无 Context Pack sources 时使用无来源边界 prompt，并向 renderer 发送 `ai:evidence` 事件；有 Context Pack 或检索来源时继续发送 `ai:sources`。
- `packages/shared/src/types/ipc.ts`、`packages/main/src/ipc/db.ipc.ts`、`packages/main/src/services/database.ts`：Chat history 增加 `evidence` 字段，持久化 assistant 消息是否有本地证据，历史回放不丢失提示状态。
- `packages/main/src/preload.ts`：暴露 `onAiEvidence` 订阅，保持 renderer 只能监听明确 allowlisted 的事件。
- `packages/renderer/src/components/ai/MessageBubble.tsx`、`MessageBubble.css`：assistant 消息在 `evidence.status === 'none'` 时显示克制的“未找到本地来源”状态提示；不把它做成大警告卡片，避免压迫正常阅读。
- `packages/renderer/src/components/ai/ChatPanel.tsx`：流式回答完成时把 sources / evidence 一起写入消息和数据库；发送、重试、继续、停止时清理 pending evidence，避免串到下一轮。
- `packages/renderer/src/components/ai/chat-evidence.ts`：新增纯函数 `buildChatEvidenceFromSources()`，根据 `source.origins` 区分 retrieval、Context Pack 和 Vault tools，避免历史记录把所有来源都粗略标成检索。
- `tests/chat-evidence-boundary.test.ts`：覆盖无来源 prompt、中英文边界文案、UI notice 只在 no evidence 消息出现，以及 sources -> evidence reason 的归因。

设计/实现约束：

- 只加固普通 RAG Chat，不把无来源问题自动切到 Agent / Vault tools。
- 没有本地证据时不阻止回答，但 UI 和 system prompt 都必须区分 vault evidence 与 general knowledge。
- 有来源时仍优先显示真实 sources；无来源时只显示轻量状态，不制造新的首屏或侧栏入口。
- evidence 是 assistant 消息的派生状态，不参与模型上下文本身，避免历史回放污染下一轮 prompt。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/chat-evidence-boundary.test.ts tests/ai-system-context.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/main/tsconfig.json --noEmit`
- `git diff --check`

### 2026-06-17：P1-2.1 Graph 信号发起 Chat

已完成：

- `packages/renderer/src/components/graph/graph-maintenance-chat.ts`：新增纯函数 `buildGraphMaintenanceChatDraft()`，把 Graph 维护信号转换成普通 Chat 草稿；三类信号分别覆盖孤岛、跨目录桥接、AI 推断关系。
- `packages/renderer/src/components/graph/GraphMaintenanceNudge.tsx`：每类可见维护信号旁新增紧凑 Ask Chat 图标按钮；原有 focus pill 行为保持不变。
- `packages/renderer/src/components/graph/GraphView.tsx`：Ask Chat 复用 `queueAiCommandDraft()` 打开右侧 Chat，并显式 `agentMode: false`，不默认进入 Agent / Vault tools。
- `packages/renderer/src/components/graph/GraphView.css`：新增按钮复用 Graph nudge 的 24px icon button 视觉，不拉高维护提示条。
- `packages/renderer/src/i18n/locales/en.json`、`packages/renderer/src/i18n/locales/zh-CN.json`：新增 Ask Chat label 和三类草稿 prompt；prompt 包含信号类型、数量、示例节点/边，并明确要求先给建议、不直接写入文件。
- `tests/graph-ui.test.ts`：覆盖 Graph 维护信号生成 Chat 草稿、普通 Chat 模式、样本/数量进入 prompt、空信号不生成草稿。

顺手修复：

- `packages/renderer/src/stores/ui-store.ts`：修复 `saveWorkspaceLayout()` 依赖 `getInitialWorkspaceLayout()` 时把当前 `editor` workspace 错误还原为 `overview` 的问题。现在 `setMainView('editor')` 后再打开 `tags/outline` 等 note-scoped panel 可以继承当前会话布局；`openFilesSidebar()` 仍保持 session-only，不会把启动页持久化成 editor。
- `tests/ui-store.test.ts`：同步 workspace 默认迁移版本，并验证 editor / graph 会保留已保存的 sidebar 状态，Overview / Memory / Bases 仍保持折叠。

设计/实现约束：

- Graph 的 Ask Chat 只是生成 Chat 草稿，不执行写入，不触发 Agent。
- 草稿要求使用本地搜索和 Context Pack，并在有来源时引用来源。
- 如果用户后续要求应用结构修复，仍必须进入 preview-first / reversible path；本轮不新增任何绕过预览的写入通道。
- UI 只增加紧凑图标按钮，不新增面板、不改变图谱布局算法、不改变原 focus 按钮。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/graph-ui.test.ts tests/ui-store.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`

下一步：

- `P1-1.3 Context Pack 反馈可见`：把关系反馈入口放到 source popover 或 related context 面板。

### 2026-06-18：P1-1.3 Context Pack 反馈可见

已完成：

- `packages/renderer/src/components/long-context/relation-feedback.ts`：新增纯 helper，统一定义反馈类型、状态文案 key、以及 `not_related` / `dismissed` / `snoozed` 这类会从当前建议列表移除的 suppressive feedback。
- `packages/renderer/src/components/long-context/RelationFeedbackControls.tsx`：新增轻量反馈控件，提供“有用、降权、暂时隐藏、不相关”，在 RelatedContextCard 中额外保留“忽略”。
- `packages/renderer/src/components/long-context/RelatedContextCard.tsx`、`RelatedContextPanel.tsx`：Related Context 卡片复用共享控件；反馈提交后立即显示状态或从当前建议中移除；IPC 失败时回滚本地乐观状态。
- `packages/renderer/src/components/observability/ChatSourceRow.tsx`：source popover 的 Context Pack relation lookup 增加同一套反馈入口；用户可直接对 cited relation 标记有用、降权、暂时隐藏或不相关。
- `packages/renderer/src/components/long-context/long-context.css`、`packages/renderer/src/components/observability/chat-source-row.css`：反馈控件保持 22px 紧凑按钮和短状态文本，不新增面板、不扩大 source row。
- `packages/renderer/src/i18n/locales/en.json`、`packages/renderer/src/i18n/locales/zh-CN.json`：新增反馈状态和“降权”文案。
- `tests/long-context-ui.test.ts`：覆盖反馈状态 key、suppressive feedback 会从当前建议列表移除、非 suppressive feedback 保留并可显示状态。

设计/实现约束：

- 反馈仍走现有 `long-context:submit-feedback` IPC 和 `relation_feedback` 表，不引入前端假状态或新数据模型。
- `not_related` 会进入后端 `wrong` 状态，后续 Context Pack / suggestions 不再强推；`snoozed` 暂时从当前 UI 隐藏并降低后续 ranking。
- Source popover 和 Related Context 复用同一套控件与 helper，避免两个入口反馈行为分叉。
- UI 只做内嵌小按钮和短状态，不新增大卡片、侧栏或独立日志。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/long-context-ui.test.ts tests/long-context-store.test.ts tests/long-context-decay.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`
- `git diff --check`

下一步：

- `P1-3.1 发布/同步前 Health 风险复用`：在发布和同步关键动作前复用 Vault Health 风险，优先展示阻断风险和建议。

### 2026-06-18：P1-1.2 Source 点击定位加固

已完成：

- `packages/renderer/src/utils/source-navigation.ts`：新增 source navigation 预检流程，统一处理文件存在性、line/endLine 直达、blockId/heading/snippet 内容匹配，以及片段未命中时的 `fallback-top`。
- `packages/renderer/src/components/observability/ChatSourceRow.tsx`：Chat source 点击改为先预检，再打开 editor；源文件缺失时显示错误 toast，片段未命中时打开文件顶部并提示原因。
- `packages/renderer/src/components/tool-surface/ToolResultPanel.tsx`：Vault tools sources 复用同一套导航预检，避免工具结果和 Chat sources 的点击行为分叉。
- `packages/renderer/src/i18n/locales/en.json`、`packages/renderer/src/i18n/locales/zh-CN.json`：新增缺文件和片段未命中提示文案。
- `tests/source-navigation.test.ts`：覆盖导航目标优先级、line 直达不读文件、snippet 补 line、未命中 fallback、缺文件返回 missing。

设计/实现约束：

- 定位优先级保持为 `line/endLine` -> `blockId` -> `heading` -> `snippet`。
- 找不到片段时不阻断用户，打开文件顶部并说明“引用片段未找到”。
- 文件不存在或被移动时不切到 editor，避免打开空白或错误路径。
- 不新增 source 详情面板，不改变 Chat source row 和 Tool Result Panel 的视觉结构。

已验证：

- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node scripts/vitest-electron.mjs run tests/source-navigation.test.ts`
- `PATH=/Users/lizhiwei/.nvm/versions/node/v22.22.3/bin:$PATH node_modules/.bin/tsc -p packages/renderer/tsconfig.json --noEmit`
- `python3 -m json.tool packages/renderer/src/i18n/locales/en.json`
- `python3 -m json.tool packages/renderer/src/i18n/locales/zh-CN.json`
- `git diff --check`

下一步：

- `P1-1.3 Context Pack 反馈可见`：把关系反馈入口放到 source popover 或 related context 面板。
