# My-Note: AI 驱动的知识库笔记应用

## Context

开发一个类似 Obsidian + AI 的桌面端知识库笔记软件。核心理念：笔记即文件（Markdown），AI 自动发现知识关联，对话式检索个人知识库。项目从零开始，目录为 `f:/proj/my-note`。

## 技术栈

| 层级 | 选型 |
|------|------|
| 桌面框架 | Electron + electron-vite |
| 前端 | React 19 + Zustand + Tailwind CSS + shadcn/ui |
| 编辑器 | TipTap 2.x (ProseMirror) |
| 数据库 | better-sqlite3 + FTS5 全文搜索 |
| 向量存储 | hnswlib-node (内存索引) + SQLite (持久化) |
| AI SDK | openai (兼容中转站) + @anthropic-ai/sdk |
| 图谱可视化 | D3-force + React Flow |
| 包管理 | pnpm monorepo |
| 语言 | TypeScript 全栈 |

## 项目结构

```
f:/proj/my-note/
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
│   │       └── services/  # 文件、数据库、向量、文件监听服务
│   ├── renderer/          # React 渲染进程
│   │   └── src/
│   │       ├── components/
│   │       │   ├── editor/    # TipTap 编辑器 + 自定义扩展
│   │       │   ├── sidebar/   # 文件树、搜索、图谱面板
│   │       │   ├── graph/     # 知识图谱可视化
│   │       │   ├── ai/        # 对话面板、AI 工具栏
│   │       │   └── settings/  # 设置页面
│   │       ├── stores/        # Zustand 状态管理
│   │       └── hooks/
│   ├── shared/            # 共享类型和工具
│   │   └── src/types/     # Note, Link, AI, IPC 类型定义
│   └── ai-core/           # AI 服务核心
│       └── src/
│           ├── providers/     # 多 Provider 适配器
│           ├── embedding/     # 向量嵌入服务
│           ├── rag/           # RAG 管线
│           └── completion/    # 补全服务
└── resources/
```

## 分阶段开发计划

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

### Phase 4: 向量嵌入 + 语义搜索 (2 周)

**目标**：笔记向量化，语义搜索，自动关联推荐。

- [ ] 文本分块器（按标题分块，200-500 tokens/块，50 token 重叠）
- [ ] 嵌入服务（支持 OpenAI embedding API + 本地 @xenova/transformers）
- [ ] 后台 Worker Thread 处理嵌入队列
- [ ] hnswlib 向量索引（启动时从 SQLite 加载）
- [ ] 语义搜索界面
- [ ] 编辑时自动推荐相关笔记
- [ ] 增量更新（只处理变更的块）

### Phase 5: RAG 问答 (1.5 周)

**目标**：基于知识库的 AI 问答，带来源引用。

- [ ] 混合检索器（向量 + FTS5 关键词 + 图谱遍历）
- [ ] RRF (Reciprocal Rank Fusion) 融合排序
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
用户提问 → 混合检索(向量+FTS5+图谱) → RRF排序 → 取top-k
→ 构建prompt(系统提示+检索块+来源标记) → 流式生成 → 解析引用 → 展示
```

## 关键技术决策

1. **IPC 类型安全**：在 shared 包定义 channel map 类型，封装类型安全的 invoke/handle
2. **Markdown 双向转换**：tiptap-markdown + 自定义 wikilink 解析规则，保证幂等
3. **向量索引性能**：hnswlib 内存索引 + SQLite 持久化，后台 Worker 增量更新
4. **文件一致性**：chokidar 监听 + content_hash 判断真实变更，避免无意义重索引
5. **本地嵌入备选**：@xenova/transformers 加载 all-MiniLM-L6-v2，离线可用

## 验证方式

- Phase 1: 能打开 vault 目录，新建/编辑/保存 .md 文件，编辑器渲染正确
- Phase 2: 输入 `[[` 弹出补全，图谱显示链接关系，反向链接面板正确
- Phase 3: 配置 API Key 后能对话，选中文本能触发 AI 操作
- Phase 4: 搜索框输入自然语言能返回语义相关的笔记
- Phase 5: 对话中提问能引用笔记内容并标注来源
- Phase 6: 打包后的应用能正常安装运行
