# Nexusky 项目全景文档

> 面向人类维护者和 AI agent 的项目说明。本文根据当前代码结构与功能实现整理，适合作为需求理解、代码导航、二次开发和自动化分析的上下文入口。

最后核对版本：`26bd7f9`

## 1. 一句话理解

Nexusky 是一个 Electron 桌面端、本地优先的 Markdown 知识库笔记应用。它把文件系统中的 Markdown vault 作为真实数据源，用 SQLite 建立索引，用 React/TipTap 提供编辑体验，并在 AI 对话、编辑、批量生成、语义搜索、知识图谱、看板、闪卡和阅读收件箱等工作流中接入多种 AI Provider。

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

- 全文搜索和语义搜索。
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

## 4. 技术栈

| 层 | 当前实现 |
| --- | --- |
| 桌面容器 | Electron 33 |
| 构建 | electron-vite + Vite 6 |
| 前端 | React 19、Zustand、i18next |
| 编辑器 | TipTap / ProseMirror、tiptap-markdown |
| Markdown 渲染 | marked、DOMPurify、KaTeX、Mermaid、lowlight |
| 图谱/知识空间 | D3 force / drag / zoom |
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
scripts/                开发/CLI 脚本
supabase/               Supabase schema 和部署说明
browser-extension/      Web Clipper 浏览器扩展
website/                项目相关网站/日志页面
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
- 注册 `file`、`vault`、`db`、`ai`、`template`、`cloud`、`export`、`plugin` IPC。
- 初始化自动更新。
- 启动 Web Clipper 本地服务。
- 注册全局快捷键 `CommandOrControl+Shift+N`。
- 在退出时停止服务并刷新持久化 store。

### 6.2 Preload 桥接

`packages/main/src/preload.ts` 通过 `contextBridge.exposeInMainWorld` 暴露 `window.api`。渲染进程不能直接访问 Node API，只能通过受控 IPC 调用主进程。

关键点：

- `invoke` 使用 `IPCChannelMap` 做类型约束。
- 事件订阅包括文件变化、vault 变化、AI stream、AI sources、AI edit stream、图谱进度、笔记生成进度、记忆生成进度、embedding 进度、更新器事件等。
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

`packages/main/src/services/database.ts` 负责为每个 vault 创建和迁移 SQLite 数据库。

主要表：

| 表 | 用途 |
| --- | --- |
| `notes` | 笔记基础索引：id、title、file_path、时间、content_hash |
| `links` | wikilink 和 AI 推理链接，包含 source、target、context、line、link_type |
| `tags` / `note_tags` | 标签与笔记关系 |
| `note_aliases` | frontmatter alias / aliases |
| `notes_fts` / `notes_fts_map` | SQLite FTS5 全文搜索 |
| `chunks` | 分块文本和 embedding 数据 |
| `tasks` | Markdown task list 抽取结果 |
| `kanban_columns` / `kanban_tasks` / `kanban_task_relations` | 看板数据 |
| `conversations` / `chat_sessions` | AI 对话历史与多会话 |
| `schema_version` | 数据库迁移版本 |

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
| `db:*` | 索引、搜索、图谱、反链、属性、对话历史、embedding 状态 |
| `flashcards:*` | 到期闪卡队列和评分写回 |
| `kanban:*` | 看板列、任务、关系、AI 分析和拆解 |
| `ai:*` | Provider、聊天、Agent、编辑、批量笔记、摘要、闪卡、标签、语音转写 |
| `template:*` | 内置/市场/社区模板 |
| `plugins:*` | 本地插件和插件市场 |
| `cloud:*` | 云配置、登录、同步、各 Provider 配置、索引同步 |
| `export:*` | HTML、PDF、分享、发布站点 |
| `updater:*` | 更新检查、下载、安装 |

重要约束：

- 渲染进程不直接读写本地文件。
- `file:write`、`file:create`、`file:delete`、`file:rename` 等写操作应校验路径位于 vault 内。
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

### 9.4 AI 编辑

编辑模式会根据用户意图走不同路径：

- `chat`：只是提问，走普通聊天。
- `edit`：对当前文件或新文件生成修改方案。
- `batch`：批量生成多个独立笔记文件。

单文件编辑通过 `ai:edit` 返回完整 Markdown 内容，前端显示 diff/preview，用户确认后才写入文件。

### 9.5 批量生成笔记

批量生成由两层计划组成：

1. `ai:plan-note-batches`：理解用户语义，规划多个目录、主题和每个目录的篇数。
2. `ai:generate-notes`：针对一个目标目录规划标题列表，再逐篇生成 Markdown 文件。

生成后会：

- 刷新文件树。
- 索引新文件。
- 解析链接。
- 对生成文件做 AI 语义关系推断，并写入 `links` 的 inferred 关系。

停止逻辑：

- 停止按钮调用 `ai:stop`。
- 前端维护批量级取消标记。
- 用户停止后，不再继续发送后续目录生成请求。
- 取消后忽略迟到的进度事件，避免未完成进度被误标为完成。

### 9.6 文档、图片、语音和闪卡

AI 面板还支持：

- 图片附件：通过多模态 content parts 发送。
- 文档附件：`file:extract-document-text` 提取 PDF、DOCX、XLSX、CSV、TXT 等文本。
- 语音转写：`ai:transcribe`。
- 闪卡生成：`ai:generate-flashcards` 生成 Basic/Cloze 卡片，并由 `flashcards:*` 管理复习。

## 10. 主要前端模块

| 模块 | 路径 | 责任 |
| --- | --- | --- |
| 应用壳 | `packages/renderer/src/App.tsx` | 布局、全局事件、视图切换、懒加载 |
| 编辑器 | `components/editor/Editor.tsx` | TipTap 编辑、保存、渲染增强、状态栏 |
| 工具栏 | `components/editor/EditorToolbar.tsx` | 格式操作、预览、导出、语音等入口 |
| 属性面板 | `components/editor/PropertiesPanel.tsx` | frontmatter 可视化编辑 |
| AI 面板 | `components/ai/ChatPanel.tsx` | 对话、编辑、批量生成、附件、session |
| 消息气泡 | `components/ai/MessageBubble.tsx` | Markdown 渲染、复制、来源 |
| 文件树 | `components/sidebar/FileTree.tsx` / `VirtualFileTree.tsx` | 文件导航、拖拽、右键菜单、虚拟滚动 |
| 命令面板 | `components/CommandPalette.tsx` | 功能命令、AI 快捷任务、导入/导出入口 |
| 搜索 | `components/SearchPanel.tsx` | 全文/语义搜索、embedding 进度 |
| 图谱 | `components/graph/GraphView.tsx` | D3 知识图谱 |
| 知识空间 | `components/canvas/CanvasView.tsx` | 无限画布、图层、节点布局 |
| 看板 | `components/KanbanPanel.tsx` | 任务列、拖拽、AI 分析 |
| 阅读收件箱 | `components/reader/ReaderInboxView.tsx` | 外部阅读材料 triage |
| 设置 | `components/settings/Settings.tsx` | AI、同步、主题、快捷键、插件等设置 |

## 11. 状态管理

Zustand stores 位于 `packages/renderer/src/stores/`。

| Store | 责任 |
| --- | --- |
| `vault-store.ts` | 当前 vault、最近 vault、文件树刷新 |
| `editor-store.ts` | 当前文件、打开标签、内容、保存状态 |
| `ui-store.ts` | 主视图、侧栏/右栏、面板宽度、命令面板、搜索、设置 |
| `sync-store.ts` | 同步状态、最后同步时间、错误 |
| `toast-store.ts` | toast 队列 |
| `activity-bar-store.ts` | 左侧活动栏条目 |
| `keybinding-store.ts` | 快捷键配置 |

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
| Obsidian | `obsidian-importer.ts` | 导入 vault，转换 callout，索引属性、别名和链接 |
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
- API Key 等敏感配置通过 Electron safeStorage 加密存储。
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
- `pnpm test` 运行 Vitest 全量测试。
- `pnpm rebuild better-sqlite3` 可在 Node ABI 不匹配时重编译本地 SQLite 原生模块。

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

1. 在 `ai.ipc.ts` 的 Agent tool 定义中加工具 schema。
2. 在工具执行分支中调用 indexer/search/memory 等服务。
3. 用 `search-results.ts` 格式化输出。
4. 在 `tool-labels.ts` 增加前端状态文案。
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
| `tests/ai-flashcards.test.ts` | 闪卡生成、解析和 SRS 写回 |
| `tests/ai-tool-arguments.test.ts` | Agent 工具参数解析 |
| `tests/embedding.test.ts` | 分块、相似度和语义搜索 fallback |
| `tests/file-path.test.ts` | 路径安全 |
| `tests/*importer.test.ts` | Obsidian、Notion、Reader 导入 |
| `tests/chat-panel.test.ts` | ChatPanel 局部行为 |
| `tests/vault-store.test.ts` / `tests/ui-store.test.ts` | Zustand store 行为 |

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
| chunk | 为语义搜索拆出的笔记片段 |
| provider | OpenAI/Claude/Ollama/自定义等 AI 服务配置 |
| Agent | 可调用工具读取和分析 vault 的 AI 对话模式 |
| edit mode | AI 生成或修改 Markdown 文件的模式 |
| batch generation | AI 根据主题规划目录并批量生成多篇笔记 |
| memory | `.nexusky/memories` 下的笔记语义摘要和概念数据 |

## 21. 与其他文档的关系

- `README.md`：项目入口、快速开始和高层介绍。
- `docs/FEATURES.md`：详细功能清单和版本演进记录。
- `docs/GUIDE.md`：面向用户的使用指南。
- `docs/DESIGN.md`：视觉和交互设计方向。
- `docs/PLUGIN_COMMANDS.md`：插件命令格式。
- `docs/WEB_CLIPPER.md`：浏览器剪藏功能说明。
- 本文：面向开发者和 AI 的代码/功能全景索引。
