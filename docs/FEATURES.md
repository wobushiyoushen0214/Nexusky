# Nexusky — AI 驱动的知识库笔记应用

> 本地优先、双向链接、AI 语义搜索、知识图谱可视化

## 已实现功能

### 核心编辑

| 功能 | 说明 |
|------|------|
| TipTap 富文本编辑器 | 基于 ProseMirror，支持 Markdown 语法 |
| Markdown 序列化 | 编辑器内容与 .md 文件双向转换 |
| Properties 面板 | 编辑器状态栏打开右侧面板，可视化编辑当前笔记 frontmatter title / aliases / tags / cssclasses |
| 属性数据库 | Bases-like 主视图按 frontmatter 与 Obsidian Dataview `key:: value` 内联属性浏览、搜索、标签筛选和排序笔记，支持任务列表中的 Dataview 字段、自定义显示列、双击单元格直接编辑属性，保留数字/布尔属性类型；编辑已有 Dataview 内联字段时会原地写回，并内置使用说明 |
| 多标签页 / 多窗口 | 同时打开多个文件，拖拽排序，右键菜单；命令面板可打开独立新窗口并行查看不同视图 |
| 分屏编辑 | 标签页右键"在右侧打开"，并排查看两个笔记 |
| 编辑器工具栏 | 标题、加粗、斜体、删除线、代码、列表、引用、表格、任务列表、高亮、分割线 |
| Slash Command | 输入 `/` 弹出命令菜单，快速插入标题、列表、代码块、表格、日期等 |
| 代码块语法高亮 | lowlight（highlight.js），支持常见语言 |
| 代码块折叠 | 超过 5 行自动折叠，hover 显示展开按钮 |
| Obsidian 高亮语法 | AI Markdown、HTML/PDF/分享和发布导出支持 `==高亮==` 渲染 |
| Obsidian 注释语法 | 索引、AI Markdown、HTML/PDF/分享和发布导出会隐藏 `%%注释%%` 内容，发布站点搜索索引也不会收录注释文本 |
| 数学公式 | KaTeX 渲染，`$行内$` 和 `$$块级$$` |
| Mermaid 图表 | mermaid 代码块自动渲染为流程图/时序图 |
| 嵌入式笔记 | `![[笔记名]]` 内联显示引用笔记内容，兼容 `![[笔记#标题]]` 和 `![[笔记#^块]]` 局部嵌入 |
| Wikilink 预览 | hover `[[链接]]` 显示目标笔记摘要，`[[笔记#标题]]` / `[[笔记#^块]]` 只预览对应局部内容 |
| 搜索替换 | Ctrl+H 打开，支持上下导航/替换/全部替换 |
| 表格支持 | 插入可调整大小的表格 |
| 任务列表 | `- [ ]` 复选框，可点击勾选；索引支持缩进嵌套任务、`-` / `*` / `+` 列表标记和 Obsidian 自定义任务状态 |
| 图片粘贴/拖拽 | 粘贴截图或拖拽图片自动保存到 vault/assets/ |
| 预览模式 | 切换编辑/只读预览 |
| 拼写检查 | 使用 Electron/Chromium 原生拼写检查，跟随当前语言设置标记编辑区域 |
| 聚焦模式 | F11 隐藏所有 UI，纯写作 |
| 工作区布局记忆 | 按 vault 自动恢复上次主视图、侧栏折叠状态和右侧面板；左侧文件侧栏按 vault 记忆宽度，右侧不同面板独立记忆宽度，可通过命令面板重置 |
| 快捷键配置 | 设置页集中管理全局快捷键，修改后立即驱动主视图、搜索、图谱、命令面板等入口 |
| 面包屑导航 | 显示当前文件路径层级 |
| 底部状态栏 | 字数、字符数、阅读时间、保存状态、同步指示器 |
| 版本历史 | 每次保存自动创建快照，工具栏按钮查看/恢复 |
| 回收站路径恢复 | 删除文件保留原相对路径，恢复时回到原目录，重名自动避让 |
| 自动保存 | 窗口失焦或关闭前自动保存未保存内容，防止数据丢失 |
| 导出 PDF/HTML | 工具栏导出按钮 |
| 笔记分享 | 生成精美 HTML 复制到剪贴板 |
| 知识库发布 | 命令面板可将整个 vault 导出为静态 HTML 站点，保留目录索引、站内搜索和 wikilink 跳转 |
| 笔记加密 | AES-256-GCM 加密单个笔记 |

### 双向链接与知识图谱

| 功能 | 说明 |
|------|------|
| `[[wikilink]]` 语法 | 紫色高亮显示，点击跳转到对应笔记；索引和发布解析兼容 Obsidian 标题与块引用片段 |
| Frontmatter aliases | 兼容 Obsidian `alias` / `aliases`，`[[别名]]` 可解析到真实笔记，并进入快速切换、悬浮预览和嵌入块 |
| 自动创建笔记 | 点击不存在的 wikilink 自动创建新笔记 |
| 链接概览面板 | 编辑器底部显示当前笔记出链、反向链接和未链接提及，点击可跳转到来源行号 |
| 未创建出链 | 链接概览中点击未创建的出链可直接新建目标笔记，并立即索引刷新链接关系 |
| 未链接提及 | 反向链接面板显示提到当前笔记标题但尚未写成 `[[wikilink]]` 的笔记，避免词内局部误匹配 |
| 未链接提及转链 | 链接概览可将来源行中的未链接提及单条或批量包成 `[[wikilink]]`，写回后立即刷新链接关系 |
| 路径/标题 Wikilink 解析 | `[[folder/note]]`、`[[note#heading]]` 和别名/大小写变体可解析到嵌套笔记 |
| Markdown 脚注渲染 | 兼容 Obsidian `[^id]` 脚注定义，AI Markdown 与 HTML/PDF/发布站点导出会生成可跳转脚注列表 |
| Obsidian Callout 渲染 | 兼容 `> [!note]` / `> [!warning]` 等 callout 块，AI Markdown 与 HTML/PDF/发布站点导出会保留标题和内容层级 |
| 知识图谱 | D3 力导向图，节点大小按链接数缩放，hover 高亮相邻节点 |
| 全屏图谱 | Ctrl+Shift+G 切换图谱为主视图 |
| 知识空间 | 无限延展主视图将笔记作为可拖拽知识节点整理，支持空间、属性和时间图层，位置按 vault 持久化，自动叠加带数据流动效且绕开卡片的 wikilink 连接线，按来源/状态/标签/日期显示分组标签，识别隐式关联建议并提供审阅队列，可将建议写回 `## Connections` wikilink，支持在所有图层拖拽、按当前图层重排、在当前视图中心附近新建未命名节点并避开遮挡、拖拽空白处平移、按钮缩放、Ctrl/Cmd + 滚轮或触控板捏合缩放、适应视图和内置使用说明 |
| 当前笔记高亮 | 图谱中当前打开的笔记有特殊高亮 |

### AI 功能

| 功能 | 说明 |
|------|------|
| 多 Provider 支持 | OpenAI、Claude、Ollama（本地）、自定义（中转站/国产模型） |
| 配置自动检测 | 读取本地 Claude Code / Codex 配置，一键导入（跨平台） |
| 模型下拉选择 | 预设最新模型列表（gpt-5.5/4.1/claude-4 等），支持自定义输入 |
| AI 对话面板 | Ctrl+L 打开，流式输出，Markdown 渲染，未发送输入按 vault 和会话自动保存草稿 |
| 多行输入 | 对话输入框支持 Shift+Enter 换行，textarea 多行编辑 |
| 对话历史持久化 | 对话自动保存到 SQLite，重启恢复，避免 localStorage 配额限制；新会话首次提问后自动生成可识别的会话标题 |
| AI 任务模板 | 空状态提供知识库问答、笔记优化、选区改写、批量生成关联笔记等快捷任务 |
| AI Agent 笔记工具 | Agent 可搜索、读取、按行/标题/块引用读取笔记，按标题、路径、别名和大小写变体定位目标 |
| AI Agent 知识库巡检 | Agent 可查询最近笔记、任务、标签、文件夹、属性、断链、孤岛、无反链、终点、空笔记、长笔记、重复标题/别名和链接枢纽 |
| AI Agent 连接机会 | Agent 可发现尚未互链但共享标签、属性或记忆概念的笔记对，输出补 wikilink 的具体理由 |
| AI Agent 当前笔记上下文 | Agent 可读取当前笔记正文、属性、标题、块引用、任务、链接摘要和未链接引用，当前笔记命令会在无打开文件时提示 |
| AI 记忆导航工具 | Agent 可读取笔记记忆、记忆覆盖率、文件夹覆盖、概念/主题分布、概念共现和记忆相似笔记 |
| 本地插件命令 | `.nexusky/plugins/*.json` 可注册插件命令，自动出现在命令面板并投递到 AI 工作台，见 `docs/PLUGIN_COMMANDS.md` |
| 插件设置页 | 设置中可查看已检测插件、命令列表，并打开当前 vault 的插件目录 |
| 停止生成 | 流式期间可点击停止按钮中断，输入框始终可用 |
| @ 引用笔记 | 输入 @ 选择笔记作为上下文发送给 AI |
| AI 编辑模式 | 类 Claude Code，直接修改笔记内容，预览后确认应用 |
| 编辑即时生效 | 应用修改后编辑器立即刷新，无需切换标签 |
| 编辑预览展开 | 预览面板支持展开/收起，可查看完整修改内容 |
| 多轮编辑 | 编辑模式保持历史上下文，连续修改同一文件 |
| 图片多模态 | 粘贴图片发送给 AI（支持 GPT-4o/Claude），发送后自动清空本轮图片附件 |
| 文档附件上下文 | AI 对话可拖入或粘贴 PDF、DOC/DOCX、XLS/XLSX、CSV/TSV/TXT/RTF 等文件，能读取的文本会随本轮问题作为上下文发送 |
| RAG 问答 | 对话时自动检索相关笔记内容，带来源引用 |
| AI 行内补全 | 可在设置中启用，写作停顿后出现 ghost text，Tab 接受（缓存/限 token/独立 AbortController） |
| AI 写作辅助 | 选中文本后浮动菜单：总结/扩展/改写/翻译/简化 |
| AI 笔记摘要 | 命令面板一键生成摘要插入开头 |
| AI 闪卡生成 | 命令面板从当前笔记生成 Anki 风格基础问答与 Cloze 填空卡，追加到笔记中并带 `#flashcard` 标签与 SRS 字段 |
| 闪卡 SRS 调度 | 可解析笔记中的闪卡块，按 due 日期筛选到期卡，并通过 IPC 按 Again/Hard/Good/Easy 写回 Status、Interval、Ease、Due 和 LastReviewed |
| 闪卡复习面板 | 命令面板可打开今日到期闪卡队列，支持显示答案、1-4 快捷评分、Again 回队尾复习和跳转来源行 |
| AI 标签建议 | 可在设置中启用，保存时自动建议标签（toast 提示） |
| 对话导出 | 将 AI 对话导出为 Markdown 笔记 |
| AI 输出 XSS 防护 | DOMPurify 消毒 AI 输出内容，防止注入攻击 |
| 对话清空确认 | 超过 3 条消息时弹出确认弹窗，防止误操作 |
| 凭据加密存储 | API Key 等敏感信息使用 Electron safeStorage 加密 |
| 语义索引 | 笔记自动分块存储，支持增量更新 |
| 语义搜索 | TF-IDF 中文 bigram 分词 + AI chat completion 重排序，无需 embedding API |
| 语义搜索缓存 | 搜索结果按 vault、模式、查询缓存，历史记录点击秒出 |
| 语义搜索智能加速 | 高置信度结果跳过 AI rerank，标题精确匹配毫秒级响应 |
| 索引数据云端同步 | 多设备共享同一套索引 |

### 搜索与导航

| 功能 | 说明 |
|------|------|
| 快速切换 | Ctrl+O 模糊搜索笔记，支持按标题、alias、相对路径和粘贴的 Obsidian wikilink 匹配，显示文件目录路径 |
| 全文搜索 | Ctrl+Shift+F，点击结果跳转到对应行 |
| 搜索历史 | 搜索面板显示最近搜索词，点击快速重搜 |
| 搜索面板键盘导航 | 上下箭头选择搜索结果，Enter 跳转 |
| 命令面板 | Ctrl+Shift+P，20+ 命令，命令名称/说明跟随中英文语言设置 |
| 复制 Wikilink | 命令面板一键复制当前笔记为 `[[笔记标题]]` |
| 文档大纲 | Ctrl+E 右面板显示标题层级 |
| 标签面板 | 右面板显示所有标签，点击筛选笔记 |
| 日历面板 | 右面板日历视图，点击日期打开每日笔记 |
| 阅读收件箱 | 主视图集中浏览 Notion、Readwise 和 Pocket 导入内容，内置三类导入入口，支持来源筛选与匹配数量、待读筛选、全文检索、最新/最早/标题/来源排序并记忆视图偏好、打开下一条待读、原文打开、阅读笔记追加、一键生成带高亮摘录、精确文件路径 wikilink 和来源路径元数据的阅读摘要、把当前筛选结果或选中条目一键交给 AI 消化、归档隐藏、单条状态写回、当前筛选结果批量标记已读、批量归档和批量取消归档 |
| 看板面板 | 独立任务管理，支持拖拽排序、优先级、截止日期、任务关联 |
| 看板 AI 分析 | AI 分析看板全局状态，给出优化建议 |
| 看板 AI 拆解 | AI 将大任务拆解为子任务并建立关联 |
| 看板从笔记提取 | AI 从笔记内容提取待办任务到看板 |
| 任务关联 | 任务间支持 blocks/depends_on/related 三种关系 |
| 文档大纲 | 右侧面板显示标题层级 |
| 最近文件优先 | 快速切换器中最近打开的文件排在前面 |

### 数据与索引

| 功能 | 说明 |
|------|------|
| SQLite 本地数据库 | better-sqlite3，WAL 模式 |
| 笔记索引 | 标题、链接关系、标签自动提取 |
| 索引语法边界 | 链接、标签、任务、未链接提及和 Dataview 属性索引会跳过 Obsidian 注释、代码块和行内代码 |
| 标签系统 | `#tag` 语法自动解析，支持 Obsidian 嵌套标签，按标签筛选 |
| 增量更新 | 保存时自动更新索引 |
| FTS 全文搜索 | SQLite FTS5 虚拟表，高性能关键词搜索 |

### 云端同步

| 功能 | 说明 |
|------|------|
| 多后端支持 | Supabase / iCloud Drive / OneDrive |
| 双向同步 | 推送本地变更 + 拉取云端新文件 |
| 独立拉取 | 只从云端下载，不推送 |
| 自动推送 | 保存时自动上传到当前后端 |
| 自动定时同步 | 可配置 5/10/30/60 分钟间隔 |
| 同步状态指示器 | 状态栏图标，点击手动同步 |
| 冲突检测 | 本地和远端都修改时标记冲突 |
| 选择性同步 | 排除指定文件夹不参与同步 |
| 离线队列 | 断网时缓存操作，恢复后自动执行 |
| 索引数据同步 | 多设备共享同一套索引数据库 |
| 后端切换 | 设置页面一键切换 |
| Supabase | Storage + Auth + 一键初始化 |
| iCloud Drive | macOS 文件系统同步，零配置 |
| OneDrive | Microsoft Graph API + OAuth2 |

### 文件管理

| 功能 | 说明 |
|------|------|
| 文件树 | 递归显示 vault 目录，文件/文件夹图标区分 |
| 文件树排序 | 按名称/修改时间切换，持久化 |
| 折叠/展开全部 | 一键折叠或展开所有文件夹 |
| 键盘导航 | 上下箭头选择，Enter 打开 |
| 新建笔记/文件夹 | 侧边栏顶部按钮 + 子文件夹右键新建 |
| 右键菜单 | 文件：收藏/重命名/删除；文件夹：新建/重命名/删除 |
| 空白区域右键 | 新建笔记/新建文件夹/刷新 |
| 操作按钮 | hover 显示 `...` 操作按钮 |
| 拖拽移动 | 文件/文件夹可拖拽到其他文件夹中 |
| 重命名更新链接 | 重命名时自动更新所有 `[[wikilink]]` 引用 |
| 回收站 | 删除移入 .trash，命令面板可恢复/清空 |
| 文件过滤 | 侧边栏搜索框实时过滤 |
| 笔记收藏 | 右键收藏，显示在侧边栏顶部 |
| 拖拽打开 | 从文件管理器拖拽 .md 文件到窗口 |
| 文件监听 | chokidar 监听变化，自动刷新文件树 |
| 每日笔记 | 自动创建 daily/YYYY-MM-DD.md |
| 模板系统 | 空白、会议记录、读书笔记、项目文档，命令面板可从内置精选模板市场安装 Zettelkasten、文献、ADR、周复盘和课程模板，也可安装 `.nexusky/templates/*.json` 社区共享模板包 |
| Obsidian 导入 | 命令面板导入，自动转换 callout 语法，并在导入时索引 frontmatter、Dataview 内联字段、别名和链接；`.canvas` 文件会保留原文件，并生成可索引的 Markdown 地图笔记，让 Canvas 文件节点和连线进入 Nexusky 的 wikilink/知识空间体系 |
| Notion 导出导入 | 命令面板选择 Notion Markdown、CSV 或 HTML 导出文件夹，页面转 Markdown、数据库 CSV 转表格笔记，并把本地页面链接转为 wikilink |
| Readwise 高亮导入 | 命令面板选择 Readwise CSV 导出文件，按文章生成带来源、作者和标签的 Markdown 笔记 |
| Pocket 稍后读导入 | 命令面板选择 Pocket HTML 导出文件，将收藏链接转为带状态、来源和标签的阅读笔记 |
| Web Clipper 链接保留 | 浏览器扩展整页剪藏会发送 HTML fallback，把安全网页链接保留为 Markdown 链接，并按页面 URL 解析相对链接，保存后按新文件路径刷新文件树 |
| Frontmatter 兼容 | 属性编辑统一通过 frontmatter 工具写回，兼容 CRLF 换行、Obsidian `cssclass` 旧字段、空格分隔标签和标签栏/标签面板同步更新 |

### UI 与体验

| 功能 | 说明 |
|------|------|
| 深色主题 | OKLCH 色彩系统 |
| 主题切换 | 亮/暗模式 + Obsidian / Nord / Solarized / 高对比等多主题色板，支持自定义强调色、vault 级主题包和 CSS 片段 |
| 自定义窗口控件 | Windows/Mac 适配 |
| 可调整面板宽度 | 侧边栏和右面板支持拖拽调整，宽度持久化 |
| 侧边栏折叠 | Ctrl+Shift+B |
| 侧边栏自适应 | 筛选栏窄宽度自动换行，按钮不被遮挡 |
| 动画过渡 | 面板滑入、弹窗淡入 |
| 命令面板 | Ctrl+Shift+P，20+ 命令，显示快捷键 |
| Toast 通知 | 替代 alert，支持 success/error/info |
| 窗口状态记忆 | 大小/位置/最大化状态自动恢复 |
| 最近 vault | 欢迎页显示历史打开的笔记空间 |
| 多 vault 切换 | 侧边栏顶部下拉菜单快速切换 |
| 标签页拖拽排序 | 拖拽重新排列标签顺序 |
| 标签页右键菜单 | 关闭/关闭其他/关闭右侧/复制路径 |
| 标签页中键关闭 | 鼠标中键点击标签页直接关闭 |
| 文件树虚拟滚动 | 只渲染可视区域节点，支持万级文件 |
| 文件树懒加载 | 展开文件夹时按需加载子目录 |
| 文件树折叠/展开 | 一键折叠或展开所有文件夹 |
| 文件树排序 | 按名称/修改时间切换排序 |
| 文件树键盘导航 | 上下箭头选择，Enter 打开 |
| 搜索历史 | 搜索面板显示最近搜索词 |
| 标签面板 | 右面板显示所有标签，点击筛选笔记 |
| 日历面板 | 右面板日历视图，点击日期打开每日笔记 |
| 阅读收件箱 | 主视图聚合第三方阅读材料，内置 Notion/Readwise/Pocket 导入入口，按来源、状态和关键词筛选，来源数量会随当前搜索/状态/归档条件同步变化，并可按最新、最早、标题或来源排序且记忆来源/排序/待读/归档显示偏好；可把当前筛选结果作为阅读队列打开下一条待读，打开原文或原笔记、追加阅读笔记，把当前结果生成带高亮/笔记摘录、精确文件路径 wikilink 和来源路径元数据的阅读摘要笔记，或一键生成带摘录的 AI 消化提示以判断优先级、关联笔记和下一步动作，选中条目时可只消化选中范围；归档隐藏条目，并可单条或批量写回阅读状态、批量归档或批量取消归档当前结果 |
| 看板面板 | 右面板看板视图，显示所有任务待办/已完成 |
| 版本历史面板 | 右面板显示文件快照列表，支持预览/恢复 |
| 自动更新 | electron-updater，设置页检查更新 |
| 新用户引导 | 首次打开显示 5 步功能介绍引导 |
| 知识图谱自动刷新 | 笔记变化后图谱数据自动更新 |

### 打包与部署

| 功能 | 说明 |
|------|------|
| Windows 安装包 | NSIS 安装程序，支持自定义安装目录、桌面快捷方式 |
| macOS 分架构 | 分别构建 arm64 和 x64 dmg，beforePack 钩子自动重编译 native 模块 |
| Linux 便携版 | AppImage，无需安装即可运行 |
| GitHub Actions CI | 自动构建三平台并发布到 GitHub Releases |
| 自动发布 | electron-builder 推送 tag 后自动创建公开 release |

---

## v0.1.5 性能优化与 Bug 修复

### 性能优化

| 优化项 | 说明 |
|--------|------|
| FTS5 全文搜索 | 用 SQLite FTS5 虚拟表替代逐文件暴力扫描，搜索速度从 O(n×文件大小) 降到 O(log n) |
| 文件树浅加载 | refreshFiles 改用 file:list-shallow，子目录展开时按需加载，大 vault 打开速度显著提升 |
| 知识图谱高亮 | 切换文件时只更新节点高亮样式，不再销毁重建整个力导向图，消除闪烁 |
| Mermaid 动态导入 | 改为 dynamic import 按需加载，首屏 bundle 减少 2-3MB |
| 右侧面板代码分割 | GraphView/ChatPanel/Settings 等用 React.lazy 拆分，首屏只加载编辑器核心 |
| Store debounce 写入 | 配置文件写入改为 500ms 防抖合并，消除窗口 resize 等高频操作的磁盘抖动 |
| WikiLink 增量装饰 | 装饰器用 plugin state 管理，只在文档变更时重算，选区移动不再触发全文扫描 |
| Kanban 数据库查询 | 看板任务从 SQLite 查询而非逐文件读取，新增 tasks 表存储 checkbox 项 |
| QuickSwitcher 限流 | 空查询时只显示前 50 条结果，避免大 vault 渲染卡顿 |
| Supabase 并发同步 | push/pull 操作从串行改为 5 并发执行，提速 3-5 倍 |
| 索引分批处理 | index-vault 每 20 个文件让出事件循环，避免大 vault 索引时主进程冻结 |
| 语义检索缓存上限 | 限制最多 2000 条 chunk 缓存，按 updated_at DESC 排序，防止内存膨胀 |
| 搜索缓存作用域 | 搜索结果缓存区分 vault 和搜索模式，避免跨知识库命中旧结果 |
| 搜索缓存失效 | 文件变更或索引完成后清理当前 vault 搜索缓存，避免展示旧结果 |
| 编辑器滚动优化 | selectionUpdate 改为 80ms debounce 且去除 smooth 动画，连续按方向键不再叠加滚动 |
| 代码块折叠优化 | MutationObserver 加 300ms debounce 且仅在节点新增时触发，全屏切换不再卡顿 |

### Bug 修复

| 修复项 | 说明 |
|--------|------|
| AI 多模态消息 | 修复 AI chat 语义搜索处理 ChatContentPart[] 类型 content 的崩溃问题 |
| AI 补全过期结果 | 添加 AbortController，新请求发起时取消旧请求，防止幽灵文本闪烁 |
| Watcher 重复通知 | 结构变更和内容变更事件分离，消除同一文件收到多次 file:changed 的问题 |
| AI 消息文字溢出 | 消息气泡添加 wordBreak/overflowWrap，长 URL/路径自动换行 |
| macOS 15 图标白边 | PNG 改为全填深色背景方形，与 macOS 自动圆角遮罩匹配 |
| dompurify 构建失败 | 添加 resolve.alias 指向 pnpm store 实际 ESM 文件 |
| 架构错配崩溃 | macOS 改为 universal binary，解决 x64 主进程加载 arm64 native module 的 dlopen 错误 |

---

## v0.1.6 ~ v0.1.7 功能升级与优化

### 新增功能

| 功能 | 说明 |
|------|------|
| 窗口失焦自动保存 | 窗口失去焦点时立即保存当前文件，防止意外关闭丢失数据 |
| 窗口关闭前自动保存 | 关闭窗口前自动保存所有未保存的标签页内容 |
| 知识图谱自动刷新 | 笔记变化后图谱数据自动更新，无需手动刷新 |
| AI 多行输入 | 对话输入框改为 textarea，支持 Shift+Enter 换行 |
| 标签页中键关闭 | 鼠标中键点击标签页直接关闭 |
| 搜索键盘导航 | 搜索面板支持上下箭头选择结果并 Enter 跳转 |
| 新用户引导 | 首次打开显示 5 步功能介绍引导 |

### 性能优化

| 优化项 | 说明 |
|--------|------|
| Ctrl+S 智能跳过 | 无变更时跳过保存，避免无意义的磁盘写入和快照创建 |
| 版本历史自动清理 | 快照保留上限 50 个，超出自动清理旧快照 |
| Watcher per-file debounce | 文件变更事件按文件粒度防抖，减少频繁通知 |
| saveWindowBounds debounce | 窗口位置保存添加 500ms 防抖，减少磁盘写入 |
| 语义搜索内存缓存 | 避免每次查询重建全部 chunk 权重 |
| AI 上下文滑动窗口 | 最多发送最近 20 条消息，减少 token 消耗 |
| 编辑器 onUpdate debounce | 序列化操作 300ms 防抖，大文件编辑不再卡顿 |
| 语义索引进度通知 | 每 5 个文件发送进度事件到前端，用户可感知索引进度 |
| 知识图谱大量节点优化 | 大规模节点渲染性能提升 |
| localStorage 安全包装 | 防止 localStorage 异常导致崩溃，ChatPanel 消息组件 memo 优化 |

### Bug 修复

| 修复项 | 说明 |
|--------|------|
| ChatPanel 错误信息友好化 | 隐藏内部路径与技术细节，用户看到可理解的错误提示 |
| 敏感凭据加密存储 | 使用 Electron safeStorage 加密 API Key 等敏感信息 |
| ChatPanel Markdown 渲染 | 用 marked 替代手写渲染器，修复格式异常；自定义 ConfirmModal 替换 window.confirm |
| 统一确认弹窗 | 图谱推理、Kanban AI 写入、回收站清空统一使用 ConfirmModal |
| 弹出菜单关闭 | Sidebar/Vault 切换等弹出菜单点击外部正确关闭 |
| AI 对话清空确认 | 超过 3 条消息时弹出确认弹窗，防止误操作 |
| Wikilink 预览边界 | 预览弹窗自动避免超出屏幕边界 |
| 搜索历史点击 | 历史记录点击使用显式查询值，避免 React 状态延迟导致搜索旧关键词 |
| 命令面板滚动 | 键盘导航时选中项自动滚动到可视区域 |
| QuickSwitcher 滚动 | 键盘导航时选中项自动滚动到可视区域 |
| 同步定时器热更新 | 自动同步定时器响应配置变更，无需重启即可生效 |
| 自动同步设置即时生效 | 设置页修改自动同步间隔后立即通知主界面刷新定时器 |
| 重建索引保留推理链接 | db:index-vault 不再清空全部 inferred 链接，只清理失效笔记关联 |
| 数据库 vault 校验 | 切换 vault 时数据库单例自动重连，避免跨 vault 数据错乱 |
| AI XSS 防护 | ChatPanel AI 输出添加 DOMPurify 消毒，防止 XSS 注入 |
| saveFile 错误处理 | 保存失败时 Toast 提示，不再静默丢失 |

### 打包与 CI

| 改进项 | 说明 |
|--------|------|
| macOS 分架构打包 | 改用 macos-latest (arm64) + 分架构打包替代 universal，减小包体积 |
| beforePack 钩子 | 为目标架构重编译 better-sqlite3 native 模块，解决跨架构崩溃 |
| 发布模式修正 | electron-builder 默认发布为 release 而非 draft |

---

## v0.1.8 深度优化

### 安全与稳定性

| 改进项 | 说明 |
|--------|------|
| Store 原子写入 | 配置文件先写 .tmp 再 rename，崩溃时自动从 .bak 恢复 |
| IPC 路径安全校验 | file:write/delete 校验路径必须在 vaultPath 内，防止越权操作 |
| AI Provider 缓存感知 | 修改 provider 配置后自动重建实例，无需重启 |

### 性能优化

| 优化项 | 说明 |
|--------|------|
| QuickSwitcher SQL 优化 | 空查询直接 SQL LIMIT 50，不再加载全部笔记到前端 |
| Sidebar 细粒度订阅 | 拆分 vaultStore selector，避免无关字段变化触发重渲染 |
| AI 补全上下文扩大 | 上下文从 150→500 字符，debounce 从 1500→800ms |
| 编辑器序列化延迟 | onUpdate debounce 延长到 1000ms，立即标记 dirty |
| 标签页上限 30 | 超出时自动关闭最早未修改标签，防止内存膨胀 |

### 功能增强

| 功能 | 说明 |
|------|------|
| 同步完成事件 | cloud:sync-done 事件通知前端推送/拉取/冲突数量 |
| 搜索关键词高亮 | 搜索结果中匹配文本用 mark 标签高亮 |
| 实时搜索 | 关键词模式下输入 300ms 后自动搜索，无需按 Enter |
| 状态栏实时字数 | 编辑时字数/字符数立即更新，不等待序列化 |
| 标签页未保存指示 | 未保存标签名前显示醒目圆点 |

### 其他改进

| 改进项 | 说明 |
|--------|------|
| CommandPalette useMemo | 命令数组缓存，避免每次渲染重建闭包 |
| EditorToolbar memo | 工具栏组件 memo 化，减少无效重渲染 |
| 文件树排序缓存 | sortFiles 结果用 useMemo，避免每次渲染重算 |
| 窗口关闭通知 | 主进程 close 事件通知 renderer 保存 |
| will-quit flush | 应用退出时确保 Store 最后一次写入落盘 |
| 流式滚动优化 | AI 对话流式期间用 auto 滚动，避免动画叠加 |
| watcher 排除 .history | 快照目录变化不再触发文件监听事件 |
| 快照去重 | 内容与最新快照相同时跳过创建，减少磁盘写入 |
| Wikilink 预览缓存 | hover 预览内容缓存到内存，避免重复 IPC 读取 |
| Mermaid 渲染缓存 | 相同代码不重复渲染 SVG |
| 代码块折叠优化 | 移除 MutationObserver，改用 editor update 事件 |
| 日历面板优化 | 减少一次 IPC 往返 |
| 离线队列持久化 | 重启后自动恢复未完成的推送 |
| preload 监听修复 | AI 事件不再 removeAllListeners |
| Mermaid SVG 消毒 | DOMPurify 防止 SVG 注入 |
| 导出进度反馈 | PDF/HTML 导出时 toast 提示 |
| 快捷键冲突检测 | 重复绑定时 toast 警告 |
| 正则搜索 | 搜索面板新增正则表达式模式 |
| 文件树拖拽打开 | 拖拽文件到编辑区直接打开 |
| AI 写作菜单 debounce | 选区检测加 200ms 防抖 |
| FindReplace 优化 | 输入时只更新匹配数，导航时才定位 |
| 构建 minify | main/preload 开启代码压缩 |
| chunk 分割 | react/tiptap/d3/katex/marked 独立 chunk |
| tightLists | 列表项间不再插入多余空行 |
| 大小写搜索 | 搜索替换添加 Aa 大小写敏感开关 |
| 标签页固定 | 右键固定标签，不会被自动关闭 |
| 图谱搜索 | 知识图谱添加搜索框，高亮匹配节点 |

---

## v0.2.1 架构优化与功能增强

### 性能优化

| 优化项 | 说明 |
|--------|------|
| 语义搜索 top-K 排序 | 改用线性扫描找最小值替代每次 Array.sort，复杂度从 O(N·K log K) 降到 O(N·K) |
| Wikilink 重命名精准定位 | 利用 SQLite links 表查出引用文件，不再遍历整个 vault 文件系统 |
| 编辑器 state cache LRU | 添加 20 条上限，超出自动淘汰最早未访问的缓存，防止内存膨胀 |

### 功能增强

| 功能 | 说明 |
|------|------|
| AI 流式中断 | 停止按钮触发后端 AbortController，真正中断网络请求，不再浪费 token |
| 数据库迁移机制 | schema_version 表 + 增量迁移函数，未来加表改列无需手动处理 |
| 对话历史 SQLite 持久化 | 替代 localStorage，消除 5MB 配额限制，支持跨设备同步 |
| Claude 多模态图片 | 正确转换 base64 图片为 Anthropic image content block，粘贴图片可被 Claude 识别 |
| AI 意图识别独立调用 | 图谱、看板、编辑等意图先通过 ai:detect-intent 分类，再启动对应流程，聊天流不再混入意图标记 |

### 构建修复

| 修复项 | 说明 |
|--------|------|
| dompurify alias | 不再硬编码 pnpm store 版本路径，升级 dompurify 后构建不会断 |

---

## v0.2.2 ~ v0.2.5 功能与修复

### 新增功能

| 功能 | 说明 | 版本 |
|------|------|------|
| AI 对话多 session | 支持创建/切换/删除多个对话会话，上下文压缩 | v0.2.2 |
| 文件树多选删除 | Ctrl/Shift 多选文件，右键批量删除 | v0.2.2 |
| AI 批量生成笔记 | 编辑模式支持一次生成多篇笔记，自动创建目录 | v0.2.2 |
| AI 知识图谱生成 | 文件/文件夹右键或对话面板触发自动生成知识图谱 | v0.2.2 |
| 文件/文件夹拖入 AI 对话 | 从文件树拖拽到对话面板作为上下文引用 | v0.2.2 |
| AI 提供商国内厂商预设 | DeepSeek/通义千问/智谱/Moonshot/零一万物/豆包一键配置 | v0.2.2 |
| 文件树"在访达中显示" | 右键菜单增加在系统文件管理器中定位功能 | v0.2.3 |
| 文件创建/保存自动索引 | 保存时自动更新知识图谱索引，无需手动重建 | v0.2.3 |
| 更新流程完善 | 动态版本号 + 平台化升级提示 | v0.2.4 |
| Codex CLI Provider | 新增 Codex CLI 作为 AI 提供商选项 | v0.2.5 |

### Bug 修复

| 修复项 | 说明 | 版本 |
|--------|------|------|
| AI 对话气泡溢出 | 长内容不再超出消息气泡边界 | v0.2.4 |
| 批量生成目录识别 | 支持"在xxx下"语法 + 已有目录名匹配 + 不存在则自动创建 | v0.2.3 |
| 批量生成标题前缀 | 生成的笔记标题不再混入目录名 | v0.2.3 |
| 知识图谱 wikilink 匹配 | 同时支持标题和文件名匹配 | v0.2.3 |
| 知识图谱已删除文件 | 删除文件时同步清理数据库索引 | v0.2.3 |
| 文件树多选样式 | 去掉 outline 边框，只用背景色区分，间隔修复 | v0.2.2 |
| 文件拖入 AI 对话 | 修复全局 drop handler 拦截 + effectAllowed 不兼容 | v0.2.2 |
| @ 引用弹层 | 选择文件后正确关闭弹层 | v0.2.2 |
| ModelSelect 下拉裁剪 | 改为 fixed 浮层，不被父容器 overflow 裁剪 | v0.2.2 |
| 有序列表编号 | 显式声明 list-style-type 覆盖 Tailwind reset | v0.2.2 |
| macOS 签名 | 加入 ad-hoc 签名，缓解 Gatekeeper "已损坏" 提示 | v0.2.3 |
| better-sqlite3 重编译 | 改用 electron-builder install-app-deps 处理原生模块 | v0.2.4 |
| 更新检查 state | 相关状态移入 AppearanceTab，避免全局重渲染 | v0.2.5 |
| Codex CLI 兼容 v0.118 | 适配新版 CLI 参数（--full-auto/-o/-），修复 Windows spawn 和 PATH 查找 | v0.2.5 |
| 批量生成笔记索引 | 生成多篇笔记后全局 resolveAllLinks，wikilink 互引在知识图谱中正确显示 | v0.2.5 |

### 体验优化

| 优化项 | 说明 | 版本 |
|--------|------|------|
| ChatPanel 组件拆分 | 消息列表/气泡独立 memo 组件，流式输出不再触发整个面板重渲染 | v0.2.5 |
| AI 重新生成按钮 | 最后一条 AI 回复下方显示"重新生成"，一键重发上一条问题 | v0.2.5 |
| 自动保存去重 | 引入 isSaving mutex，防止高频触发导致并发写入 | v0.2.5 |
| AI 编辑保留 Undo | 应用 AI 修改使用 editor.chain().selectAll().insertContent()，Ctrl+Z 可撤销 | v0.2.5 |
| 关闭已保存标签 | 标签页右键菜单新增"关闭已保存"，一键清理无修改标签 | v0.2.5 |
| 知识图谱筛选 | 新增最小链接数过滤 + 标签显隐开关，多维度筛选节点 | v0.2.5 |
| 全局快速新建 | Ctrl+Shift+N 系统级快捷键，任何时候唤起窗口并新建笔记 | v0.2.5 |
| AI 对话面板持久化 | 切换右面板或关闭面板时 ChatPanel 保持挂载，流式输出和历史不丢失 | v0.2.5 |

### Bug 修复（UX）

| 修复项 | 说明 | 版本 |
|--------|------|------|
| openFile 竞态保护 | 快速切换文件时互斥锁防止并发保存导致数据丢失 | v0.2.5 |
| 版本恢复编辑器刷新 | HistoryPanel 恢复快照后通知 TipTap 编辑器重载内容 | v0.2.5 |
| QuickSwitcher 搜索防抖 | 输入 150ms 后才发起 IPC 搜索，减少无效调用和结果闪烁 | v0.2.5 |
| 文件删除确认弹窗 | 右键删除文件/文件夹前弹出确认对话框，防止误操作 | v0.2.5 |
| ChatPanel 流式中断竞态 | 发送新消息中断流式时正确标记防止消息重复追加 | v0.2.5 |
| 编辑器切换内容闪烁 | 切换标签时从 store 读取最新 content 避免闭包过期 | v0.2.5 |
| Wikilink 预览幽灵弹窗 | 切换文件时取消异步预览请求，清除残留弹窗 | v0.2.5 |

---

## v0.3.0 ~ v0.3.1 语义搜索重构 + 独立看板 + UI 优化

### 新增功能

| 功能 | 说明 |
|------|------|
| 独立看板任务管理 | 独立数据模型（columns, tasks, task_relations），不依赖 markdown checkbox |
| 任务关联 | 支持 blocks / depends_on / related 三种关系类型 |
| 看板 AI 分析 | AI 分析看板全局状态，给出优化建议 |
| 看板 AI 拆解任务 | AI 将大任务拆解为子任务并自动建立关联 |
| 看板从笔记提取 | AI 从笔记内容提取待办任务到看板 |
| 看板拖拽排序 | 任务卡片拖拽移动到不同列，支持列排序 |
| 任务详情抽屉 | 点击任务展开详情，编辑优先级/截止日期/描述/关联 |
| VS Code 风格 Activity Bar | 竖直图标导航栏，替代旧侧边栏切换方式 |
| Frontmatter 标签管理 | 可视化管理标签，编辑器隐藏 frontmatter 源码 |
| 大纲跳转动画 | easeInOutCubic 缓动滚动到对应标题 |
| 快速切换快捷键别名 | 快速切换同时支持 Ctrl+O 和 Ctrl+P，贴近编辑器/命令启动器习惯 |

### 语义搜索重构

| 改进项 | 说明 |
|--------|------|
| 移除 embedding API 依赖 | 不再需要 text-embedding-3-small，普通 chat completion 模型即可 |
| TF-IDF + AI rerank | TF-IDF 初筛候选 → AI chat completion 语义重排序 |
| 中文 bigram 分词 | 中文文本使用 bigram 切分 + 完整词，大幅提升中文搜索准确性 |
| 标题/标题加权 | 查询词出现在标题中权重 ×2.5，heading 中 ×1.5 |
| 高置信度跳过 AI | TF-IDF 分数明显领先时直接返回，毫秒级响应 |
| 搜索结果去重 | 同一篇笔记只返回最佳匹配 chunk，不再重复出现 |
| 搜索结果缓存 | 按 vault、模式、查询缓存，历史记录点击秒出 |
| 索引进度优化 | 最小 1.5 秒持续时间 + 逐步推进动画，避免闪烁 |

### UI 优化

| 改进项 | 说明 |
|--------|------|
| macOS TitleBar 简化 | Mac 下隐藏 logo 和文字，只保留透明拖拽区域 |
| 标签面板 pill 样式 | icon + 标题同行，标签恢复 pill 样式，SVG 关闭按钮 |
| 语义搜索状态隐藏 | 索引完成后隐藏进度条和百分比，不干扰搜索结果 |
| 搜索结果去百分比 | 移除结果项的 score 百分比标签，界面更简洁 |

---

## v0.3.2 ~ v0.3.5 知识图谱增强 + 多语言 + AI 编辑体验升级

### 新增功能

| 功能 | 说明 |
|------|------|
| i18next 多语言框架 | 引入 i18next，支持中英文切换，设置中新增语言入口 |
| OpenAI Responses 协议 | 新增 OpenAI Responses 协议类型支持 |
| 笔记记忆文件系统 | 基于文件系统的记忆机制，提升跨目录关联准确性 |
| 知识图谱"生成记忆"按钮 | 图谱面板一键触发 AI 生成笔记记忆，显示逐篇进度、失败统计和处理范围 |
| AI 语义关联推断 | AI 推断链接标记 link_type，全局语义关联先生成结果再事务替换旧推理链接 |
| Kanban AI 写入预览 | 从笔记提取任务和任务拆解会先展示待创建任务，确认后再写入看板 |
| AI 长任务取消 | 聊天、批量生成、Agent、Kanban AI、记忆生成与全局推理共享取消控制 |
| 文件监听自动索引 | 文件变更时自动索引笔记内容和嵌入向量 |
| Claude/Ollama 重试机制 | Provider 请求失败时自动重试 |
| 编辑模式流式反馈 | 编辑模式实时显示生成进度 |
| 编辑模式 diff 预览 | 编辑结果支持 diff/preview 切换查看 |
| AI 回复复制按钮 | 所有 AI 消息显示操作栏，支持一键复制 |
| 流式中断保留内容 | 中断流式响应时保留已生成部分，支持继续生成 |
| Token 用量指示器 | 输入框底部显示当前 token 用量 |
| Onboarding 全屏沉浸式 | 重构引导页为全屏沉浸式体验 |
| 多 group 混合颜色 glow | 多分组节点使用混合颜色的发光滤镜 |

### 性能优化

| 优化项 | 说明 |
|--------|------|
| 意图识别独立调用 | 使用轻量 ai:detect-intent 先分类，再进入聊天、图谱、看板或编辑流程 |
| TypeScript 验证 | 根 typecheck 脚本覆盖 shared/main/renderer，IPC 类型补齐后可完整通过 |
| 测试验证 | 恢复向量相似度测试辅助函数，Vitest 全量测试可通过 |

### 重构

| 改进项 | 说明 |
|--------|------|
| AI 提示词英文化 | 所有 AI 提示词转为英文，应用 Claude Code 提示词工程最佳实践 |
| AI/Cloud 类型边界收敛 | Provider SDK 适配、Agent 工具参数、Kanban AI JSON、renderer 错误提示、云同步配置和 preload 参数均使用显式类型或 `unknown` 窄化 |

### 知识图谱视觉优化

| 改进项 | 说明 |
|--------|------|
| 节点 hover 毛玻璃发光 | 增强 hover 效果，毛玻璃发光反馈 |
| 当前节点 glow + 涟漪 | 当前打开文件节点使用更强的 glow 和涟漪效果 |
| 涟漪半径调优 | 缩小涟漪扩散半径 40px → 28px |
| 统一 margin 圆角 | 图谱视图与编辑器使用统一的 margin 和圆角 |
| 连线渐变效果 | 知识图谱连线渐变效果及交互优化 |
| 非高亮连线可见度 | 提高非高亮连线的可见度 |
| 关联节点联动高亮 | 增强 hover 高亮亮度及关联节点联动高亮 |

### Bug 修复

| 修复项 | 说明 |
|--------|------|
| AI 对话残余消息 | 停止 AI 对话后不再收到残余消息 |
| 图谱节点点击闪烁 | 修复点击文件节点切换时的闪烁 |
| 图谱视图切回编辑器 | 图谱视图下点击文件按钮正确切回编辑器 |
| 涟漪颜色跟随 group | 涟漪动画颜色跟随节点 group 颜色 |
| 同名文件误高亮 | 用 filePath 匹配当前节点，解决同名文件误高亮 |
| fileHoverFilterIds 初始化 | 修复在初始化前被引用的错误 |
| 跨目录笔记误关联 | 修复知识图谱跨目录笔记误关联 |
| 文件树多选删除 | 修复多选删除不完整问题 |
| 批量生成多目录 | AI 批量生成支持多目录指令 |
| Supabase 中文路径 | 存储路径编码兼容中文文件名 |
| 跨平台 API Key 加密 | 修复跨平台加密解密失败问题 |
| 批量生成目录推断 | AI 编辑批量生成时支持语义推断目录名 |
| 跨目录关联准确性 | 提高知识图谱跨目录关联准确性 |
| Token 估算 CJK | Token 估算支持 CJK 字符，概念匹配大小写归一化 |

---

## v0.3.8 AI 对话附件与发布入口增强

### 新增功能

| 功能 | 说明 |
|------|------|
| AI 对话草稿 | 未发送输入按 vault 和会话自动保存，切换会话或重开面板后恢复，发送后清除 |
| AI 会话自动命名 | 新会话首次提问后自动从问题生成简短标题，减少历史会话列表里的空白项 |
| AI 文档附件 | 对话支持 PDF、DOC/DOCX、XLS/XLSX、CSV/TSV/TXT/RTF 等文档附件，并把可提取文本注入本轮上下文 |
| AI 附件选择器 | 对话输入区新增附件按钮，可从系统文件选择器添加图片、Markdown 和文档附件 |
| 知识空间分组标签 | 知识空间按来源、状态、标签和日期分组时显示分组标签，提升大画布扫视效率 |

### 体验优化

| 优化项 | 说明 |
|--------|------|
| 图片附件发送后清空 | 图片随 AI 消息发送后立即从输入框移除，避免下一轮误带旧图片 |
| 文档附件发送后清空 | 文档附件随消息发送后同步清空，保持输入区状态和已发送消息一致 |
| 附件空输入发送 | 只有附件没有文字时可直接发送，并自动使用附件分析提示 |
| 官网下载入口 | 下载页改为真实 GitHub 仓库地址，并用单一版本常量生成各平台安装包链接 |
| 网站日志页 lint | 日志页首次加载改为异步调度，满足 React hooks lint 规则 |
| 知识空间拖拽连线性能 | 拖拽中使用轻量跟随线，拖拽结束保持当前路线不再触发跳线式重算，完整避让路线迁移到 Web Worker 计算，连续拖拽不再阻塞主线程 |

---

## v0.3.6 ~ v0.3.7 Agent 知识库工具与链接体验增强

### 新增功能

| 功能 | 说明 |
|------|------|
| AI Agent 笔记定位增强 | Agent 可按标题、文件路径、别名、大小写变体定位笔记，搜索结果带路径，找不到唯一结果时返回候选项 |
| AI Agent 精读工具 | 支持读取整篇笔记、当前笔记、指定行范围、指定 heading 章节和 Markdown 块引用，读取结果包含标题、路径、行号等元数据 |
| AI Agent 知识库导航 | 新增 vault overview、最近笔记、文件夹/标签/属性导航、属性值统计、任务列表、断链、孤岛、无反链、终点笔记、空笔记、长笔记、重复标题/别名和链接枢纽等工具 |
| AI Agent 当前笔记工具 | 新增当前笔记正文、行范围、标题、块引用、任务、属性、链接摘要和未链接引用工具，围绕正在编辑的文件做上下文问答 |
| AI Memory 工具扩展 | Agent 可读取笔记记忆、当前笔记记忆、记忆覆盖概览、缺失记忆笔记、文件夹覆盖、概念/主题列表、概念共现和按记忆概念查找笔记 |
| AI 闪卡生成 | 命令面板可从当前笔记生成 Anki 风格 basic/cloze 闪卡，追加 `#flashcard`、状态、间隔、ease 和 due 字段 |
| 闪卡 SRS 调度接口 | 新增 vault 级到期闪卡队列与评分写回 IPC，基于 Markdown 字段完成 Again/Hard/Good/Easy 调度并重新索引笔记 |
| 链接概览行号跳转 | 反向链接、出链和未链接提及都记录来源行号，点击概览项可直接跳到对应位置 |
| 未链接提及一键转链 | 链接概览可把来源行中的纯文本提及单条或批量转换为 `[[wikilink]]`，并刷新链接关系 |
| 未创建链接即时索引 | 从链接概览中新建未创建出链后，立即把新笔记纳入索引，避免关系延迟出现 |
| 嵌套 Wikilink 解析 | 支持 `[[folder/note]]`、`[[note#heading]]` 等路径/标题组合解析到嵌套笔记 |

### 体验优化

| 优化项 | 说明 |
|--------|------|
| 当前笔记命令保护 | 依赖当前文件的 AI 编辑、属性、标签、历史和大纲入口在无打开笔记时给出提示或禁用，避免空上下文误操作 |
| Activity Bar 可用性收敛 | 右侧文件面板只在编辑器视图且有当前文件时可用，切到图谱/画布/属性数据库时自动隐藏不适用面板 |
| AI 工具状态可读化 | 工具调用状态显示中文动作和关键参数，并限制过长细节，流式执行时更容易判断 Agent 正在做什么 |
| AI 上下文保留 | intent detection 和 chat 会保留客户端注入的 system context，当前笔记路径可传入 Agent 对话 |
| 知识空间新节点定位 | 新建知识节点优先落在当前可视视口附近，并避开已有节点，减少创建后找不到节点的问题 |

### 兼容与索引修复

| 修复项 | 说明 |
|--------|------|
| Obsidian 嵌套标签 | 索引器正确识别 `#parent/child` 形式的嵌套标签 |
| Frontmatter CRLF | frontmatter 解析/写回兼容 CRLF 换行，标签栏和标签面板统一通过 frontmatter 工具更新 |
| 未链接提及精度 | 未链接提及匹配避免命中单词或中文片段内部的局部文本 |
| 链接概览路径解析 | 链接概览按路径解析笔记，减少同名笔记、嵌套目录和别名场景误跳转 |
| AI 批量生成防覆盖 | 批量生成笔记会对重复标题去重避让，不覆盖已有文件 |
| 语义搜索 fallback | AI 搜索在 FTS/语义召回不足时使用索引文本和查询词 fallback，提高弱匹配命中率 |

### 测试覆盖

| 覆盖项 | 说明 |
|--------|------|
| AI 工具格式化 | `ai-search-results` / `ai-tool-labels` 覆盖新增工具输出和状态文案 |
| 笔记定位与链接解析 | `ai-note-lookup` / `indexer` 覆盖别名、路径、heading、块引用、行号、延迟链接解析和未链接提及 |
| 语义搜索与参数解析 | `embedding` / `ai-tool-arguments` / `ai-tool-limits` 覆盖 fallback 搜索、模型文本参数解析和工具结果限制 |
| 画布与 Activity Bar | `canvas-view` / `activity-bar-registry` 覆盖新卡片视口定位和文件面板可用性 |
| AI 闪卡 | `ai-flashcards` 覆盖 JSON 归一化、去重、卡片数量限制、SRS 字段、本地日期、到期队列和评分更新 |

---

## 近期 Git 记录回写（master 至 7d2096e）

| Git 记录 | 文档回写内容 |
|----------|--------------|
| `7d2096e feat: add canvas group labels` | 知识空间按当前图层生成来源、状态、标签或日期分组标签，并补充英中 i18n 与 `canvas-view` 回归测试 |
| `80e04d4 Refine knowledge space node cards` / `e0ebac4 Consolidate knowledge space entry labels` | 知识空间入口文案和节点卡片信息层级收敛，减少图层视图中的噪声 |
| `4bebfbf Improve knowledge space edge routing` | 知识空间连接线改为绕开卡片的折线路由，降低节点密集时的遮挡 |
| `d88bd1c Fix knowledge space rearrange basis` / `bc8d623 Allow dragging cards in all canvas modes` | 属性和时间图层按当前图层基础重排，所有图层都支持手动拖拽位置覆盖 |
| `79c0d06 Add knowledge association review queue` / `7d8edf2 Accept implicit knowledge associations` / `cff7ac2 Show implicit knowledge associations` | 知识空间展示隐式关联建议、支持队列审阅，并可把接受的建议写回笔记 Connections 区块 |
| `495a3ea Add selected reader AI digestion` | 阅读收件箱支持只把选中条目交给 AI 消化 |
| `26d4b3e Add reader inbox continuous triage` / `901d94c Redesign reader inbox workflow` | 阅读收件箱补充连续 triage、队列打开、筛选统计和批量状态处理能力 |

---

## 历史版本资产格式

| 平台 | 文件名 | 安装方式 |
|------|--------|----------|
| Windows | `Nexusky-Setup-X.X.X.exe` | 双击运行 NSIS 安装程序 |
| macOS | `Nexusky-X.X.X-arm64.dmg` / `Nexusky-X.X.X-x64.dmg` | 双击挂载 dmg，拖拽 Nexusky.app 到 Applications |
| Linux | `Nexusky-X.X.X.AppImage` | `chmod +x` 后双击运行，无需安装 |

---

## 快捷键一览

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+N` | 全局快速新建笔记（系统级） |
| `Ctrl+N` | 新建笔记 |
| `Ctrl+O` / `Ctrl+P` | 快速切换笔记 |
| `Ctrl+W` | 关闭当前标签 |
| `Ctrl+Tab` | 下一个标签 |
| `Ctrl+E` | 文档大纲面板 |
| `Ctrl+G` | 知识图谱（右面板） |
| `Ctrl+Shift+G` | 知识图谱（全屏） |
| `Ctrl+L` | AI 对话 |
| `Ctrl+H` | 搜索替换 |
| `Ctrl+,` | 设置 |
| `Ctrl+Shift+S` | 云端同步 |
| `Ctrl+Shift+F` | 全文搜索 |
| `Ctrl+Shift+B` | 折叠/展开侧边栏 |
| `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+Shift+K` | 删除当前行 |
| `Shift+Enter` | AI 对话输入框换行 |
| `/` | Slash Command 快捷插入菜单 |
| `F11` | 聚焦模式 |
| `Tab` | 接受 AI 补全 |
| `Esc` | 取消 AI 补全 |

快捷键可在设置 > 快捷键中自定义。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 构建工具 | electron-vite + Vite 6 |
| 前端 | React 19 + Zustand |
| 编辑器 | TipTap 2 (ProseMirror) + lowlight + KaTeX + Mermaid |
| 样式 | Tailwind CSS 4 + CSS Variables |
| 数据库 | better-sqlite3 (WAL) |
| AI SDK | openai + @anthropic-ai/sdk |
| 图谱 | D3-force + D3-zoom + D3-drag |
| 云端 | @supabase/supabase-js + Microsoft Graph API |
| 文件监听 | chokidar |
| 自动更新 | electron-updater |
| 打包 | electron-builder |
| CI/CD | GitHub Actions（自动发布到 Releases） |

---

## 未来可扩展方向

### 编辑器增强
- [x] 代码块语法高亮（lowlight）
- [x] Mermaid 图表渲染（流程图、时序图）
- [x] 数学公式支持（KaTeX）
- [x] 嵌入式笔记（transclusion，`![[笔记名]]`）
- [x] 编辑器内搜索替换（Ctrl+H）
- [x] 折叠代码块
- [x] Wikilink 悬浮预览
- [x] Slash Command 快捷命令（`/` 触发插入菜单）
- [ ] 多光标编辑
- [ ] Vim 模式
- [x] 拼写检查

### AI 能力
- [x] 本地模型支持（Ollama）
- [x] AI 自动标签建议
- [x] AI 对话历史持久化
- [x] AI 对话 @ 引用笔记
- [x] AI 编辑模式（类 Claude Code，直接修改笔记）
- [x] 多模态图片支持
- [x] AI 对话导出为笔记
- [x] AI 笔记摘要生成
- [x] Kanban AI 任务预览确认
- [x] AI 长任务取消
- [x] AI 闪卡生成（Anki 风格复习）
- [x] AI 知识图谱自动扩展（发现隐含关联）
- [x] 语音输入转文字（编辑器麦克风录音，OpenAI 兼容转写后插入光标位置）

### 知识管理
- [x] 日历视图（按日期浏览笔记）
- [x] 看板视图（任务管理）
- [x] 笔记加密（AES-256-GCM）
- [x] 笔记分享（生成 HTML）
- [x] 版本历史快照 + UI
- [x] 回收站 + UI
- [x] 时间线视图（按创建/更新时间分组浏览笔记活动）
- [x] 笔记模板市场
- [ ] Obsidian vault 完整兼容导入

### 协作与同步
- [x] 多后端同步（Supabase / iCloud / OneDrive）
- [x] 独立拉取操作
- [x] 同步冲突检测
- [x] 同步状态指示器（状态栏图标）
- [x] 自动定时同步
- [x] 索引数据云端同步
- [ ] 实时协作编辑（Supabase Realtime + CRDT）
- [x] 选择性同步（只同步部分文件夹）
- [x] 离线队列（断网时缓存操作，恢复后同步）
- [x] WebDAV 自定义同步后端
- [x] S3 自定义同步后端

### 插件系统
- [ ] 插件 API 设计
- [x] 插件市场（内置精选插件包，一键安装到 `.nexusky/plugins`）
- [x] 自定义主题包
- [x] 自定义快捷键映射
- [x] 第三方服务集成（Notion、Readwise、Pocket）

### 性能优化
- [x] 文件监听（chokidar）自动刷新文件树
- [x] AI 补全性能优化（缓存/限制 token/非流式 + AbortController）
- [x] 虚拟滚动文件树（万级文件）
- [x] 文件列表懒加载（展开时按需加载子目录）
- [x] FTS5 全文搜索
- [x] 图谱 simulation 持久化（切换文件只更新高亮）
- [x] Mermaid 动态 import
- [x] 右侧面板 React.lazy 代码分割
- [x] Store debounce 写入
- [x] WikiLink 增量装饰
- [x] Kanban 任务数据库查询
- [x] QuickSwitcher 结果限制
- [x] Supabase 同步并发
- [x] index-vault 分批处理
- [x] 语义检索缓存上限
- [x] 语义搜索 top-K 排序优化
- [x] Wikilink 重命名精准定位（利用 DB 查询）
- [x] 编辑器 state cache LRU 上限
- [x] localStorage 安全包装统一用于核心 UI 状态
- [x] Worker Thread 后台索引（全量 vault 索引在独立 worker 中执行并回传进度）
- [x] 数据库查询缓存（vault-scoped TTL/LRU，索引变更自动失效）

### 发布与运营
- [x] 自动更新（electron-updater）
- [x] GitHub Actions CI 自动发布
- [x] 崩溃报告收集（主进程异常、Promise rejection、渲染/子进程崩溃结构化落盘并上报）
- [ ] 官网 + 文档站

---

## 项目结构

```
packages/
  main/           → Electron 主进程
    src/
      ipc/        → IPC 通信（file, vault, db, ai, cloud, template, export）
      services/   → 业务逻辑（database, indexer, embedding, store, ai/）
  renderer/       → React 渲染进程
    src/
      components/ → UI 组件
        editor/   → 编辑器、工具栏、扩展、反向链接、大纲、AI 写作菜单
        sidebar/  → 侧边栏、文件树
        graph/    → 知识图谱
        ai/       → AI 对话面板
        settings/ → 设置
      stores/     → Zustand 状态管理（editor, vault, ui）
      styles/     → 全局 CSS
  shared/         → 共享类型定义
supabase/         → 云端 schema + 配置指南
.github/workflows → CI/CD
scripts/          → 开发脚本
```

---

## 下一步可优化/扩展方向

### 产品体验
- [x] Obsidian vault 导入兼容（解析 frontmatter、dataview 语法，并将 `.canvas` 画布转换为可索引 Markdown 地图）
- [x] 笔记模板市场（社区共享模板）
- [x] 全局快捷键唤起（类 Raycast，系统级快速记录）
- [x] 多窗口支持（同时打开多个笔记窗口）
- [x] 工作区布局和侧边栏宽度按 vault 独立记忆
- [x] 拖拽分屏（左右并排编辑两个笔记）
- [x] 自定义 slash command 扩展（本地插件命令可直接从编辑器 `/` 菜单唤起 AI 工作流）
- [x] 阅读收件箱（聚合 Notion、Readwise、Pocket 导入内容）

### AI 进阶
- [x] AI 笔记摘要生成（一键生成笔记摘要）
- [x] AI 闪卡生成（Anki 风格卡片 + SRS 字段）
- [x] 闪卡间隔复习调度接口
- [x] 闪卡复习面板
- [x] AI 知识图谱自动扩展（发现笔记间隐含关联）
- [x] AI 多轮编辑（连续修改同一文件，保持上下文）
- [x] AI 写作风格学习（从当前笔记提取风格画像，注入续写、选区改写、整篇 AI 编辑）
- [x] 语音输入转文字（Whisper API / OpenAI 兼容转写）

### 编辑器
- [ ] 多光标编辑
- [ ] Vim 模式
- [x] 拼写检查（Electron 内置）
- [x] 表格公式计算（Markdown 表格支持单元格引用、四则运算、SUM/AVG/MIN/MAX）
- [x] 脚注支持（AI Markdown 与 HTML/PDF/发布站点导出）
- [x] Obsidian Callout 渲染（AI Markdown 与 HTML/PDF/发布站点导出）

### 协作与平台
- [ ] 实时协作编辑（CRDT + WebSocket）
- [ ] Web 版本（共享渲染层代码）
- [x] 浏览器扩展（本地 Web Clipper 服务 + Chromium 扩展网页剪藏到 vault，HTML fallback 保留 Markdown 链接）
- [x] CLI 工具（`pnpm cli new/search` 命令行快速创建和搜索 vault 笔记）
- [x] Notion 导出导入（Markdown、CSV 和 HTML 文件夹转为可索引笔记）
- [x] Readwise 高亮导入（CSV 导出转为来源化 Markdown 笔记）
- [x] Pocket 稍后读导入（HTML 导出转为阅读条目笔记）
- [ ] iOS/Android 移动端

### 插件系统
- [x] 插件 API 设计（声明式注册命令、面板、编辑器扩展能力）
- [x] 自定义主题包
- [x] 自定义快捷键映射
- [x] 第三方服务集成（Notion、Readwise、Pocket）
