# Nexusky 工程与产品化审计

> 生成日期：2026-05-28
> 范围：full repo scan，包括 `packages/main`、`packages/renderer`、`packages/shared`、`browser-extension`、`website`、`tests`、`docs`。
> 与 `docs/PRODUCT_STRATEGY_ANALYSIS.md` 关系：那篇文档侧重战略叙事；本文以代码证据为主，给出工程层真实状况和可落地的优先级。

## 1. 总体定位（一句话）

Nexusky 已经从 "Markdown 编辑器 + AI 聊天" 进化为 **一个本地优先的 AI 知识工作台**：编辑器、索引、图谱、维护、长期上下文、Agent、批量生成、同步、发布、剪藏八条主线全部跑通了 MVP / Beta，但作为产品它的入口太多、心智不集中，"用户每周为什么回来" 这个问题还没回答清楚。

## 2. 工程现状评估（基于代码事实）

### 2.1 体量与分布

| 维度 | 数据 |
| --- | --- |
| 主进程 services 文件 | 50+ 个，最大 `indexer.ts` 1121 行 |
| 主进程 IPC | 13 个域，`db.ipc.ts` 1458 行（最大）、`ai.ipc.ts` 拆成 7 个子模块 |
| 渲染层组件 | 80+ 个，最大 `ChatPanel.tsx` 2267 行、`CanvasView.tsx` 1858 行、`KanbanPanel.tsx` 1618 行、`GraphView.tsx` 1032 行、`Editor.tsx` 944 行 |
| SQLite schema | v11，21 张表（含 long_context、proactive、agent、kanban 各自的表族） |
| Tool Surface 工具 | 25 个（note 7、graph 10、memory 5、task 2、maintenance 1）；全部 read_only，只有 1 个 preview_write |
| Agent step kinds | 5 种（tool_call / file_create / file_write / task_update / note_edit），均支持 dryRun + rollback |
| AI Provider | 5 个（openai / openai-responses / claude / custom OpenAI-兼容 / ollama / codex CLI）|
| 同步后端 | 5 个（supabase / icloud / onedrive / webdav / s3） |
| 测试文件 | 104 个，约 96 个对核心域有针对性覆盖 |
| 仓库 LOC（src） | ~50K，渲染层 ~20K、主进程 ~30K |

### 2.2 工程优点（具体到代码）

1. **数据模型清晰且分层完整**：`packages/main/src/services/database.ts` 21 张表按职责分群（笔记 / 链接 / 任务 / 看板 / 长上下文 / 主动 / Agent），每张表都有 `IF NOT EXISTS`+ `ensureColumn` 自修复机制，旧 vault 打开不会因缺列报错。
2. **Provider 抽象稳**：`packages/main/src/services/ai/base-provider.ts` 定义统一接口，5 个 provider 各自一个文件，错误通过 `provider-errors.ts` 归一化，流式 + abort 在 `packages/main/src/ipc/streams/consume-stream.ts` 统一收口。
3. **Secret 加密真做了**：`services/secret.ts` 实现 `enc:v3:`（Electron safeStorage） + `enc:v2:`（AES-256-GCM 便携加密）+ `enc:v1:`（legacy）三层，`get()` 命中旧版本自动升级。
4. **Agent 引擎完整闭环**：`services/agent/executor.ts:33-249` 实现 dryRun、依赖检查、rollback data 持久化；vault path 越界校验在 `resolveVaultPath` (line 303-314)，rollback 数据写进 `agent_steps.rollback_data` 字段。
5. **Long-context Ranker 公式可解释**：`services/long-context/relation-ranker.ts` 用 6 因子加权（localScore 30% + aiConfidence 30% + recurrence 15% + decay 10% + feedback 10% + evidence 5%），半衰期默认 90 天，feedback 负权重 −0.5 (notRelated)。**这是产品可解释性的真正基础**。
6. **Embedding + FTS5 双轨**：`services/embedding.ts` 真的实现了 chunk + cosine similarity（CHUNK_SIZE 400 / overlap 50），`chunks` 表有 `embedding BLOB` + `embedding_model` 字段。语义搜索不是营销话术。
7. **测试覆盖 104 个文件**：核心域（agent、ai、long-context、proactive、maintenance、graph、canvas、editor markdown 兼容、obsidian/notion/reader 导入）都有针对性测试。每次 commit 之前 `pnpm typecheck && pnpm test` 是可信的护栏。
8. **Worker 真用了**：`packages/renderer/src/workers/graph-force-worker.ts`（D3 力仿真）、`canvas-route-worker.ts`（卡片绕行路由）、`packages/main/src/workers/index-vault-worker.ts`（批量索引）— Web Worker / Node Worker 都已部署，避免主线程阻塞。
9. **i18n 完整**：renderer 全量经过 `useTranslation`，中英两份 locale 同步维护。

### 2.3 工程缺陷与债（直接给文件/行号）

1. **Web Clipper 缺认证 — P0 安全风险**：`services/web-clipper.ts:151-153` 设置 `Access-Control-Allow-Origin: *`，本地 `127.0.0.1:17321` 接受任何源的 POST `/clip`，没有 token / origin 校验。任意用户访问的恶意网页 + 一个 `fetch('http://127.0.0.1:17321/clip', ...)` 就能静默写文件到 vault。
2. **Agent file_create 回滚不是真删除 — bug**：`services/agent/executor.ts:262-264` 把 file_create 的回滚实现为 `writeFileSync(targetPath, '', 'utf-8')`（写空文件），而不是 `unlink`，回滚后 vault 留下空 Markdown。
3. **维护队列同步 IO 阻塞主进程**：`services/maintenance/queue-builder.ts:112-120` 在循环里 `readFileSync` 每篇笔记。无缓存，每次 `maintenance:get-queue` 全量扫描；大 vault（10K+ 笔记）会卡 UI 几秒。
4. **渲染层巨石组件**：
   - `ChatPanel.tsx` 2267 行 — agentMode、editMode、batchMode、attachments、history、session、draft、abort 全揉一起
   - `CanvasView.tsx` 1858 行 — viewport / mode / drag / pan / zoom / route / association suggestions / persistence 混杂
   - `KanbanPanel.tsx` 1618 行 — UI + 业务 + AI 预览 + drag drop（虽然入口已被砍但代码还在）
   - `GraphView.tsx` 1032 行 — 数据加载 / canvas 渲染 / worker 协议 / 交互 / 持久化
   单文件超过 1500 行就难做局部修改不破坏其他路径。当前对它们做改动的回归风险已经偏高。
5. **db.ipc.ts 1458 行未按域拆分**：和 `ai.ipc.ts` 拆成 `ai/edit.ts / notes.ts / ...` 的做法不一致。db 域应该拆 search / graph / property / kanban / history / chunks 等。
6. **长上下文关系候选用 token Jaccard，不是 embedding**：`services/long-context/relation-candidates.ts:381-460` 用 `tokenSetSimilarity`（关键词集合相似度），阈值 0.12/0.16。这与 README 暗示的"长期记忆"语义有落差 — 真正向量化的只有 chunks，跨笔记关系仍是浅层匹配 + AI confidence。这不是错，但**产品话术需要诚实地讲清楚**。
7. **Tool Surface 25 个工具但只有 1 个 preview_write**：`services/tool-surface/registry.ts` 全部是读工具，写动作只能通过 ChatPanel agentMode 或 Agent run。AI 能"看"但很少能"做"，与 Plan-Execute-Reflect 的能力宣称有差距。
8. **同步冲突解决简化为时间戳**：`services/cloud/manager.ts:170-178` 用 `mtimeMs` 比 `remoteMtime`，5 秒抖动容忍。没有内容哈希 / 三方合并 / 冲突 UI，多设备并发编辑会导致"较晚 push 覆盖较早 push"。`SyncResult.conflicts: string[]` 字段存在但调用链里没有真正的冲突写回机制。
9. **Activity Bar 入口去重还未做完**：今天的三次提交（Kanban、Agent、Canvas spatial）已经把上层入口砍了，但底层 `KanbanPanel.tsx`、`mainView === 'kanban'`、`rightPanel === 'agent'` 路由都还在，是为了不破坏老用户的持久化状态保留的。下次大版本应彻底删除。
10. **测试缺少端到端 / Electron 实例集成**：104 个测试是 Vitest 单元测试（在 Electron 运行时跑），没有 Playwright / Spectron 级别的窗口操作 / 真实 DB 实例测试。CI workflow `.github/workflows/ci.yml` 只跑 typecheck + test，没有 build smoke / packaging 验证。

### 2.4 实现成熟度评级

| 子系统 | 成熟度 | 证据 |
| --- | --- | --- |
| Markdown 索引 + FTS5 | **GA** | `indexer.ts` 1121 行，21 张表 schema v11，自修复迁移，wikilink / heading / block 引用、Dataview inline、Tasks 插件全支持 |
| 编辑器（TipTap） | **GA** | Editor.tsx 944 行，markdown 双向序列化、wikilink autocomplete、图片粘贴、KaTeX/Mermaid、AIWritingMenu、slash command |
| 语义搜索（embedding） | **Beta** | embedding.ts 完整 chunk + cosine，但 embedding model 来源依赖 AI provider 配置，新用户无 key 时不可用 |
| 长上下文关系 | **Beta** | ranker / classifier / discovery / theme / cognitive review 都齐了，但 relation-candidates 用 token Jaccard，**语义深度有限** |
| Agent 引擎 | **Beta** | 5 step kinds + rollback + dryRun，但 file_create 回滚写空文件而非删除（bug）、step kind 数量少（无 `move_file` / `delete_file` / `apply_tag` 等）|
| 主动建议 | **Beta** | 5 trigger 类型规则化触发，policy + signature 去重，broadcaster 推送；阈值不可调（HIGH_SCORE_THRESHOLD = 0.75 等硬编码）|
| 维护队列 | **Beta+** | 19 种维护类型完整，IPC + apply-fix 通路完整；同步 IO 性能问题、UI 重设计待办 |
| Tool Surface | **MVP** | 25 个工具但 24 个 read_only，无写入工具；命令面板入口好，但缺"工具组合"能力 |
| 多 Provider AI | **GA** | base provider 抽象、错误归一化、abort 统一，5 个 provider 都跑通 |
| 同步（5 后端） | **MVP / Alpha** | 接口铺好，但冲突仅时间戳比较，多设备场景未真正验证；s3 / webdav 有针对性测试，icloud / onedrive 测试薄 |
| 导入器（Obsidian/Notion/Reader） | **GA** | 测试齐全，字段映射覆盖 callout / Dataview / Tasks 插件 / 嵌套 |
| Web Clipper | **MVP / 不安全** | 端到端通路跑通，但 P0 安全缺口未补 |
| 静态发布 | **MVP** | `publish.ts` 134 行，单页生成，未与官网 / CDN 一体化 |
| 官网 | **MVP** | Next.js 项目跑通，page.tsx 写好但是只是"列能力"，未做转化路径 |
| 插件系统 | **Alpha** | 声明式插件命令 + 面板 + 编辑器扩展，但无 marketplace / 签名 / 沙箱 |

## 3. 产品优势（聚焦差异化）

1. **数据主权可信**：Markdown 主数据 + SQLite 索引派生 + safeStorage 加密 secret，三层都做了；离开 Nexusky 笔记仍是普通文件。
2. **AI 写入有边界**：所有 AI 编辑都走 preview-first（`ai:edit` 返回 diff，用户确认才写），批量生成、Kanban AI、Agent 全部预览 plan。这是"敢把真 vault 放进来"的关键。
3. **长期上下文 + 反馈闭环**：`relation_feedback` 表 + ranker 把"用户说没用"作为负权重 −0.5 写回排序。这一闭环目前没有同类产品做到这么显式。
4. **图谱不是装饰**：5 种 GraphMode、explicit / inferred / folder 三种边类型、worker 力仿真、按 folder 着色 + Obsidian 风格自由布局。和 Obsidian 比，多了 AI 推断关系；和 Notion 比，根本不是同一物种。
5. **Provider 开放性 + Codex CLI 支持**：覆盖国内外、订阅 / 自部署、CLI 工具链多种使用方式。这是中文用户社区会高频提到的差异化。
6. **工程基础牢**：typecheck + test 双重护栏 + CI + 104 个测试 + worker 已部署 + schema 自修复，作为开源桌面项目这是上游 80% 项目达不到的水平。

## 4. 产品风险与短板

### 4.1 战略层

1. **激活路径不清晰**：当前 ActivityBar 即使三次降权后仍有 11 个入口，新用户打开 vault 后没有"先做什么"的明确指引。Onboarding.tsx 只有 188 行，更像欢迎页而不是引导。
2. **核心叙事散**：README 一段、PRODUCT.md 一段、官网一段、PROJECT_OVERVIEW 一段，互相补充但没有一句话能让人 5 秒钟记住"为什么用 Nexusky 而不是 Obsidian / Notion"。
3. **长期上下文产品化不够**：能力强，但用户感知是 `LongContextDebugPanel`、`relation reason` popover 这种工程化术语，缺一个"AI 记得什么"的简单视图。
4. **维护队列像问题清单而非任务**：19 种类型按类型筛选，但没有"今天做这三件"的优先级与节奏。

### 4.2 工程层（P0 / P1 / P2）

P0（必须修，否则不能放心给用户用）：
- Web Clipper 加 token 鉴权 + origin allowlist（`services/web-clipper.ts`）
- Agent file_create 回滚改成 `unlink`（`services/agent/executor.ts:262-264`）
- 同步冲突至少加 content hash 比较 + 冲突 UI（`services/cloud/manager.ts`）

P1（影响体验稳定性）：
- 维护队列加缓存 + 异步化（`services/maintenance/queue-builder.ts`）
- ChatPanel / CanvasView / GraphView 拆分到 sub-component（每个不超过 600 行）
- db.ipc.ts 按域拆分为 db/search.ts / db/graph.ts / db/property.ts / db/kanban.ts
- 主动建议阈值可配置（`services/proactive/proactive-triggers.ts:42-46`）

P2（演进期）：
- Tool Surface 加 preview_write 工具：apply_tag、move_file、archive_note、merge_notes
- Agent step kinds 扩展：move_file、delete_file、apply_tag、create_link
- 端到端测试：Playwright 跑 Electron 实例的 golden path

## 5. 产品化方向

### 5.1 战略主线（建议 12 个月）

**Nexusky = Markdown vault 的 AI cognitive partner**

具体到一句话定位：
> Nexusky 把本地 Markdown 知识库变成一个可搜索、可连接、可维护、可被 AI 解释和有边界执行的认知伙伴。

这句话四个动词对应四个已有能力：
- 可搜索 ← embedding + FTS5（GA）
- 可连接 ← 图谱 + AI 推断关系 + bridge notes（Beta）
- 可维护 ← 19 种 maintenance + apply-fix（Beta+）
- 可执行 ← Agent + Tool Surface + preview/rollback（Beta）

### 5.2 三步收束

**Step 1（0-2 周）：把安全和激活底座补上**

- 修 Web Clipper 鉴权 + 同步冲突 + Agent 回滚 bug。
- WelcomeScreen 后接一个 `Vault Health Scan`：扫完 vault 显示 笔记数 / 链接数 / 孤岛数 / 待办数 / 缺记忆数 / 重复标题数。
- 给出 3 个"下一步"按钮：a) 问 AI 一个关于 vault 的问题；b) 修 3 个未解析链接；c) 浏览最重要的桥接笔记。
- AI Provider 配置后增加 "测试问题"，确保用户在 5 分钟内看到第一次有源引用的回答。

**Step 2（1-2 月）：核心闭环可感知**

- `Vault Health` 作为 WelcomeScreen 之外的首页面：把 maintenance queue 重排成"今天做这 3 件"，把长期上下文重新包装为 `Memory Ledger`（AI 记得什么）+ `Context Pack`（本轮看到什么）+ `Why this?`（来源解释）。
- ChatPanel 拆分：Chat / Edit / Batch 三种 mode 分别独立组件，agentMode 仅在 Chat 内部 toggle。
- Maintenance queue 加缓存 + 增量更新（基于 file watcher 事件）。

**Step 3（3-6 月）：认知伙伴 MVP**

- Proactive 上线低频高价值通知（每天 ≤ 3 条，可全局静默）。
- Agent 不再是独立入口，而是"维护队列里点击批量修复 → Agent plan 预览 → 一键执行"。
- 周度 cognitive review：让用户看到本周写了什么 / 关系怎么变 / 哪些主题在浮现。
- 同步：默认推荐 iCloud（macOS）/ WebDAV（跨平台高级用户），Supabase 留给"我要 managed 体验"用户。

### 5.3 明确不做（产品取舍）

| 不做 | 原因 |
| --- | --- |
| 团队协作 / 多人实时编辑 | 会引入云架构 + 权限 + 实时同步，稀释本地优先定位 |
| 移动端 App | 桌面端 + Web Clipper + bring-your-own-sync 是更务实的 capture 路径 |
| 插件 marketplace 商业化 | 现阶段没有审核 / 沙箱 / 签名，是 power-user 扩展，不是增长抓手 |
| 自己做 embedding 模型 | 依赖用户配置的 provider，避免锁定一种 GPU/CPU 推理路径 |
| 自动备份 / 版本回滚作为云服务 | 留给 1 年后再评估 |

### 5.4 商业模式（建议）

- 桌面核心免费开源（MIT 已是）。
- Pro（订阅 $5-10/月）：托管同步 / 增强 AI 配额 / 自动备份 / 发布站点托管 / 高级主题。
- Team / Enterprise：≥ 12 个月不做。

## 6. 落地优先级 Backlog

### P0（2 周内）

- [x] Web Clipper token + origin allowlist *(2026-05-28: origin 白名单仅允许 chrome/moz/safari/edge-extension://，并要求自定义 X-Nexusky-Clipper 头；恶意网页 fetch 会被浏览器在 preflight 阶段拒绝)*
- [x] Agent file_create rollback → unlink *(2026-05-28: executor.ts rollback 改成 unlinkSync + removeNoteIndex；以前是 writeFileSync('')，会留下空文件 + 脏索引)*
- [ ] 同步加 content hash 冲突检测
- [ ] WelcomeScreen → Vault Health Scan
- [ ] AI Provider 配置后加测试问题

### P1（1-2 个月）

- [ ] Maintenance queue 缓存 + 异步化
- [ ] ChatPanel / CanvasView / GraphView 子组件拆分
- [ ] db.ipc.ts 按域拆分
- [ ] Memory Ledger + Context Pack 用户化
- [ ] Why this? 来源解释
- [ ] 主动建议阈值可配置

### P2（3-6 个月）

- [ ] Maintenance → Agent plan → Execute 完整路径
- [ ] Tool Surface 加 preview_write 工具
- [ ] Weekly Cognitive Review
- [ ] Agent step kinds 扩展（move/delete/apply_tag）
- [ ] Playwright e2e

### P3（6-12 个月）

- [ ] 插件 marketplace + 签名沙箱
- [ ] 官方托管同步
- [ ] 模板 / 主题社区运营
- [ ] 商业模式上线
- [ ] 官网 SEO + 用例页

## 7. 与现有文档的关系

- **`README.md`**：项目入口和快速开始。
- **`PRODUCT.md`**：产品定位 + Surface Decisions 决策日志（今天加的）。
- **`docs/PROJECT_OVERVIEW.md`**：技术全景，代码导航 — 仍是开发的权威文档。
- **`docs/PRODUCT_STRATEGY_ANALYSIS.md`**：GPT 5.5 写的战略叙事 — 与本文互补。
- **本文 `docs/PROJECT_AUDIT.md`**：基于代码事实的工程 + 产品双面审计，给出可执行优先级。

## 8. 给 AI / 维护者的 TL;DR

1. **代码层**：技术债主要集中在三个超大组件（ChatPanel / CanvasView / GraphView）+ db.ipc.ts，未来三个月任何改动都要警惕回归；三个 P0 安全/正确性 bug（Web Clipper、Agent rollback、同步冲突）应该最优先修。
2. **产品层**：功能已经够，缺核心激活和叙事收束；下一阶段的关键不是加功能，而是把"长期上下文 + 维护队列 + Agent 执行"包装成一个可感知的闭环。
3. **战略层**：不要尝试同时打 Obsidian、Notion、AI Chat 三个市场；专注"本地 Markdown vault 的 AI 认知伙伴"这一定位，12 个月内不开协作和移动端。
