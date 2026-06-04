# Nexusky

Nexusky 是一个本地优先的 AI 知识库桌面应用。它把普通 Markdown 文件夹作为真实数据源，用 SQLite 建立索引，用 Electron + React 提供编辑、搜索、图谱、任务和 AI 工作流。

核心目标很直接：让你的笔记可以长期保存在自己控制的文件系统里，同时让 AI 能在需要时读取、连接、维护和解释这些知识。

## 当前能力

- **本地 Markdown vault**：笔记、附件和私有元数据都在本地文件夹中，SQLite 只做索引和派生状态。
- **编辑器与 Obsidian 兼容**：TipTap 富文本编辑，支持 wikilink、frontmatter、Dataview inline 字段、Tasks 插件日期、callout、脚注、嵌入、KaTeX 和 Mermaid。
- **知识网络**：反链、出链、未链接提及、知识图谱、知识空间和属性数据库围绕同一个 vault 运转。
- **AI 工作台**：支持 OpenAI、Claude、Ollama、自定义 OpenAI 兼容接口和 Codex CLI；提供 RAG 问答、AI 编辑、批量笔记生成、闪卡和 Agent 工具。
- **长期上下文**：系统会沉淀关系、主题和认知复盘，把 Hot / Warm / Cold context 注入 AI 对话，并解释来源。
- **主动建议与维护队列**：基于长期上下文、任务、孤岛笔记、断链和重复标题等信号，生成可处理的维护建议。
- **任务与看板**：从 Markdown task list 抽取任务，也支持独立看板、任务关系和 AI 预览式写入。
- **导入、剪藏、同步与发布**：支持 Obsidian、Notion、Readwise、Pocket、Web Clipper、Supabase、iCloud、OneDrive、WebDAV、S3、HTML/PDF 导出和静态站点发布。

## 技术栈

| 层 | 当前实现 |
| --- | --- |
| 桌面 | Electron 39，原生模块按 Electron 运行时重建 |
| 构建 | electron-vite + Vite 6 |
| 前端 | React 19、Zustand、i18next、Tailwind CSS 4 |
| 编辑器 | TipTap / ProseMirror、tiptap-markdown |
| Markdown | marked、DOMPurify、KaTeX、Mermaid、lowlight |
| 数据 | better-sqlite3，WAL，FTS5 |
| AI | OpenAI、Anthropic、Ollama、自定义 OpenAI 兼容接口、Codex CLI |
| 测试 | Vitest，在 Electron 运行时执行 |

## 仓库结构

```text
packages/
  main/                 Electron 主进程、IPC、数据库、索引、AI、同步服务
  renderer/             React 渲染进程、编辑器、图谱、AI 面板、设置和状态
  shared/               IPC 类型、Markdown 工具和共享类型

browser-extension/      Chromium Web Clipper 扩展
docs/                   项目全景、指南、设计、优化和规划文档
image/                  产品截图和文档图片
resources/              应用图标等资源
scripts/                开发、重建原生模块、CLI、打包辅助脚本
supabase/               Supabase schema 与配置说明
tests/                  Vitest 测试
website/                Next.js 官网和日志后台
```

## 开发

要求：

- Node.js 22
- pnpm 10
- 当前平台可编译 `better-sqlite3` 原生模块

常用命令：

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

说明：

- `pnpm dev` 启动 Electron + Vite 开发环境。
- `pnpm test` 通过 `scripts/vitest-electron.mjs` 在 Electron 运行时跑测试。
- `pnpm rebuild` 会调用 `scripts/rebuild-native.mjs`，按 Electron ABI 重建 `better-sqlite3`。
- 不要用普通 `pnpm rebuild better-sqlite3` 替代项目脚本，否则可能按系统 Node ABI 编译。

官网子项目：

```bash
pnpm -C website install
pnpm -C website run dev
pnpm -C website run lint
pnpm -C website run build
```

## 文档入口

- [项目全景文档](docs/PROJECT_OVERVIEW.md)：给维护者和 AI agent 的代码导航与系统说明。
- [产品上下文](PRODUCT.md)：当前产品取舍、ActivityBar 调整、Canvas/Kanban/Agent 入口决策。
- [项目分析与修复记录](docs/PROJECT_ANALYSIS_2026-05.md)：当前缺陷清单、优先级和修复进度。
- [P0 修复工单](docs/P0_FIX_TICKETS_2026-05.md)：数据安全、安全链和 P1 速修工单。
- [迁移指南](docs/MIGRATION_GUIDE.md)：Markdown/Obsidian vault 安全打开、备份、忽略规则和 AI 数据边界。
- [10k+ vault 性能回归](docs/10K_VAULT_PERFORMANCE_REGRESSION.md)：大 vault fixture 生成、手动 UI 回归和可选服务级 smoke 测试。
- [同步灾难恢复演练](docs/SYNC_DISASTER_RECOVERY_DRILL.md)：本地 fake remote fixture、删除/覆盖/冲突恢复路径和发布前回归标准。
- [Web Clipper](docs/WEB_CLIPPER.md)：浏览器剪藏扩展和本地接口说明。
- [本地插件 API](docs/PLUGIN_COMMANDS.md)：声明式插件命令、面板和编辑器扩展格式。
- [产品未来发展与功能升级](docs/PRODUCT_FUTURE_AND_UPGRADE_PLAN_2026-06-03.md)：基于 v0.8.2 当前状态的下一阶段产品方向、现有功能升级、路线图和指标体系。
- [产品策略分析](docs/PRODUCT_STRATEGY_ANALYSIS.md)：产品方向、目标用户和体验策略。
- [历史项目审计](docs/PROJECT_AUDIT.md)：早期工程审计记录和历史问题背景。

## 安全边界

- Markdown 文件是主数据，SQLite 是本地索引。
- 渲染进程通过 preload 暴露的受控 IPC 访问主进程。
- 文件写入必须限制在当前 vault 内，并处理 symlink 逃逸风险。
- API Key 等敏感数据优先使用 Electron `safeStorage` 加密。
- AI 请求会把用户输入、检索片段或附件文本发送给用户配置的 Provider。
- 云同步只会上传到用户显式配置的后端。

## License

MIT
