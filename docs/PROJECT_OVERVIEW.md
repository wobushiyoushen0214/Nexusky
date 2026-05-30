# Nexusky 项目全景文档

> 面向人类维护者和 AI agent 的项目说明。本文根据当前代码结构与功能实现整理，适合作为需求理解、代码导航、二次开发和自动化分析的上下文入口。

最后核对版本：`cb6a1f3`（v0.5.0 后，含分组图谱钻取、相关上下文侧栏整合、知识空间路由显示和官网首页重做）

## 1. 一句话理解

Nexusky 是一个 Electron 桌面端、本地优先的 Markdown 知识库笔记应用。它把文件系统中的 Markdown vault 作为真实数据源，用 SQLite 建立索引，用 React/TipTap 提供编辑体验，并在 AI 对话、Agent、编辑、批量生成、长期上下文、本地相关检索、知识图谱、看板、闪卡、阅读收件箱和主动建议等工作流中接入多种 AI Provider。

## 2. 产品定位

Nexusky 的核心目标是让用户在本地文件夹中长期维护知识资产，同时获得现代知识库工具和 AI 助手能力。

它不是纯云端笔记软件，也不是只读的 AI 聊天窗口。它的设计重点是：

- 本地 Markdown 文件是主数据，应用可以离线使用。
- SQLite 是索引和派生状态，不替代 Markdown 文件。
- AI 能读取、搜索、生成和修改笔记，但关键写入仍落到 vault 文件或本地数据库。
- 知识图谱、知识空间、搜索、看板、闪卡等功能都围绕同一个 vault 运转。

## 3. 主要用户场景

### 3.1 日常笔记与写作

用户打开或创建一个 vault 后，可以在左侧文件树中新建、重命名、删除、移动 Markdown 文件。中间编辑器支持 TipTap 富文本体验，同时保留 Markdown 序列化。

常见能力：

- 标题、列表、表格、任务列表、引用、代码块、高亮、分割线。
- KaTeX 数学公式和 Mermaid 图表。
- 图片粘贴/拖拽自动保存到 `assets/`。
- 搜索替换、预览模式、聚焦模式、版本历史、自动保存。
- Frontmatter 属性面板和标签栏。

### 3.2 双向链接与知识网络

用户用 `[[wikilink]]` 建立笔记之间的显式关系。索引器会读取 Markdown，抽取标题、链接、标签、任务、别名和属性。

相关体验：

- 点击不存在的 wikilink 可创建目标笔记。
- `[[folder/note]]`、`[[note#heading]]`、别名和大小写变体可解析。
- 当前笔记底部可看出链、反链和未链接提及。
- 未链接提及可转为 wikilink。
- D3 知识图谱和知识空间会基于索引展示节点关系。
- 知识图谱底层支持 folder / semantic / connection / group / folder-scope 数据模式，边会区分显式链接、AI 推断链接和目录归属。
- 当前图谱 UI 先展示顶层分组总览，可点击目录节点钻入单层目录视图；深层笔记会通过子目录节点聚合，跨目录推断关系以聚合边呈现。
- 图谱默认以显式关系为主，隐藏 AI 推断边、目录归属边、孤立节点和普通节点标签，保留开关供用户临时查看低信号关联。
- 编辑器底部链接概览默认折叠，避免出链/反链/未链接提及在普通写作时长期占用正文空间。

### 3.3 AI 对话与 AI 编辑

右侧 AI 面板提供聊天、RAG、Agent、编辑和批量生成笔记能力。

主要模式：

- 普通聊天：回答问题，可自动检索相关笔记作为上下文。
- Agent 模式：可调用工具搜索、读取、巡检知识库。
- 编辑模式：可生成新笔记或对当前笔记生成修改方案，用户预览后应用。
- 批量生成：AI 先识别批量意图，再规划目录和主题，逐目录生成多篇 Markdown 笔记。
- 附件上下文：可附加笔记、选区、图片和文档。

### 3.4 搜索、阅读和复习

Nexusky 不只处理用户手写笔记，也能导入外部阅读材料并帮助复习。

能力包括：

- 全文搜索和本地词法相关检索。
- Notion、Readwise、Pocket 导入。
- 阅读收件箱按来源、状态、关键词筛选。
- 命令面板从笔记生成摘要或闪卡。
- 闪卡复习面板按 SRS 字段调度到期卡片。

### 3.5 同步与发布

Nexusky 以本地优先为基础，同时支持多个同步/导出方向：

- Supabase、iCloud Drive、OneDrive、WebDAV、S3 等同步后端。
- HTML/PDF 导出。
- 整个 vault 发布为静态 HTML 站点。
- 浏览器扩展 Web Clipper 把网页剪藏保存为 Markdown。

### 3.6 任务管理、看板、知识维护与主动建议

围绕 vault 中的 Markdown 任务列表，Nexusky 提供任务级别的工作流：

- 索引器抽取 Markdown 任务，识别状态（待办、已完成、Obsidian 自定义状态如 `/`、`x`、`-` 等）、嵌套层级、Dataview inline 字段、Tasks 插件的截止/计划/开始日期、优先级、循环规则和阻塞信号。
- 看板视图（`KanbanPanel`）按列管理任务，可手动新建、拖拽、关联，也可从已索引的笔记任务批量导入或预览导入。
- 看板的 AI 工作流：`kanban:ai-analyze`、`kanban:ai-breakdown-task`、`kanban:ai-from-note` 先生成可编辑 plan 预览，用户确认后再写入。
- AI Agent 提供 `plan_knowledge_maintenance` 工具，把"未解析链接、空笔记、过期任务、今日到期、高优先级、计划/开始/阻塞/循环任务、即将到期、孤岛笔记、缺失属性、重复标题或别名、待复习笔记记忆、超长笔记、知识桥接"等问题统一汇总成可执行的维护队列。
- `list_knowledge_bridges` 工具找出语义上的桥接笔记，配合 `suggest_note_links`、`connection-opportunities` 帮助补全跨主题链接。
- 知识维护面板通过 `maintenance:*` IPC 获取队列并应用部分自动修复；同一右侧面板也整合了"相关上下文"页签，编辑器状态栏可一键打开当前笔记的长期上下文轮播。
- 主动建议系统会基于长期上下文、主题接近、认知回顾和维护信号生成通知；通知中心支持单条打开/稍后/忽略，也支持一次性全部已读或全部删除。

## 4. 技术栈

| 层 | 当前实现 |
| --- | --- |
| 桌面容器 | Electron 39；原生模块通过 `scripts/rebuild-native.mjs` 按 Electron 运行时重建 |
| 构建 | electron-vite + Vite 6 |
| 前端 | React 19、Zustand、i18next |
| 编辑器 | TipTap / ProseMirror、tiptap-markdown |
| Markdown 渲染 | marked、DOMPurify、KaTeX、Mermaid、lowlight |
| 图谱/知识空间 | D3 force / drag / zoom；`db:get-graph` 支持 `GraphMode`（semantic / connection / folder / group / folder-scope），GraphView 默认展示分组总览并支持目录钻取、linkType 视觉区分、布局缓存和 renderer Web Worker 力仿真；知识空间保留属性/时间图层，连接线默认显示并由路由 worker 绕开卡片 |
| 本地数据库 | better-sqlite3，WAL 模式，FTS5 |
| AI SDK | OpenAI、Anthropic、Ollama 兼容接口、Codex CLI |
| 同步 | Supabase、iCloud、OneDrive、WebDAV、S3 |
| 测试 | Vitest |
| 类型 | TypeScript，多包 `tsconfig` |

## 5. 仓库结构

```text
packages/
  main/                 Electron 主进程
    src/
      index.ts          创建窗口、注册 IPC、启动更新器和 Web Clipper
      preload.ts        暴露受控 window.api 给渲染进程
      ipc/              文件、vault、数据库、AI、云同步、导出、插件等 IPC
      services/         主进程业务逻辑
      workers/          后台索引 worker

  renderer/             React 渲染进程
    src/
      App.tsx           应用壳、布局、全局事件、主视图/右面板装配
      components/       编辑器、侧边栏、AI、图谱、看板、设置等 UI
      stores/           Zustand 状态
      utils/            前端工具函数
      i18n/             国际化文案
      styles/           全局样式

  shared/               主进程和渲染进程共享代码
    src/types/ipc.ts    IPC 通道、参数和返回值的权威类型定义
    src/markdown/       Markdown 兼容渲染工具

docs/                   项目文档
scripts/                开发/CLI 脚本（dev.mjs、rebuild-native.mjs、nexusky-cli.mjs、vitest-electron.mjs）
supabase/               Supabase schema 和部署说明
browser-extension/      Web Clipper 浏览器扩展（Chrome/Edge MV3）
website/                官网首页、下载入口与发布日志后台（Next.js 子项目）
test-vault/             Vitest/手测用的样例 vault
tests/                  Vitest 测试
```

## 6. 运行时架构

```text
用户界面 React
  ↓ window.api.invoke(...)
preload.ts 类型化桥接
  ↓ ipcRenderer / ipcMain
main/ipc/*.ipc.ts
  ↓ 调用
main/services/*
  ↓ 读写
文件系统 Markdown vault + .nexusky 元数据 + SQLite 索引
```

### 6.1 主进程

主进程入口是 `packages/main/src/index.ts`。它负责：

- 创建无边框 Electron 窗口，恢复窗口大小和位置。
- 注册 `file`、`vault`、`db`、`ai`、`agent`、`maintenance`、`proactive`、`template`、`cloud`、`export`、`plugin` IPC。
- 初始化自动更新。
- 启动 Web Clipper 本地服务。
- 注册全局快捷键 `CommandOrControl+Shift+N`。
- 在退出时停止服务并刷新持久化 store。

### 6.2 Preload 桥接

`packages/main/src/preload.ts` 通过 `contextBridge.exposeInMainWorld` 暴露 `window.api`。渲染进程不能直接访问 Node API，只能通过受控 IPC 调用主进程。

关键点：

- `invoke` 使用 `IPCChannelMap` 做类型约束。
- 事件订阅包括文件变化、vault 变化、AI stream、AI sources、AI edit stream、图谱进度、笔记生成进度、记忆生成进度、本地检索索引进度、主动建议、Agent step update、更新器事件等。
- 窗口控制通过 `window:minimize`、`window:maximize`、`window:close`、`window:new` 发送给主进程。

### 6.3 渲染进程

`packages/renderer/src/App.tsx` 是应用壳。它负责：

- 加载 vault。
- 装配 TitleBar、ActivityBar、Sidebar、Editor、WelcomeScreen、主视图和右侧面板。
- 通过 React.lazy 拆分重型视图：GraphView、CanvasView、ReaderInboxView、ChatPanel、Settings、SearchPanel 等。
- 根据全局快捷键打开快速切换、搜索、命令面板、设置、AI 面板等。
- 处理图谱生成、知识空间、插件面板、回收站、闪卡复习、主题包和 CSS 片段。

## 7. 数据模型与持久化

### 7.1 真实数据源

用户笔记以 Markdown 文件存在于 vault 目录中。应用应把这些文件视为可迁移、可备份、可被其他工具读取的主数据。

常见文件/目录：

- `*.md`：用户笔记。
- `assets/`：图片等附件。
- `.trash/`：回收站文件。
- `.nexusky/`：应用私有元数据，例如笔记记忆、插件、模板、主题包等。

### 7.2 SQLite 索引

`packages/main/src/services/database.ts` 负责为每个 vault 创建和迁移 SQLite 数据库。当前 `SCHEMA_VERSION = 11`。

主要表：

| 表 | 用途 |
| --- | --- |
| `notes` | 笔记基础索引：id、title、file_path、时间、content_hash |
| `links` | wikilink 和 AI 推理链接，包含 source、target、context、line、link_type |
| `tags` / `note_tags` | 标签与笔记关系 |
| `note_aliases` | frontmatter alias / aliases |
| `note_properties` | frontmatter / Dataview inline 属性键值索引 |
| `notes_fts` / `notes_fts_map` | SQLite FTS5 全文搜索 |
| `chunks` | 本地检索分块文本 |
| `tasks` | Markdown task list 抽取结果，含状态字符（含 Obsidian 自定义状态）、嵌套层级、Tasks 插件 due/scheduled/start 日期、Dataview 字段 |
| `kanban_columns` / `kanban_tasks` / `kanban_task_relations` | 看板列、任务（含 priority、due_date、source_note_id、source_file_path、时间戳）和任务间关系（`related` / `blocks` / `depends_on` 等） |
| `conversations` / `chat_sessions` | AI 对话历史与多会话 |
| `context_events` / `ai_relations` / `long_term_themes` / `theme_memberships` / `relation_feedback` | 长期上下文事件、AI 关系、长期主题、主题成员和关系反馈 |
| `proactive_suggestions` | 主动建议通知，含类型、来源、实体、CTA、重要度、状态、稍后提醒和响应时间 |
| `agent_runs` / `agent_steps` | Agent 任务运行记录、计划步骤、执行状态、结果、回滚数据 |
| `schema_version` | 数据库迁移版本 |

旧 vault 兼容策略：

- `getDatabase(vaultPath)` 打开数据库后会先做一次结构修复，再执行 `CREATE TABLE IF NOT EXISTS` 和版本迁移，最后再次修复，确保旧数据库即使 `schema_version` 已经是当前版本，也能补齐后来新增的字段。
- 结构修复覆盖 `links.context/line/link_type`、`conversations.sources/session_id`、`kanban_tasks` 来源和时间字段等历史版本常见缺列，避免打开旧文件空间后在索引、图谱、看板或 AI 历史查询中出现 `no such column`。
- 如果旧 `links` 表缺少可追溯的 `source_note_id`，修复后会清理无法归属到现有笔记的脏链接行；重新索引 vault 会从 Markdown 源文件重建正确链接关系。

### 7.3 索引流程

`packages/main/src/services/indexer.ts` 是 Markdown 到数据库的核心转换层。

索引一篇笔记时会：

1. 计算相对路径和内容 hash。
2. 如果内容未变化，跳过重复索引。
3. upsert `notes`。
4. 删除该笔记旧的 links、tags、aliases、tasks、FTS 行。
5. 解析 wikilink、标签、frontmatter、Dataview inline properties、任务列表。
6. 写入 links、tags、note_aliases、tasks、notes_fts。
7. 调用 `resolveLinks` / `resolveAllLinks` 把 target title/path/alias 解析到目标 note id。

删除文件时，索引器会从 `notes` 删除对应行；外键级联清理相关 links、tags、tasks、FTS map 等派生数据。

## 8. IPC 设计

`packages/shared/src/types/ipc.ts` 是所有 IPC 通道的类型契约。新增 IPC 时应先更新这里，再在主进程注册 handler，最后在渲染进程调用。

主要通道族：

| 通道前缀 | 责任 |
| --- | --- |
| `file:*` | 文件读写、创建、删除、重命名、历史、加密、回收站、文档文本提取 |
| `vault:*` | 选择、创建、读取、清空当前 vault 和最近 vault |
| `db:*` | 索引、搜索、图谱、反链、属性、对话历史、本地检索状态 |
| `flashcards:*` | 到期闪卡队列和评分写回 |
| `kanban:*` | 看板列、任务、关系、AI 分析、AI 任务拆解、AI 笔记转看板、按笔记任务批量导入和 AI plan 预览 |
| `ai:*` | Provider、聊天、Agent 工具执行、工具面板 surface、编辑、批量笔记、摘要、闪卡、标签、语音转写 |
| `maintenance:*` | 知识维护队列查询和自动修复应用 |
| `proactive:*` | 主动建议列表、单条响应、批量已读/删除、偏好设置和调试运行 |
| `agent:*` | Agent 规划、运行控制、步骤重试/跳过/回滚、运行列表和反思 |
| `template:*` | 内置/市场/社区模板 |
| `plugins:*` | 本地插件和插件市场 |
| `cloud:*` | 云配置、登录、同步、各 Provider 配置、索引同步 |
| `export:*` | HTML、PDF、分享、发布站点 |
| `updater:*` | 更新检查、下载、安装 |

重要约束：

- 渲染进程不直接读写本地文件。
- `file:write`、`file:create`、`file:delete`、`file:rename` 等写操作应校验路径位于 vault 内。
- `vault:select`、`vault:create`、`vault:clear-current` 会关闭当前 SQLite 连接并清空 vault 查询缓存，避免切换或创建文件空间时复用旧连接、旧查询结果或旧 schema 状态。
- 长任务通过 `ai-task-control` 提供取消控制。
- AI streaming 通过事件回传，而不是普通 invoke 返回大文本。

## 9. AI 子系统

AI 入口主要在 `packages/main/src/ipc/ai.ipc.ts` 和 `packages/main/src/services/ai/`。

### 9.1 Provider 管理

`packages/main/src/services/ai/index.ts` 中的 `AIManager` 根据配置创建 provider。

当前支持：

- `openai`
- `openai-responses`
- `claude`
- `custom`
- `ollama`
- `codex`

Provider 统一实现基础聊天/流式输出接口。错误会经 `provider-errors.ts` 归一化，支持重试和用户可读错误消息。

### 9.2 普通聊天与 RAG

`ai:chat` 会根据最后一条用户消息对当前 vault 做语义检索。若找到相关笔记，会把片段作为系统上下文合并到消息中，并通过 `ai:sources` 事件把来源返回给前端。

前端 `ChatPanel` 负责：

- 保存和加载会话。
- 汇总上下文、附件和当前笔记提示。
- 渲染流式 Markdown。
- 管理停止生成、草稿、session title、导出等体验。

### 9.3 Agent 工具

`ai:chat-agent` 为 AI 提供工具调用能力。工具覆盖：

- 搜索和读取笔记。
- 按行、标题、块引用读取局部内容。
- 读取当前笔记、属性、标题目录、链接摘要和未链接引用。
- 查询标签、文件夹、属性、任务、最近笔记。
- 检查断链、孤岛、空笔记、长笔记、重复标题/别名、链接枢纽。
- 读取或浏览笔记记忆。

这些工具输出由 `search-results.ts` 格式化，参数由 `tool-arguments.ts` 解析，limit 由 `tool-limits.ts` 归一化。

新增的"主动维护"工具：

- `plan_knowledge_maintenance`：调用 `services/ai/maintenance-queue.ts` 构造结构化维护队列，按 `KnowledgeMaintenanceType` 分类（未解析链接、过期/今日/高优先级/计划/开始/阻塞/循环/即将到期任务、孤岛笔记、空笔记、超长笔记、缺失属性、重复标题/别名、待复习记忆、桥接笔记等）。可通过 `type` 参数过滤单一类别，结果会与 elevated 任务做去重排序。
- `list_knowledge_bridges`：通过 `findKnowledgeBridgeNotes` 找出连接多个语义主题的桥接笔记。
- `suggest_note_links` + `findConnectionOpportunities`（`services/ai/connection-opportunities.ts`）：基于属性/标签共现给出可操作的链接建议。
- 图谱洞察 `services/ai/graph-insights.ts`：为图谱视图和 Agent 提供节点中心度、孤岛检测等派生指标。

### 9.4 AI 编辑

编辑模式会根据用户意图走不同路径：

- `chat`：只是提问，走普通聊天。
- `edit`：对当前文件或新文件生成修改方案。
- `batch`：批量生成多个独立笔记文件。

单文件编辑通过 `ai:edit` 返回完整 Markdown 内容，前端显示 diff/preview，用户确认后才写入文件。

### 9.5 批量生成笔记

批量生成由两层计划组成：

1. `ai:plan-note-batches`：理解用户语义，规划多个目录、主题和每个目录的篇数。生成的 plan 可在前端预览面板里编辑、增删行、确认后再执行。
2. `ai:generate-notes`：针对一个目标目录规划标题列表，再逐篇生成 Markdown 文件。生成的笔记会带上时间戳等 frontmatter metadata，并自动补全/合并跨笔记的 wikilink 关联章节。

生成后会：

- 刷新文件树。
- 索引新文件。
- 解析链接。
- 对生成文件做 AI 语义关系推断，并写入 `links` 的 inferred 关系。

停止与隔离逻辑：

- 停止按钮调用 `ai:stop`。
- 前端维护批量级取消标记，进度事件按 `requestId` / `operationId` 严格归属，迟到事件不会污染新的批量任务。
- 用户停止后，不再继续发送后续目录生成请求；queued planning、retry 流程也会被同步取消。
- 取消后忽略迟到的进度事件，避免未完成进度被误标为完成。

### 9.6 文档、图片、语音和闪卡

AI 面板还支持：

- 图片附件：通过多模态 content parts 发送。
- 文档附件：`file:extract-document-text` 提取 PDF、DOCX、XLSX、CSV、TXT 等文本。
- 语音转写：`ai:transcribe`。
- 闪卡生成：`ai:generate-flashcards` 生成 Basic/Cloze 卡片，并由 `flashcards:*` 管理复习。

### 9.7 Agent 运行面板

除 ChatPanel 内的工具调用外，Nexusky 还有独立的 Agent run 工作流：

- `packages/main/src/services/agent/planner.ts` 生成结构化步骤计划。
- `agent-store.ts` 持久化 `agent_runs` / `agent_steps`。
- `executor.ts` 执行步骤，支持 dry run、暂停/恢复、取消、重试、跳过和回滚。
- `reflector.ts` 对运行结果生成反思摘要。
- `packages/main/src/ipc/agent.ipc.ts` 注册 `agent:*` IPC，并通过 `agent:step-update` 事件推送步骤进度。
- 前端 `AgentRunPanel` 展示运行列表、步骤状态、回滚与反思入口。

### 9.8 长期上下文与主动建议

长期上下文系统位于 `packages/main/src/services/long-context/`，用于把用户的编辑、搜索、AI 对话和图谱关系沉淀为可复用的上下文：

- `context_events` 记录长期事件。
- `relation-candidates` / `relation-classifier` / `relation-ranker` 发现、分类和排序 AI 关系。
- `theme-extractor` 聚合长期主题，`context-pack-builder` 构造聊天可用的 hot/warm/cold 上下文包。
- `background.ts` 负责后台分析，`long-context-prefs.ts` 负责偏好设置，`cognitive-review.ts` 生成认知回顾。
- `RelatedContextPanel`、`LongContextDebugPanel` 和 `ChatSourceRow` 让用户查看相关上下文、调试 pack，并解释聊天来源为什么被引用；相关上下文面板支持 inline / top / side 布局，当前侧栏入口复用维护面板的 context 页签。

主动建议系统位于 `packages/main/src/services/proactive/`：

- `proactive-triggers.ts` 从长期关系、主题接近、认知回顾和维护信号生成候选。
- `proactive-policy.ts` 根据用户偏好、静默时段、每日上限、重要度阈值、冷却和去重决定是否发出。
- `proactive-store.ts` 写入 `proactive_suggestions`，支持 pending / shown / opened / snoozed / dismissed / expired 状态。
- `proactive-orchestrator.ts` 统一评估、upsert 和广播；`proactive-broadcaster.ts` 把新建议推给渲染进程。
- `NotificationCenter` 读取 pending/shown 列表，支持单条响应和 `proactive:respond-all` 批量已读/删除。

## 10. 主要前端模块

| 模块 | 路径 | 责任 |
| --- | --- | --- |
| 应用壳 | `packages/renderer/src/App.tsx` | 布局、全局事件、视图切换、懒加载 |
| 编辑器 | `components/editor/Editor.tsx` | TipTap 编辑、保存、渲染增强、状态栏和相关上下文侧栏入口 |
| 工具栏 | `components/editor/EditorToolbar.tsx` | 格式操作、预览、导出、语音等入口 |
| 属性面板 | `components/editor/PropertiesPanel.tsx` | frontmatter 可视化编辑 |
| AI 面板 | `components/ai/ChatPanel.tsx` | 对话、编辑、批量生成、附件、session |
| 消息气泡 | `components/ai/MessageBubble.tsx` | Markdown 渲染、复制、来源 |
| 文件树 | `components/sidebar/FileTree.tsx` / `VirtualFileTree.tsx` | 文件导航、拖拽、右键菜单、虚拟滚动 |
| 命令面板 | `components/CommandPalette.tsx` | 功能命令、AI 快捷任务、导入/导出入口 |
| 搜索 | `components/SearchPanel.tsx` | 全文/本地相关检索、检索索引进度 |
| 图谱 | `components/graph/GraphView.tsx` | D3 知识图谱；当前 UI 使用 group 总览 + folder-scope 目录钻取，底层 `db:get-graph` 兼容 Semantic / Connection / Folder；linkType 视觉区分，力仿真在 `workers/graph-force-worker.ts` 中跑 |
| 知识空间 | `components/canvas/CanvasView.tsx` | 属性/时间图层、节点布局和默认可见的正交连接线路由 |
| 看板 | `components/KanbanPanel.tsx` | 任务列、拖拽、AI 分析 |
| 阅读收件箱 | `components/reader/ReaderInboxView.tsx` | 外部阅读材料 triage |
| 长期上下文面板 | `components/long-context/*` | 当前笔记相关上下文、关系卡片、轮播布局和长期上下文徽标 |
| 维护队列 | `components/maintenance/MaintenanceQueuePanel.tsx` | 知识维护项列表、筛选、修复入口，以及当前笔记相关上下文页签 |
| Agent 运行面板 | `components/agent/AgentRunPanel.tsx` | Agent 计划、步骤执行、回滚、重试和反思入口 |
| 主动建议 | `components/proactive/NotificationCenter.tsx` / `ProactiveToast.tsx` / `ProactivePreferences.tsx` | 通知中心、toast、偏好设置和批量响应 |
| 工具结果面板 | `components/tool-surface/ToolResultPanel.tsx` | 命令面板或编辑器工具调用后的结构化结果展示 |
| 观测面板 | `components/observability/LongContextDebugPanel.tsx` | 长期上下文 pack、指标和趋势调试 |
| 设置 | `components/settings/Settings.tsx` | AI、同步、主题、快捷键、插件等设置 |

## 11. 状态管理

Zustand stores 位于 `packages/renderer/src/stores/`。

| Store | 责任 |
| --- | --- |
| `vault-store.ts` | 当前 vault、最近 vault、文件树刷新 |
| `editor-store.ts` | 当前文件、打开标签、内容、保存状态 |
| `ui-store.ts` | 主视图、侧栏/右栏、面板宽度、命令面板、搜索、设置和维护面板子页签 |
| `sync-store.ts` | 同步状态、最后同步时间、错误 |
| `toast-store.ts` | toast 队列 |
| `activity-bar-store.ts` | 左侧活动栏条目 |
| `keybinding-store.ts` | 快捷键配置 |
| `proactive-store.ts` | 主动建议列表、抽屉状态、单条/批量响应 |

设计原则：

- 需要跨组件共享的 UI 状态放 Store。
- 和单个组件强相关的临时状态留在组件内部。
- vault 相关 UI 偏好要按 vault scope 持久化。

## 12. 文件、导入和导出

### 12.1 文件服务

`packages/main/src/ipc/file.ipc.ts` 和相关服务处理：

- 文件读写。
- 新建、删除、重命名、移动。
- 图片保存。
- 版本历史快照。
- 回收站。
- 单文件加密/解密。
- 文档文本提取。

### 12.2 导入器

| 导入器 | 文件 | 说明 |
| --- | --- | --- |
| Obsidian | `obsidian-importer.ts` | 导入 vault，转换 callout、CSS 类、Markdown 注释、`==高亮==`、Dataview inline 字段、Tasks 插件 due/scheduled/start 元数据、自定义任务状态、嵌套任务、heading/block 引用 `![[note#heading]]` / `![[note^block]]`、publish 模式的 transclusion；保留 `.canvas` 原文件并生成可索引 Markdown 地图 |
| Notion | `notion-importer.ts` | Markdown/CSV/HTML 导出转 Markdown，转换本地页面链接 |
| Readwise/Pocket | `reader-importer.ts` | 阅读材料转换为 Markdown 阅读笔记 |
| Web Clipper | `web-clipper.ts` + `browser-extension/` | 本地服务接收浏览器扩展剪藏 |

### 12.3 导出和发布

`packages/main/src/ipc/export.ipc.ts` 支持：

- 当前笔记导出 HTML。
- 当前笔记导出 PDF。
- 分享 HTML 复制到剪贴板。
- 整个 vault 发布为静态站点，保留目录索引、搜索和 wikilink 跳转。

## 13. 云同步

同步服务位于 `packages/main/src/services/cloud/`，IPC 位于 `packages/main/src/ipc/cloud.ipc.ts`。

Provider 文件：

- `supabase-provider.ts`
- `icloud-provider.ts`
- `onedrive-provider.ts`
- `webdav-provider.ts`
- `s3-provider.ts`

同步能力：

- 多后端配置和切换。
- 登录/授权和连接测试。
- push/pull/pull-all/sync。
- 冲突检测。
- 排除路径。
- 在线状态和离线队列。
- 索引数据库同步。

## 14. 插件、模板、主题和 CSS 片段

Nexusky 支持 vault 级可扩展内容：

- 插件：`.nexusky/plugins/*.json`，由 `plugin.ipc.ts` 读取，命令可出现在命令面板并投递到 AI 工作台。
- 模板：内置模板、市场模板、社区模板包，由 `template.ipc.ts` 管理。
- 主题包和 CSS 片段：渲染进程启动或 vault 切换时通过 `theme-packages.ts`、`css-snippets.ts` 应用。

## 15. 安全与隐私边界

项目采用本地优先策略，但仍有外部服务交互。关键边界如下：

- Markdown 文件默认保存在用户本地 vault。
- SQLite 索引是本地派生数据。
- API Key 等敏感配置优先通过 Electron safeStorage 加密存储（`enc:v3:`，由 Keychain / DPAPI / libsecret 接管）；若系统密钥库不可用，则回退到便携式 AES-256-GCM（`enc:v2:`）。`get()` 命中旧版本会自动透明升级到当前最强方案。
- 渲染进程通过 preload 受控访问主进程能力。
- AI 请求会发送用户输入、检索到的笔记片段或附件文本给用户配置的 Provider。
- 云同步会把文件或索引上传到用户配置的后端。
- AI Markdown 输出经 DOMPurify 消毒后渲染。

开发新功能时应避免：

- 在渲染进程直接使用 Node 文件系统 API。
- 把 vault 外路径传给写操作。
- 在日志中输出完整 API Key、token 或用户私密文件全文。
- 把 AI 生成内容未经确认直接覆盖用户文件，除非该 workflow 已明确设计为自动写入。

## 16. 开发命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

常见说明：

- `pnpm dev` 启动 Electron + Vite 开发环境。
- `pnpm typecheck` 依次检查 shared、main、renderer。
- `pnpm test` 通过 `scripts/vitest-electron.mjs` 在 Electron 运行时下跑 Vitest。
- `pnpm run rebuild` 调用 `scripts/rebuild-native.mjs` 按 Electron（Node 22 ABI）重编译本地 SQLite 原生模块；`postinstall` 会自动跑一次。不要使用 `pnpm rebuild better-sqlite3`，那会按系统 Node 编译，可能重新触发 `NODE_MODULE_VERSION` 不匹配。
- `pnpm cli` 调用 `scripts/nexusky-cli.mjs`，提供 vault 维护和批量索引等离线命令。

## 17. 新增功能时的代码导航

### 17.1 新增一个 IPC 能力

1. 在 `packages/shared/src/types/ipc.ts` 增加通道类型。
2. 在对应的 `packages/main/src/ipc/*.ipc.ts` 注册 handler。
3. 如需业务逻辑，放到 `packages/main/src/services/*`。
4. 在渲染进程通过 `window.api.invoke(...)` 调用。
5. 增加或更新测试。

### 17.2 新增一个编辑器能力

1. 查看 `components/editor/Editor.tsx`、`EditorToolbar.tsx` 和 `extensions/`。
2. 如果涉及 Markdown 语法，检查 shared markdown 工具和 tiptap-markdown 序列化。
3. 若保存后影响搜索/图谱，确认 `db:index-file` 或文件 watcher 会更新索引。

### 17.3 新增一个 AI 工具

1. 在 `packages/main/src/ipc/tools/agent-tools.ts` 增加工具 schema。
2. 在 `packages/main/src/ipc/tools/execute-tool-call.ts` 或对应 service 中实现执行逻辑。
3. 用 `search-results.ts` 等 formatter 保持工具输出稳定。
4. 在 `tool-labels.ts` 或 tool-surface 文案中增加前端状态文案。
5. 为参数解析、输出格式或边界情况加测试。

### 17.4 新增一个数据库字段或表

1. 修改 `database.ts` schema。
2. 增加迁移逻辑和 `SCHEMA_VERSION`。
3. 更新相关 service 查询。
4. 增加数据库/索引测试。

### 17.5 新增一个右侧面板或主视图

1. 新组件放 `components/` 或子目录。
2. 在 `App.tsx` lazy import。
3. 在 `ui-store.ts` 扩展 view/panel 状态。
4. 在活动栏、命令面板或菜单中增加入口。
5. 如果依赖当前文件，参考 `FILE_REQUIRED_RIGHT_PANELS` 的行为。

## 18. 测试覆盖地图

当前测试集中在主进程服务、共享工具和部分前端状态。

常见测试文件：

| 测试 | 覆盖 |
| --- | --- |
| `tests/indexer.test.ts` | Markdown 索引、链接、标签、属性、任务 |
| `tests/ai-note-lookup.test.ts` | AI 工具定位笔记 |
| `tests/ai-note-plan.test.ts` | AI 批量笔记规划清洗 |
| `tests/ai-note-writing.test.ts` | 批量生成笔记的 wikilink/metadata 合并 |
| `tests/ai-maintenance-queue.test.ts` | 知识维护队列分类、过滤、优先级排序 |
| `tests/maintenance-apply-fix.test.ts` / `maintenance-queue-ipc.test.ts` | 维护队列 IPC 与自动修复 |
| `tests/ai-connection-opportunities.test.ts` | 跨笔记链接建议 |
| `tests/ai-graph-insights.test.ts` | 图谱派生指标 |
| `tests/ai-system-context.test.ts` | 系统上下文拼装 |
| `tests/ai-flashcards.test.ts` | 闪卡生成、解析和 SRS 写回 |
| `tests/ai-tool-arguments.test.ts` / `ai-tool-limits.test.ts` / `ai-tool-labels.test.ts` | Agent 工具参数/限制/前端标签 |
| `tests/ai-transcription.test.ts` | 语音转写参数与错误归一 |
| `tests/ai-provider-types.test.ts` / `provider-errors.test.ts` | Provider 类型与错误归一 |
| `tests/ai-search-results.test.ts` / `ai-json.test.ts` | 检索结果和 JSON 解析 |
| `tests/chat-panel.test.ts` / `chat-session-title.test.ts` / `chat-batch-*.test.ts` / `chat-edit-stream.test.ts` | ChatPanel、批量与编辑流隔离行为 |
| `tests/agent-*.test.ts` | Agent planner、store、executor、IPC 类型 |
| `tests/proactive-*.test.ts` | 主动建议 schema、store、触发器、策略、orchestrator、偏好、通知中心和 IPC 类型 |
| `tests/long-context-*.test.ts` | 长期上下文 schema、候选、分类、ranker、store、pack、后台任务、认知回顾、偏好、指标和 UI helper |
| `tests/search-index.test.ts` | 分块与本地词法检索 fallback |
| `tests/file-path.test.ts` / `file-tree-refresh.test.ts` | 路径安全与文件树刷新 |
| `tests/markdown-comments.test.ts` / `markdown-highlights.test.ts` / `callouts.test.ts` / `footnotes.test.ts` / `frontmatter.test.ts` / `table-formulas.test.ts` | Markdown 兼容渲染特性 |
| `tests/obsidian-importer.test.ts` / `obsidian-link.test.ts` / `notion-importer.test.ts` / `reader-importer.test.ts` | 各导入器 |
| `tests/publish-wikilinks.test.ts` / `wikilink.test.ts` | wikilink 解析与发布 |
| `tests/backlinks-panel.test.ts` / `related-context-panel.test.ts` | 链接概览默认折叠、相关上下文布局和轮播 helper |
| `tests/canvas-view.test.ts` | 知识空间画布、连接线路由和拖拽时轻量路由 |
| `tests/graph-modes.test.ts` / `graph-ui.test.ts` | 图谱数据模式、group/folder-scope 钻取、布局缓存、默认降噪和过滤 helper |
| `tests/reader-inbox.test.ts` | 阅读收件箱 |
| `tests/vault-store.test.ts` / `tests/ui-store.test.ts` / `activity-bar-registry.test.ts` | Zustand store 行为 |
| `tests/tool-surface-*.test.ts` | 工具 surface 注册、命令面板入口、编辑器上下文菜单和 IPC 类型 |
| `tests/s3-provider.test.ts` / `webdav-provider.test.ts` / `storage.test.ts` | 云同步 Provider |
| `tests/web-clipper.test.ts` / `plugin-api.test.ts` / `nexusky-cli.test.ts` / `version.test.ts` / `crash-reporting.test.ts` / `db-query-cache.test.ts` / `document-text.test.ts` / `document-attachment.test.ts` / `vault-indexer.test.ts` / `note-search.test.ts` / `writing-style.test.ts` / `ai-task-control.test.ts` | 其他子系统 |

合入前至少运行：

```bash
pnpm typecheck
pnpm test
```

## 19. AI Agent 快速上下文

如果你是 AI agent，处理本项目时优先记住：

- 真实笔记在 vault 文件系统，SQLite 是索引。
- IPC 类型权威来源是 `packages/shared/src/types/ipc.ts`。
- 主进程业务逻辑大多在 `packages/main/src/services/`。
- 前端入口是 `packages/renderer/src/App.tsx`。
- AI 面板核心是 `packages/renderer/src/components/ai/ChatPanel.tsx`。
- AI 后端核心是 `packages/main/src/ipc/ai.ipc.ts` 和 `packages/main/src/services/ai/`。
- Agent run 后端核心是 `packages/main/src/services/agent/` 和 `packages/main/src/ipc/agent.ipc.ts`。
- 主动建议后端核心是 `packages/main/src/services/proactive/` 和 `packages/main/src/ipc/proactive.ipc.ts`。
- 长期上下文后端核心是 `packages/main/src/services/long-context/`。
- 索引核心是 `packages/main/src/services/indexer.ts` 和 `database.ts`。
- 文件写入要走 IPC，并保持 vault 路径安全。
- 修改用户笔记的 workflow 要特别注意未保存内容、取消状态和重复写入。
- 改 UI 后要考虑桌面窗口、右侧面板、窄宽度、长文本溢出和持久化状态。

## 20. 术语表

| 术语 | 含义 |
| --- | --- |
| vault | 用户选择的知识库根目录 |
| note | 一个 Markdown 笔记文件 |
| wikilink | `[[目标笔记]]` 形式的内部链接 |
| backlink | 指向当前笔记的其他笔记链接 |
| unlinked mention | 提到当前标题但没有写成 wikilink 的文本 |
| inferred link | AI 根据语义推断出的非显式链接 |
| chunk | 为本地相关检索拆出的笔记片段 |
| provider | OpenAI/Claude/Ollama/自定义等 AI 服务配置 |
| Agent | 可调用工具读取和分析 vault 的 AI 对话模式 |
| Agent run | 独立 Agent 任务运行记录，包含计划、步骤状态、结果和回滚数据 |
| edit mode | AI 生成或修改 Markdown 文件的模式 |
| batch generation | AI 根据主题规划目录并批量生成多篇笔记 |
| memory | `.nexusky/memories` 下的笔记语义摘要和概念数据 |
| maintenance queue | `plan_knowledge_maintenance` 工具生成的、按类型聚合的可执行维护项列表 |
| proactive suggestion | 基于长期上下文或维护信号生成的主动建议通知 |
| bridge note | 连接多个语义主题、删除后会让图谱割裂的关键笔记 |
| connection opportunity | 基于共同属性/标签等信号发现的、值得用 wikilink 显式串起来的潜在关联 |
| kanban plan | 看板 AI 工作流先生成、用户可编辑、确认后才写入数据库的中间结果 |
| GraphMode | `db:get-graph` 的数据模式：`folder`、`semantic`、`connection`、`group`、`folder-scope` |
| tool surface | 命令面板、编辑器上下文菜单等可触发结构化 AI 工具的前端入口 |

## 21. 与其他文档的关系

- `README.md`：项目入口、快速开始和高层介绍。
- `PRODUCT.md`：产品取舍、ActivityBar 调整和 Canvas/Kanban/Agent 入口决策。
- `docs/PROJECT_ANALYSIS_2026-05.md`：当前缺陷清单、优先级和修复进度。
- `docs/P0_FIX_TICKETS_2026-05.md`：数据安全、安全链和 P1 速修工单。
- `docs/PLUGIN_COMMANDS.md`：插件命令格式。
- `docs/WEB_CLIPPER.md`：浏览器剪藏功能说明。
- `docs/PRODUCT_STRATEGY_ANALYSIS.md`：产品方向和策略分析。
- `docs/PROJECT_AUDIT.md`：历史项目审计记录。
- 本文：面向开发者和 AI 的代码/功能全景索引。

## 22. v0.4.0 及之后的增量索引

本节面向"已读过旧版 OVERVIEW（核对版本 `09f55cb`）"的读者，列出 `09f55cb..cb6a1f3` 之间引入的关键变化，便于增量更新心智模型。

### 22.1 知识维护与 AI 主动建议

- 新增 `services/ai/maintenance-queue.ts`：构造 `KnowledgeMaintenanceItem[]`，覆盖 19 种维护类型（链接、任务、孤岛、空/超长笔记、重复标识、缺失属性、待复习记忆、桥接等），同时导出大量按路径分组的辅助函数，被 `db.ipc.ts` 和 Agent 工具复用。
- 新增 `services/ai/connection-opportunities.ts`：基于属性共现等信号给出 `suggest_note_links`。
- 新增 `services/ai/graph-insights.ts`：图谱派生指标。
- AI Agent 增加 `plan_knowledge_maintenance` 和 `list_knowledge_bridges` 两个工具，前端 `tool-labels.ts` 同步增加状态文案。
- 新增 `maintenance:*` IPC 与 `MaintenanceQueuePanel`，把维护队列从 Agent 工具扩展为可直接浏览和应用修复的主视图。
- 新增主动建议系统：schema v10、触发器、策略、orchestrator、偏好页、toast、通知中心和 `proactive:*` IPC。通知中心后来补上了 `proactive:respond-all`，支持全部已读和全部删除。

### 22.2 Obsidian 兼容性大幅增强

- 高亮 `==text==` 渲染与导入。
- Markdown 注释 `%% ... %%`：渲染时隐藏、索引时跳过注释内部的链接/提及/属性、不参与 publish 搜索、不被当作 inline property。
- Heading / block 引用：`[[note#heading]]`、`[[note^block]]` 解析、嵌入预览、嵌入展开和 publish 转载。
- Dataview inline 字段：写入并索引，含自定义任务的字段。
- Tasks 插件：识别 due/scheduled/start 日期、优先级、循环、阻塞，并由维护队列消费。
- 自定义任务状态字符（`x`、`/`、`-` 等）的索引与渲染。
- 嵌套任务索引。
- 修复一系列细节：忽略 image alt 文本中的 wikilink 与未链接提及、忽略 URL 片段被识别为标签、忽略 code block 中的链接/提及、清理 Obsidian frontmatter 兼容问题。

### 22.3 Kanban 工作流升级

- 视觉与交互大改（卡片、列表、任务录入、画布样式）。
- AI 工作流（分析、任务拆解、笔记转看板、按笔记任务批量导入）现在统一先生成 `KanbanAiPlan` 预览，前端可编辑、确认后再写入数据库；解析、类型与错误处理全面收紧。

### 22.4 批量笔记生成稳定性

- Plan 阶段：用户可编辑、增行、确认后再执行。
- 生成笔记带 metadata、wikilink 自动补全 / 合并 related 段、避免重复段落。
- 进度与停止：`requestId` / `operationId` 严格隔离过期请求；停止流可取消 retry、queued planning、stale edit stream、stale chat sources、stale chat requests，避免误报完成。

### 22.5 兼容与运行时

- Vault 旧库自我修复：`getDatabase` 在打开时双向修复历史缺列；脏 `links` 行被清理；切换或创建 vault 时关闭旧连接并清空查询缓存。
- 升级到 Electron 39；新增 `scripts/rebuild-native.mjs` 与对应 `postinstall`，并修复 Windows 版本的原生模块重建与安装。CI 上 Windows 跳过原生 smoke test（见 `5399436`）。

### 22.6 长期上下文系统

- 新增 schema v9：`context_events`、`ai_relations`、`long_term_themes`、`theme_memberships`、`relation_feedback`。
- 新增本地关系候选、关系分类、关系评分衰减、长期主题抽取、认知回顾、上下文包构建和后台分析。
- 前端增加 `RelatedContextPanel`、`RelatedContextCard`、`LongContextBadge`、`LongContextDebugPanel`、`ChatSourceRow` 和趋势 sparkline。
- 聊天上下文包默认 token 预算提高到 3000，并增加偏好设置、inspect-pack IPC、来源 Why? popover 和长期上下文指标。

### 22.7 Agent Run 与工具 surface

- 新增 schema v11：`agent_runs` / `agent_steps`。
- 新增 Agent planner、store、executor、reflector、tool-runner 和 `agent:*` IPC。
- 前端新增 `AgentRunPanel`，保留 Command Palette、Chat/Kanban hand-off 等入口，不再占用 ActivityBar 默认导航位。
- AI IPC 被拆分为 provider、transcribe、complete、edit、text-tools、notes、graph 等模块；stream/abort 公共逻辑抽到 `ipc/streams/consume-stream.ts`。
- Agent tool 定义和执行从 `ai.ipc.ts` 抽到 `ipc/tools/agent-tools.ts` 和 `ipc/tools/execute-tool-call.ts`。
- 新增 tool surface registry、`ai:run-tool` / `ai:list-tool-surface`、命令面板工具入口、编辑器上下文菜单和结构化结果抽屉。

### 22.8 图谱性能与默认视图

- `db:get-graph` 增加 `GraphMode`：先加入 `folder`、`semantic`、`connection` 并默认保持 folder 兼容，后续又加入 `group`、`folder-scope` 支持分组总览和目录钻取。
- `links.link_type` 区分 explicit / inferred / folder，图谱用不同样式展示边类型。
- D3 force simulation 移到 renderer Web Worker，重进同一 vault/mode 时复用布局缓存，重图谱跳过昂贵 SVG filter 和渐变。
- GraphView 默认降噪：隐藏普通标签、孤立节点、AI 推断边和目录归属边；目录归属不再计入关系连接数，只用于分组与着色。
- 自动 TF-IDF / memory-backed 图谱相关改动让语义模式和记忆关系能参与图谱数据；当前主 UI 已切换为 group 总览 + folder-scope 目录钻取，见 22.11。

### 22.9 安全、质量门禁与发布

- 安全边界增强：BrowserWindow sandbox、safeStorage `enc:v3:`、外链 scheme allowlist、日志/崩溃上报脱敏、preload send allowlist、vault symlink escape 防护、高风险 IPC payload 校验、HTTP WebDAV 警告。
- 新增 `.github/workflows/ci.yml`，在 push/PR 上跑 typecheck 与 test 质量门禁。
- 版本号推进到 `0.5.0`。

### 22.10 文档与配套

- `docs/PROJECT_OVERVIEW.md`（本文）：随 22 节增量演进。
- `README.md`、`PRODUCT.md`、`docs/PROJECT_ANALYSIS_2026-05.md`、`docs/P0_FIX_TICKETS_2026-05.md` 在同一周期内同步更新。
- 保留 `docs/PRODUCT_STRATEGY_ANALYSIS.md` 和 `docs/PROJECT_AUDIT.md` 作为策略与历史审计背景。

### 22.11 `ac7dee4..cb6a1f3` 最新回写

- 图谱新增 `group` 与 `folder-scope` 两种数据模式。当前 `GraphView` 默认打开顶层分组总览，点击目录节点后按 `rootPath` 懒加载一层目录；深层子目录以 folder 节点聚合，跨可见节点的 explicit / inferred 关系会按可见 owner 聚合成边。`db:get-graph` 的缓存 key 同步纳入 `mode` 和 `rootPath`。
- 知识空间连接线体验修复：属性/时间图层进入时会先种下所有可见边和关联建议的轻量正交路由，再交给 `canvas-route-worker.ts` 做绕卡片的精细路由；拖拽时用轻量路线保持反馈，完成后再刷新 worker 路由，避免连接线默认不可见或使用过期锚点。
- 当前笔记相关上下文从正文上方的内联区域调整为右侧维护面板的 `context` 页签，编辑器状态栏提供"相关上下文"入口；`RelatedContextPanel` 支持 top / side 轮播布局，维护队列和相关上下文共享同一个 `maintenance` 右侧面板。
- 编辑器底部的链接概览默认折叠，每次切换当前文件都会恢复折叠状态，只在用户主动展开时显示出链、反链和未链接提及。
- 左侧活动栏将维护入口设为默认可见，命令面板、activity bar registry、`ui-store` 和中英文 i18n 同步适配维护面板子页签。
- README 被压缩为当前能力、技术栈、开发命令、文档入口和安全边界的高层入口；旧 `docs/FEATURES.md` 已移除，overview 和 README 不再引用它。
- `website/` 首页重做为 Nexusky v0.5.0 官网与下载入口，使用 `public/product/icon.png`，展示本地 Markdown、长期上下文、AI 工具、图谱和下载链接；Next.js 中间件文件迁移为 `proxy.ts`，`website/README.md` 同步说明日志后台、环境变量和首页资产。
