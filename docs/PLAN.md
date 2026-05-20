# Nexusky: AI 驱动的知识库笔记应用

## Context

Nexusky 是一个类似 Obsidian + AI 的桌面端知识库笔记软件。核心理念：笔记即文件（Markdown），AI 自动发现知识关联，对话式检索个人知识库。本文件保留原始阶段规划，同时补充当前实现状态；完整功能清单以 `docs/FEATURES.md` 为准。

## 技术栈

| 层级 | 选型 |
|------|------|
| 桌面框架 | Electron + electron-vite |
| 前端 | React 19 + Zustand + CSS/Tailwind |
| 编辑器 | TipTap 2.x (ProseMirror) |
| 数据库 | better-sqlite3 + FTS5 全文搜索 + SQLite 迁移 |
| 语义检索 | SQLite chunks + TF-IDF 中文 bigram + AI rerank |
| AI SDK | openai / @anthropic-ai/sdk / Ollama / Codex CLI / OpenAI Responses |
| 图谱可视化 | D3-force |
| 包管理 | pnpm monorepo |
| 语言 | TypeScript 全栈 |

## 项目结构

```text
Nexusky/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── electron-builder.yml
├── packages/
│   ├── main/              # Electron 主进程
│   │   └── src/
│   │       ├── index.ts
│   │       ├── window.ts
│   │       ├── ipc/       # IPC 通信处理
│   │       └── services/  # 文件、数据库、索引、AI、云端同步服务
│   ├── renderer/          # React 渲染进程
│   │   └── src/
│   │       ├── components/
│   │       │   ├── editor/    # TipTap 编辑器 + 自定义扩展
│   │       │   ├── sidebar/   # 文件树、搜索、图谱面板
│   │       │   ├── graph/     # 知识图谱可视化
│   │       │   ├── ai/        # 对话面板、AI 工具栏
│   │       │   └── settings/  # 设置页面
│   │       ├── stores/        # Zustand 状态管理
│   │       └── utils/
│   ├── shared/            # 共享类型和工具
│   │   └── src/types/     # IPC / Kanban / Graph / AI 类型定义
└── resources/
```

## 当前实现状态

- [x] Electron + React + TipTap 基础应用、文件树、Vault、Markdown 编辑和保存
- [x] SQLite schema/migration、FTS5、wikilink 解析、反向链接、知识图谱
- [x] 多 AI Provider、流式对话、AI 写作辅助、AI 编辑、AI 行内补全
- [x] 语义搜索：FTS/TF-IDF 初筛，高置信度直返，必要时 AI rerank
- [x] RAG 对话：自动检索相关笔记，回复携带来源引用
- [x] 知识空间：空间/属性/时间图层、卡片拖拽、连接线绕行、分组标签、隐式关联建议、审阅队列和 Connections 写回
- [x] 阅读收件箱：Notion/Readwise/Pocket 聚合、连续 triage、选中或筛选结果 AI 消化、摘要生成和批量状态处理
- [x] 看板、日历、版本历史、回收站、模板、导出、自动更新
- [x] Supabase / iCloud Drive / OneDrive 同步，冲突检测、离线队列、选择性同步
- [x] AI 长任务取消、意图识别取消、安全 localStorage 包装、类型安全 IPC/preload、Provider 工具类型和 Vitest 回归测试

## 近期 Git 记录回写

| Git 记录 | 当前状态更新 |
|----------|--------------|
| `7d2096e` | 知识空间新增当前图层分组标签，覆盖来源、标签和日期分组测试 |
| `80e04d4` / `e0ebac4` | 知识空间入口和节点卡片文案进一步统一 |
| `4bebfbf` | 知识空间连接线改为绕开卡片的折线路由 |
| `d88bd1c` / `bc8d623` | 属性/时间图层重排依据修正，所有图层支持拖拽覆盖位置 |
| `79c0d06` / `7d8edf2` / `cff7ac2` | 隐式知识关联从展示推进到队列审阅和接受写回 |
| `495a3ea` / `26d4b3e` / `901d94c` | 阅读收件箱补齐连续 triage、选中范围 AI 消化和重构后的批量处理流程 |

## 历史分阶段开发计划

> 下方是早期从零实现时的拆分计划，已完成项不再逐条维护；当前状态以上方摘要和 `docs/FEATURES.md` 为准。

### Phase 1: 基础骨架 (2 周)

**目标**：可运行的 Electron + React + TipTap 应用，能打开/编辑/保存 Markdown 文件。

- [ ] 初始化 pnpm monorepo + electron-vite 配置
- [ ] Electron 窗口管理（创建、菜单、生命周期）
- [ ] preload 脚本 + 类型安全 IPC 封装
- [ ] TipTap 基础编辑器（标题、段落、列表、代码块、引用、图片）
- [ ] Markdown 序列化/反序列化（tiptap-markdown）
- [ ] 文件树侧边栏 + vault 目录选择
- [ ] 文件读写服务 + chokidar 文件监听
- [ ] 基础 UI 布局（侧边栏 + 编辑器 + 可折叠右面板）
- [ ] Tailwind + shadcn/ui 基础主题

### Phase 2: 双向链接 + 知识图谱 (2 周)

**目标**：`[[wikilink]]` 支持，SQLite 索引，图谱可视化。

- [ ] SQLite 初始化 + 迁移机制
- [ ] 数据库 schema（notes、links、tags、note_tags 表）
- [ ] Markdown 解析提取 wikilink + frontmatter
- [ ] TipTap BiLink 扩展（`[[` 触发自动补全弹窗）
- [ ] 反向链接面板（右侧面板显示引用列表）
- [ ] 知识图谱可视化（D3-force 力导向图）
- [ ] 快速切换器（Ctrl+O 模糊搜索）
- [ ] 文件变更时增量更新索引

### Phase 3: AI 基础集成 (2 周)

**目标**：接入多 AI 提供商，实现对话和写作辅助。

- [ ] BaseAIProvider 抽象类
- [ ] OpenAI Provider（支持自定义 baseURL 兼容中转站）
- [ ] Claude Provider（@anthropic-ai/sdk）
- [ ] Custom Provider（通用 OpenAI 兼容接口，覆盖国产模型）
- [ ] AI 提供商配置界面（API Key、Base URL、模型选择）
- [ ] AI 对话面板（流式输出 + Markdown 渲染）
- [ ] 写作辅助：选中文本 → 总结/扩展/改写/翻译
- [ ] TipTap slash-command 扩展（`/ai` 触发）

### Phase 4: 语义索引 + 语义搜索 (2 周)

**目标**：笔记分块索引，语义搜索，自动关联推荐。

- [ ] 文本分块器（按标题分块，200-500 tokens/块，50 token 重叠）
- [ ] TF-IDF 中文 bigram 语义检索
- [ ] FTS5/TF-IDF 初筛 + AI rerank
- [ ] 搜索缓存与索引失效机制
- [ ] 语义搜索界面
- [ ] 编辑时自动推荐相关笔记
- [ ] 增量更新（只处理变更的块）

### Phase 5: RAG 问答 (1.5 周)

**目标**：基于知识库的 AI 问答，带来源引用。

- [ ] 混合检索器（FTS5 关键词 + TF-IDF + 图谱关系）
- [ ] top-K 剪枝 + 高置信度直返
- [ ] Prompt 模板（系统提示 + 检索结果 + 来源标记）
- [ ] Token 预算管理（计数 + 截断）
- [ ] 回答中的来源引用（[^n] 标记 → 可点击跳转）
- [ ] 对话历史管理

### Phase 6: 高级功能 + 打磨 (2 周)

**目标**：完善体验，增加高级功能。

- [ ] AI 行内补全（ghost text，Tab 接受）
- [ ] 每日笔记 + 模板系统
- [ ] 标签管理和筛选
- [ ] 主题切换（亮/暗模式）
- [ ] 全局快捷键系统
- [ ] Obsidian vault 导入兼容
- [ ] electron-builder 打包 + 自动更新

## 数据模型

### SQLite Schema 核心表

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    content_hash TEXT NOT NULL
);

CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_note_id TEXT NOT NULL,
    target_note_id TEXT,
    target_title TEXT NOT NULL,
    context TEXT,
    FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);
CREATE TABLE note_tags (note_id TEXT, tag_id INTEGER, PRIMARY KEY (note_id, tag_id));

CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    chunk_index INTEGER,
    content TEXT NOT NULL,
    heading_context TEXT,
    token_count INTEGER,
    embedding BLOB,
    embedding_model TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, tags);
```

## AI 集成架构

### 多 Provider 设计

```typescript
abstract class BaseAIProvider {
  abstract chat(params: ChatParams): AsyncIterable<ChatChunk>;
  abstract embed(texts: string[]): Promise<number[][]>;
  abstract listModels(): Promise<AIModel[]>;
}

// OpenAI Provider 同时支持官方和中转站（只需改 baseURL）
// Claude Provider 用 @anthropic-ai/sdk
// Custom Provider 支持任何 OpenAI 兼容 API（国产模型）
```

### RAG 流程

```
用户提问 → FTS/TF-IDF 初筛 → 高置信度直返或 AI rerank → 取 top-k
→ 构建 prompt（系统提示+检索块+来源标记）→ 流式生成 → 展示引用来源
```

## 关键技术决策

1. **IPC 类型安全**：在 shared 包定义 channel map 类型，封装类型安全的 invoke/handle；preload 入口和 AI/Cloud 工具边界使用 `unknown` 窄化，避免异常对象和模型工具参数绕过类型检查
2. **Markdown 双向转换**：tiptap-markdown + 自定义 wikilink 解析规则，保证幂等
3. **语义检索性能**：SQLite chunks + TF-IDF 内存缓存 + top-K 剪枝，高置信度结果跳过 AI rerank
4. **文件一致性**：chokidar 监听 + content_hash 判断真实变更，避免无意义重索引
5. **AI 成本控制**：搜索先本地排序，只有模糊语义场景才调用 AI rerank；长任务统一 AbortController 取消

## 验证方式

- Phase 1: 能打开 vault 目录，新建/编辑/保存 .md 文件，编辑器渲染正确
- Phase 2: 输入 `[[` 弹出补全，图谱显示链接关系，反向链接面板正确
- Phase 3: 配置 API Key 后能对话，选中文本能触发 AI 操作
- Phase 4: 搜索框输入自然语言能通过 TF-IDF/AI rerank 返回语义相关笔记
- Phase 5: 对话中提问能引用笔记内容并标注来源
- Phase 6: 打包后的应用能正常安装运行

---

## v0.1.5 已发布（2026-05-12）

### 16 项性能优化

1. **FTS5 全文搜索** — 替代逐文件暴力扫描
2. **文件树浅加载** — refreshFiles 改用 file:list-shallow，子目录懒加载
3. **图谱 simulation 持久化** — 切换文件只更新高亮，不重建力导向图
4. **Mermaid 动态 import** — 首屏 bundle 减少 2-3MB
5. **AI 多模态消息修复** — 语义搜索正确处理 ChatContentPart[]
6. **右侧面板 React.lazy** — 代码分割，首屏加载提速
7. **Store debounce 写入** — 500ms 防抖合并配置文件写入
8. **WikiLink 增量装饰** — 用 plugin state 管理，选区移动不重算
9. **dompurify 构建修复** — resolve.alias 指向 pnpm store ESM 文件
10. **Kanban 数据库查询** — 新增 tasks 表，替代逐文件读取
11. **AI 补全 AbortController** — 防止过期结果覆盖
12. **Watcher 通知去重** — 结构变更和内容变更事件分离
13. **QuickSwitcher 结果限流** — 空查询显示前 50 条
14. **Supabase 同步 5 并发** — push/pull 提速 3-5 倍
15. **index-vault 分批处理** — 每 20 文件让出事件循环
16. **语义检索缓存上限** — 最多 2000 chunk 防内存膨胀

### Bug 修复

- AI 消息长 URL 自动换行（wordBreak/overflowWrap）
- 全屏切换卡顿（selectionUpdate 80ms debounce + MutationObserver 300ms debounce）
- macOS 15 应用图标白边（PNG 改为全填深色背景方形）
- better-sqlite3 架构错配（macOS 改为 universal binary）

### 打包改进

- macOS 单一 universal.dmg（同时支持 Intel x86_64 + Apple Silicon arm64）
- CI 配置 `--universal` 替代独立 `--x64 --arm64`
- electron-builder 默认 release 而非 draft（用户能直接看到下载）
- 历史 v0.1.0~v0.1.4 release 从 draft 转为 published

---

## v0.2.1 架构优化（2026-05-13）

### 性能
1. **语义搜索 top-K 优化** — 线性扫描替代每次 sort，O(N·K log K) → O(N·K)
2. **Wikilink 重命名精准定位** — 利用 links 表查引用文件，不再全 vault 遍历
3. **编辑器 state cache LRU** — 上限 20，防止长时间使用内存膨胀

### 功能
4. **AI 流式真正中断** — AbortController 传递到 Provider，停止即断网络请求
5. **数据库迁移机制** — schema_version 表 + migrations 数组，未来改表无痛
6. **对话历史 SQLite 持久化** — 替代 localStorage，无配额限制，可跨设备同步
7. **Claude 多模态图片** — base64 → Anthropic image block 正确转换

### 修复
8. **dompurify alias** — 不再硬编码 pnpm store 版本路径
