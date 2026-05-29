# Nexusky 产品功能扫描与未来方向分析

> 生成日期：2026-05-28  
> 分析范围：根 Electron 桌面应用、`packages/main`、`packages/renderer`、`packages/shared`、`browser-extension`、`website`、`docs`、测试目录与现有产品文档。  
> 目标：从产品视角扫描当前项目功能，分析优缺点，给出未来产品方向和可执行路线。

## 1. 结论摘要

Nexusky 当前已经不是一个普通 Markdown 编辑器，而是一个本地优先的 AI 知识工作台。它以 Markdown vault 为数据主权层，以 SQLite/FTS/关系索引为结构化层，以 AI Chat、Agent、长期上下文、维护队列、图谱、看板、阅读收件箱等能力作为智能层。

最强的产品机会是：把 Nexusky 定位为「本地 Markdown 知识库的 AI 认知伙伴」。这个方向比单纯对标 Obsidian、Notion 或 AI Chat 更清晰，因为 Nexusky 已经具备三个稀缺资产：

- 本地 Markdown 主数据与 SQLite 派生索引，适合长期保存和迁移。
- 可解释的长期上下文、关系、主题、证据和反馈机制。
- 可执行的维护队列、Tool Surface 和 Plan-Execute-Reflect Agent。

当前最大问题不是功能不足，而是功能过多导致产品入口、激活路径和核心卖点变得分散。未来 3 到 6 个月应优先收束成一个高频闭环：打开或导入 vault -> 建立索引 -> 获得 vault health / 维护建议 -> 通过 AI 追问、编辑、连接、复盘 -> 下次继续被长期上下文和主动建议唤回。

推荐战略：

1. 短期先做「可信和可上手」，补安全边界、首启引导、AI Provider 配置、vault 健康报告。
2. 中期主打「认知伙伴闭环」，把长期上下文、维护队列、主动建议和 Agent 变成一个可感知的日常产品体验。
3. 长期再做「生态和分发」，包括插件、主题、Web Clipper、发布站点、同步后端和官网转化。

## 2. 扫描依据

本分析基于以下实际项目证据：

| 证据 | 说明 |
| --- | --- |
| `README.md` | 当前能力、技术栈、仓库结构和安全边界。 |
| `PRODUCT.md` | 产品定位：本地优先、Markdown source of truth、AI 长期上下文、维护工作流。 |
| `docs/PROJECT_OVERVIEW.md` | 系统架构、主要用户场景、数据模型、IPC 和模块说明。 |
| `docs/GUIDE.md` | 用户侧能力：编辑、链接、图谱、AI、同步、搜索、外观。 |
| `docs/COGNITIVE_PARTNER_PLAN.md` | 认知伙伴方向：Proactive AI、Tool Surface、Agent、可观测性。 |
| `docs/PROJECT_SCORE_OPTIMIZATION_PLAN.md` | 当前安全、工程、性能和发布成熟度 backlog。 |
| `packages/renderer/src/App.tsx` | 产品工作台结构：Activity Bar、主视图、右侧面板、弹层。 |
| `packages/shared/src/types/ipc.ts` | 功能边界和 IPC 能力全集。 |
| `packages/main/src/services/*` | 索引、AI、长期上下文、维护、同步、导入、发布、Agent 等服务。 |
| `browser-extension/background.js` / `docs/WEB_CLIPPER.md` | 浏览器剪藏扩展与本地 HTTP 入口。 |
| `website/src/app/page.tsx` | 官网当前定位和对外叙事。 |

## 3. 当前产品定位

### 3.1 一句话定位

Nexusky 是一个本地优先的 Markdown 知识库桌面应用，让用户在自己控制的文件夹中长期维护知识，并让 AI 能在可解释、可回滚、可审视的边界内帮助搜索、连接、写作、维护和复盘。

### 3.2 核心用户

更适合的首批用户不是轻量笔记用户，而是已经有长期知识资产、愿意维护结构、也愿意接入 AI 的高意愿用户：

| 用户类型 | 典型需求 | Nexusky 契合点 |
| --- | --- | --- |
| Obsidian / Logseq / Markdown 重度用户 | 本地文件、双链、图谱、可迁移 | Markdown vault、wikilink、反链、图谱、导入 |
| 研究者 / 写作者 / 独立开发者 | 大量材料整理、长期主题沉淀 | 阅读收件箱、长期上下文、AI 摘要、闪卡 |
| PM / 创始人 / 知识工作者 | 把想法、任务、项目串起来 | 看板、维护队列、任务抽取、Agent |
| AI power user | 希望 AI 读取个人知识而不是只看单次会话 | 多 Provider、RAG、长上下文、可观测性 |
| 隐私敏感用户 | 不想把笔记锁进云服务 | 本地优先、可选同步、自带 Provider |

### 3.3 当前产品边界

Nexusky 应明确不是：

- 不是云协作文档软件，不应短期硬拼 Notion 的团队协作和数据库生态。
- 不是纯 Markdown 编辑器，不应把价值停留在编辑器工具栏。
- 不是通用 AI Chat，不应把对话框当作唯一智能入口。
- 不是只面向程序员的 Agent 工具，它的核心数据是个人知识和任务。

## 4. 功能全景

### 4.1 工作台与信息架构

当前主界面由四层组成：

- 顶部 `TitleBar`：窗口控制、应用级入口。
- 左侧 `ActivityBar`：文件、搜索、聊天、图谱、画布、阅读、看板、维护、Agent 等入口。
- 中央主视图：编辑器、图谱、Bases、Canvas、Timeline、Reader、Kanban。
- 右侧面板：AI Chat、大纲、属性、标签、历史、维护、Agent、插件面板。

这说明产品已经具备完整的工作台形态。用户可以在同一个 vault 中完成写作、检索、图谱浏览、任务处理、AI 对话和维护。

### 4.2 Vault 与文件管理

功能覆盖：

- 打开或创建 Markdown vault。
- 文件树、浅层/递归列表、最近 vault。
- 新建、重命名、删除、回收站、恢复。
- 历史快照与恢复。
- 图片保存到 vault assets。
- 文件拖拽打开、快速切换。
- `.nexusky` 存储索引、主题、模板、插件、记忆等派生数据。

产品价值：

- 数据主权强，用户可离开应用继续用普通 Markdown 文件。
- 对 Obsidian 用户迁移成本低。

主要风险：

- 文件 IPC 边界需要更严格以主进程当前 vault 为信任源，避免渲染层被攻破后越界读写。
- 历史、回收站、导入、加密等功能都触达本地文件系统，信任叙事必须比普通云产品更严谨。

### 4.3 Markdown 编辑器

功能覆盖：

- TipTap / ProseMirror 富文本编辑，同时保持 Markdown 序列化。
- 标题、列表、任务列表、表格、引用、代码块、高亮、分割线。
- KaTeX、Mermaid、callout、脚注、注释、表格公式、frontmatter。
- Wikilink、自定义 link preview、点击不存在链接创建笔记。
- 搜索替换、预览模式、聚焦模式、多标签、分屏相关能力。
- 图片粘贴、AI 行内补全、选区 AI 写作菜单。
- 大纲、属性、标签、历史、反链/出链/未链接提及。

产品价值：

- 对 Markdown/Obsidian 生态兼容度高。
- 编辑体验与知识结构能力在同一页面闭环。

主要风险：

- 富文本和 Markdown 双向同步复杂，越强的兼容承诺越需要边界说明。
- 编辑器能力多，但新用户不一定知道「为什么要从现有工具迁移」。

### 4.4 链接、图谱与知识空间

功能覆盖：

- Wikilink 解析、别名、标题、路径、heading 变体。
- 出链、反链、未链接提及。
- D3 图谱，多种 GraphMode 类型定义：semantic、connection、folder、group、folder-scope。
- 显式链接、AI 推断链接、目录归属边分离。
- 顶层目录聚合、钻入目录、跨目录聚合边。
- GraphView 对大图有筛选、隐藏孤立节点、标签开关、worker 布局等处理。
- Canvas / Knowledge Space 支持卡片式空间、属性模式、时间模式、连接线绕开卡片、位置持久化。

产品价值：

- 图谱不是装饰，而是和链接、目录、AI 推断、维护队列连在一起。
- 「显式关系 vs AI 推断关系」分离，有助于建立信任。

主要风险：

- 图谱和知识空间存在心智负担，普通用户可能不知道何时使用。
- 如果缺少示例 vault、空状态和推荐任务，图谱容易变成一次性探索功能。

### 4.5 搜索与语义检索

功能覆盖：

- 快速切换最近笔记和标题搜索。
- 全文搜索、正则搜索、搜索历史、结果缓存。
- FTS5、本地词法相关检索、本地检索索引状态、手动重建索引。
- AI Chat 中 RAG 使用检索片段和 sources。

产品价值：

- 本地搜索是 AI 可靠回答的基础。
- Keyword、regex、semantic 三类搜索覆盖不同用户习惯。

主要风险：

- 本地检索索引不依赖 Provider；若未来重新接入真实向量检索，需要单独设计 embedding 流程和首次索引体验。
- 如果没有明确告诉用户「哪些内容会发送给 AI Provider」，会损伤隐私信任。

### 4.6 AI 工作台

功能覆盖：

- 多会话 Chat、会话标题自动生成、草稿恢复。
- 支持 OpenAI、OpenAI Responses、Claude、Ollama、本地/自定义 OpenAI 兼容接口、Codex CLI。
- 普通 Chat、Agent Chat、编辑模式、批量生成笔记。
- 附件：笔记、选区、图片、PDF、DOC/DOCX、XLS/XLSX、CSV/TSV/TXT/RTF。
- AI 编辑带 diff/preview，用户确认后写入。
- 命令面板触发 RAG、编辑当前笔记、重写选区、新建笔记、批量笔记、摘要、闪卡。
- AI 停止、取消、错误友好化。

产品价值：

- Provider 开放性强，适合高级用户和中国/海外不同模型环境。
- Preview-first 写入是正确方向，符合本地知识资产的安全心理。

主要风险：

- AI Provider 配置是强门槛，若首启没有快速检测、推荐配置、可用性测试和「无 AI 也能用」路径，激活会断。
- 当前 AI 能力很多，但没有被包装成少数高频用户任务。

### 4.7 长期上下文与认知伙伴能力

功能覆盖：

- Long-context relation store、relation discovery、ranker、classifier、theme extractor。
- Hot / Warm / Cold context pack。
- 关系类型：related_to、caused_by、evolved_from、blocked_by、inspired_by、repeated_pattern、supports_goal、conflicts_with。
- 关系反馈：useful、not_related、wrong_reason、dismissed。
- Cognitive review 生成。
- Long Context Debug / Observability 面板，metrics、prefs、pack inspect。
- RelatedContextPanel 进入维护面板的 context tab。

产品价值：

- 这是 Nexusky 最稀缺的差异化资产：AI 不只是读取当前笔记，而是能带着长期关系和证据工作。
- 可解释、可反馈、可调参，适合解决 AI 记忆不可信的问题。

主要风险：

- 目前这套能力偏「系统能力」，产品表达不够简单。
- 需要把抽象名词转成用户能感知的价值：找回旧想法、发现冲突、追踪长期目标、复盘重复问题。

### 4.8 主动建议与维护队列

功能覆盖：

- Proactive suggestions 表、策略、偏好、通知中心、toast。
- Trigger 包括长期上下文高分关系、主题接近、认知复盘、孤岛笔记、逾期任务等。
- 维护队列覆盖未解析链接、孤岛笔记、空笔记、重复标题/别名、缺失属性、过期任务、高优先级任务、长笔记拆分、桥接笔记等。
- 部分 action 可打开笔记、创建目标、标记完成、归档、添加别名。

产品价值：

- 从被动工具变成主动工作台，是留存的关键。
- 维护队列非常适合做「vault health」和周报式复盘。

主要风险：

- 主动建议很容易变成噪音，必须有频控、snooze、dismiss、not related、解释原因。
- 维护队列若只是一堆问题列表，用户会觉得负担重；需要从「问题」转成「可完成的小任务」。

### 4.9 Agent 与 Tool Surface

功能覆盖：

- Tool Surface Registry 暴露搜索笔记、相似笔记、链接、孤岛、hub、bridge、memory、task、maintenance 等工具。
- 命令面板可直接调工具，避免所有动作都进入 Chat。
- Agent Run 支持 goal、description、dry run、plan、编辑 plan、执行、pause/resume/cancel、retry/skip、step rollback、run rollback、reflect、历史。
- Agent 数据持久化到 `agent_runs` 和 `agent_steps`。

产品价值：

- 这是真正把 AI 从「聊天」推进到「承担任务」的基础。
- Dry run 和 rollback 对知识库写操作非常重要。

主要风险：

- Agent 面向普通用户仍显复杂，适合先面向高级用户或放在「维护队列的一键执行」后面。
- 工具很多但发现性不足，需要按用户任务包装。

### 4.10 阅读收件箱、导入和剪藏

功能覆盖：

- Notion、Readwise、Pocket 导入。
- Reader Inbox 按来源、状态、关键词、归档筛选。
- 下一条待读、追加阅读笔记、生成 digest、打开原文。
- Web Clipper 扩展通过本地 HTTP 服务保存页面或选区到 `Clippings/`。

产品价值：

- 把外部阅读材料变成 vault 内容，补齐知识工作流上游。
- 对研究和写作用户很关键。

主要风险：

- Web Clipper 当前文档支持 direct API，但本地接口认证和 CORS 需要收紧。
- 阅读收件箱需要与长期上下文、维护队列、图谱形成闭环，否则会变成又一个独立模块。

### 4.11 任务、看板与闪卡

功能覆盖：

- Markdown task list 抽取，支持 Obsidian 自定义状态、Tasks 插件日期、Dataview inline 字段。
- Kanban columns、tasks、relations、拖拽排序。
- AI 分析看板、拆解任务、从笔记生成任务、预览后写入。
- 闪卡生成、Markdown 追加、到期复习、SRS 字段更新。

产品价值：

- 从知识管理延展到行动管理，符合「认知伙伴」方向。
- 任务可以成为主动建议和维护队列的重要信号。

主要风险：

- 如果任务/看板过强，会让产品边界像项目管理工具，分散核心定位。
- 闪卡适合学习用户，但对所有用户不是主线，需要作为垂直能力而不是一级卖点。

### 4.12 同步、导出、发布和官网

功能覆盖：

- Supabase、iCloud、OneDrive、WebDAV、S3。
- 双向同步、pull all、push file、index 同步、排除列表、离线队列。
- HTML/PDF 导出、Share、静态站点发布。
- 官网首页、下载入口、日志后台。

产品价值：

- 本地优先不等于单机孤岛，用户可以自选同步后端。
- 静态发布适合把 vault 的一部分变成公开知识站。

主要风险：

- 多同步后端会显著增加冲突处理、支持和安全成本。
- 官网和发布链路需要承担增长转化，当前更像项目介绍页，缺少强用例和演示路径。

### 4.13 插件、模板、主题与个性化

功能覆盖：

- 插件命令、面板、编辑器扩展声明。
- 插件 marketplace pack 和 vault 本地插件。
- 模板 marketplace、community pack、daily note。
- 主题包、CSS snippets、内置主题、强调色。
- 中英 i18n。

产品价值：

- 对 PKM 用户很有吸引力，能保留本地可定制文化。
- 插件可以承接长尾需求，避免主产品继续膨胀。

主要风险：

- 插件生态没有分发、审核、安全模型和文档运营时，不应作为短期主卖点。
- 主题和 CSS snippets 是高级能力，首启不应打断核心激活。

## 5. 产品优势

### 5.1 定位有长期价值

本地 Markdown + AI 是一个清晰的长期方向。云端笔记解决协作和同步，传统 Markdown 工具解决所有权和可迁移，但「AI 能长期理解并维护本地知识库」仍是一个有差异化的空位。

### 5.2 功能纵深超过普通 MVP

当前项目不仅有编辑器和聊天框，还已经做到了：

- 数据模型：notes、links、tags、tasks、chunks、long-context、proactive、agent。
- AI 写入边界：preview、diff、dry run、rollback。
- 知识维护：维护队列、主动建议、工具直调。
- 可观测：context pack、metrics、feedback。

这些能力形成了产品护城河的雏形。

### 5.3 本地优先叙事可信

代码和文档都强调 Markdown 文件是 source of truth，SQLite 是索引和派生状态。这比「云端知识库 + 导出 Markdown」更容易获得隐私敏感和长期主义用户信任。

### 5.4 多 Provider 适配强

OpenAI、Claude、Ollama、国产兼容接口、Codex CLI 同时存在，使产品可覆盖不同预算、地区、隐私偏好的用户。

### 5.5 工程基础较成熟

项目已有 TypeScript 类型边界、Vitest 测试、Electron sandbox、preload 受控 IPC、文档、优化计划和多模块拆分。对一个桌面知识库来说，这是重要资产。

### 5.6 维护队列是潜在留存飞轮

很多知识库产品的问题是「只写不整理」。Nexusky 的维护队列能持续产生小任务：补链接、处理孤岛、清理过期任务、刷新记忆、拆分大笔记。这天然适合做周活和长期留存。

## 6. 产品短板与风险

### 6.1 功能面过宽，核心激活不够尖

当前能力覆盖编辑器、AI、图谱、Canvas、Bases、Reader、Kanban、Agent、Flashcards、Sync、Publish、Plugin。问题不是缺功能，而是用户第一次打开后很难知道「我现在该做什么，做完会得到什么价值」。

建议把首个激活目标压缩为一个可衡量结果：

> 10 分钟内让用户打开已有 vault，完成索引，看到 3 条有用维护建议或 1 次有来源的 AI 回答。

### 6.2 产品叙事容易像「大而全」

官网当前提到 Local-first vault、Long-term context、AI tools、Readable graph，这些都对，但还缺少强用户场景。用户更关心：

- 我已有 Obsidian vault，Nexusky 能给我什么额外价值？
- 它会不会破坏我的笔记？
- AI 会把哪些内容发出去？
- 它每天提醒我什么，如何帮我节省时间？

### 6.3 AI 配置门槛较高

多 Provider 是优势，也是复杂度来源。新用户若没有 API Key 或不知道选什么模型，会卡在第一个价值点之前。

建议提供：

- 本地无 AI 可用模式。
- Provider 自动检测后的明确推荐。
- 配置完成后的「测试问题」和「首次回答 demo」。
- 对 Ollama / 自定义兼容接口的简单向导。

### 6.4 主动建议存在打扰风险

Proactive AI 是方向，但如果提示太多、原因不清、不能反馈，就会被用户关闭。主动建议必须以低频、高确定性、可解释、可撤回为原则。

### 6.5 安全与隐私必须先补齐

当前优化计划已指出多个 P0：

- Web Clipper 本地 HTTP 接口认证、CORS、来源校验。
- 文件 IPC 统一以主进程当前 vault 为信任源。
- 生产依赖漏洞与 Mermaid 渲染防护。
- 遥测 opt-in 与官网日志入口加固。
- 官网登录密钥和限流。

对本地知识库产品而言，这些不是普通工程债，而是产品信任底座。

### 6.6 同步策略复杂

Supabase、iCloud、OneDrive、WebDAV、S3 同时支持很有吸引力，但每个后端都会带来冲突、凭据、安全、错误恢复和用户教育成本。未来应明确主推路径：

- macOS 用户默认 iCloud。
- 高级用户使用 WebDAV/S3。
- 需要托管体验时再考虑官方 managed sync。

### 6.7 Agent 能力强但需要降维包装

Plan-Execute-Reflect 很完整，但普通用户不会先想「我要开 Agent 面板」。更自然的产品入口是：

- 维护队列里选择「帮我处理这 5 个孤岛笔记」。
- Reader Inbox 里选择「把这 10 篇材料整理成主题笔记」。
- 当前笔记里选择「生成下一步任务并加入看板」。

也就是说，Agent 应作为任务背后的执行引擎，而不是第一层心智。

### 6.8 插件生态还不能承担增长叙事

插件、模板、主题能力已经存在，但生态不是写完 API 就成立。短期应把它们作为 power user 功能，等核心产品闭环稳定后再投入 marketplace、审核、安全沙箱和文档运营。

## 7. 未来产品方向

### 7.1 战略主线：AI Cognitive Partner for Markdown Vaults

建议未来 12 个月围绕一句话收束：

> Nexusky 帮你把长期 Markdown 知识库变成可搜索、可连接、可维护、可被 AI 解释和执行的认知伙伴。

这句话里有四个关键词：

- 可搜索：FTS、语义检索、RAG。
- 可连接：wikilink、反链、图谱、AI 推断关系。
- 可维护：维护队列、主动建议、任务、健康报告。
- 可执行：AI 编辑、Tool Surface、Agent、preview/rollback。

### 7.2 核心产品闭环

推荐把主循环设计成：

1. Capture：写笔记、导入、剪藏、阅读收件箱。
2. Index：解析 Markdown、链接、标签、属性、任务、全文、语义。
3. Understand：图谱、知识空间、长期主题、context pack。
4. Act：AI 问答、AI 编辑、Tool Surface、维护队列、看板。
5. Review：主动建议、认知复盘、vault health、闪卡。
6. Preserve：本地文件、同步、导出、发布。

所有新增功能都应回答：它加强了这个闭环的哪一段？

### 7.3 首启与激活方向

首启不应只让用户选择文件夹。建议改成「Vault Intelligence Setup」：

1. 打开或创建 vault。
2. 显示本地优先承诺：Markdown 不被接管，SQLite 只是索引。
3. 扫描 vault，展示笔记数、链接数、孤岛数、任务数、导入材料数。
4. 可选配置 AI Provider，支持跳过。
5. 生成首份 Vault Health Report。
6. 给出三个可执行下一步：
   - 问 AI 一个关于 vault 的问题。
   - 修复 3 个未解析链接。
   - 查看最重要的知识桥接笔记。

关键指标：

- Time to first indexed vault。
- Time to first useful AI answer。
- First maintenance action completed。
- First note opened from graph/search/context。

### 7.4 Vault Health 作为产品首页

当前 WelcomeScreen 和工作台可以增加「健康报告」视角，把维护队列、长期上下文和任务状态变成一个高价值入口。

建议模块：

- Knowledge structure：孤岛笔记、未解析链接、重复标题、未链接提及。
- Work state：过期任务、今日任务、高优先级任务。
- Memory state：缺失/过期 memory、长期主题变化。
- Reading state：待读材料、最近导入、可连接材料。
- Suggested actions：最多 5 个高价值操作。

产品收益：

- 用户不用理解所有功能，也能知道下一步。
- 维护队列从「负担列表」变成「健康改善」。
- 每周复盘和主动建议有落点。

### 7.5 长期上下文产品化

长期上下文不应只叫 debug 或 observability。建议面向用户包装为：

- Memory Ledger：AI 记住了什么。
- Context Pack：本轮 AI 看到了什么。
- Why this?：为什么推荐这条笔记/关系。
- Review Memory：确认、纠正、忽略 AI 关系。

最重要的体验：

- 每条 AI 回答引用不仅有 source，还能看到 relation reason / confidence / evidence。
- 用户能一键「有用」「不相关」「原因错误」。
- 被用户否定的关系应明显降低后续出现概率。

### 7.6 维护队列与 Agent 合并成执行体验

未来不要让用户先学习 Agent。应该让用户从具体任务出发：

- 「补齐这些未解析链接」
- 「把这些孤岛笔记连接到主题」
- 「从这篇长笔记拆出 3 篇子笔记」
- 「把这批阅读材料整理成主题地图」

点击后进入 Agent plan 预览：

- Step 列表。
- 每步会读写什么。
- 默认 dry run。
- 用户确认后执行。
- 每步结果可回滚。

这样 Agent 成为信任机制，而不是复杂功能入口。

### 7.7 阅读收件箱成为知识入口

Reader Inbox、Notion/Readwise/Pocket/Web Clipper 可以组成「知识输入层」。建议未来强化：

- 剪藏后自动识别主题、候选关联笔记。
- 阅读材料处理状态：Next、Connect、Later、Archived。
- 一键生成 Digest，并把引用写成精确 wikilink。
- 对 5 到 20 篇材料生成「主题综述」或「待连接关系」。

这能把 Nexusky 从「存量 vault 工具」扩展到「持续输入和消化工具」。

### 7.8 同步与发布方向

短期不建议把协作作为主线。更合理的叙事是：

- 本地优先。
- Bring your own sync。
- 可发布、可导出、可备份。

优先级：

1. 先把冲突处理和错误恢复做可信。
2. 主推 iCloud/WebDAV/S3 作为本地优先用户的自然选择。
3. Supabase 适合高级用户或未来 managed sync。
4. 静态发布适合知识站和作品集，但不应压过核心认知伙伴定位。

### 7.9 官网与增长叙事

官网应该从「列能力」转向「展示使用场景」：

- Import your Obsidian vault, get a health report in minutes。
- Ask questions with sources, see why context was used。
- Let AI find stale tasks, broken links and forgotten ideas。
- Keep Markdown local, bring your own model and sync。

推荐增加：

- 60 秒产品动图或截图序列。
- Obsidian vault 用户迁移页。
- Local-first privacy 页。
- AI Cognitive Partner 用例页。
- 安全边界页：哪些数据本地、哪些会发给 Provider。

## 8. 路线图建议

### 8.1 0 到 2 周：信任与激活底座

优先级最高：

- Web Clipper token、CORS、payload 限制。
- 文件 IPC 边界统一加固。
- 遥测 opt-in、日志上报加固。
- 依赖漏洞修复，Mermaid 安全配置。
- 根 lint / CI baseline 修复。
- 首启流程最小改造：索引进度、vault 摘要、下一步建议。

交付目标：

- 用户敢把真实 vault 放进来。
- 新用户第一次打开知道下一步做什么。

### 8.2 1 到 2 个月：核心闭环

重点：

- Vault Health Report。
- 维护队列信息架构重做，按价值和可执行性排序。
- AI Provider 配置向导、自动检测、可用性测试。
- 首次 AI 问答模板：总结 vault、查找主题、列出待维护项。
- Graph/Canvas 空状态和示例引导。
- Reader Inbox 与 digest/关联建议加强。

交付目标：

- 用户 10 分钟内获得第一个有用结果。
- 用户每周回来处理维护建议。

### 8.3 3 到 6 个月：认知伙伴 MVP

重点：

- Proactive AI 低频高价值上线。
- Memory Ledger / Context Pack 用户化。
- Why this? 引用反查。
- 关系反馈闭环进入 ranking。
- 维护队列 -> Agent plan -> dry run -> execute -> rollback 完整路径。
- 周度 Cognitive Review。

交付目标：

- 用户能感知「Nexusky 记得并理解我的长期知识」。
- 用户开始信任 AI 执行小范围维护任务。

### 8.4 6 到 12 个月：生态与商业化

重点：

- 插件 marketplace、模板生态、主题生态。
- 官方同步或托管发布服务评估。
- 官网下载、更新、release note、遥测 opt-in 数据闭环。
- 高级用户工作流包：研究、写作、项目管理、学习复习。
- 更明确的商业模式。

可能商业模式：

- 开源桌面核心免费。
- Pro 版提供高级 AI 工作流、托管同步、发布站点、自动备份。
- 团队版暂缓，除非先解决协作和权限模型。

## 9. 指标体系

### 9.1 激活指标

| 指标 | 定义 |
| --- | --- |
| Indexed Vault Rate | 首次打开后成功完成索引的用户比例。 |
| Time to First Useful Result | 从打开 vault 到完成一次搜索/AI 回答/维护 action 的时间。 |
| AI Setup Completion | 进入 AI 配置后成功验证 Provider 的比例。 |
| First Maintenance Action | 首次完成打开、修复、归档或标记任务的比例。 |

### 9.2 留存指标

| 指标 | 定义 |
| --- | --- |
| Weekly Vault Health Actions | 每周处理维护建议数量。 |
| Context Suggestion Open Rate | 主动建议被打开比例。 |
| Useful Feedback Rate | 长期上下文建议被标记 useful 的比例。 |
| Repeat Search / AI Sessions | 每周搜索和 AI 会话次数。 |
| Reader Processing Rate | 导入/剪藏材料进入 digest、归档或连接的比例。 |

### 9.3 信任指标

| 指标 | 定义 |
| --- | --- |
| AI Write Preview Apply Rate | AI 写入预览被用户应用的比例。 |
| AI Write Revert / Rollback Rate | 应用后回滚或撤销比例。 |
| Provider Error Rate | AI Provider 请求失败率。 |
| Sync Conflict Rate | 同步冲突发生率与成功解决率。 |
| Security Boundary Test Coverage | 文件 IPC、Clipper、外部链接、secret 的测试覆盖。 |

## 10. 优先级 Backlog

### P0：必须先做

- 文件系统和 Web Clipper 安全边界。
- AI/同步/遥测隐私说明和 opt-in。
- 首启激活：vault 扫描结果 + 3 个下一步。
- AI Provider 配置向导和检测。
- Vault Health Report MVP。

### P1：形成产品记忆点

- 维护队列重构为健康报告和可执行 action。
- Context Pack / Why this? 面向用户可解释。
- Proactive suggestion 低频上线。
- Agent 作为维护任务执行引擎。
- Reader Inbox 到 digest/关联建议的闭环。

### P2：扩大生态

- 插件 marketplace 和安全模型。
- 模板/主题社区包运营。
- 静态发布体验打磨。
- 官方同步或备份服务。
- 官网用例页和产品演示。

## 11. 关键产品取舍

### 11.1 暂缓团队协作

团队协作会引入权限、实时同步、评论、多人冲突和云架构。它会稀释本地优先和个人认知伙伴定位。除非已有明确付费需求，否则 12 个月内不建议作为主线。

### 11.2 暂缓移动端

移动端对 capture 有帮助，但会带来同步、编辑器、文件访问和平台限制。更务实的路径是先做好桌面端 + Web Clipper + bring-your-own-sync。

### 11.3 不把插件作为短期增长核心

插件生态需要审核、安全、文档、示例、版本兼容和分发运营。短期应该用于 power user 扩展，而不是承诺生态。

### 11.4 不把所有功能都放到一级入口

Activity Bar 当前入口很多，未来应按用户任务合并：

- Capture：文件、Reader、Clipper。
- Understand：Search、Graph、Context。
- Act：AI、Maintenance、Agent、Kanban。
- Preserve：Sync、Export、Publish。

## 12. 建议的下一版产品叙事

### 官网主标题方向

Nexusky  
Local Markdown. Long-term AI memory. Inspectable actions.

### 中文叙事

Nexusky 是一个本地优先的 Markdown 知识工作台。你的笔记仍然保存在自己的文件夹里，Nexusky 负责建立索引、发现关系、维护结构，并让 AI 在有来源、有证据、可预览、可回滚的边界内帮助你长期思考。

### 三个主卖点

1. 本地可信：Markdown 文件是主数据，AI 和同步都由你配置。
2. 长期记忆：AI 能带着跨笔记、跨会话的关系和主题回答问题。
3. 可执行维护：发现断链、孤岛、过期任务和重复内容，并通过预览式 Agent 帮你处理。

## 13. 最终建议

Nexusky 不需要继续横向堆功能。下一阶段应该做减法和包装：把已经存在的高级能力组织成用户能理解、能上手、能反复使用的核心循环。

产品优先级应从「有什么功能」转为「用户每周为什么回来」：

- 回来处理 vault health。
- 回来让 AI 找回旧关系。
- 回来整理新导入材料。
- 回来执行可预览的知识维护任务。
- 回来复盘长期主题和目标变化。

如果这个循环跑通，Nexusky 的定位会从「功能很多的本地 AI 笔记应用」升级为「能长期陪伴用户维护知识资产的本地 AI 认知伙伴」。
