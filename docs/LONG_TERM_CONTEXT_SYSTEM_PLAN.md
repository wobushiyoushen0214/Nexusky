# Nexusky 长期上下文系统执行计划

> 目标：把 Nexusky 从“AI 笔记软件”推进为“AI-native 长期上下文系统”。本文不是概念稿，而是可直接拆任务、写代码、验收和迭代的工程执行文档。

适用版本：`v0.4.0` 之后  
当前基础：Electron + React + SQLite + Markdown vault + AI/RAG/embedding/graph/kanban  
核心亮点：AI 自动发现长期认知关系，并在正确时刻把被遗忘但重要的上下文带回来。

---

## 1. 最小可感知产品

第一版不要做完整“个人认知操作系统”。第一版只交付一个用户能立刻感知的闭环：

```text
用户正在写当前笔记 / 任务
  -> Nexusky 自动发现历史相关上下文
  -> 展示 Top 3
  -> 解释为什么相关
  -> 用户可以打开、确认、否定
  -> 反馈进入后续排序
```

示例体验：

```text
你 3 个月前的《MCP 工具调用实验记录》与当前“AI 自动化工作流”高度相关。

关系类型：supports_goal
置信度：86%
原因：两者都围绕“让 AI 调用外部工具完成自动化任务”。
证据：
- 当前内容提到：AI 自动化工作流
- 历史笔记提到：MCP 工具调用、外部工具、Agent 编排
```

这个 MVP 的判断标准：

```text
用户写下当前想法时，
Nexusky 能不能主动找回一个用户自己已经忘了、
但确实重要的历史上下文。
```

---

## 2. 非目标

这些事情第一阶段不要做：

- 不做通用 Agent 平台。
- 不做复杂图谱 UI 作为主入口。
- 不做“记住所有东西”的全量记忆系统。
- 不做只返回相似搜索结果的高级搜索。
- 不做无证据的用户画像推断。

第一阶段只做：

```text
动态关系发现 + 关系解释 + 用户反馈 + 可追溯证据
```

---

## 3. 当前代码落点

现有能力可以直接复用：

| 能力 | 当前位置 | 用法 |
| --- | --- | --- |
| SQLite schema / migration | `packages/main/src/services/database.ts` | 增加长期上下文表和索引 |
| 笔记索引 | `packages/main/src/services/indexer.ts` | 获取 notes、links、tags、tasks、properties |
| embedding / 语义搜索 | `packages/main/src/services/embedding.ts` | 候选召回 |
| 全文搜索 | `packages/main/src/services/note-search.ts` | 关键词召回 |
| AI Provider | `packages/main/src/services/ai/index.ts` | 关系分类、主题抽取 |
| AI JSON 工具 | `packages/main/src/services/ai/json.ts` | 解析结构化输出 |
| 关系机会发现 | `packages/main/src/services/ai/connection-opportunities.ts` | 复用候选特征思路 |
| 知识维护队列 | `packages/main/src/services/ai/maintenance-queue.ts` | 后续接入周期性整理 |
| IPC 类型 | `packages/shared/src/types/ipc.ts` | 增加 long-context IPC 类型 |
| DB IPC | `packages/main/src/ipc/db.ipc.ts` | 注册查询、反馈、刷新接口 |
| AI IPC | `packages/main/src/ipc/ai.ipc.ts` | 注册 AI 关系分析任务 |
| 编辑器 | `packages/renderer/src/components/editor/Editor.tsx` | 展示当前笔记相关上下文 |
| AI 面板 | `packages/renderer/src/components/ai/ChatPanel.tsx` | 使用长期上下文作为 chat context |
| 图谱 | `packages/renderer/src/components/graph/GraphView.tsx` | 后续展示 inferred relation |
| 测试 | `tests/` | 增加 long-context 单元测试 |

新增目录建议：

```text
packages/main/src/services/long-context/
  context-events.ts
  relation-candidates.ts
  relation-classifier.ts
  relation-ranker.ts
  relation-store.ts
  theme-extractor.ts
  context-pack-builder.ts
  cognitive-review.ts
```

---

## 4. 数据模型

### 4.1 schema 版本

当前 `SCHEMA_VERSION = 8`。实现时升级到：

```ts
const SCHEMA_VERSION = 9
```

在 `database.ts` 的 `migrations` 中新增 Migration 9。

### 4.2 `context_events`

记录内容和行为事件。它是长期上下文系统的输入层。

```sql
CREATE TABLE IF NOT EXISTS context_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_title TEXT,
  entity_path TEXT,
  content_snapshot TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_context_events_entity
  ON context_events(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_events_type
  ON context_events(event_type, created_at DESC);
```

第一版事件类型：

```text
note_created
note_updated
note_opened
task_created
task_updated
ai_question_asked
relation_feedback_submitted
```

第一版不需要记录每一次光标移动或普通点击，避免噪声。

### 4.3 `ai_relations`

存储 AI 或规则发现的长期关系。

```sql
CREATE TABLE IF NOT EXISTS ai_relations (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_title TEXT,
  source_path TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_title TEXT,
  target_path TEXT,
  relation_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  strength REAL NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_relations_pair_type
  ON ai_relations(source_type, source_id, target_type, target_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_ai_relations_source
  ON ai_relations(source_type, source_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_ai_relations_target
  ON ai_relations(target_type, target_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_ai_relations_type
  ON ai_relations(relation_type, score DESC);
```

支持的 `relation_type`：

```text
related_to
caused_by
evolved_from
blocked_by
inspired_by
repeated_pattern
supports_goal
conflicts_with
```

支持的 `status`：

```text
active
dismissed
archived
wrong
```

### 4.4 `long_term_themes`

存储长期主题。

```sql
CREATE TABLE IF NOT EXISTS long_term_themes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  strength REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_long_term_themes_strength
  ON long_term_themes(strength DESC, last_seen_at DESC);
```

### 4.5 `theme_memberships`

记录笔记、任务、关系归属于哪些长期主题。

```sql
CREATE TABLE IF NOT EXISTS theme_memberships (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_title TEXT,
  entity_path TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (theme_id) REFERENCES long_term_themes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_memberships_unique
  ON theme_memberships(theme_id, entity_type, entity_id);
```

### 4.6 `relation_feedback`

记录用户反馈，用于排序和去噪。

```sql
CREATE TABLE IF NOT EXISTS relation_feedback (
  id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (relation_id) REFERENCES ai_relations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relation_feedback_relation
  ON relation_feedback(relation_id, created_at DESC);
```

支持的 `feedback_type`：

```text
useful
not_related
wrong_reason
dismissed
```

---

## 5. 服务层设计

### 5.1 `context-events.ts`

职责：

- 记录长期上下文输入事件。
- 对同一实体做简单去重。
- 限制 `content_snapshot` 长度，避免数据库膨胀。

建议接口：

```ts
export interface ContextEventInput {
  vaultPath: string
  eventType: ContextEventType
  entityType: 'note' | 'task' | 'chat'
  entityId: string
  entityTitle?: string
  entityPath?: string
  contentSnapshot?: string
  metadata?: Record<string, unknown>
}

export function recordContextEvent(input: ContextEventInput): void
```

第一版接入点：

- `db:index-file` 成功后记录 `note_updated`
- `kanban:create-task` 后记录 `task_created`
- `kanban:update-task` 后记录 `task_updated`
- `db:chat-history-append` 记录用户消息 `ai_question_asked`

### 5.2 `relation-candidates.ts`

职责：

- 针对当前实体召回候选上下文。
- 只做本地快速召回，不调用 AI。

候选来源：

| 来源 | 方法 | 权重建议 |
| --- | --- | --- |
| 显式链接 | `links` / backlinks | 1.0 |
| 标签重合 | `tags` / `note_tags` | 0.75 |
| 属性重合 | `note_properties` | 0.65 |
| 标题关键词 | notes title / FTS | 0.55 |
| 任务文本 | `tasks` / `kanban_tasks` | 0.6 |
| embedding | `chunks.embedding` / `semanticSearch` | 0.8 |
| 文件夹 | same folder | 0.35 |
| 近期编辑 | updated_at window | 0.25 |

建议接口：

```ts
export interface RelationCandidate {
  sourceType: EntityType
  sourceId: string
  sourceTitle?: string
  sourcePath?: string
  targetType: EntityType
  targetId: string
  targetTitle?: string
  targetPath?: string
  localScore: number
  signals: string[]
  snippets: string[]
}

export function findRelationCandidates(params: {
  vaultPath: string
  entityType: EntityType
  entityId: string
  content?: string
  limit?: number
}): RelationCandidate[]
```

第一版目标：

```text
本地召回 20 条候选，耗时 < 300ms。
```

### 5.3 `relation-classifier.ts`

职责：

- 调用 AI 判断候选是否是真的长期认知关系。
- 输出结构化 JSON。
- 无证据则不入库。

输入：

```ts
export interface RelationClassificationInput {
  current: {
    title: string
    content: string
  }
  candidate: {
    title: string
    content: string
  }
  signals: string[]
}
```

输出：

```ts
export interface RelationClassification {
  relationType: RelationType
  confidence: number
  reason: string
  evidence: string[]
}
```

AI Prompt 规则：

```text
You are classifying long-term cognitive relationships between two user knowledge items.

Allowed relation types:
- related_to
- caused_by
- evolved_from
- blocked_by
- inspired_by
- repeated_pattern
- supports_goal
- conflicts_with

Return strict JSON:
{
  "relationType": "...",
  "confidence": 0.0,
  "reason": "...",
  "evidence": ["...", "..."]
}

Rules:
- If there is no concrete evidence, set confidence below 0.4.
- Evidence must be grounded in the given content.
- Do not infer personal facts unless they are explicit.
- Prefer repeated_pattern only when both items show a recurring behavior, problem, or theme.
```

入库门槛：

```text
confidence >= 0.65
evidence.length >= 2
reason.length >= 12
```

### 5.4 `relation-ranker.ts`

职责：

- 把本地召回、AI 判断、时间权重、用户反馈合成一个展示分数。

第一版评分公式：

```text
score =
  localScore        * 0.30
+ aiConfidence     * 0.30
+ recurrenceScore  * 0.15
+ freshnessScore   * 0.10
+ feedbackScore    * 0.10
+ evidenceScore    * 0.05
```

分数定义：

```text
localScore       本地召回信号强度
aiConfidence    AI 判断置信度
recurrenceScore 相同主题/关系重复出现次数
freshnessScore  最近出现程度
feedbackScore   用户反馈
evidenceScore   证据数量和质量
```

时间衰减：

```ts
function decay(days: number): number {
  return Math.exp(-days / 90)
}
```

重复强化：

```ts
function recurrence(count: number): number {
  return Math.min(1, Math.log1p(count) / Math.log1p(8))
}
```

反馈分：

```text
useful       +0.25
dismissed    -0.15
not_related  -0.5
wrong_reason -0.25
```

### 5.5 `relation-store.ts`

职责：

- upsert `ai_relations`
- 查询某实体的 Top N 关系
- 写入用户反馈
- 更新 `strength`、`last_seen_at`、`status`

建议接口：

```ts
export function upsertRelation(vaultPath: string, relation: UpsertRelationInput): void

export function getContextSuggestions(params: {
  vaultPath: string
  entityType: EntityType
  entityId: string
  limit?: number
}): ContextSuggestion[]

export function submitRelationFeedback(params: {
  vaultPath: string
  relationId: string
  feedbackType: RelationFeedbackType
  note?: string
}): void
```

### 5.6 `theme-extractor.ts`

职责：

- 从高分关系中抽取长期主题。
- 避免把短期热点误判为长期主题。

第一版触发条件：

```text
同一候选主题覆盖 >= 3 个实体
时间跨度 >= 7 天
平均关系分 >= 0.65
```

主题来源：

- 关系理由中的关键词
- note title / tags / properties
- memory concepts
- task title / description
- AI chat 的高频问题

建议接口：

```ts
export function extractLongTermThemes(params: {
  vaultPath: string
  changedEntityIds?: string[]
  limit?: number
}): ThemeExtractionResult
```

### 5.7 `context-pack-builder.ts`

职责：

- 给 AI chat / Agent / 编辑器生成上下文包。
- 避免把长期记忆做成无差别全文塞入。

三层记忆：

```text
Hot Memory
最近 7 天活跃笔记、任务、对话。

Warm Memory
最近 30-90 天反复出现的主题和项目。

Cold Memory
长期目标、长期主题、稳定关系、反复问题。
```

建议输出：

```ts
export interface LongContextPack {
  hot: ContextPackItem[]
  warm: ContextPackItem[]
  cold: ContextPackItem[]
  relationSummary: string
  tokenEstimate: number
}
```

预算建议：

```text
Hot  50%
Warm 30%
Cold 20%
```

---

## 6. IPC 设计

在 `packages/shared/src/types/ipc.ts` 增加类型：

```ts
export type LongContextEntityType = 'note' | 'task' | 'chat'

export type LongContextRelationType =
  | 'related_to'
  | 'caused_by'
  | 'evolved_from'
  | 'blocked_by'
  | 'inspired_by'
  | 'repeated_pattern'
  | 'supports_goal'
  | 'conflicts_with'

export interface LongContextSuggestion {
  relationId: string
  targetType: LongContextEntityType
  targetId: string
  targetTitle: string
  targetPath?: string
  relationType: LongContextRelationType
  confidence: number
  score: number
  reason: string
  evidence: string[]
  lastSeenAt: number
}

export interface LongTermTheme {
  id: string
  title: string
  summary: string
  keywords: string[]
  strength: number
  evidenceCount: number
  firstSeenAt: number
  lastSeenAt: number
}
```

新增 IPC：

```ts
'long-context:get-suggestions': {
  params: {
    vaultPath: string
    entityType: LongContextEntityType
    entityId: string
    content?: string
    limit?: number
    refresh?: boolean
  }
  result: LongContextSuggestion[]
}

'long-context:discover-relations': {
  params: {
    vaultPath: string
    entityType: LongContextEntityType
    entityId: string
    content?: string
    limit?: number
  }
  result: {
    discovered: number
    suggestions: LongContextSuggestion[]
  }
}

'long-context:submit-feedback': {
  params: {
    vaultPath: string
    relationId: string
    feedbackType: 'useful' | 'not_related' | 'wrong_reason' | 'dismissed'
    note?: string
  }
  result: void
}

'long-context:get-themes': {
  params: {
    vaultPath: string
    limit?: number
  }
  result: LongTermTheme[]
}

'long-context:run-theme-extraction': {
  params: {
    vaultPath: string
  }
  result: {
    created: number
    updated: number
  }
}
```

注册位置建议：

```text
packages/main/src/ipc/db.ipc.ts
```

原因：

- 这些接口主要读写本地数据库。
- AI 调用可以由 service 内部通过 `aiManager` 完成。
- 后续如果 AI 任务需要 streaming，再拆到 `ai.ipc.ts`。

---

## 7. 前端落点

### 7.1 当前笔记相关上下文面板

新增组件：

```text
packages/renderer/src/components/long-context/RelatedContextPanel.tsx
packages/renderer/src/components/long-context/RelatedContextCard.tsx
packages/renderer/src/components/long-context/LongContextBadge.tsx
packages/renderer/src/components/long-context/long-context.css
```

展示信息：

```text
标题
关系类型
置信度
原因
证据
时间
操作按钮
```

操作：

```text
打开
有用
不相关
原因不对
忽略
```

### 7.2 UI 原则

- 默认最多展示 3 条。
- 不要打断写作。
- 不要用大段 AI 总结占满界面。
- 每条建议必须可追溯到源笔记或任务。
- 低置信度不展示，只进入后台关系库。

### 7.3 建议位置

第一版优先放在编辑器右侧 AI 面板中，或者作为编辑器下方轻量折叠区。

不建议第一版放在全局图谱，因为图谱适合探索，不适合即时价值感知。

---

## 8. AI 输出规范

所有 AI 结构化任务必须满足：

- 输出 JSON。
- 不能输出 Markdown。
- 不能返回额外解释。
- 置信度必须是 `0-1` 数字。
- 证据必须来自输入文本。
- 没有证据时降低置信度。

关系分类 JSON：

```json
{
  "relationType": "supports_goal",
  "confidence": 0.86,
  "reason": "两段内容都围绕 AI 调用外部工具完成自动化任务。",
  "evidence": [
    "当前内容提到 AI 自动化工作流",
    "历史笔记提到 MCP 工具调用"
  ]
}
```

主题抽取 JSON：

```json
{
  "themes": [
    {
      "title": "AI 长期上下文系统",
      "summary": "用户持续关注让 AI 理解长期项目、目标和知识关系。",
      "keywords": ["Nexusky", "长期上下文", "知识图谱", "MCP", "Agent"],
      "evidenceEntityIds": ["note-1", "note-2", "task-1"],
      "confidence": 0.82
    }
  ]
}
```

---

## 9. 迭代路线

### Iteration 0：打地基

目标：

```text
长期上下文数据结构存在，测试能验证迁移。
```

任务：

- [x] `database.ts` 升级 `SCHEMA_VERSION` 到 9。
- [x] 新增 `context_events`。
- [x] 新增 `ai_relations`。
- [x] 新增 `long_term_themes`。
- [x] 新增 `theme_memberships`。
- [x] 新增 `relation_feedback`。
- [x] 更新 `repairExistingSchema`。
- [x] 增加数据库 migration 测试。

测试：

```text
tests/long-context-schema.test.ts
```

验收：

- [x] 新 vault 自动创建新表。
- [x] 旧 vault 从 schema 8 迁移到 9。
- [x] 重复运行 migration 不报错。
- [x] foreign key / index 存在。

执行记录：

- 2026-05-22：完成 `packages/main/src/services/database.ts` schema v9、long-context 表和索引、`repairExistingSchema` 修复逻辑；新增 `tests/long-context-schema.test.ts` 覆盖新 vault、schema 8 升级、重复打开幂等、外键和索引。验证通过：`npm test -- long-context-schema`、`npm test -- long-context`、`npm run typecheck`。

下一步：

- Iteration 1 已完成；下一步从 Iteration 2 的 AI 关系分类开始。

### Iteration 1：本地候选召回

目标：

```text
不调用 AI，也能为当前笔记找出 20 个候选上下文。
```

任务：

- [x] 新建 `relation-candidates.ts`。
- [x] 从 explicit links / backlinks 召回。
- [x] 从 tag / property 重合召回。
- [x] 从 FTS / title 关键词召回。
- [x] 从 semantic search 召回。
- [x] 输出 `signals` 和 `snippets`。

测试：

```text
tests/long-context-candidates.test.ts
```

验收：

- [x] 一个有 tag 重合的历史笔记能被召回。
- [x] 一个仅 embedding / semantic chunk 相似的笔记能被召回。
- [x] 已经显式链接的笔记分数高于普通关键词命中。
- [x] 候选结果稳定排序。

执行记录：

- 2026-05-22：新增 `packages/main/src/services/long-context/relation-candidates.ts`，实现 notes / tasks / chat 输入的本地候选召回。当前信号覆盖 `explicit_link`、`backlink`、`tag:*`、`property:*`、`fts_keyword:*`、`title_keyword:*`、`semantic_chunk`、`task_text`、`same_folder`、`recent_edit`，并输出 `signals` 和 `snippets`。`semantic_chunk` 使用本地 chunks/token similarity，不调用 AI provider，后续可替换或增强为真实 embedding BLOB 相似度。
- 2026-05-22：新增 `tests/long-context-candidates.test.ts` 覆盖显式链接高于普通关键词、tag/property 召回、chunk 语义召回、稳定排序。验证通过：`npm test -- long-context`、`npm run typecheck`。

下一步：

- Iteration 2 已完成；下一步从 Iteration 3 的关系入库和排序开始。

### Iteration 2：AI 关系分类

目标：

```text
AI 能把候选上下文转成可解释关系。
```

任务：

- [x] 新建 `relation-classifier.ts`。
- [x] 编写严格 JSON prompt。
- [x] 使用 `extractJsonFromText` 解析。
- [x] 增加输出校验和 fallback。
- [x] 低置信度不入库。

测试：

```text
tests/long-context-classifier.test.ts
```

验收：

- [x] AI 输出非 JSON 时能恢复或失败为低置信度。
- [x] 没有证据的关系不会入库。
- [x] `supports_goal`、`evolved_from`、`blocked_by` 至少有样例覆盖。

执行记录：

- 2026-05-22：新增 `packages/main/src/services/long-context/relation-classifier.ts`，实现严格 JSON prompt、AI provider 流式响应拼接、`extractJsonFromText` 解析、输出字段校验、无证据/无原因降为低置信度，以及 `shouldPersistRelationClassification` 入库门槛（`confidence >= 0.65`、证据不少于 2 条、原因长度不少于 12）。
- 2026-05-22：新增 `tests/long-context-classifier.test.ts` 覆盖 prompt 约束、带解释文本的 JSON 恢复、非 JSON fallback、无证据不入库、`supports_goal` / `evolved_from` / `blocked_by` 样例，以及 mock provider 流式输出解析。验证通过：`npm test -- long-context`、`npm run typecheck`。

下一步：

- 从 Iteration 3 开始实现 `relation-store.ts` 和 `relation-ranker.ts`，把候选 + 分类结果持久化为 Top 3 建议，并让 feedback 影响排序。

### Iteration 3：关系入库和排序

目标：

```text
当前实体能查询 Top 3 长期上下文建议。
```

任务：

- [x] 新建 `relation-store.ts`。
- [x] 新建 `relation-ranker.ts`。
- [x] 实现 upsert relation。
- [x] 实现 Top N 查询。
- [x] 实现 feedback 写入。
- [x] feedback 影响后续 score。

测试：

```text
tests/long-context-ranker.test.ts
tests/long-context-store.test.ts
```

验收：

- [x] 同一对实体不会重复插入多条同类型关系。
- [x] `useful` 反馈会提高排序。
- [x] `not_related` 会降低排序或隐藏。
- [x] 关系有 `first_seen_at` 和 `last_seen_at`。

执行记录：

- 2026-05-22：新增 `packages/main/src/services/long-context/relation-ranker.ts`，实现 `localScore`、AI confidence、recurrence、freshness、feedback、evidence 的合成分数，以及 `decay` / `recurrence` / `feedbackScore` helper。
- 2026-05-22：新增 `packages/main/src/services/long-context/relation-store.ts`，实现 `upsertRelation`、`getContextSuggestions`、`submitRelationFeedback`。同一 source/target/relation_type 走唯一索引 upsert；`useful` 提升 score，`wrong_reason` 降低 score，`dismissed` / `not_related` 隐藏关系；Top N 查询会在当前实体位于 source 或 target 时返回另一端作为建议。
- 2026-05-22：新增 `tests/long-context-ranker.test.ts` 和 `tests/long-context-store.test.ts`，覆盖 feedback 分数、decay/recurrence、重复 upsert、Top N、`useful` 排序提升、`not_related` 隐藏、缺失 relationId 错误。验证通过：`npm test -- long-context`、`npm run typecheck`。

下一步：

- 从 Iteration 4 开始补齐 IPC 类型和 `db.ipc.ts` handlers，让 renderer 能调用 suggestions / discover / feedback。

### Iteration 4：IPC 闭环

目标：

```text
renderer 可以调用长期上下文能力。
```

任务：

- [x] 在 `IPCChannelMap` 增加 long-context 类型。
- [x] 在 `db.ipc.ts` 注册 handler。
- [x] 接入 `get-suggestions`。
- [x] 接入 `discover-relations`。
- [x] 接入 `submit-feedback`。

测试：

```text
tests/long-context-ipc-types.test.ts
```

验收：

- [x] TypeScript 类型通过。
- [x] 缺少 vaultPath 时不执行危险写入。
- [x] relationId 不存在时返回明确错误。

执行记录：

- 2026-05-22：在 `packages/shared/src/types/ipc.ts` 增加 `LongContextEntityType`、`LongContextRelationType`、`LongContextFeedbackType`、`LongContextSuggestion`、`LongTermTheme`，并注册 `long-context:get-suggestions`、`long-context:discover-relations`、`long-context:submit-feedback` 三个 IPC channel 类型。
- 2026-05-22：在 `packages/main/src/ipc/db.ipc.ts` 注册 long-context handlers。`get-suggestions` 支持 `refresh` 时触发 discover；`discover-relations` 串联本地候选、AI 分类、持久化门槛和 relation store；`submit-feedback` 复用 store 写入反馈。handler 入口使用 runtime guard 校验 `vaultPath`、`entityType`、`entityId`、`relationId`、`feedbackType` 和可选文本长度。
- 2026-05-22：新增 `tests/long-context-ipc-types.test.ts` 覆盖 IPC 类型映射；`tests/long-context-store.test.ts` 已覆盖缺失 relationId 的明确错误。验证通过：`npm test -- long-context`、`npm run typecheck`。

下一步：

- Iteration 5 已完成；下一步从 Iteration 6 的长期主题抽取开始。

### Iteration 5：编辑器 UI

目标：

```text
用户在写笔记时能看到相关历史上下文。
```

任务：

- [x] 新建 `RelatedContextPanel`。
- [x] 加载当前笔记 suggestions。
- [x] 展示 Top 3。
- [x] 支持打开源笔记。
- [x] 支持 useful / not_related / wrong_reason / dismissed。
- [x] 加载中、空状态、错误状态。

验收：

- [x] 不阻塞编辑器输入。
- [x] 无建议时不显示大面积空面板。
- [x] 每条卡片都显示原因和证据。
- [x] 点击反馈后卡片状态立即更新。

执行记录：

- 2026-05-22：新增 `packages/renderer/src/components/long-context/RelatedContextPanel.tsx`、`RelatedContextCard.tsx`、`LongContextBadge.tsx`、`long-context.css`。面板通过当前文件路径解析 noteId，加载 `long-context:get-suggestions` Top 3；刷新按钮触发 `refresh` discover；空建议时只保留紧凑 header，不显示大面积空状态，加载和错误时显示轻量状态。
- 2026-05-22：在 `packages/renderer/src/components/editor/Editor.tsx` 的主编辑器滚动区底部接入 `RelatedContextPanel`。卡片展示标题、关系类型、置信度、原因、证据、分数；支持打开源笔记和 `useful` / `not_related` / `wrong_reason` / `dismissed` 反馈。`not_related` / `dismissed` 立即移除卡片，`useful` / `wrong_reason` 立即标记按钮状态。
- 2026-05-22：新增 `tests/long-context-ui.test.ts` 覆盖关系类型短标签。验证通过：`npm test -- long-context`、`npm run typecheck`、`npm run build`。未用 Browser 截图：当前目标是 Electron 界面，没有稳定 localhost 页面；用生产构建替代前端集成验证。

下一步：

- Iteration 6 已完成；下一步从 Iteration 7 的 decay / recurrence / 归档治理开始。

### Iteration 6：长期主题抽取

目标：

```text
系统能从重复关系中形成长期主题。
```

任务：

- [x] 新建 `theme-extractor.ts`。
- [x] 从高分关系聚合候选主题。
- [x] AI 生成主题标题、摘要、关键词。
- [x] 写入 `long_term_themes`。
- [x] 写入 `theme_memberships`。
- [x] 增加 `get-themes` IPC。

测试：

```text
tests/long-context-themes.test.ts
```

验收：

- [x] 少于 3 个证据实体不形成长期主题。
- [x] 时间跨度不足 7 天不形成长期主题。
- [x] 主题必须能追溯到实体和关系。

执行记录：

- 2026-05-22：新增 `packages/main/src/services/long-context/theme-extractor.ts`，从 `ai_relations` 中筛选 `score >= 0.65` 且 `status = active` 的高分关系，按标题、reason、evidence 抽取关键词聚合候选主题；只有覆盖不少于 3 个实体、时间跨度不少于 7 天、平均分不少于 0.65 的候选才写入主题。
- 2026-05-22：主题草稿优先调用 AI provider 输出严格 JSON（title / summary / keywords / confidence），无 provider 或解析失败时使用本地 fallback；写入 `long_term_themes`，并为每个证据实体 upsert `theme_memberships`，保留实体标题、路径、confidence 和 evidence。
- 2026-05-22：在 `packages/shared/src/types/ipc.ts` 和 `packages/main/src/ipc/db.ipc.ts` 增加 `long-context:get-themes`、`long-context:run-theme-extraction`；更新 `tests/long-context-ipc-types.test.ts`。新增 `tests/long-context-themes.test.ts` 覆盖 3 实体 + 7 天形成主题、少于 3 实体不形成主题、时间跨度不足不形成主题。验证通过：`npm test -- long-context`、`npm run typecheck`。
- 2026-05-22：最终验收前补齐 `getLongTermThemes` 的 `memberships` 返回值，主题列表可直接看到关联实体的类型、id、标题、路径、confidence 和 evidence。验证通过：`npm test -- long-context-themes long-context-ipc-types`、`npm run typecheck`。

下一步：

- 从 Iteration 7 开始把已有 ranker 的 `decay` / `recurrence` 规则落到刷新任务和归档策略上，确保被否定或长期未出现的关系不会反复占位。

### Iteration 7：时间权重和上下文腐烂治理

目标：

```text
旧关系会衰减，重复出现的关系会增强。
```

任务：

- [x] 实现 decay score。
- [x] 实现 recurrence score。
- [x] 增加 relation refresh job。
- [x] 增加 dismissed / wrong 关系降权。
- [x] 增加长期未出现关系归档策略。

测试：

```text
tests/long-context-decay.test.ts
```

验收：

- [x] 90 天未出现的普通关系分数明显降低。
- [x] 重复 3 次出现的关系分数提高。
- [x] 用户否定的关系不会反复出现。

执行记录：

- 2026-05-22：在 `relation-store.ts` 增加 `refreshRelationScores`，按 relation `last_seen_at` 重新计算 decay，按 `strength` 重新计算 recurrence；`getContextSuggestions` 会先刷新当前实体相关关系，避免旧 score 长期占位。
- 2026-05-22：`dismissed` / `wrong` 关系在 upsert 和 refresh 时保留状态并额外降权；`not_related` 后再次 rediscover 也不会重新出现在建议列表。
- 2026-05-22：增加长期未出现关系归档策略：默认 180 天未出现且 refresh 后低于阈值的 active 关系转为 `archived`。新增 `long-context:refresh-relations` IPC，支持全 vault 或指定实体刷新。
- 2026-05-22：新增 `tests/long-context-decay.test.ts` 覆盖 90 天衰减、3 次 recurrence 增强、stale weak relation 归档、用户否定后不反复出现；更新 IPC 类型测试。验证通过：`npm test -- long-context`、`npm run typecheck`。

下一步：

- 从 Iteration 8 开始实现 AI Chat 长期上下文包，把 Hot / Warm / Cold memory 注入可选 chat context，并确保 prompt 明确“长期上下文是辅助，不可虚构用户事实”。

### Iteration 8：AI Chat 长期上下文包

目标：

```text
AI 对话开始使用长期上下文，而不是只做当前检索。
```

任务：

- [x] 新建 `context-pack-builder.ts`。
- [x] 构造 Hot / Warm / Cold Memory。
- [x] 在 `ai:chat` 或 `ai:chat-agent` 中接入可选上下文包。
- [x] 系统 prompt 中加入“长期上下文是辅助，不可虚构用户事实”。

测试：

```text
tests/long-context-pack.test.ts
tests/ai-system-context.test.ts
```

验收：

- [x] context pack 有 token 预算。
- [x] 长期上下文有来源和证据。
- [x] AI 不把低置信度关系当作事实。

执行记录：

- 2026-05-22：新增 `context-pack-builder.ts`，基于当前笔记构造 Hot Memory（当前实体 Top 关系）、Warm Memory（长期主题）、Cold Memory（较旧但仍 active 的关系），按 token budget 贪心裁剪，并输出来源与证据。
- 2026-05-22：`ai:chat` 与 `ai:chat-agent` 均接入长期上下文包；普通 chat 新增 `currentFilePath` 参数，renderer 会把当前打开笔记传入主进程，使长期上下文和当前笔记关联。
- 2026-05-22：系统 prompt 注入 `<long_term_context>`，明确“长期上下文是辅助，不可虚构用户事实”，低置信度关系只能作为假设。长期上下文 sources 会与语义检索 / agent tool sources 合并去重。
- 2026-05-22：新增 `tests/long-context-pack.test.ts`、`tests/ai-system-context.test.ts`；更新 IPC 类型测试。验证通过：`npm test -- long-context-pack ai-system-context long-context-ipc-types`、`npm test -- long-context`、`npm run typecheck`。

下一步：

- 从 Iteration 9 开始实现周期性认知整理，聚合新增关系、主题变化、重复问题 / 阻塞项，并生成可落盘的认知观察 Markdown。

### Iteration 9：周期性认知整理

目标：

```text
Nexusky 能每周生成“认知观察”，而不是普通总结。
```

任务：

- [x] 新建 `cognitive-review.ts`。
- [x] 聚合最近新增关系。
- [x] 聚合长期主题变化。
- [x] 聚合重复问题和阻塞项。
- [x] 生成周报 Markdown。
- [x] 可选写入 `.nexusky/reviews/` 或用户指定笔记。

验收：

- [x] 周报包含新增关系。
- [x] 周报包含长期主题变化。
- [x] 周报包含被遗忘但重新相关的上下文。
- [x] 周报不把短期摘要伪装成长期洞察。

执行记录：

- 2026-05-22：新增 `cognitive-review.ts`，生成 evidence-backed cognitive review，而不是普通活动摘要；默认窗口为最近 7 天，支持自定义 `since` / `until`。
- 2026-05-22：聚合 `ai_relations` 的新增关系、长期未见后重新出现的关系，聚合 `long_term_themes` 的主题变化，并从 `context_events` / `conversations` 提取重复 AI 问题。
- 2026-05-22：从 inline tasks 和 kanban tasks 提取 blocked / waiting / stuck 信号，生成 Markdown 的 `New Relationships`、`Theme Changes`、`Repeated Questions and Blockers`、`Forgotten Context Resurfaced`、`Observation Boundary` 分区。
- 2026-05-22：新增 `long-context:generate-cognitive-review` IPC，支持返回 Markdown 或写入 `.nexusky/reviews/YYYY-MM-DD-cognitive-review.md` / 用户指定 vault 内路径。新增 `tests/long-context-cognitive-review.test.ts` 并更新 IPC 类型测试。验证通过：`npm test -- long-context-cognitive-review long-context-ipc-types`、`npm test -- long-context`、`npm run typecheck`。

下一步：

- 进入最终验收：按 MVP、长期主题、长期上下文验收标准逐项核对已实现闭环，补齐必要的测试 / 文档缺口后再标记目标完成。

---

## 10. 执行顺序

推荐先做 4 个 PR 或 4 个开发批次：

### PR 1：数据层和本地召回

包含：

- schema v9
- `context_events`
- `ai_relations`
- `relation-candidates.ts`
- schema / candidates 测试

不包含：

- 前端 UI
- AI 分类
- 主题系统

### PR 2：AI 分类和关系排序

包含：

- `relation-classifier.ts`
- `relation-ranker.ts`
- `relation-store.ts`
- relation feedback
- classifier / ranker / store 测试

### PR 3：IPC 和前端相关上下文面板

包含：

- IPC 类型
- IPC handlers
- `RelatedContextPanel`
- feedback UI
- 当前笔记 suggestions

### PR 4：长期主题和时间权重

包含：

- `theme-extractor.ts`
- `long_term_themes`
- `theme_memberships`
- decay / recurrence
- themes UI 或 AI 面板入口

---

## 11. 质量门禁

每个 PR 完成前必须跑：

```bash
npm run typecheck
npm test
```

若只改主进程服务，至少跑相关测试：

```bash
npm test -- long-context
```

如果新增前端 UI，需要手测：

```text
1. 打开一个 vault
2. 打开一篇已有笔记
3. 编辑当前内容
4. 触发关系发现
5. 查看 Top 3 建议
6. 打开建议来源笔记
7. 点 useful
8. 点 not_related
9. 重新打开当前笔记，确认反馈影响排序
```

---

## 12. 产品验收标准

### MVP 验收

- [x] 当前笔记可以获得 Top 3 历史上下文建议。
- [x] 每条建议都有关系类型。
- [x] 每条建议都有原因。
- [x] 每条建议都有证据。
- [x] 每条建议可以打开源内容。
- [x] 用户可以反馈有用或不相关。
- [x] 反馈会影响后续排序。

### 长期主题验收

- [x] 系统能生成长期主题。
- [x] 主题必须有至少 3 个证据实体。
- [x] 主题必须有时间跨度。
- [x] 用户可以看到主题关联了哪些笔记、任务或关系。

### 长期上下文验收

- [x] AI chat 能读取 Hot / Warm / Cold context。
- [x] 长期上下文不会无来源注入。
- [x] 低置信度关系不会被当作事实。
- [x] 被用户否定的关系不会反复出现。

最终验收记录：

- 2026-05-22：MVP 闭环已覆盖 `long-context:get-suggestions` / `long-context:discover-relations` / `long-context:submit-feedback`、编辑器 Top 3 面板、来源打开、useful / not_related / wrong_reason / dismissed 反馈、排序刷新和持久化。
- 2026-05-22：长期主题闭环已覆盖主题抽取、3 实体 + 7 天门槛、membership 追溯、`long-context:get-themes` / `long-context:run-theme-extraction`。
- 2026-05-22：长期上下文闭环已覆盖 Hot / Warm / Cold context pack、来源与证据注入、低置信度 guard、否定关系隐藏和衰减归档治理、周期性 cognitive review。

---

## 13. 指标

第一阶段不要追求复杂指标，先记录这些：

```text
suggestion_shown_count
suggestion_opened_count
suggestion_useful_count
suggestion_dismissed_count
suggestion_not_related_count
relation_created_count
relation_reinforced_count
theme_created_count
```

核心指标：

```text
useful_rate = suggestion_useful_count / suggestion_shown_count
open_rate = suggestion_opened_count / suggestion_shown_count
not_related_rate = suggestion_not_related_count / suggestion_shown_count
```

第一阶段目标：

```text
useful_rate >= 20%
not_related_rate <= 40%
```

如果 `not_related_rate` 高于 40%，优先调低展示数量和置信度阈值，不要急着增加 AI prompt 复杂度。

---

## 14. 风险和处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 变成高级搜索 | 只返回相似笔记 | 必须显示关系类型、原因、证据 |
| AI 幻觉关系 | 没证据也建立连接 | 无证据不入库，低置信度不展示 |
| 推荐太吵 | 用户被打扰 | 默认 Top 3，低分隐藏，反馈降权 |
| 上下文腐烂 | 旧关系长期占位 | decay + recurrence + archive |
| 主题泛化 | 什么都归为“AI” | 主题必须有实体数、时间跨度和关键词差异 |
| 用户画像越界 | 推断用户人格 | 第一版只记录明确目标、项目、兴趣，不做人格判断 |

---

## 15. 最终产品形态

当上面几轮迭代完成后，Nexusky 的核心体验会从：

```text
用户手动整理笔记
```

变成：

```text
用户表达当前想法，
系统自动连接过去上下文，
并持续形成长期主题和认知关系。
```

这就是 Nexusky 和普通 AI 笔记软件的分界线。

---

## 16. 第一周具体任务清单

第一周只建议完成这些：

```text
Day 1
- 设计 schema v9（已完成，2026-05-22）
- 写 migration（已完成，2026-05-22）
- 写 schema 测试（已完成，2026-05-22）

Day 2
- 实现 relation-candidates.ts（已完成，2026-05-22）
- 支持 links / backlinks / tags / properties 召回（已完成，2026-05-22）

Day 3
- 接入 FTS / semantic search 候选（已完成，2026-05-22；semantic 当前为本地 chunks/token similarity）
- 写 candidates 测试（已完成，2026-05-22）

Day 4
- 实现 relation-store.ts（已完成，2026-05-22）
- 实现 upsert / query / feedback（已完成，2026-05-22）

Day 5
- 实现 relation-ranker.ts（已完成，2026-05-22）
- 写 ranker / store 测试（已完成，2026-05-22）

Day 6
- 增加 IPC 类型和 handlers（已完成，2026-05-22）
- 做最小 CLI 或单元测试验证闭环（已完成，2026-05-22；`tests/long-context-ipc-types.test.ts` + store tests）

Day 7
- 复盘召回质量
- 调整阈值
- 准备前端面板（已完成，2026-05-22）
```

第一周结束时必须能做到：

```text
给定当前 noteId，
系统能返回 3 条有分数、有原因占位、有来源的历史上下文候选。
```

AI 关系分类可以放到第二周，不要阻塞数据层闭环。
