# Nexusky — AI 驱动的知识库笔记应用

> 本地优先、双向链接、AI 语义搜索、知识图谱可视化

## 已实现功能

### 核心编辑

| 功能 | 说明 |
|------|------|
| TipTap 富文本编辑器 | 基于 ProseMirror，支持 Markdown 语法 |
| Markdown 序列化 | 编辑器内容与 .md 文件双向转换 |
| 多标签页 | 同时打开多个文件，拖拽排序，右键菜单 |
| 分屏编辑 | 标签页右键"在右侧打开"，并排查看两个笔记 |
| 编辑器工具栏 | 标题、加粗、斜体、删除线、代码、列表、引用、表格、任务列表、高亮、分割线 |
| Slash Command | 输入 `/` 弹出命令菜单，快速插入标题、列表、代码块、表格、日期等 |
| 代码块语法高亮 | lowlight（highlight.js），支持常见语言 |
| 代码块折叠 | 超过 5 行自动折叠，hover 显示展开按钮 |
| 数学公式 | KaTeX 渲染，`$行内$` 和 `$$块级$$` |
| Mermaid 图表 | mermaid 代码块自动渲染为流程图/时序图 |
| 嵌入式笔记 | `![[笔记名]]` 内联显示引用笔记内容 |
| Wikilink 预览 | hover `[[链接]]` 显示目标笔记摘要 |
| 搜索替换 | Ctrl+H 打开，支持上下导航/替换/全部替换 |
| 表格支持 | 插入可调整大小的表格 |
| 任务列表 | `- [ ]` 复选框，可点击勾选 |
| 图片粘贴/拖拽 | 粘贴截图或拖拽图片自动保存到 vault/assets/ |
| 预览模式 | 切换编辑/只读预览 |
| 聚焦模式 | F11 隐藏所有 UI，纯写作 |
| 面包屑导航 | 显示当前文件路径层级 |
| 底部状态栏 | 字数、字符数、阅读时间、保存状态、同步指示器 |
| 版本历史 | 每次保存自动创建快照，工具栏按钮查看/恢复 |
| 自动保存 | 窗口失焦或关闭前自动保存未保存内容，防止数据丢失 |
| 导出 PDF/HTML | 工具栏导出按钮 |
| 笔记分享 | 生成精美 HTML 复制到剪贴板 |
| 笔记加密 | AES-256-GCM 加密单个笔记 |

### 双向链接与知识图谱

| 功能 | 说明 |
|------|------|
| `[[wikilink]]` 语法 | 紫色高亮显示，点击跳转到对应笔记 |
| 自动创建笔记 | 点击不存在的 wikilink 自动创建新笔记 |
| 反向链接面板 | 编辑器底部显示引用当前笔记的所有笔记 |
| 知识图谱 | D3 力导向图，节点大小按链接数缩放，hover 高亮相邻节点 |
| 全屏图谱 | Ctrl+Shift+G 切换图谱为主视图 |
| 当前笔记高亮 | 图谱中当前打开的笔记有特殊高亮 |

### AI 功能

| 功能 | 说明 |
|------|------|
| 多 Provider 支持 | OpenAI、Claude、Ollama（本地）、自定义（中转站/国产模型） |
| 配置自动检测 | 读取本地 Claude Code / Codex 配置，一键导入（跨平台） |
| 模型下拉选择 | 预设最新模型列表（gpt-5.5/4.1/claude-4 等），支持自定义输入 |
| AI 对话面板 | Ctrl+L 打开，流式输出，Markdown 渲染 |
| 多行输入 | 对话输入框支持 Shift+Enter 换行，textarea 多行编辑 |
| 对话历史持久化 | 对话自动保存到 localStorage，重启恢复 |
| 对话引导面板 | 空状态显示可点击的快捷操作卡片 |
| 停止生成 | 流式期间可点击停止按钮中断，输入框始终可用 |
| @ 引用笔记 | 输入 @ 选择笔记作为上下文发送给 AI |
| AI 编辑模式 | 类 Claude Code，直接修改笔记内容，预览后确认应用 |
| 编辑即时生效 | 应用修改后编辑器立即刷新，无需切换标签 |
| 编辑预览展开 | 预览面板支持展开/收起，可查看完整修改内容 |
| 多轮编辑 | 编辑模式保持历史上下文，连续修改同一文件 |
| 图片多模态 | 粘贴图片发送给 AI（支持 GPT-4o/Claude） |
| RAG 问答 | 对话时自动检索相关笔记内容，带来源引用 |
| AI 行内补全 | 写作停顿后出现 ghost text，Tab 接受（优化：缓存/限 token） |
| AI 写作辅助 | 选中文本后浮动菜单：总结/扩展/改写/翻译/简化 |
| AI 笔记摘要 | 命令面板一键生成摘要插入开头 |
| AI 标签建议 | 保存时自动建议标签（toast 提示） |
| 对话导出 | 将 AI 对话导出为 Markdown 笔记 |
| AI 输出 XSS 防护 | DOMPurify 消毒 AI 输出内容，防止注入攻击 |
| 对话清空确认 | 超过 3 条消息时弹出确认弹窗，防止误操作 |
| 凭据加密存储 | API Key 等敏感信息使用 Electron safeStorage 加密 |
| 向量嵌入 | 笔记自动分块 + embedding（text-embedding-3-small） |
| 语义搜索 | 基于向量的相似度检索 |
| 向量索引云端同步 | 多设备共享同一套索引 |

### 搜索与导航

| 功能 | 说明 |
|------|------|
| 快速切换 | Ctrl+O 模糊搜索笔记，显示文件目录路径 |
| 全文搜索 | Ctrl+Shift+F，点击结果跳转到对应行 |
| 搜索历史 | 搜索面板显示最近搜索词，点击快速重搜 |
| 搜索面板键盘导航 | 上下箭头选择搜索结果，Enter 跳转 |
| 命令面板 | Ctrl+Shift+P，20+ 命令 |
| 文档大纲 | Ctrl+E 右面板显示标题层级 |
| 标签面板 | 右面板显示所有标签，点击筛选笔记 |
| 日历面板 | 右面板日历视图，点击日期打开每日笔记 |
| 看板面板 | 右面板看板视图，待办/已完成任务 |
| 文档大纲 | 右侧面板显示标题层级 |
| 最近文件优先 | 快速切换器中最近打开的文件排在前面 |

### 数据与索引

| 功能 | 说明 |
|------|------|
| SQLite 本地数据库 | better-sqlite3，WAL 模式 |
| 笔记索引 | 标题、链接关系、标签自动提取 |
| 标签系统 | `#tag` 语法自动解析，按标签筛选 |
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
| 向量索引同步 | 多设备共享同一套索引数据库 |
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
| 模板系统 | 空白、会议记录、读书笔记、项目文档 |
| Obsidian 导入 | 命令面板导入，自动转换 callout 语法 |

### UI 与体验

| 功能 | 说明 |
|------|------|
| 深色主题 | OKLCH 色彩系统 |
| 主题切换 | 亮/暗模式 |
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
| Embedding 缓存上限 | 限制最多 2000 条 chunk 缓存，按 updated_at DESC 排序，防止内存膨胀 |
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
| 语义搜索内存缓存 | 避免每次查询反序列化全部 embedding |
| AI 上下文滑动窗口 | 最多发送最近 20 条消息，减少 token 消耗 |
| 编辑器 onUpdate debounce | 序列化操作 300ms 防抖，大文件编辑不再卡顿 |
| 向量索引进度通知 | 每 5 个文件发送进度事件到前端，用户可感知索引进度 |
| 知识图谱大量节点优化 | 大规模节点渲染性能提升 |
| localStorage 安全包装 | 防止 localStorage 异常导致崩溃，ChatPanel 消息组件 memo 优化 |

### Bug 修复

| 修复项 | 说明 |
|--------|------|
| ChatPanel 错误信息友好化 | 隐藏内部路径与技术细节，用户看到可理解的错误提示 |
| 敏感凭据加密存储 | 使用 Electron safeStorage 加密 API Key 等敏感信息 |
| ChatPanel Markdown 渲染 | 用 marked 替代手写渲染器，修复格式异常；自定义 ConfirmModal 替换 window.confirm |
| 弹出菜单关闭 | Sidebar/Vault 切换等弹出菜单点击外部正确关闭 |
| AI 对话清空确认 | 超过 3 条消息时弹出确认弹窗，防止误操作 |
| Wikilink 预览边界 | 预览弹窗自动避免超出屏幕边界 |
| 命令面板滚动 | 键盘导航时选中项自动滚动到可视区域 |
| QuickSwitcher 滚动 | 键盘导航时选中项自动滚动到可视区域 |
| 同步定时器热更新 | 自动同步定时器响应配置变更，无需重启即可生效 |
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
- [ ] 拼写检查

### AI 能力
- [x] 本地模型支持（Ollama）
- [x] AI 自动标签建议
- [x] AI 对话历史持久化
- [x] AI 对话 @ 引用笔记
- [x] AI 编辑模式（类 Claude Code，直接修改笔记）
- [x] 多模态图片支持
- [x] AI 对话导出为笔记
- [x] AI 笔记摘要生成
- [ ] AI 闪卡生成（Anki 风格复习）
- [ ] AI 知识图谱自动扩展（发现隐含关联）
- [ ] 语音输入转文字

### 知识管理
- [x] 日历视图（按日期浏览笔记）
- [x] 看板视图（任务管理）
- [x] 笔记加密（AES-256-GCM）
- [x] 笔记分享（生成 HTML）
- [x] 版本历史快照 + UI
- [x] 回收站 + UI
- [ ] 时间线视图
- [ ] 笔记模板市场
- [ ] Obsidian vault 完整兼容导入

### 协作与同步
- [x] 多后端同步（Supabase / iCloud / OneDrive）
- [x] 独立拉取操作
- [x] 同步冲突检测
- [x] 同步状态指示器（状态栏图标）
- [x] 自动定时同步
- [x] 向量索引云端同步
- [ ] 实时协作编辑（Supabase Realtime + CRDT）
- [x] 选择性同步（只同步部分文件夹）
- [x] 离线队列（断网时缓存操作，恢复后同步）
- [ ] WebDAV / S3 自定义同步后端

### 插件系统
- [ ] 插件 API 设计
- [ ] 插件市场
- [ ] 自定义主题包
- [x] 自定义快捷键映射
- [ ] 第三方服务集成（Notion、Readwise、Pocket）

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
- [x] Embedding 缓存上限
- [ ] 向量索引增量更新优化
- [ ] Worker Thread 后台索引
- [ ] 数据库查询缓存

### 发布与运营
- [x] 自动更新（electron-updater）
- [x] GitHub Actions CI 自动发布
- [ ] 崩溃报告收集
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
- [ ] Obsidian vault 导入兼容（解析 frontmatter、dataview 语法）
- [ ] 笔记模板市场（社区共享模板）
- [ ] 全局快捷键唤起（类 Raycast，系统级快速记录）
- [ ] 多窗口支持（同时打开多个笔记窗口）
- [ ] 侧边栏宽度记忆每个面板独立宽度
- [x] 拖拽分屏（左右并排编辑两个笔记）

### AI 进阶
- [x] AI 笔记摘要生成（一键生成笔记摘要）
- [ ] AI 闪卡生成（Anki 风格间隔复习）
- [ ] AI 知识图谱自动扩展（发现笔记间隐含关联）
- [x] AI 多轮编辑（连续修改同一文件，保持上下文）
- [ ] AI 写作风格学习（模仿用户风格续写）
- [ ] 语音输入转文字（Whisper API）

### 编辑器
- [ ] 多光标编辑
- [ ] Vim 模式
- [ ] 拼写检查（Electron 内置）
- [ ] 表格公式计算
- [ ] 脚注支持
- [ ] 自定义 slash command 扩展

### 协作与平台
- [ ] 实时协作编辑（CRDT + WebSocket）
- [ ] Web 版本（共享渲染层代码）
- [ ] 浏览器扩展（网页剪藏到 vault）
- [ ] CLI 工具（命令行快速创建/搜索笔记）
- [ ] iOS/Android 移动端

### 插件系统
- [ ] 插件 API 设计（注册命令、面板、编辑器扩展）
- [ ] 自定义主题包
- [x] 自定义快捷键映射
- [ ] 第三方服务集成（Notion、Readwise、Pocket）
