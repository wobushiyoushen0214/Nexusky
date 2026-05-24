# 优化计划

> 基于代码审查发现的 17 项可优化点，按优先级排序逐项实施。

## 性能优化

| # | 项目 | 状态 | 说明 |
|---|------|------|------|
| 1 | 语义搜索优化 | ✅ 已完成 | Float32Array + 预计算 norm + top-K 剪枝，避免全量排序 |
| 2 | Embedding 批量限流 | ✅ 已完成 | 分批 20 个发送 + 指数退避重试（最多 3 次） |
| 3 | ChatPanel 持久化 debounce | ✅ 已完成 | saveHistory 加 500ms 防抖，减少序列化开销 |
| 4 | Editor Store 细粒度订阅 | ✅ 已完成 | 拆分为独立 selector，避免无关字段变化触发重渲染 |
| 5 | Supabase pullAll 并发 | ✅ 已完成 | 串行改为 runConcurrent 5 并发下载 |

## 架构改进

| # | 项目 | 状态 | 说明 |
|---|------|------|------|
| 6 | 对话历史迁移 SQLite | ✅ 已完成 | 新建 conversations 表 + IPC 接口（load/append/clear） |
| 7 | notes 表 updated_at 索引 | ✅ 已完成 | 添加 DESC 索引加速排序查询 |
| 8 | FTS5 中文分词优化 | ✅ 已完成 | tokenize 改为 unicode61 categories "L* N* Co"，改善 CJK 字符边界识别 |
| 9 | Watcher depth 限制移除 | ✅ 已完成 | 去掉 depth:10 硬编码，支持任意深度目录 |
| 10 | AI edit 上下文裁剪 | ✅ 已完成 | 大文件按 heading 分段，只发送与指令相关的片段 |

## 功能扩展

| # | 项目 | 状态 | 说明 |
|---|------|------|------|
| 11 | 测试基础设施 | ✅ 已完成 | 添加 Vitest + embedding/indexer 测试用例 |
| 12 | 同步冲突解决 | ✅ 已完成 | 添加 cloud:resolve-conflict IPC，支持选择保留本地/远端 |
| 13 | 向量索引增量更新 | ✅ 已完成 | 对比 chunk content，只对变化的 chunk 调用 embedding API |
| 14 | 崩溃/错误上报 | ✅ 已完成 | React ErrorBoundary + 主进程 uncaughtException/unhandledRejection |
| 15 | Undo 历史持久化 | ✅ 已完成 | 切换标签时保存/恢复 ProseMirror EditorState（含 undo 历史） |
| 26 | 任务看板 ↔ Agent 双向跳转 | ✅ 已完成 | Kanban 详情新增"交给 Agent"按钮（带任务标题/描述跳到 Agent goal 阶段）；Agent reflect 结果若 status≠fail 提供"发送到任务看板"按钮（带 reflect 摘要写回 kanban_task） |
| 27 | 知识维护 → 属性图层定位 | ✅ 已完成 | MaintenanceItemCard 新增"在属性图层定位"按钮：跳到 Bases 视图、用 filename 设为查询、目标卡片 3s 高亮（背景色过渡） |
| 28 | ui-store 跨功能跳转 selectors | ✅ 已完成 | `pendingAgentGoal/pendingKanbanTask/pendingBasesFocus` + `sendToAgent/sendToKanban/focusInBases/consume*` 三组 transient state，避免页面间紧耦合；附 3 项 ui-store 跨功能跳转测试 |

## 安全性

| # | 项目 | 状态 | 说明 |
|---|------|------|------|
| 16 | 本地配置读取确认 | ✅ 已完成 | 自动检测前弹出 ConfirmModal 告知用户将读取哪些文件 |
| 17 | DOMPurify 配置加固 | ✅ 已完成 | 禁止 form/iframe/object/embed/script/style 等危险标签和事件属性 |
| 18 | AI/同步错误边界类型化 | ✅ 已完成 | AI Provider、Agent 工具、Kanban AI、编辑器、图谱、云同步和 preload 显式 `any` 清零，统一 unknown → 用户可读错误消息 |

## 工程基线

| # | 项目 | 状态 | 说明 |
|---|------|------|------|
| 19 | CI 质量门（typecheck + test） | ✅ 已完成 | `.github/workflows/ci.yml` 在 push/PR 时跑 `pnpm typecheck` + `pnpm test`（99 测试文件、577 用例），与 `build.yml` 的 tag-only 发版流水线解耦 |
| 20 | ai.ipc.ts 流处理模板抽取 | ✅ 已完成 | 新增 `packages/main/src/ipc/streams/consume-stream.ts`，封装 for-await + abort/destroyed check + text/error chunk 处理；14 处重复模板（intent/chat/edit/graph/complete/summarize/flashcards/tags/batch/compact 等）改为一行 `consumeStream(...)` 调用，附 7 个单元测试 |
| 21 | ai.ipc.ts AGENT_TOOLS + executeToolCall 拆出 | ✅ 已完成 | 静态 50 项工具定义抽到 `packages/main/src/ipc/tools/agent-tools.ts`，50+ case 的 `executeToolCall` 函数（含 17 个 helper、`KNOWLEDGE_MAINTENANCE_TYPES`）抽到 `packages/main/src/ipc/tools/execute-tool-call.ts`；ai.ipc.ts 从 3492 行降到 1291 行（-2201 / -63%），主文件只剩 IPC 路由与流编排 |
| 22 | ai.ipc.ts provider/transcribe/local-config 等独立 handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/provider.ts` 收纳 10 个无 closure 依赖的 handler（`ai:get/save/set-providers`、`ai:get-active-provider`、`ai:validate`、`ai:transcribe`、`ai:detect-local-config`、`ai:list-ollama-models`、`ai:get/set-system-prompt`），主文件再降 1291→1185 行 |
| 23 | ai.ipc.ts text-tool handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/text-tools.ts` 收纳 3 个轻量文本 handler（`ai:summarize`、`ai:generate-flashcards`、`ai:suggest-tags`），共用 `consumeStream` + flashcards 工具；主文件再降 1185→1110 行 |
| 24 | ai.ipc.ts edit handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/edit.ts` 收纳 `ai:edit`（含 writing-style prompt、token 估算、流式 edit-stream 推送、abort 处理）；主文件再降 1110→1024 行 |
| 25 | ai.ipc.ts complete handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/complete.ts` 收纳 `ai:complete` + `ai:complete-abort`（续写 + 任务级 abort controller map + writing-style prompt）；主文件再降 1024→975 行 |
| 29 | ai.ipc.ts graph handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/graph.ts` 收纳 `ai:generate-graph`（抽样笔记 → Mermaid graph TD 流式推送 ai:graph-progress/done）；主文件再降 975→900 行 |
| 30 | ai.ipc.ts notes 域 5 个 handler 拎出 | ✅ 已完成 | `packages/main/src/ipc/ai/notes.ts` 收纳 `ai:plan-note-batches`/`generate-notes`/`infer-links`/`infer-global-links`/`generate-memories`（含笔记规划、流式生成、写入索引、语义链推断、记忆生成）；主文件再降 900→451 行（−449），相比阶段开始的 3492 行已削减 87%；12 个仅供 notes 使用的 import（fs/path/note-plan/note-writing/memory/embedding/database 等）随之删除 |
