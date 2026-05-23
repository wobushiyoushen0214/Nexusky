# Nexusky 认知伙伴升级执行计划

> 目标：把 Nexusky 从“AI-native 长期上下文系统”进化为“AI-native Cognitive Partner（认知伙伴）”。本文不是愿景稿，而是可直接拆任务、写代码、跑测试、出 PR 的工程执行文档。

适用版本：`v0.4.0` 之后，紧接 `docs/LONG_TERM_CONTEXT_SYSTEM_PLAN.md` 落地后的下一阶段。
当前基础：Electron 33 + React 19 + better-sqlite3 (SCHEMA v9) + 长期上下文系统（13 个 long-context 测试、9 个 long-context IPC、后台节流主路径已上线）。
新阶段核心：四个方向（A 主动 / B 日常 / C 自治 / D 透明）合力把"被动展示长期上下文"升级为"主动陪伴的认知伙伴"。

## 实施状态（2026-05-24）

| 方向 | 迭代 | 状态 | 关键 commit |
| --- | --- | --- | --- |
| A · Proactive AI | iter 0-4 | ✅ 全部完成 | 258d7e1 → 955e1ce |
| A · 5 分钟全局 cooldown | 收尾 | ✅ 完成 | 7cae5e1 |
| B · Tool Surface | iter 0-3 | ✅ 全部完成 | c6b76a1 → 96bd762 |
| B · 命令面板按 tool 名搜 | 收尾 | ✅ 完成 | 7cae5e1 |
| B · Tool Surface | iter 4 | ⚠️ 文案 + 类型已收尾；跨平台手测 / 5000-note 性能基线待真机 |  |
| C · Plan-Execute-Reflect | iter 0-5 | ✅ 全部完成 | 3b1e9ff → d6657be |
| D · Long-Context 可观测 | iter 0-3 | ✅ 全部完成 | d9e9f07 → 4ed357b |
| D · Metrics sparkline 趋势 | 收尾 | ✅ 完成 | 524f167 |
| 测试基线 | 12 个 pre-existing 失败 | ✅ 修复（v11/store fallback/symlink probe/.mjs shebang/Windows 路径） | b7eabfd |

剩余非代码工作：跨平台 (macOS / Windows) 验收手测，5000-note 性能基线。代码层 10 条断言全部覆盖。

---

## 0. 终极目标（Vision）

### 0.1 一句话愿景

> Nexusky 是一个本地优先、长期记忆、可被审视的 AI 认知伙伴：它不只记得你想过什么，也在你需要时主动提醒、随手可用、独立承担多步任务、并且永远可以被你审视和校准。

### 0.2 四个支柱（A / B / C / D）

四个支柱是同一愿景的四面，不是孤立功能：

| 支柱 | 含义 | 用一句话验收 |
| --- | --- | --- |
| A · Proactive AI | AI 有"主动权"：在恰当时机主动开口，但绝不打扰写作 | 用户编辑笔记达到阈值后，看到一条"3 个月前的 X 与当前内容矛盾"提示，可一键打开/dismiss/snooze |
| B · Tool Surface | AI 有"日常存在感"：54 个 Agent 工具从 chat loop 内被搬出来，成为命令面板/右键/侧边面板的一等公民 | 用户在 1.5 秒内通过命令面板单工具直调 `list_orphan_notes`，看到结果，不走任何 LLM |
| C · Plan-Execute-Reflect Agent | AI 有"任务承担力"：从单步 tool-call loop 升级到多步、可预览、可中断、可回滚的自主规划 | 用户输入"为缺失 memory 的笔记批量生成 memory"，看到 plan 预览，可编辑/执行/中断/查看每步证据 |
| D · Long-Context 可观测 + 可调参 | AI 有"可信度"：Hot/Warm/Cold context、token 占用、被裁项、useful_rate 全部可视 + 可调 | 用户能在 Settings 子页看到当前 chat 看到了什么、为什么 AI 引用了 X，并能调 confidence/decay/tier ratio |

### 0.3 与 Obsidian / Notion / Cursor 的差异化定位

| 维度 | Obsidian | Notion | Cursor | Nexusky 认知伙伴态 |
| --- | --- | --- | --- | --- |
| 数据所有权 | 本地 Markdown | 云端块 | 云端项目 | 本地 Markdown（同 Obsidian） |
| AI 长期记忆 | 插件级 | 单文档 | session 内 | vault 级、跨会话、有衰减、有反馈 |
| 主动提醒 | 无 | 无 | 无 | 编辑达阈值时主动开口（A） |
| 工具直调 | 命令面板（用户操作） | 命令面板（用户操作） | Agent | 命令面板 + 右键 + 维护队列（B） |
| 多步任务 | 用户手动 | 用户手动 | Agent loop | Plan-Execute-Reflect with 用户中断点（C） |
| AI 透明度 | 不适用 | 不适用 | 引用 | Hot/Warm/Cold 包可视 + 可调参 + 引用反查（D） |

差异化一句话：**Obsidian 让你拥有数据；Notion 让你协作；Cursor 让你写代码；Nexusky 让 AI 长期陪你思考。**

### 0.4 完成态用户故事

```text
Story 1（A·主动）：
小明早上打开 Nexusky，右上角通知中心一条灰底提醒："你 11 月写的《MCP 试验记录》和这周的 5 篇 Agent 笔记是 supports_goal 关系，
要不要在主线笔记里加一条 [[MCP 试验记录]] 的反链？" 小明点 Snooze 7 天。

Story 2（A·主动 + B·日常）：
小明开始写新笔记，写到 400 字时编辑器右下角弹出"💡 你 3 个月前的 X 笔记与当前内容存在 conflicts_with 关系"。
小明点 "Why?" 看到原因、证据，关闭提示。

Story 3（B·日常）：
小明 Ctrl+Shift+P，输入 "orphan"，回车 — 命令面板直接列出所有孤岛笔记，不走任何 LLM、1 秒内返回。
他点击一个，跳转到那篇笔记。

Story 4（C·自治）：
小明在右侧 Agent Run 面板输入"为 .nexusky/memories 里缺失的 53 篇笔记批量生成 memory"。
AI 生成 5 步 plan（按文件夹分批），小明删掉一步、确认执行。
执行到第 3 步时小明点 Pause，看 step 3 写了什么，继续执行。
全部完成后小明打开 agent_runs 历史，看到完整证据链。

Story 5（D·透明）：
小明问 AI："为什么你刚刚推荐我读《长期记忆设计》？" 
点击 AI 引用旁的 "Why?" 图标，弹出 context pack 详情：
"它来自 Hot Memory tier，relationId=xyz，confidence=0.86，evidence=[...]，
被 ranker 排在 0.78（feedback +0.25），可在 Settings → Long-Context 调整。"
```

---

## 1. 总体路线（Roadmap）

### 1.1 四方向相对优先级

按"用户立刻能感知 + 复用底层最多"的原则排序：

| 优先级 | 方向 | 理由 |
| --- | --- | --- |
| P0 | **A · Proactive AI** | 用户最大痛点是"AI 在我没主动问的时候完全沉默"；后台主路径已可挂触发点 |
| P0 | **B · Tool Surface** | 54 个工具是 Nexusky 最低估的资产；纯前端 + IPC 工作，风险最低 |
| P1 | **D · Long-Context 可观测** | A/B 上线后用户会问"AI 凭什么这样推断"；这是建立信任的前提 |
| P2 | **C · Plan-Execute-Reflect Agent** | 最重也最 risky（写操作、回滚、原子化）；前三方向稳定后再上 |

**推荐执行节奏：A 和 B 并行做（不同人/不同 PR），D 接着上，C 最后做。**

### 1.2 关键里程碑

```text
Milestone 1 · Proactive + Tool Surface MVP（4-6 周）
  - A Iteration 0-3
  - B Iteration 0-2
  - 第一个可发布的"认知伙伴"用户体验

Milestone 2 · 可观测性闭环（2-3 周）
  - D Iteration 0-3
  - 用户能看到 AI 凭什么开口

Milestone 3 · 自治 Agent 落地（4-6 周）
  - C Iteration 0-4
  - 用户能委托多步任务

Milestone 4 · 跨方向打磨（2 周）
  - 通知中心统一
  - 指标看板
  - 用户偏好统一存储
```

### 1.3 预计 PR 数和时间盘子

| 方向 | Iteration 数 | 估计 PR 数 | 估计开发时间（单人，含测试） |
| --- | --- | --- | --- |
| A | 5 | 4-5 PR | 3-4 周 |
| B | 5 | 4-5 PR | 3-4 周 |
| C | 6 | 6-7 PR | 5-6 周 |
| D | 4 | 3-4 PR | 2-3 周 |
| 跨方向打磨 | 2 | 2 PR | 2 周 |
| **合计** | 22 | 19-23 PR | **15-19 周（单人）** |

并行执行（A+B 并行、D 跟 B 后、C 最晚）：约 **10-12 周**。

---

## 2. 方向 A：Proactive AI

### 2.1 MVP 与非目标

**MVP（第一个可上线的最小闭环）：**

```text
用户编辑一篇笔记 5 分钟、内容增量 >= 300 字时
  ↓
后台主路径已经为这篇笔记跑过 long-context discover（已有）
  ↓
proactive 服务从 ai_relations 选出一条 "够大新鲜 + 高 score + 未展示过" 的关系
  ↓
通知中心出现一条 toast 级提示（不弹窗、不抢焦点、不占编辑空间）
  ↓
用户可: Open / Snooze / Dismiss / Not interested
```

**非目标（A 阶段明确不做）：**

- 不做"AI 主动起对话"（避免用户疲劳）。
- 不做 desktop notification（避免跨平台权限和打扰）。
- 不做语音提醒。
- 不做基于"用户情绪/行为推断"的提示（隐私边界）。
- 不做超过 4 类 trigger（避免 trigger 爆炸难维护）。

### 2.2 当前代码落点

| 复用 | 位置 |
| --- | --- |
| 后台触发点 | `packages/main/src/services/long-context/background.ts` 的 `runLongContextBackgroundCycle` |
| 关系来源 | `packages/main/src/services/long-context/relation-store.ts` 的 `getContextSuggestions` / `ai_relations.score` |
| 长期主题 | `packages/main/src/services/long-context/theme-extractor.ts` 的 `getLongTermThemes` |
| 维护信号 | `packages/main/src/services/ai/maintenance-queue.ts` 的 `buildKnowledgeMaintenanceQueue` |
| Cognitive review | `packages/main/src/services/long-context/cognitive-review.ts` 的 `generateCognitiveReview`（已可 schedule 写 `.nexusky/reviews/`） |
| Toast | `packages/renderer/src/stores/toast-store.ts` |
| 右栏宿主 | `packages/renderer/src/App.tsx` 的 `<aside>` |
| 编辑器宿主 | `packages/renderer/src/components/editor/Editor.tsx` 的右下角 status bar 区 |

新增目录建议：

```text
packages/main/src/services/proactive/
  proactive-triggers.ts        // 触发条件判断器
  proactive-store.ts            // proactive_suggestions 表读写
  proactive-orchestrator.ts     // 串联 trigger → policy → store → emit
  proactive-policy.ts           // 频率限制、snooze 计算
  index.ts

packages/renderer/src/components/proactive/
  NotificationCenter.tsx
  ProactiveToast.tsx
  proactive.css
```

### 2.3 数据模型

**Schema 升级到 v10**：在 `packages/main/src/services/database.ts` 加 Migration 10。

```sql
CREATE TABLE IF NOT EXISTS proactive_suggestions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- 'relation' | 'theme_link' | 'cognitive_review' | 'maintenance'
  source_ref TEXT NOT NULL,        -- relationId / themeId / reviewFilePath / maintenance signature
  entity_type TEXT,                -- 当前焦点实体类型（'note' | 'task' | 'vault'）
  entity_id TEXT,                  -- 当前焦点实体 id（null 表示 vault 级）
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  cta_action TEXT NOT NULL,        -- 'open_note' | 'add_wikilink' | 'open_review' | 'open_queue'
  cta_payload_json TEXT NOT NULL DEFAULT '{}',
  importance INTEGER NOT NULL DEFAULT 50,  -- 0-100
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'shown' | 'opened' | 'snoozed' | 'dismissed' | 'expired'
  snooze_until INTEGER,            -- unix seconds
  shown_at INTEGER,
  responded_at INTEGER,
  signature TEXT NOT NULL,         -- 去重 key: kind|source_ref|entity_id
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proactive_signature ON proactive_suggestions(signature);
CREATE INDEX IF NOT EXISTS idx_proactive_status_created ON proactive_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_entity ON proactive_suggestions(entity_type, entity_id, status);
```

**注意**：每条 proactive suggestion 都对应一个可追溯的 source（relationId / themeId / reviewFilePath / maintenance signature），不允许"凭空生成提示"。

### 2.4 服务层设计

新建 `packages/main/src/services/proactive/`，遵循 long-context 已建立的"后台节流队列 + IPC 类型先行"模式。

```ts
// proactive-triggers.ts
export type ProactiveTriggerKind =
  | 'long_context_high_score'      // 当前笔记编辑后发现高分关系
  | 'theme_proximity'              // 当前内容接近一个长期主题但未加 wikilink
  | 'cognitive_review_ready'       // 周度 cognitive review 写盘完成
  | 'stale_island_note'            // 30+ 天未维护的孤岛笔记被打开
  | 'overdue_task_burst'           // 同一笔记下逾期任务 >= 3 条

export interface ProactiveTriggerInput {
  vaultPath: string
  entityType: 'note' | 'task' | 'vault'
  entityId: string
  trigger: ProactiveTriggerKind
  context?: Record<string, unknown>
}

export interface ProactiveCandidate {
  kind: 'relation' | 'theme_link' | 'cognitive_review' | 'maintenance'
  sourceRef: string
  title: string
  body: string
  ctaAction: 'open_note' | 'add_wikilink' | 'open_review' | 'open_queue'
  ctaPayload: Record<string, unknown>
  importance: number  // 0-100
  signature: string
}

export function evaluateTriggers(input: ProactiveTriggerInput): ProactiveCandidate[]
```

```ts
// proactive-policy.ts
// 决定一个 candidate 现在能不能展示
export interface ProactivePolicyContext {
  vaultPath: string
  now: number
  candidate: ProactiveCandidate
  userPrefs: ProactiveUserPrefs
  recentlyShown: ProactiveSuggestionRow[]  // 过去 24h shown 的 suggestion
}

export interface ProactivePolicyDecision {
  emit: boolean
  reason: string  // 'duplicate' | 'rate_limit' | 'snoozed' | 'silent_hours' | 'ok'
  suppressUntil?: number
}

export function decideEmission(ctx: ProactivePolicyContext): ProactivePolicyDecision
```

```ts
// proactive-orchestrator.ts
export interface RunProactiveCycleParams {
  vaultPath: string
  entityType: 'note' | 'task' | 'vault'
  entityId: string
  trigger: ProactiveTriggerKind
  now?: number
}

export interface RunProactiveCycleResult {
  evaluated: number
  emitted: number
  suggestions: ProactiveSuggestion[]
}

export async function runProactiveCycle(params: RunProactiveCycleParams): Promise<RunProactiveCycleResult>
```

**触发挂接点（关键）**：所有触发点都在主进程，不依赖前端 polling。

1. `background.ts` 的 `runLongContextBackgroundCycle` 末尾，如果 `discovery.discovered > 0` 且新关系 `score >= 0.75`：调用 `runProactiveCycle({ trigger: 'long_context_high_score' })`。
2. `background.ts` 的 `maybeGenerateCognitiveReview` 写盘后：调用 `runProactiveCycle({ trigger: 'cognitive_review_ready' })`。
3. `db:index-file` 索引完成后，如果该笔记 `tasks.due_date < today` 数 >= 3：调用 `runProactiveCycle({ trigger: 'overdue_task_burst' })`。
4. `db:get-outgoing-links`/`indexer.ts` 在笔记打开路径上检测到笔记是 orphan 且 `updated_at` > 30 天：调用 `runProactiveCycle({ trigger: 'stale_island_note' })`。
5. `theme-extractor.ts` 完成抽取后：扫描最近 24h 编辑过、内容关键词与新主题重叠 >= 3 的笔记，调用 `runProactiveCycle({ trigger: 'theme_proximity' })`。

**Frequency 上限（policy 硬规则）**：

```text
全 vault 24 小时内 shown 总数 <= 5
同一 entity 24 小时内 shown <= 1
同一 signature 一辈子最多 shown 一次（除非用户主动重置）
snoozed 默认 7 天，可配 1/3/7/30/forever
"静音时段"（用户偏好）期间 emit=false
```

### 2.5 IPC 设计

在 `packages/shared/src/types/ipc.ts` 新增（命名遵循 `long-context:*` 风格）：

```ts
export type ProactiveSuggestionKind = 'relation' | 'theme_link' | 'cognitive_review' | 'maintenance'
export type ProactiveSuggestionStatus = 'pending' | 'shown' | 'opened' | 'snoozed' | 'dismissed' | 'expired'
export type ProactiveCtaAction = 'open_note' | 'add_wikilink' | 'open_review' | 'open_queue'

export interface ProactiveSuggestion {
  id: string
  kind: ProactiveSuggestionKind
  title: string
  body: string
  ctaAction: ProactiveCtaAction
  ctaPayload: Record<string, unknown>
  importance: number
  status: ProactiveSuggestionStatus
  shownAt?: number
  snoozeUntil?: number
  createdAt: number
}

export interface ProactiveUserPrefs {
  enabled: boolean
  silentHoursStart?: string  // 'HH:mm'
  silentHoursEnd?: string
  defaultSnoozeDays: number  // 1 | 3 | 7 | 30
  perKindEnabled: Record<ProactiveSuggestionKind, boolean>
  maxPerDay: number  // 默认 5
}

// IPC channels:
'proactive:list': {
  params: { vaultPath: string; status?: ProactiveSuggestionStatus[]; limit?: number }
  result: ProactiveSuggestion[]
}
'proactive:respond': {
  params: { vaultPath: string; id: string; response: 'opened' | 'snoozed' | 'dismissed' | 'not_interested'; snoozeDays?: number }
  result: void
}
'proactive:get-prefs': { params: undefined; result: ProactiveUserPrefs }
'proactive:set-prefs': { params: { prefs: ProactiveUserPrefs }; result: void }
'proactive:debug-run-cycle': {
  params: { vaultPath: string; entityType: 'note' | 'task' | 'vault'; entityId: string; trigger: string }
  result: { evaluated: number; emitted: number }
}
```

注册位置：新建 `packages/main/src/ipc/proactive.ipc.ts`，在 `index.ts` 注册。前端通过事件回传新提示：在 `preload.ts` 暴露 `onProactiveEmitted`，主进程通过 `webContents.send('proactive:emitted', suggestion)`。

### 2.6 前端落点

新增组件：

```text
packages/renderer/src/components/proactive/
  NotificationCenter.tsx        // 右上角铃铛 + 抽屉，列出 pending/shown 的 suggestion
  ProactiveToast.tsx            // 高优先级 (importance >= 80) 的非阻塞 toast
  ProactivePreferences.tsx      // Settings 子页：开关、静音时段、每日上限、per-kind 开关
  proactive.css
```

UI 原则（硬约束）：

- 默认 toast 4 秒后自动消失（除非用户 hover）。
- toast 不抢焦点、不占编辑器空间、不出现在 `focusMode` 下。
- 通知中心铃铛只在有 pending 时显示数字徽标，无 pending 时是隐性的。
- 所有 CTA 必须能在 1 次点击内完成 `Open` / `Snooze` / `Dismiss`。
- 严禁阻塞编辑器输入，严禁拦截 Esc/Enter 等编辑器快捷键。
- 所有动画 <= 200ms。

挂接位置：

- `App.tsx` 头部 (`TitleBar` 旁边) 加 `NotificationCenter` 铃铛。
- `App.tsx` 顶层 lazy mount `ProactiveToast`（订阅 `onProactiveEmitted` 事件）。
- `Settings.tsx` 新增 "Proactive" tab 加载 `ProactivePreferences`。

### 2.7 迭代路线

**Iteration 0：数据层 + Schema v10（Day 1-2）**

任务：
- 新建 Migration 10，加 `proactive_suggestions` 表和 3 个索引。
- `repairExistingSchema` 兼容旧 vault 缺列。
- 新建 `packages/main/src/services/proactive/proactive-store.ts`：`upsertSuggestion`、`listSuggestions`、`updateStatus`、`pruneExpired`。

文件：
- 修改 `packages/main/src/services/database.ts`（SCHEMA_VERSION 9 → 10）
- 新建 `packages/main/src/services/proactive/proactive-store.ts`
- 新建测试 `tests/proactive-schema.test.ts`、`tests/proactive-store.test.ts`

依赖前序：长期上下文 SCHEMA v9 已完成（已是）。

验收：
- 新 vault 创建包含 v10 表。
- schema 9 → 10 升级幂等。
- `pruneExpired` 把 `created_at < now - 30 天` 且 `status in (pending, shown)` 的清为 expired。
- 重复 upsert 同 signature 不会产生新行。

PR 估计：1 PR。

---

**Iteration 1：触发器 + Policy（Day 3-5）**

任务：
- 新建 `proactive-triggers.ts`：5 种 trigger 的 `evaluateTriggers` 实现，全部走读 DB，不调用 LLM。
- 新建 `proactive-policy.ts`：频率上限、snooze、静音时段、signature 去重、importance 阈值。
- 用户偏好存储：写入 `store`（electron-store）`proactiveUserPrefs` key。

文件：
- `packages/main/src/services/proactive/proactive-triggers.ts`
- `packages/main/src/services/proactive/proactive-policy.ts`
- `packages/main/src/services/proactive/proactive-orchestrator.ts`
- 新建测试 `tests/proactive-triggers.test.ts`、`tests/proactive-policy.test.ts`

依赖前序：Iteration 0。

验收：
- `long_context_high_score` trigger 能从 `ai_relations.score >= 0.75 AND created_at >= recent` 命中候选。
- `theme_proximity` trigger 能从最近编辑笔记 + `long_term_themes.keywords` 命中候选。
- policy 在 24h 内 emit >= 5 次后下一次决策 `emit=false`。
- 同一 signature 重复评估时 policy `emit=false, reason='duplicate'`。
- 静音时段内 `emit=false`。

PR 估计：1 PR。

---

**Iteration 2：挂接后台主路径 + IPC（Day 6-8）**

任务：
- 在 `long-context/background.ts` 的 `runLongContextBackgroundCycle` 后置 hook 调 `runProactiveCycle(trigger: long_context_high_score)`。
- 在 `maybeGenerateCognitiveReview` 写盘后调 `runProactiveCycle(trigger: cognitive_review_ready)`。
- 在 `theme-extractor.ts` 末尾扫描最近编辑笔记 + 新主题，触发 `theme_proximity`。
- 在 `indexer.ts`（或 `db.ipc.ts` 的 `db:index-file` handler）末尾 emit `overdue_task_burst` 和 `stale_island_note`。
- 注册 IPC：`proactive:list`、`proactive:respond`、`proactive:get-prefs`、`proactive:set-prefs`、`proactive:debug-run-cycle`。
- 在 `preload.ts` 暴露 `onProactiveEmitted` 事件。

文件：
- 修改 `packages/main/src/services/long-context/background.ts`
- 修改 `packages/main/src/services/long-context/theme-extractor.ts`
- 修改 `packages/main/src/ipc/db.ipc.ts`（`db:index-file` 后置）
- 新建 `packages/main/src/ipc/proactive.ipc.ts`
- 修改 `packages/main/src/index.ts`（注册 ipc）
- 修改 `packages/main/src/preload.ts`（暴露事件）
- 修改 `packages/shared/src/types/ipc.ts`（5 个新 channel + types）
- 新建测试 `tests/proactive-background-integration.test.ts`、`tests/proactive-ipc-types.test.ts`

依赖前序：Iteration 1。

验收：
- 写一条笔记触发 `db:index-file` 后，background 主路径完成 long-context discover，如发现 score>=0.75 关系，DB 内出现 status=pending 的 suggestion。
- 此过程不依赖用户点击任何 UI（与 long-context 主路径保持同一形态）。
- IPC 类型测试通过（仿 `tests/long-context-ipc-types.test.ts`）。
- `proactive:respond` 写入 `responded_at` 并把 status 改为 opened/snoozed/dismissed。
- 用户 dismiss 后再次触发同 signature → 不再 emit。

PR 估计：1 PR。

---

**Iteration 3：通知中心 + Toast（Day 9-11）**

任务：
- 新建 `NotificationCenter` 组件：铃铛 + 抽屉，调 `proactive:list({ status: ['pending', 'shown'] })`。
- 新建 `ProactiveToast`：监听 `onProactiveEmitted`，对 `importance >= 80` 显示自动消失 toast。
- 抽屉中的每条 suggestion：Open（按 ctaAction dispatch）、Snooze 1/7/30 天、Dismiss。
- 在 `App.tsx` 头部加铃铛、顶层 mount toast。
- 在 `focusMode === true` 时屏蔽 toast。
- i18n key 命名空间：`proactive.*`。

文件：
- 新建 `packages/renderer/src/components/proactive/NotificationCenter.tsx`
- 新建 `packages/renderer/src/components/proactive/ProactiveToast.tsx`
- 新建 `packages/renderer/src/components/proactive/proactive.css`
- 修改 `packages/renderer/src/App.tsx`（mount NotificationCenter + Toast）
- 修改 `packages/renderer/src/components/TitleBar.tsx` 或邻近（铃铛位置）
- 修改 `packages/renderer/src/i18n/locales/zh-CN.json`、`en.json`（proactive.* 键）
- 新建测试 `tests/proactive-notification-center.test.ts`

依赖前序：Iteration 2。

验收：
- 高优先级 suggestion 主进程 emit 后，前端 1 秒内显示 toast。
- toast 4 秒后自动消失，用户 hover 不消失。
- 铃铛抽屉打开后调 `proactive:list`，每条都能 Open/Snooze/Dismiss。
- `focusMode === true` 时不显示 toast。
- Snooze 7 天后 status=snoozed，铃铛抽屉默认不展示 snoozed 项。
- CSS 不用 `padding-inline` 等 logical properties。

PR 估计：1 PR。

---

**Iteration 4：用户偏好 Settings 子页 + 验收（Day 12-14）**

任务：
- 新建 `ProactivePreferences.tsx`：enabled 总开关、per-kind 开关、静音时段（用 24h "HH:mm" 格式）、`maxPerDay` 滑杆、默认 snooze 天数。
- 在 `Settings.tsx` 增加 "Proactive" tab。
- 重置按钮：`proactive:debug-run-cycle` 触发一次 trigger（开发自检用，发布版可隐藏在 advanced）。
- 撰写跨平台手测脚本：macOS / Windows 各跑一遍 5 个 trigger 的预期路径。

文件：
- 新建 `packages/renderer/src/components/proactive/ProactivePreferences.tsx`
- 修改 `packages/renderer/src/components/settings/Settings.tsx`
- 修改 i18n locale 文件
- 新建测试 `tests/proactive-preferences.test.ts`

依赖前序：Iteration 3。

验收：
- 关闭总开关后无论什么 trigger 都不 emit。
- 静音时段（如 22:00-08:00）内 emit=false（policy 拦截）。
- per-kind 关掉 `cognitive_review` 后该 kind 的 emit=false。
- `maxPerDay = 1` 时，第二次 trigger 被 policy 拒绝。
- macOS 和 Windows 上 timezone 处理一致（用 system local time）。

PR 估计：1 PR。

### 2.8 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 打扰频率失控 | 用户被弹得疲劳，关掉 | policy 硬上限 + per-vault 频率统计 + 关闭按钮放抽屉顶部 |
| 误报关系 | 提示的关系用户觉得不相关 | importance 受 `score` 影响；`not_interested` 反馈写入 `relation_feedback` 降权 |
| signature 冲突 | 同一来源生成不同提示 | signature = `kind|sourceRef|entityId`，确保稳定且可重放 |
| Snooze 跨日重置 | snooze 7 天但用户感觉时间没到就重现 | `snooze_until` 用 unix seconds 绝对值，不依赖"重启计数" |
| focusMode 期间噪声 | 用户专注写作被打扰 | 前端读 `focusMode` 直接屏蔽 toast；铃铛徽标仍可累计 |
| 跨平台时区 | Win11 和 macOS 静音时段不一致 | 用 `new Date()` 取 local time，明确写在 policy 单元测试里 |

---

## 3. 方向 B：Tool Surface

### 3.1 MVP 与非目标

**MVP：**

```text
54 个 Agent 工具里挑选 ~25 个"读类 + 写类预览" 工具：
  - 命令面板里 20+ 个一键直调（"Quick Tool"），不走 LLM
  - 编辑器右键菜单 5-8 个上下文工具
  - 右侧维护队列面板（已有 `plan_knowledge_maintenance` 底层）作为 first-class panel
```

**非目标：**

- 不做"无 chat 上下文的全工具暴露"（部分工具如 `read_current_note_lines` 在裸调时无意义）。
- 不做"在命令面板里直接执行写操作"（写操作走维护队列面板的"Apply Fix" 流程）。
- 不做工具市场/插件化（现阶段是内置工具）。
- 不做完全替代 Agent loop（Agent 仍是多工具串联的最佳形态）。

### 3.2 当前代码落点

| 复用 | 位置 |
| --- | --- |
| Agent 工具 schema + executor | `packages/main/src/ipc/ai.ipc.ts` 的 `executeToolCall`（54 个 case） |
| 工具结果格式化 | `packages/main/src/services/ai/search-results.ts` |
| 工具参数解析 | `packages/main/src/services/ai/tool-arguments.ts` |
| 工具 limit 归一化 | `packages/main/src/services/ai/tool-limits.ts` |
| 工具前端标签 | `packages/main/src/services/ai/tool-labels.ts` |
| 维护队列 | `packages/main/src/services/ai/maintenance-queue.ts` |
| 命令面板 | `packages/renderer/src/components/CommandPalette.tsx` |
| 右栏 panel 注册 | `packages/renderer/src/App.tsx`（rightPanel 联动 `ui-store.ts`） |

### 3.3 单工具直调架构

**关键设计决策：不要为 54 个工具各开 IPC channel，太碎。**

用一个统一 channel `ai:run-tool` 加白名单：

```ts
// 新建 packages/main/src/services/tool-surface/registry.ts
export type ToolSurfaceKind = 'read_only' | 'preview_write' | 'agent_only'

export interface ToolSurfaceEntry {
  name: string                  // 与 executeToolCall name 完全一致
  kind: ToolSurfaceKind
  category: 'note' | 'graph' | 'memory' | 'task' | 'maintenance'
  defaultArgs?: Record<string, unknown>
  requiresCurrentNote?: boolean
  commandPaletteEntry?: { id: string; labelKey: string; keywords: string[]; shortcut?: string }
  rendererFormatter?: 'markdown' | 'text' | 'json'  // 前端如何展示
}

export const TOOL_SURFACE_REGISTRY: ToolSurfaceEntry[] = [
  { name: 'list_orphan_notes', kind: 'read_only', category: 'maintenance', commandPaletteEntry: {...}, rendererFormatter: 'markdown' },
  { name: 'list_unresolved_links', kind: 'read_only', category: 'graph', commandPaletteEntry: {...}, rendererFormatter: 'markdown' },
  // ... ~25 项
]
```

`ai:run-tool` handler 复用 `executeToolCall`：

```ts
// 在 ai.ipc.ts 注册
ipcMain.handle('ai:run-tool', async (event, params: {
  vaultPath: string
  toolName: string
  args?: Record<string, unknown>
  currentFilePath?: string | null
}): Promise<{ ok: true; content: string; sources?: ChatSource[] } | { ok: false; error: string }> => {
  const entry = TOOL_SURFACE_REGISTRY.find((e) => e.name === params.toolName)
  if (!entry) return { ok: false, error: `Tool not allowed in direct mode: ${params.toolName}` }
  if (entry.kind === 'agent_only') return { ok: false, error: 'Tool requires agent context' }
  if (entry.requiresCurrentNote && !params.currentFilePath) return { ok: false, error: 'Current note required' }
  const merged = { ...entry.defaultArgs, ...params.args }
  const result = await executeToolCall(params.toolName, merged, params.vaultPath, params.currentFilePath)
  return { ok: true, content: result.content, sources: result.sources }
})
```

**入选 25 个工具的清单（read_only）：**

```text
Note: search_notes, find_similar_notes, find_memory_related_notes, find_connection_opportunities,
      read_current_note, read_current_note_properties, find_text_in_current_note
Graph: list_note_links, list_current_note_links, summarize_current_note_links,
       list_current_note_unlinked_references, list_unresolved_links, list_orphan_notes,
       list_unreferenced_notes, list_dead_end_notes, list_link_hubs, list_knowledge_bridges
Memory: get_memory_overview, list_memory_folders, list_memory_terms, list_notes_missing_memory,
        read_current_note_memory
Task: list_tasks, list_current_note_tasks
Maintenance: plan_knowledge_maintenance
```

**Preview-write 类（不直接写，先预览）**：

```text
suggest_note_links（已是建议生成器，不写入）
plan_knowledge_maintenance（已是列表，不写入）
```

写入动作放方向 C 的 Agent runs。

### 3.4 IPC 设计

```ts
'ai:run-tool': {
  params: {
    vaultPath: string
    toolName: string
    args?: Record<string, unknown>
    currentFilePath?: string | null
  }
  result:
    | { ok: true; content: string; sources?: ChatSource[] }
    | { ok: false; error: string }
}

'ai:list-tool-surface': {
  params: undefined
  result: {
    entries: { name: string; kind: ToolSurfaceKind; category: string; labelKey: string; keywords: string[]; requiresCurrentNote: boolean }[]
  }
}

'maintenance:get-queue': {
  params: { vaultPath: string; type?: KnowledgeMaintenanceType; query?: string; limit?: number }
  result: { items: KnowledgeMaintenanceItem[]; total: number; counts: Record<KnowledgeMaintenanceType, number> }
}

'maintenance:apply-fix': {
  params: {
    vaultPath: string
    item: KnowledgeMaintenanceItem  // 完整 item，保证可追溯
    action: 'open_note' | 'create_target' | 'mark_done' | 'archive' | 'add_alias'
    payload?: Record<string, unknown>  // 例如 alias 字符串
  }
  result: { ok: boolean; appliedAction: string; resultMessage: string }
}
```

注意：`maintenance:apply-fix` 当前只暴露**非破坏性操作**（open_note 不写、create_target 走 file:create、mark_done 改 task 状态、archive 写 frontmatter 字段、add_alias 改 frontmatter）。真正高风险写操作留给方向 C。

### 3.5 前端落点

#### 3.5.1 命令面板扩展

在 `CommandPalette.tsx` 的 `commands` 数组里通过 `TOOL_SURFACE_REGISTRY` 自动注册：

```ts
const [toolSurface, setToolSurface] = useState<ToolSurfaceEntry[]>([])
useEffect(() => {
  if (open && vaultPath) {
    window.api.invoke('ai:list-tool-surface', undefined).then((res) => setToolSurface(res.entries))
  }
}, [open, vaultPath])

const toolCommands = toolSurface.map((entry) => ({
  id: `tool:${entry.name}`,
  category: entry.category === 'maintenance' ? 'ai' : 'search',
  label: t(entry.labelKey),
  description: t(`${entry.labelKey}.description`),
  keywords: ['tool', ...entry.keywords],
  action: async () => {
    if (entry.requiresCurrentNote && !requireCurrentNote()) return
    const result = await window.api.invoke('ai:run-tool', {
      vaultPath: vaultPath!,
      toolName: entry.name,
      currentFilePath
    })
    if (result.ok) {
      window.dispatchEvent(new CustomEvent('tool-surface-result', {
        detail: { toolName: entry.name, content: result.content, sources: result.sources }
      }))
    } else {
      toast(result.error, 'error')
    }
  }
}))
```

结果展示：用一个新的 `ToolResultPanel`（slide-up 抽屉），把 `result.content` 用 marked + DOMPurify 渲染（Markdown 格式由 `search-results.ts` 保证）。

#### 3.5.2 编辑器右键菜单

在 `Editor.tsx` 的编辑区 `onContextMenu` 加 5-8 个上下文工具入口（仅限当前笔记有效的工具）：

```text
Find Similar Notes (find_similar_notes with current note title as query)
Show Current Note Links (list_current_note_links)
Show Unlinked References (list_current_note_unlinked_references)
Show Current Note Tasks (list_current_note_tasks)
Connection Opportunities for Current Note (find_connection_opportunities, query=title)
Maintenance Suggestions for This Note (plan_knowledge_maintenance scoped via query)
Read Current Note Memory (read_current_note_memory)
```

复用现有 `ContextMenu.tsx`。

#### 3.5.3 维护队列面板

新增 `Panel` 类型 `'maintenance'` 到 `ui-store.ts`：

```ts
type Panel = 'none' | 'chat' | 'outline' | 'properties' | 'tags' | 'calendar' | 'history' | 'graph' | 'plugin' | 'maintenance'
const PANEL_IDS: Panel[] = [..., 'maintenance']
```

新建组件：

```text
packages/renderer/src/components/maintenance/
  MaintenanceQueuePanel.tsx     // 主面板（接入 App.tsx）
  MaintenanceItemCard.tsx       // 单项卡片
  MaintenanceFilters.tsx        // 类型 / query / 完成度筛选
  MaintenanceProgress.tsx       // 顶部进度条
  maintenance.css
```

面板列布局（左侧栏 + 右侧详情，参考 ReaderInboxView）：

```text
┌────────────────────────────────┐
│ Maintenance Queue              │
│ ━━━━━━━━━━━━━━━━━━━━━━ Filter │
│ Type ▼  Query: ____   Done 18%│
│                                │
│ [Priority 95] 🔗 fix_unresolved│
│   Note A — Resolve [[X]]       │
│   [Open] [Create X] [Skip]     │
│                                │
│ [Priority 90] 🛑 overdue task  │
│   Note B — 3 tasks overdue     │
│   [Open Note] [Mark Done]      │
│                                │
│ ...                            │
└────────────────────────────────┘
```

操作（Apply Fix 通过 `maintenance:apply-fix`）：

- `Open` → `useEditorStore.openFile(item.filePath)`
- `Create target`（`fix_unresolved_link` 专属）→ `file:create` 并 reindex
- `Mark Done`（task 类）→ 修改 Markdown 行的 checkbox
- `Add Alias`（`resolve_duplicate_alias` 专属）→ 编辑 frontmatter
- `Archive`（`connect_orphan` 专属）→ frontmatter 加 `nexusky_archived: true`
- `Skip` → 本地 localStorage 隐藏（不入库，因为底层是无状态计算）

ActivityBar 入口：在 `activity-bar-store.ts` 加 `maintenance` 条目。

### 3.6 维护队列面板规范

| 字段 | 行为 |
| --- | --- |
| 类型筛选 | 多选下拉，覆盖 19 种 KnowledgeMaintenanceType |
| 搜索框 | 走 `maintenance:get-queue` 的 `query` 参数 |
| 排序 | 默认 priority desc + updatedAt asc |
| 完成度 | 本面板内被 Apply 过的项数 / 总数（localStorage 持久化） |
| 批量操作 | "Apply Fix to all visible" 仅对 mark_done / archive 类生效，每条仍走单独 `maintenance:apply-fix` 调用 |
| 确认对话框 | 写操作前用 `ConfirmModal` 二次确认（特别是 batch） |
| 进度反馈 | 顶部 progress bar，批处理过程用 toast 节流报错 |

### 3.7 迭代路线

**Iteration 0：注册中心 + IPC 直调（Day 1-3）**

任务：
- 新建 `packages/main/src/services/tool-surface/registry.ts`，列出 25 项白名单。
- 在 `ai.ipc.ts` 注册 `ai:run-tool`、`ai:list-tool-surface`。
- 新建 i18n key：`commandPalette.toolSurface.<toolName>.label` / `.description`。

文件：
- `packages/main/src/services/tool-surface/registry.ts`
- 修改 `packages/main/src/ipc/ai.ipc.ts`
- 修改 `packages/shared/src/types/ipc.ts`
- 修改 `packages/renderer/src/i18n/locales/{zh-CN,en}.json`
- 新建测试 `tests/tool-surface-registry.test.ts`、`tests/tool-surface-ipc-types.test.ts`

验收：
- 调 `ai:run-tool` with whitelisted tool 返回 content。
- 调 with non-whitelisted tool 返回 `{ ok: false }`。
- `requiresCurrentNote=true` 且未传 `currentFilePath` 时返回 `{ ok: false }`。
- 注册中心 25 项的 `name` 全部能在 `executeToolCall` switch 中找到（用测试遍历）。

PR 估计：1 PR。

---

**Iteration 1：命令面板扩展 + 结果抽屉（Day 4-6）**

任务：
- `CommandPalette.tsx` 自动注入 25 个工具命令。
- 新建 `ToolResultPanel.tsx`：底部 slide-up 抽屉，渲染 markdown 结果，支持复制 / 跳转 source。
- 全局事件 `tool-surface-result` 触发抽屉。

文件：
- 修改 `packages/renderer/src/components/CommandPalette.tsx`
- 新建 `packages/renderer/src/components/tool-surface/ToolResultPanel.tsx`
- 修改 `packages/renderer/src/App.tsx`（挂 ToolResultPanel）
- 新建测试 `tests/tool-surface-command-palette.test.ts`

验收：
- 命令面板搜 "orphan" 能看到 `list_orphan_notes`，点击直接调 IPC、显示结果（1.5 秒内）。
- 不打开 ChatPanel，不消耗 token。
- 结果中的 source 点击能 `openFile`。
- 当前无 vault 时所有 tool 命令在面板里 disabled。

PR 估计：1 PR。

---

**Iteration 2：编辑器右键菜单（Day 7-8）**

任务：
- `Editor.tsx` 编辑区 `onContextMenu` 加 7 个上下文工具。
- 复用 `ContextMenu.tsx`。
- 当前笔记没保存或 currentFilePath 为空时这些项 disabled。

文件：
- 修改 `packages/renderer/src/components/editor/Editor.tsx`
- 修改 i18n locale
- 新建测试 `tests/tool-surface-editor-context-menu.test.ts`

验收：
- 在编辑器右键能看到 7 项，点击触发对应工具。
- 结果显示在 `ToolResultPanel`。
- 工具列表与 `ai:list-tool-surface` 中 `requiresCurrentNote=true` 项一致。

PR 估计：1 PR。

---

**Iteration 3：维护队列面板（Day 9-12）**

任务：
- `ui-store.ts` 加 `'maintenance'` panel 类型。
- `maintenance:get-queue` 主进程实现：复用 `buildKnowledgeMaintenanceQueue` 全量结果（限制 200 条），分类聚合 `counts`。
- `maintenance:apply-fix` 主进程实现：5 种非破坏操作（open_note / create_target / mark_done / archive / add_alias）。
- 新建 `MaintenanceQueuePanel.tsx` 等 5 个组件。
- ActivityBar 加 `maintenance` 入口。

文件：
- `packages/main/src/ipc/db.ipc.ts`（注册 `maintenance:*`）
- 新建 `packages/main/src/services/maintenance/apply-fix.ts`
- 新建 `packages/renderer/src/components/maintenance/*`
- 修改 `packages/renderer/src/App.tsx`（rightPanel === 'maintenance' 分支）
- 修改 `packages/renderer/src/stores/ui-store.ts`
- 修改 `packages/renderer/src/stores/activity-bar-store.ts`
- 修改 i18n locale
- 新建测试 `tests/maintenance-queue-ipc.test.ts`、`tests/maintenance-apply-fix.test.ts`、`tests/maintenance-panel.test.ts`

验收：
- 在面板里看到分类 counts 与 `plan_knowledge_maintenance` 工具返回一致。
- `Apply Fix → mark_done` 对一个 task 行实际改了 Markdown 文件并 reindex。
- `Apply Fix → create_target` 创建新笔记并打开。
- `Apply Fix → add_alias` 修改 frontmatter 后保留其他属性。
- 错误情况（文件已被删）显示 toast，不崩溃。
- 批量 `mark_done` 走 ConfirmModal 二次确认。

PR 估计：2 PR（IPC 一个、UI 一个）。

---

**Iteration 4：i18n、跨平台手测、收尾（Day 13-14）**

任务：
- 中英文 locale 补全所有 tool-surface 和 maintenance 文案。
- macOS + Windows 各跑一遍：命令面板 → 抽屉、右键 → 抽屉、维护队列 → Apply Fix。
- Performance 验证：`list_orphan_notes` 在 5000 笔记 vault 上 < 1.5 秒。

文件：
- 完善 i18n locale
- 文档：在本计划添加"已完成"标记和性能基线

验收：
- 5000 笔记 vault 中命令面板单工具直调 P95 < 1.5 秒。
- macOS 与 Windows 右键菜单显示一致（无 logical property 用法）。
- 所有 i18n key 在两种语言下都有值。

PR 估计：1 PR。

### 3.8 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 工具数量爆炸 | 命令面板被工具淹没 | 限制 25 项白名单；按 category 分组展示 |
| 用户混淆 chat vs quick tool | 用户期望"问就行" | quick tool 走 `ai:run-tool` 不需 LLM，UX 标签明确写 "Direct" / "1s" |
| 写操作误触 | 用户 batch mark_done 误改 | ConfirmModal 二次确认 + 显示 affected count |
| 大 vault 性能 | `list_orphan_notes` 在 10k 笔记上慢 | maintenance IPC 限制 `limit=200`；DB 查询有 index |
| 工具结果太长 | Markdown 弹出占满屏 | `ToolResultPanel` slide-up 抽屉，max height 60vh，内部滚动 |

---

## 4. 方向 C：Plan-Execute-Reflect Agent

### 4.1 MVP 与非目标

**MVP：**

```text
用户描述目标（如"为 53 篇缺失 memory 的笔记批量生成"）
  ↓
AI 生成 plan（多步 JSON，每步带工具调用、参数、预期产出、依赖前序步）
  ↓
用户预览 plan，可编辑/删除/重排
  ↓
点 Execute，每步执行写入 agent_steps 表
  ↓
每步执行前/后用户可暂停、查看证据、cancel
  ↓
所有步骤完成或 cancel 后写入 agent_runs 状态
  ↓
若失败步骤可标记 retry 或 ignore，整体可 rollback（dry-run 模式默认开启）
```

**非目标：**

- 不做"AI 完全自主无人值守"。
- 不做跨 vault 操作。
- 不做并行步骤（先做线性，简化状态机）。
- 不做"AI 调外部 API"（仅限当前 54 个工具 + 文件读写）。
- 不做"AI 自动修复 plan 失败"（失败后由用户决定 retry/skip/abort）。

### 4.2 数据模型

**Schema 升级到 v11**：在 v10 之上再加 Migration 11。

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  vault_path TEXT NOT NULL,
  goal TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'planning' | 'awaiting_user' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  plan_json TEXT NOT NULL DEFAULT '[]',     -- AgentPlanStep[]
  dry_run INTEGER NOT NULL DEFAULT 1,       -- 1 = dry-run (default), 0 = real
  current_step_index INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  result_summary TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created ON agent_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_kind TEXT NOT NULL,           -- 'tool_call' | 'file_write' | 'file_create' | 'task_update' | 'note_edit'
  tool_name TEXT,
  args_json TEXT NOT NULL DEFAULT '{}',
  depends_on_json TEXT NOT NULL DEFAULT '[]',  -- number[] (step indices)
  status TEXT NOT NULL DEFAULT 'pending',       -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rolled_back'
  preview TEXT,
  result_content TEXT,
  result_sources_json TEXT,
  error TEXT,
  rollback_data_json TEXT,           -- 用于 undo（如旧文件内容）
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, step_index ASC);
CREATE INDEX IF NOT EXISTS idx_agent_steps_status ON agent_steps(status, updated_at DESC);
```

### 4.3 服务层设计

新建目录：

```text
packages/main/src/services/agent/
  planner.ts            // AI 生成 plan JSON
  executor.ts           // 单步执行
  reflector.ts          // 完成后评估
  rollback.ts           // 回滚单步或全 run
  agent-store.ts        // agent_runs / agent_steps 读写
  step-kinds.ts         // step kind 定义与执行映射
  index.ts
```

**Planner**：

```ts
export interface AgentPlanStep {
  index: number
  kind: 'tool_call' | 'file_write' | 'file_create' | 'task_update' | 'note_edit'
  toolName?: string                    // 仅 tool_call 用
  args: Record<string, unknown>
  description: string                  // 给用户看的简述
  expectedEffect: string               // 预期产出（用于 reflect）
  dependsOn: number[]                  // 依赖的 step index
}

export async function planAgentRun(params: {
  vaultPath: string
  goal: string
  context?: Record<string, unknown>
}): Promise<{ plan: AgentPlanStep[]; rationale: string }>
```

planner 使用 AI provider 输出严格 JSON，prompt 模板规则（参考 long-context relation-classifier）：

```text
You are designing a step-by-step plan to achieve a user goal in a knowledge base.

Allowed step kinds: tool_call | file_write | file_create | task_update | note_edit

Allowed tools for tool_call (whitelist):
  search_notes, find_similar_notes, list_orphan_notes, list_notes_missing_memory, ...

Each step must include: index, kind, args, description, expectedEffect, dependsOn.

Return strict JSON: {"steps":[...],"rationale":"..."}

Rules:
- Maximum 12 steps.
- Every write step (file_write|file_create|task_update|note_edit) must be preceded by a read step.
- dependsOn must reference earlier step indices only.
- Never include destructive operations (delete file, drop table).
- If goal is ambiguous, return fewer steps and put missing info in rationale.
```

**Executor**：

```ts
export interface ExecuteStepParams {
  vaultPath: string
  runId: string
  stepIndex: number
  dryRun: boolean
  signal?: AbortSignal
}

export interface ExecuteStepResult {
  status: 'completed' | 'failed' | 'skipped'
  content?: string
  error?: string
  rollbackData?: Record<string, unknown>
}

export async function executeStep(params: ExecuteStepParams): Promise<ExecuteStepResult>
```

执行映射（`step-kinds.ts`）：

| step.kind | dryRun=true 行为 | dryRun=false 行为 |
| --- | --- | --- |
| `tool_call` | 调 `executeToolCall`（read-only 默认无副作用） | 同 dryRun |
| `file_write` | 计算 diff，写入 step.preview，不落盘 | 备份旧 content 到 rollbackData，写入新内容 |
| `file_create` | 计算目标路径，写入 step.preview | 调 `file:create` |
| `task_update` | 计算 task 修改后的 Markdown 行 | 写回文件、reindex |
| `note_edit` | 走 `ai:edit` 路径，生成新内容 preview | 用户在前端 diff 确认后写入 |

**Reflector**：

```ts
export interface ReflectAgentRunResult {
  goalAchieved: boolean
  succeededSteps: number
  failedSteps: number
  unmetExpectations: string[]
  suggestions: string[]
}

export async function reflectAgentRun(runId: string, vaultPath: string): Promise<ReflectAgentRunResult>
```

reflector 把 plan 的 `expectedEffect` 与 each step 的 `result_content` 喂给 AI provider，输出 JSON 评估。失败步骤可由用户决定 retry 或 ignore。

**Rollback**：

- 每个写入步骤把旧状态存到 `rollback_data_json`。
- `rollback.ts` 提供 `rollbackStep(runId, stepIndex)` 和 `rollbackRun(runId)`。
- file_write/file_create 类用 `rollbackData.previousContent`；task_update 用 `rollbackData.previousLine`。
- 数据库写操作不在 C 阶段范围（避免跨表事务）。

### 4.4 IPC 设计

```ts
export interface AgentRun {
  id: string
  goal: string
  description: string
  status: AgentRunStatus
  dryRun: boolean
  currentStepIndex: number
  totalSteps: number
  plan: AgentPlanStep[]
  resultSummary?: string
  error?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
}

export type AgentRunStatus = 'pending' | 'planning' | 'awaiting_user' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface AgentStep {
  id: string
  runId: string
  stepIndex: number
  kind: 'tool_call' | 'file_write' | 'file_create' | 'task_update' | 'note_edit'
  toolName?: string
  args: Record<string, unknown>
  description: string
  expectedEffect: string
  dependsOn: number[]
  status: AgentStepStatus
  preview?: string
  resultContent?: string
  resultSources?: ChatSource[]
  error?: string
  hasRollback: boolean
  startedAt?: number
  completedAt?: number
}

// IPC channels:
'agent:plan': {
  params: { vaultPath: string; goal: string; description?: string }
  result: { runId: string; plan: AgentPlanStep[]; rationale: string }
}
'agent:update-plan': {
  params: { vaultPath: string; runId: string; plan: AgentPlanStep[] }
  result: void
}
'agent:start': {
  params: { vaultPath: string; runId: string; dryRun?: boolean }
  result: void  // 后续通过事件 agent:step-update 推送进度
}
'agent:pause': { params: { vaultPath: string; runId: string }; result: void }
'agent:resume': { params: { vaultPath: string; runId: string }; result: void }
'agent:cancel': { params: { vaultPath: string; runId: string }; result: void }
'agent:retry-step': { params: { vaultPath: string; runId: string; stepIndex: number }; result: void }
'agent:skip-step': { params: { vaultPath: string; runId: string; stepIndex: number }; result: void }
'agent:rollback-step': { params: { vaultPath: string; runId: string; stepIndex: number }; result: void }
'agent:rollback-run': { params: { vaultPath: string; runId: string }; result: void }
'agent:get-run': { params: { vaultPath: string; runId: string }; result: { run: AgentRun; steps: AgentStep[] } }
'agent:list-runs': { params: { vaultPath: string; status?: AgentRunStatus[]; limit?: number }; result: AgentRun[] }
'agent:reflect': { params: { vaultPath: string; runId: string }; result: ReflectAgentRunResult }
```

事件（preload 暴露 `onAgentStepUpdate`）：

```ts
{
  channel: 'agent:step-update'
  payload: { runId: string; stepIndex: number; status: AgentStepStatus; preview?: string; error?: string }
}
```

### 4.5 前端落点

新增组件：

```text
packages/renderer/src/components/agent/
  AgentRunPanel.tsx           // 主面板：plan 编辑 + 执行进度 + 单步详情
  AgentPlanEditor.tsx          // plan 步骤编辑器（reorder / delete / inline edit）
  AgentStepDetail.tsx          // 单步 preview + result + retry/skip/rollback
  AgentRunsList.tsx            // 历史 runs 列表
  AgentDiffPreview.tsx         // file_write/note_edit 的 diff 渲染
  agent.css
```

`ui-store.ts` 加 `Panel` 类型 `'agent'`：

```ts
type Panel = 'none' | 'chat' | 'outline' | ... | 'maintenance' | 'agent'
```

UI 原则：

- Plan 预览阶段，用户必须明确点 "Execute" 才进入 running，dryRun 是默认 ON。
- 每个 file_write/file_create 步骤必须显示 diff，不允许"黑盒"执行。
- pause / cancel 按钮位于面板顶部固定区，1 次点击触发。
- 进度条显示 `currentStepIndex / totalSteps`。
- 失败步骤红色高亮，提供 retry / skip / view error。
- 历史 runs 抽屉可按 status 筛选。

### 4.6 安全性

| 约束 | 实现 |
| --- | --- |
| 写操作必须经用户确认 | dryRun 默认 ON，前端 "Execute" 按钮后才切到 `dryRun=false` |
| 步骤可中断 | 每步执行前检查 `AbortSignal`；agent-store 状态机允许 `paused` 中间态 |
| 失败原子化 | 失败步骤的 partial write 必须能 rollback（rollback_data_json 保存旧 content） |
| 全 run 可回滚 | `agent:rollback-run` 逆序执行 rollback_data_json，跳过已 skipped 步骤 |
| 严禁删除 | step.kind 不允许 file_delete / table_drop |
| 跨 vault 隔离 | 每个 IPC 校验 vaultPath，agent_runs.vault_path 与当前 vault 不一致时拒绝 |
| 长任务可取消 | 复用现有 `ai-task-control.ts` 模式 |

### 4.7 迭代路线

**Iteration 0：Schema v11 + agent-store（Day 1-2）**

任务：
- Migration 11：`agent_runs` + `agent_steps`。
- `agent-store.ts`：createRun / addStep / updateStep / getRun / listRuns。
- 测试 schema + store。

文件：
- 修改 `packages/main/src/services/database.ts`（SCHEMA_VERSION 10 → 11）
- 新建 `packages/main/src/services/agent/agent-store.ts`
- 新建测试 `tests/agent-schema.test.ts`、`tests/agent-store.test.ts`

依赖前序：A Iteration 0 完成（v10 在前）。

验收：
- 新 vault 升级到 v11。
- 重复 Migration 幂等。
- 外键 cascade 删除 steps。

PR 估计：1 PR。

---

**Iteration 1：Planner（Day 3-5）**

任务：
- `planner.ts`：AI provider 调用 + 严格 JSON prompt + `extractJsonFromText` 解析。
- 白名单工具检查、写步骤必须前置读步骤的检查。
- Mock provider 测试覆盖至少 3 个真实 goal 模板。

文件：
- 新建 `packages/main/src/services/agent/planner.ts`
- 新建 `packages/main/src/services/agent/step-kinds.ts`
- 新建测试 `tests/agent-planner.test.ts`

依赖前序：Iteration 0。

验收：
- 输入 goal "为缺失 memory 的笔记批量生成" → 输出至少 2 步：先 `list_notes_missing_memory`，后 `ai:generate-memories`。
- AI 返回非 JSON 时 fallback 到 "无法生成 plan" 而不是崩溃。
- plan 中包含未白名单工具时 reject。

PR 估计：1 PR。

---

**Iteration 2：Executor + DryRun（Day 6-9）**

任务：
- `executor.ts`：5 种 step kind 的 dryRun 与 real 路径。
- 写操作的 rollback_data_json 采集。
- 复用 `executeToolCall`。
- 步骤超时（默认 60 秒）。

文件：
- 新建 `packages/main/src/services/agent/executor.ts`
- 新建 `packages/main/src/services/agent/rollback.ts`
- 修改 `packages/main/src/ipc/ai.ipc.ts`（导出 `executeToolCall` 给 executor 使用）
- 新建测试 `tests/agent-executor.test.ts`、`tests/agent-executor-dryrun.test.ts`、`tests/agent-rollback.test.ts`

依赖前序：Iteration 1。

验收：
- dryRun 模式 file_write 不落盘但 preview 包含 diff。
- real 模式 file_write 落盘 + rollback_data_json 保存旧内容。
- rollback 后文件恢复到执行前。
- AbortSignal 在执行中断 step。

PR 估计：1 PR。

---

**Iteration 3：IPC + 事件（Day 10-11）**

任务：
- 新建 `packages/main/src/ipc/agent.ipc.ts`。
- 注册所有 `agent:*` channel。
- `preload.ts` 暴露 `onAgentStepUpdate`。
- 主进程通过 `webContents.send('agent:step-update', ...)` 推送。

文件：
- 新建 `packages/main/src/ipc/agent.ipc.ts`
- 修改 `packages/main/src/index.ts`
- 修改 `packages/main/src/preload.ts`
- 修改 `packages/shared/src/types/ipc.ts`
- 新建测试 `tests/agent-ipc-types.test.ts`

依赖前序：Iteration 2。

验收：
- `agent:plan` 返回 plan + runId。
- `agent:start` 启动后多次 `agent:step-update` 事件。
- `agent:pause` 在当前步骤完成后挂起。
- `agent:cancel` 中断当前步骤、status=cancelled。

PR 估计：1 PR。

---

**Iteration 4：前端 AgentRunPanel（Day 12-16）**

任务：
- 5 个组件 + ui-store.Panel 加 `'agent'`。
- Plan 编辑：reorder（拖拽）、delete、inline edit description。
- 执行视图：步骤列表 + 当前 detail + diff（用现成 diff 算法或第三方 lib，但避免引入大依赖）。
- ActivityBar 入口、Settings 子页（高级用户可关掉 dryRun 默认值）。

文件：
- 新建 `packages/renderer/src/components/agent/*`
- 修改 `packages/renderer/src/App.tsx`
- 修改 `packages/renderer/src/stores/ui-store.ts`、`activity-bar-store.ts`
- 修改 i18n locale
- 新建测试 `tests/agent-run-panel.test.ts`

依赖前序：Iteration 3。

验收：
- 用户在面板输入 goal，看到 plan 预览。
- 编辑 plan 后 "Execute" 触发 IPC。
- 进度条与每步状态实时更新。
- file_write 步骤显示 diff，用户能 Accept/Reject 单步。
- Cancel 在任何状态都能立即触发。

PR 估计：2 PR（plan editor 一个、execution view + history 一个）。

---

**Iteration 5：Reflector + 历史抽屉（Day 17-18）**

任务：
- `reflector.ts`：AI 评估 goal 达成度。
- `AgentRunsList.tsx`：历史 runs 列表 + 状态筛选 + 单 run 跳转详情。
- 失败步骤的 retry / skip / rollback。

文件：
- 新建 `packages/main/src/services/agent/reflector.ts`
- 完善 `packages/renderer/src/components/agent/AgentRunsList.tsx`
- 新建测试 `tests/agent-reflector.test.ts`

依赖前序：Iteration 4。

验收：
- 完成 run 后 `agent:reflect` 返回 `goalAchieved`、unmet expectations。
- 历史 runs 可按 status 筛选，点开看详情。
- 失败步骤 retry 后状态从 failed → running → completed。

PR 估计：1 PR。

### 4.8 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| AI plan 幻觉 | 步骤引用不存在工具 | 白名单检查 + 写前置读检查 + 用户预览可删 |
| 写操作误写 | file_write 错笔记 | dryRun 默认 ON + diff preview + rollback_data_json |
| 长任务无法取消 | step 死循环 | step 超时 60 秒；AbortSignal 检查在每个 IO 边界 |
| 状态机异常 | 中断时 status 不一致 | 状态机有限种，每次切换写 updated_at；前端读取容错 |
| Plan 编辑破坏依赖 | 用户删了被依赖的步 | Plan editor 验证 dependsOn 引用，删除时提示 |
| 跨 vault 数据泄露 | run 复用其他 vault 数据 | 每 IPC 强校验 vaultPath；agent_runs 内含 vault_path |
| Rollback 链断裂 | 某步无 rollback_data | UI 明确标 "no rollback available"；用户决定继续 |

---

## 5. 方向 D：Long-Context Observability

### 5.1 MVP 与非目标

**MVP：**

```text
Settings → Long-Context tab：
  - 展示当前 chat 的 context pack：Hot / Warm / Cold 内容、token 占用、被裁项
  - 实时显示 useful_rate / open_rate / not_related_rate
  - 滑杆调整：confidence threshold、tier 比例、decay rate、Top N
  - "Why did AI mention X?" 引用反查：点击 chat 内引用 → 跳到 context pack 来源项
```

**非目标：**

- 不做实时 streaming 调参（应用重启或下次 chat 生效）。
- 不做 A/B 实验框架。
- 不做 token 详细 breakdown（仅给估算）。
- 不暴露原始 prompt（含敏感系统 prompt）。

### 5.2 当前可复用的 metrics 和 sources

| 复用 | 位置 |
| --- | --- |
| Metrics | `long-context:get-metrics`（已有） |
| Context pack | `packages/main/src/services/long-context/context-pack-builder.ts` 的 `buildLongContextPack` |
| 关系详情 | `packages/main/src/services/long-context/relation-store.ts` 的 `getContextSuggestions` |
| 主题详情 | `packages/main/src/services/long-context/theme-extractor.ts` 的 `getLongTermThemes` |
| Chat sources | `MessageBubble.tsx` 已展示 chat 引用 |

### 5.3 前端落点

新增组件：

```text
packages/renderer/src/components/observability/
  LongContextDebugPanel.tsx       // Settings 子页
  ContextPackInspector.tsx        // 展示 Hot/Warm/Cold 三段
  MetricsDashboard.tsx             // useful_rate / open_rate / not_related_rate / 趋势图
  TuningControls.tsx               // 滑杆调参
  CitationLookup.tsx               // chat 引用 → context pack 来源跳转
  observability.css
```

入口：

- `Settings.tsx` 加 "Long-Context" tab，挂 `LongContextDebugPanel`。
- `ChatPanel.tsx` / `MessageBubble.tsx` 在 sources 列表旁加 "Why?" 按钮（小图标 "?"），点击触发 `CitationLookup`。
- `CommandPalette.tsx` 加 "View Context Pack" 命令打开 debug panel。

### 5.4 可调参 schema

存储在 `electron-store` key `longContextUserPrefs`：

```ts
export interface LongContextUserPrefs {
  confidenceThreshold: number      // 0-1，默认 0.65，影响 ranker 入库门槛
  tokenBudget: number              // 200-4000，默认 1200
  hotRatio: number                 // 0-1，默认 0.5
  warmRatio: number                // 0-1，默认 0.3
  coldRatio: number                // 0-1，默认 0.2
  decayHalfLifeDays: number        // 30-365，默认 90（对应 ranker decay 公式）
  topN: number                     // 1-10，默认 3（编辑器 RelatedContextPanel 展示数）
  hotLimit: number                 // 1-10，默认 3
  warmLimit: number                // 1-10，默认 3
  coldLimit: number                // 1-10，默认 3
  archiveAfterDays: number         // 60-365，默认 180
}
```

**重要**：调参影响下次 chat 与下次 background 主路径，不实时改已有数据。修改保存到 `store`，`context-pack-builder.ts`、`relation-store.ts`、`background.ts` 读取时优先取 user prefs，缺省回默认。

### 5.5 IPC 设计

```ts
export interface LongContextInspection {
  pack: {
    hot: LongContextPackItem[]
    warm: LongContextPackItem[]
    cold: LongContextPackItem[]
    estimatedTokens: number
    tokenBudget: number
    droppedItems: LongContextPackItem[]   // 因预算被裁的项
  }
  currentFilePath?: string
  generatedAt: number
}

// IPC channels:
'long-context:inspect-pack': {
  params: { vaultPath: string; currentFilePath?: string | null; tokenBudget?: number }
  result: LongContextInspection
}

'long-context:lookup-citation': {
  params: { vaultPath: string; sourceFilePath: string; sourceTitle: string }
  result: {
    found: boolean
    relations: LongContextSuggestion[]
    themes: LongTermTheme[]
  }
}

'long-context:get-prefs': { params: undefined; result: LongContextUserPrefs }
'long-context:set-prefs': { params: { prefs: LongContextUserPrefs }; result: void }
```

修改：`context-pack-builder.ts` 的 `buildLongContextPack` 改为从 `getPrefs()` 读取 hot/warm/cold limits 与 token budget；ranker 的 `decay` 接受 prefs 的 halfLife。

`buildLongContextPack` 增强：在 `pickWithinBudget` 内**记录被裁项**到 `droppedItems`（仅 inspector 用，不进 systemText）。

### 5.6 迭代路线

**Iteration 0：Prefs 存储 + IPC（Day 1-2）**

任务：
- 新增 `LongContextUserPrefs` schema 默认值。
- 注册 `long-context:get-prefs` / `set-prefs`。
- `context-pack-builder.ts` 读 prefs。
- `relation-ranker.ts` 接受 halfLife 参数。

文件：
- 修改 `packages/main/src/services/long-context/context-pack-builder.ts`
- 修改 `packages/main/src/services/long-context/relation-ranker.ts`
- 修改 `packages/main/src/ipc/db.ipc.ts`（注册新 IPC）
- 修改 `packages/shared/src/types/ipc.ts`
- 新建 `packages/main/src/services/long-context/long-context-prefs.ts`
- 新建测试 `tests/long-context-prefs.test.ts`

验收：
- 修改 confidenceThreshold 后下次 discover 应用新阈值。
- 修改 tokenBudget 后下次 buildLongContextPack 应用新值。
- 缺省 prefs 走默认值。

PR 估计：1 PR。

---

**Iteration 1：Inspector IPC + 被裁项采集（Day 3-4）**

任务：
- `buildLongContextPack` 增加 `droppedItems` 输出。
- 注册 `long-context:inspect-pack`。
- 在测试里验证 droppedItems 与 picked 互补。

文件：
- 修改 `packages/main/src/services/long-context/context-pack-builder.ts`
- 修改 `packages/main/src/ipc/db.ipc.ts`
- 新建测试 `tests/long-context-inspect.test.ts`

依赖前序：Iteration 0。

验收：
- 强制 tokenBudget=300 时，部分 candidate 进 droppedItems。
- droppedItems + picked 总数 = candidate 总数。

PR 估计：1 PR（可合并 Iteration 0）。

---

**Iteration 2：Citation Lookup（Day 5-6）**

任务：
- 注册 `long-context:lookup-citation`，按 (sourceFilePath, sourceTitle) 反查 `ai_relations` 和 `long_term_themes.memberships`。
- 在 `MessageBubble.tsx` 的 source chip 旁加 "?" 按钮。
- 弹出 popover 显示来源 relation / theme，可点击跳转到 source note。

文件：
- 修改 `packages/main/src/ipc/db.ipc.ts`
- 修改 `packages/renderer/src/components/ai/MessageBubble.tsx`
- 新建 `packages/renderer/src/components/observability/CitationLookup.tsx`
- 新建测试 `tests/long-context-citation-lookup.test.ts`

依赖前序：Iteration 1。

验收：
- AI 引用一个笔记后，"?" 按钮显示该笔记关联的 relation 或 theme。
- 关联为空时显示 "No long-context relation found"。
- 跳转源笔记走 `openFile`。

PR 估计：1 PR。

---

**Iteration 3：Settings 子页 + Tuning + Dashboard（Day 7-10）**

任务：
- `LongContextDebugPanel`：3 个子区（ContextPackInspector / MetricsDashboard / TuningControls）。
- ContextPackInspector：tab Hot/Warm/Cold/Dropped；每项展示 title / source / reason / evidence / confidence / score。
- MetricsDashboard：useful_rate / open_rate / not_related_rate 当前值 + 趋势（用 sparkline，可简单 SVG）。
- TuningControls：滑杆改 confidenceThreshold / tokenBudget / decayHalfLifeDays / topN / tier limits；保存按钮触发 `set-prefs`。
- `CommandPalette` 加 "View Context Pack" 命令。

文件：
- 新建 `packages/renderer/src/components/observability/*`
- 修改 `packages/renderer/src/components/settings/Settings.tsx`
- 修改 `packages/renderer/src/components/CommandPalette.tsx`
- 修改 i18n locale
- 新建测试 `tests/long-context-debug-panel.test.ts`

依赖前序：Iteration 2。

验收：
- 打开 Long-Context tab 看到当前 vault 的 pack（with currentFilePath 来自最后聚焦的笔记）。
- 修改 confidenceThreshold 后点 Save，下次 discover 应用。
- Dashboard 数字与 `long-context:get-metrics` 一致。
- Dropped 区列出被裁项目，标明原因 "exceeded token budget"。

PR 估计：1 PR。

### 5.7 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 用户调参把系统调坏 | useful_rate 暴跌 | TuningControls 提供 "Reset to defaults"；记录每次调参时间到 context_events |
| 显示系统 prompt 泄露 | 用户看到机密 prompt | inspector 只展示 long-context 部分，不展示 base system prompt |
| Citation lookup 误判 | 无关 source 也返回 relation | 查询条件严格匹配 sourceFilePath；返回 confidence < 0.4 的项标灰 |
| Metrics 性能 | 每次打开拉所有 context_events | `get-metrics` 已有时间窗 + 索引；面板默认只显示 30 天 |
| 跨平台样式 | sparkline 在 macOS / Windows 不同 | 用纯 SVG path，不依赖 canvas |

---

## 6. 跨方向的共享基础

### 6.1 通知中心

A 的 proactive toast / 维护提醒、B 的批量操作进度、C 的 agent run 状态推送 — 都用同一个 `NotificationCenter`（在 A·Iteration 3 建立）。

| 来源 | 进入 NotificationCenter 的方式 |
| --- | --- |
| A · Proactive | `proactive:emitted` 事件 → `ProactiveToast` + 持久化到 `proactive_suggestions` |
| B · 批量进度 | `tool-surface-result` 事件 → 临时 toast，不持久化 |
| C · Agent 进度 | `agent:step-update` 事件 → 临时 toast；run 完成时持久化到 `agent_runs` |
| D · Tuning 改动 | 即时 toast "Saved. Will apply on next chat" |

### 6.2 用户偏好/设置存储位置

| 偏好 | 存储 |
| --- | --- |
| `proactiveUserPrefs` | electron-store（全局 / vault 无关） |
| `longContextUserPrefs` | electron-store（全局） |
| `agentRunDefaults`（如 dryRun 默认） | electron-store（全局） |
| 维护队列 skip 列表 | localStorage（vault-scoped key） |
| Agent runs 历史 | SQLite `agent_runs` 表（vault-scoped） |

**原则**：跨 vault 共享的偏好放 electron-store；vault scoped 偏好放对应 vault 的 SQLite 或 localStorage。

### 6.3 i18n key 命名空间

```text
proactive.notificationCenter.*
proactive.toast.*
proactive.preferences.*

toolSurface.commands.<toolName>.label
toolSurface.commands.<toolName>.description
toolSurface.resultPanel.*

maintenance.queue.*
maintenance.filters.*
maintenance.actions.*

agent.plan.*
agent.step.*
agent.run.*
agent.history.*

observability.contextPack.*
observability.metrics.*
observability.tuning.*
observability.citation.*
```

每方向迭代结束 PR 都必须补齐 `zh-CN.json` 和 `en.json` 两个 locale 的 keys，否则 typecheck 不通过。

---

## 7. 质量门禁与验收

### 7.1 每方向的产品验收清单

**方向 A 验收**：

- [ ] 用户在 vault 内 5 分钟无操作后被打扰次数 = 0。
- [ ] 编辑 1 篇笔记 5 分钟内最多 1 条 proactive。
- [ ] dismiss / snooze / not_interested 三种反馈都能持久化。
- [ ] cognitive review 写入 `.nexusky/reviews/` 后通知出现一次。
- [ ] `focusMode === true` 不显示任何 toast。
- [ ] 5 种 trigger 各有至少 1 个单元测试 + 1 个集成测试。

**方向 B 验收**：

- [ ] 命令面板有 20+ tool-surface 命令。
- [ ] 5000 笔记 vault 中单工具直调 P95 < 1.5 秒。
- [ ] 编辑器右键菜单显示 5-8 个上下文工具。
- [ ] 维护队列面板能 Apply 5 种非破坏操作。
- [ ] 批量 mark_done 走 ConfirmModal。

**方向 C 验收**：

- [ ] AI 能为常见 goal 输出 plan（覆盖 ≥ 5 个测试 goal）。
- [ ] dryRun ON 时写操作不落盘。
- [ ] file_write 步骤显示 diff preview。
- [ ] pause / cancel / retry / skip / rollback 五种操作可用。
- [ ] 失败步骤不影响后续无依赖步骤（按 dependsOn 决定）。

**方向 D 验收**：

- [ ] Settings → Long-Context tab 可打开。
- [ ] Inspector 显示当前 pack 三段 + dropped 项。
- [ ] 调 confidenceThreshold 后下次 discover 应用。
- [ ] Citation lookup 在 chat 引用旁可用。
- [ ] Metrics dashboard 与 `get-metrics` 数据一致。

### 7.2 测试策略

- 主进程：每个 service 至少 1 个单元测试 + 1 个 IPC 集成测试，参考 `tests/long-context-*`。
- 前端：组件 store 行为测试（仿 `tests/vault-store.test.ts`、`tests/ui-store.test.ts`）。
- 跨方向集成：A·trigger → 写 DB → IPC list → 前端 toast 走端到端测试。
- 性能基准：B Iteration 4 要跑 5000 笔记 vault 的 tool 调用 P95。

合入前必须跑：

```bash
npm run typecheck
npm test
```

仅改主进程服务时：

```bash
npm test -- proactive
npm test -- tool-surface
npm test -- agent
npm test -- long-context
```

### 7.3 跨平台兼容性要求

- 所有路径处理用 `path.join` / `path.relative`，不允许字符串拼 `/`。
- 文件系统操作必须在 macOS / Windows 都验证。
- 静音时段使用 system local time，不依赖 timezone string。
- 通知 UI 不用 `padding-inline` 等 logical properties。
- 批处理操作（B 维护队列、C agent）单步耗时不依赖文件大小排序（避免 macOS / Windows 排序差异）。

---

## 8. 指标

### 8.1 方向 A 指标

```text
proactive_evaluated_count        触发评估总数
proactive_shown_count            实际展示总数
proactive_opened_count           用户 Open 点击数
proactive_snoozed_count          Snooze 次数
proactive_dismissed_count        Dismiss 次数
proactive_not_interested_count   Not interested 次数
proactive_useful_rate            opened / shown
proactive_dismissal_rate         dismissed / shown
proactive_per_day_avg            每日平均展示数
```

数据来源：`context_events` 已能扩展（参考已有 `suggestion_shown` / `suggestion_opened`）。新增 `proactive_shown` / `proactive_opened` / `proactive_dismissed` 等 event_type。

KPI：
- `proactive_useful_rate >= 25%`
- `proactive_dismissal_rate <= 50%`
- `proactive_per_day_avg <= 4`

### 8.2 方向 B 指标

```text
tool_invocation_count           按 toolName 分桶
tool_invocation_p95_ms          按 toolName 分桶
maintenance_queue_opened_count
maintenance_fix_applied_count    按 action 分桶
maintenance_skip_count
```

数据来源：在 `ai:run-tool` handler 写入 `context_events`（新 event_type `tool_invoked`），`maintenance:apply-fix` 写 `maintenance_applied`。

KPI：
- 每个白名单工具至少被调用过 1 次（前 4 周新用户）。
- `maintenance_fix_applied_count > 0` 占活跃用户 40%。

### 8.3 方向 C 指标

```text
agent_plan_created_count
agent_plan_executed_count
agent_run_completed_count
agent_run_cancelled_count
agent_run_rollback_count
agent_step_failed_count
agent_avg_steps_per_run
```

数据来源：`agent_runs` 表 status 聚合。

KPI：
- `agent_run_completed_count / agent_plan_created_count >= 60%`
- `agent_run_rollback_count / agent_run_completed_count <= 5%`

### 8.4 方向 D 指标

```text
observability_panel_opened_count
prefs_changed_count              按 prefs key 分桶
citation_lookup_clicked_count
prefs_reset_count
```

KPI：
- 至少 30% 活跃用户打开过 Long-Context tab。
- `prefs_reset_count / prefs_changed_count <= 30%`（用户调参后不大量回滚）。

### 8.5 核心成功指标（KPI）

| KPI | 现状 | 目标 |
| --- | --- | --- |
| Long-Context `useful_rate` | 现有 | 提升 + 5pp |
| Proactive `useful_rate` | 新指标 | >= 25% |
| Agent run `completion_rate` | 新指标 | >= 60% |
| Tool surface daily DAU per active user | 新指标 | >= 1 次/天 |
| 整体留存（D7） | 现有 | + 5pp |

---

## 9. 风险全景

| 风险类别 | 来源方向 | 描述 | 缓解 |
| --- | --- | --- | --- |
| 用户疲劳 | A | proactive 太吵 | policy 硬上限 + 静音时段 + per-kind 开关 |
| 数据写错 | C | agent file_write 写错笔记 | dryRun 默认 + diff preview + rollback |
| 性能退化 | B, D | 5000 笔记 vault 工具慢 | DB index + IPC limit + 子结果分页 |
| Schema 升级失败 | A, C | v10 / v11 迁移异常 | `repairExistingSchema` 兜底 + 幂等测试 |
| 跨 vault 数据泄露 | C | agent_runs 跨 vault | 每 IPC 校验 vaultPath |
| AI 幻觉 plan | C | plan 引用不存在工具 | 白名单 + 写前置读检查 |
| Token 预算溢出 | D | tokenBudget 设太低 chat 空 | 设 200 最小值，UI 警示 |
| 隔离破坏 | A, C | agent 与 proactive 互相干扰 | 各自独立 service 目录，不共享 mutable state |
| 跨平台样式 | A, B, C, D | macOS / Windows 差异 | CSS 严禁 logical property，DPI 用 vw/vh |
| 国际化遗漏 | 全部 | locale 缺 key | typecheck 包含 i18n 完整性检查（用 script） |

---

## 10. 第一周（Day 1-7）具体任务清单

仅覆盖 A 和 B 的 Iteration 0-1，作为并行启动期。

```text
Day 1（A）
- 设计 Schema v10 migration（proactive_suggestions 表 + 3 索引）
- 编写 migration 测试 tests/proactive-schema.test.ts
- 编写 store 测试 tests/proactive-store.test.ts

Day 1（B 并行）
- 起草 TOOL_SURFACE_REGISTRY 草稿（25 项白名单）
- 在 ai.ipc.ts 注册 ai:list-tool-surface
- 写 tests/tool-surface-registry.test.ts

Day 2（A）
- 实现 proactive-store.ts（upsert / list / updateStatus / pruneExpired）
- 合并 schema + store PR

Day 2（B）
- 实现 ai:run-tool handler（复用 executeToolCall）
- 写 tests/tool-surface-ipc-types.test.ts
- 合并 registry + IPC PR

Day 3（A）
- 实现 proactive-triggers.ts（5 种 trigger 的 evaluate 函数）
- 写 tests/proactive-triggers.test.ts

Day 3（B）
- 改 CommandPalette.tsx 注入 25 个工具命令
- 新建 ToolResultPanel.tsx
- 写 tests/tool-surface-command-palette.test.ts

Day 4（A）
- 实现 proactive-policy.ts（频率上限、snooze、静音、signature 去重）
- 写 tests/proactive-policy.test.ts

Day 4（B）
- 完成 ToolResultPanel.tsx Markdown 渲染（marked + DOMPurify）
- 接入 App.tsx 顶层
- 端到端测试：命令面板搜 orphan → 1 秒内显示结果

Day 5（A）
- 实现 proactive-orchestrator.ts，串联 trigger → policy → store
- 写 tests/proactive-orchestrator.test.ts
- 合并 triggers + policy + orchestrator PR

Day 5（B）
- 合并 Command Palette + ToolResultPanel PR
- 跨平台手测（macOS / Windows）

Day 6（A）
- 挂接 background.ts → runProactiveCycle
- 挂接 theme-extractor.ts → runProactiveCycle
- 挂接 db:index-file → runProactiveCycle
- 注册 IPC proactive:list / respond / get-prefs / set-prefs

Day 6（B）
- 起步编辑器右键菜单：改 Editor.tsx
- 写 tests/tool-surface-editor-context-menu.test.ts

Day 7（A）
- 写 tests/proactive-background-integration.test.ts
- 写 tests/proactive-ipc-types.test.ts
- 合并 background 接入 + IPC PR

Day 7（B）
- 完成编辑器右键菜单
- 合并 right-click 菜单 PR
- 准备 Day 8 启动 maintenance queue panel
```

第一周结束态：

```text
A: 可以从主进程触发任意 trigger，DB 内能看到 pending suggestion，
   但前端 NotificationCenter / Toast 尚未上线（留 Iteration 3）。

B: 命令面板有 20+ 工具直调，右键有 5-8 个上下文工具，
   都能 1.5 秒内返回结果，不走 chat loop。
```

---

## 11. 终态用户体验描述

完成 ABCD 后的用户一天：

```text
9:00 早上打开 Nexusky
  - TitleBar 旁的铃铛上有 "2" 徽标
  - 点开抽屉：
    · "Cognitive review for last week is ready" (来自 A · cognitive_review_ready)
    · "5 overdue tasks in your Project X notes" (来自 A · overdue_task_burst)
  - 点第一条 → 打开 .nexusky/reviews/2026-05-22.md
  - 第二条 Snooze 1 天

9:15 写一篇关于 Agent 设计的新笔记
  - 写到 400 字时编辑器右下角微微闪现一条 toast：
    "💡 你 11 月写的《MCP 试验记录》与本笔记 supports_goal 关系（score 0.82）"
    点 "Why?" 看到原因和证据
    点 "Add wikilink" 自动插入 [[MCP 试验记录]]
  - toast 自动 4 秒消失，不打扰写作

10:30 想做点知识维护
  - Ctrl+Shift+P 打开命令面板
  - 输入 "orphan" → 第一项 "List orphan notes (Direct, ~1s)"
  - 回车 → 1.2 秒后 ToolResultPanel 弹出 12 个 orphan
  - 点其中一个 → 跳到该笔记
  - 关闭面板，决定批量处理 → 打开右侧 Maintenance Queue 面板
  - 筛选 "connect_orphan" 类，12 条
  - 一条条 Open，加 wikilink，Apply Fix
  - 完成度 0% → 50%

13:00 一个大任务：为缺失 memory 的 53 篇笔记批量生成
  - 右侧切到 Agent Run 面板
  - 输入 goal: "为缺失 memory 的笔记批量生成"
  - 5 秒后看到 plan（4 步）：
    1. list_notes_missing_memory（read）
    2. plan_knowledge_maintenance type=refresh_memory（read）
    3. 调 ai:generate-memories（write, 53 篇）
    4. 验证 get_memory_overview
  - 删掉步骤 2（不需要），点 Execute
  - dryRun 默认 ON → 看到 step 3 的 dry-run 输出：13 个文件夹分批
  - 切到 real → 重新 Execute
  - 进度 0/53 → 53/53，中间暂停一次查看 step 3 第 12 篇的 memory 内容
  - 完成后 Reflector 输出 "Goal achieved. 53/53 memories generated."

20:00 复盘 AI 行为
  - 用 chat 问 "总结一下我这周关于 Agent 的思考"
  - AI 回答里引用了 5 个笔记
  - 点击其中一个引用旁的 "?" 按钮
  - 弹出 popover："这条来自 Hot Memory，relation=evolved_from，confidence=0.79，
    被 ranker 排在 0.71"
  - 点 "Open Long-Context Tab" → 进入 Settings → Long-Context
  - 看到当前 pack 的 Hot/Warm/Cold 三段、token 占用、被裁项
  - 注意到 useful_rate 是 28%（健康）
  - 把 hotRatio 从 0.5 调到 0.55，存
  - 下次 chat 应用新配比

22:30 静音时段开始
  - 通知不再 emit toast，但铃铛仍累计未读
```

这一天里：
- A 让 AI 在 3 个时机主动开口（早上 / 写作 / 任务）。
- B 让用户在 5 个时刻不走 LLM 直接调工具（命令面板 / 维护队列）。
- C 让用户委托一个 53 项的多步任务，全程可中断可审计。
- D 让用户在 chat 末尾的"Why?"按钮上理解 AI 推理来源，并按需调参。

这就是 Nexusky 的认知伙伴形态。

---

## 12. 与现有文档的关系

- `docs/LONG_TERM_CONTEXT_SYSTEM_PLAN.md` — 直接前置依赖。本文复用其 schema、IPC 命名、后台主路径模式。
- `docs/PROJECT_OVERVIEW.md` — 8/9/10 节描述的 IPC / AI / 前端模块图是本文落点的基础。
- `docs/FEATURES.md` — 完成各方向后需要在此追加用户特性条目。
- `docs/GUIDE.md` — 完成 A / B 后追加"主动提醒"和"快捷工具"使用章节。
- `docs/OPTIMIZATION_PLAN.md` — 与本文并行，本文聚焦升级，OPTIMIZATION_PLAN 聚焦稳定性 / 性能。

---

## 13. 完成态的判断标准

四个方向全部完成后，下面这些断言必须能成立：

```text
1. 用户编辑 5 分钟内最多看到 1 条 proactive 提示（A）
2. 关掉 proactive 总开关后，无论触发什么都不出现提示（A）
3. 命令面板搜任意已注册 tool 名能 1.5 秒内返回结果（B）
4. 维护队列 Apply Fix 后，文件系统变化能被 indexer 实时捕获（B）
5. Agent plan 生成不超过 12 步，全部写步骤前必须有读步骤（C）
6. Agent dryRun 默认开启，real 模式必须用户显式切换（C）
7. 任意 chat 引用旁的 "?" 按钮 1 秒内返回来源 relation 或 theme（D）
8. Long-Context tab 显示的 useful_rate 与 long-context:get-metrics 输出一致（D）
9. macOS 与 Windows 上同一 vault 的所有上述能力行为一致（跨平台）
10. 任意一方向的能力关闭，其余三个方向仍可用（隔离）
```

第 10 条是关键架构判据：四方向是合力但不是耦合，A 关掉 B 不受影响，C 关掉 D 仍正常。