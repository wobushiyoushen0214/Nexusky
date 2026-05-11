# Nexusky

AI 驱动的本地知识库笔记应用。双向链接 + 语义搜索 + 知识图谱，本地优先，隐私安全。

## 特性

- **Markdown 编辑器** — 基于 TipTap，支持表格、任务列表、高亮、图片粘贴
- **双向链接** — `[[wikilink]]` 语法，自动反向链接，知识图谱可视化
- **AI 对话** — 接入 OpenAI / Claude / 自定义中转站，RAG 问答带来源引用
- **AI 写作辅助** — 行内补全、选中文本总结/扩展/改写/翻译
- **语义搜索** — 向量嵌入 + 相似度检索
- **云端同步** — 支持 Supabase、iCloud Drive、OneDrive 三种后端
- **本地优先** — 数据存储在本地文件系统，SQLite 索引，无需联网即可使用

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发模式
pnpm run dev

# 构建安装包
pnpm run dist
```

启动后选择「创建笔记空间」或「打开已有文件夹」即可开始使用。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 构建工具 | electron-vite + Vite 6 |
| 前端 | React 19 + Zustand |
| 编辑器 | TipTap 2 (ProseMirror) |
| 样式 | Tailwind CSS 4 |
| 数据库 | better-sqlite3 (WAL) |
| AI | openai + @anthropic-ai/sdk |
| 云端 | Supabase / iCloud / OneDrive |

## 项目结构

```
packages/
  main/           → Electron 主进程
    src/
      ipc/        → IPC 通信
      services/   → 业务逻辑（数据库、索引、AI、云端同步）
  renderer/       → React 渲染进程
    src/
      components/ → UI 组件（编辑器、侧边栏、图谱、AI、设置）
      stores/     → Zustand 状态管理
  shared/         → 共享类型定义
docs/             → 项目文档
supabase/         → 云端 schema
```

## 文档

- [用户使用指南](docs/GUIDE.md)
- [功能清单](docs/FEATURES.md)
- [设计系统](docs/DESIGN.md)
- [产品定义](docs/PRODUCT.md)
- [开发计划](docs/PLAN.md)

## License

MIT
