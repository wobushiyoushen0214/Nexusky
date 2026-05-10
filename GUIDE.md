# Nexusky 使用指南

## 快速开始

```bash
pnpm run dev    # 启动开发模式
pnpm run dist   # 打包安装包
```

启动后选择「创建笔记空间」或「打开已有文件夹」。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+O` | 快速切换笔记（模糊搜索） |
| `Ctrl+G` | 打开/关闭知识图谱 |
| `Ctrl+L` | 打开/关闭 AI 对话 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+N` | 新建笔记（侧边栏 + 按钮） |
| `Tab` | 接受 AI 补全建议 |
| `Esc` | 取消 AI 补全 |

---

## AI 配置

1. 按 `Ctrl+,` 打开设置
2. 在「AI 提供商」tab 点击「+ 添加」
3. 填写：
   - **名称**：随意，如 "My OpenAI"
   - **类型**：OpenAI / Claude / 自定义
   - **API Key**：你的 API 密钥
   - **Base URL**：留空用官方地址，填写中转站地址则走中转
   - **模型**：如 `gpt-4o-mini`、`claude-sonnet-4-6`
4. 点击「保存」，然后点击「激活」

### 支持的 AI 服务

| 类型 | 说明 |
|------|------|
| OpenAI | 官方 API，支持 GPT-4o 系列 |
| Claude | Anthropic 官方 API |
| 自定义 | 任何 OpenAI 兼容接口（中转站、国产模型等） |

### 中转站配置示例

- 类型选「自定义」
- Base URL 填中转站地址，如 `https://api.your-proxy.com/v1`
- API Key 填中转站提供的 key
- 模型填中转站支持的模型名

---

## AI 功能

### AI 对话 (Ctrl+L)

打开右侧 AI 面板，直接提问。如果笔记库已建立向量索引，AI 会自动检索相关笔记内容作为上下文回答（RAG），并标注来源。

### AI 行内补全

写作时停顿 1.5 秒，AI 会自动生成续写建议（灰色文字）。按 `Tab` 接受，按 `Esc` 或继续输入取消。

### 向量索引

首次打开笔记库时会自动建立文本索引。向量嵌入需要配置 AI 提供商后才能生成（使用 OpenAI 的 `text-embedding-3-small` 模型）。

---

## 云端同步（Supabase）

### 配置步骤

1. 在 [supabase.com](https://supabase.com) 创建项目
2. 在 Supabase SQL Editor 中执行 `supabase/schema.sql`
3. 在 Storage 中创建名为 `notes` 的 private bucket
4. 在 Nexusky 设置 > 云端同步 tab 中填入：
   - Supabase URL（如 `https://xxx.supabase.co`）
   - Supabase Anon Key
5. 勾选「启用云端同步」并保存

### 同步行为

- **自动推送**：每次 Ctrl+S 保存文件时自动上传到云端
- **全量同步**：对比本地和云端的文件 hash，缺失的文件双向补齐

---

## 双向链接

在编辑器中输入 `[[笔记标题]]` 即可创建双向链接。链接会以紫色高亮显示。

---

## 知识图谱 (Ctrl+G)

可视化所有笔记之间的链接关系。节点可拖拽，支持缩放。点击节点跳转到对应笔记。

---

## 每日笔记

点击侧边栏底部的「今日笔记」按钮，自动在 `daily/` 目录下创建当天日期的笔记（如 `2026-05-10.md`）。

---

## 模板

内置 4 种模板：空白笔记、会议记录、读书笔记、项目文档。通过 IPC 调用 `template:create-from` 使用。

---

## 项目结构

```
packages/
  main/       → Electron 主进程（文件、数据库、AI、云端）
  renderer/   → React 前端（编辑器、侧边栏、图谱、对话）
  shared/     → 共享类型定义
supabase/     → 云端数据库 schema
scripts/      → 开发脚本
```
