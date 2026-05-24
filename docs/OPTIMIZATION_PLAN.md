# Nexusky 优化与改进建议（v0.4.0 审计）

> 核对版本：`5399436`（v0.4.0 + Windows CI 修复）。本文整理本轮全仓审计发现的 **新增** 可优化项，按优先级排序。已完成的历史优化见 [OPTIMIZATION.md](./OPTIMIZATION.md)。
>
> 每条建议给出文件/行号、问题描述、改造方向、预期收益。可作为重构 backlog 或 issue 拆条依据。

---

## 优先级图例

| 标记 | 含义 |
| --- | --- |
| **P0** | 安全、数据正确性或线上稳定性风险，建议立即处理 |
| **P1** | 影响开发效率、性能或长期可维护性，建议本季度处理 |
| **P2** | 体验或代码风味优化，机会窗口允许时处理 |

---

## 1. 安全与隐私

### 1.1 [P0] BrowserWindow 未启用 sandbox

`packages/main/src/index.ts:72` 中 `sandbox: false`。Electron 官方安全清单把开启沙箱列为第一项推荐。

- **风险**：preload 与渲染层都可以触达完整 Node API。若 preload 出现 prototype pollution / 任意通道注入，可直接 RCE。
- **建议**：将 sandbox 改为 `true`，并把当前 preload 里依赖 Node 模块（`crypto`、`fs` 等）的部分迁移到主进程 IPC handler。预计需要拆 1–2 个 preload 工具函数。
- **回归测试**：跑 Web Clipper、文件读写、AI 流；确认 `contextBridge.exposeInMainWorld` 仍能挂载 API。

### 1.2 [P0] 加密主密钥硬编码，不是真正的系统密钥库

`packages/main/src/services/secret.ts:7-9`：

```ts
function getPortableKey(): Buffer {
  return createHash('sha256').update('nexusky-note-secret-2024').digest()
}
```

`docs/PROJECT_OVERVIEW.md` 第 15 节宣称"API Key 等敏感配置通过 Electron safeStorage 加密存储"，但代码实际只用一个全局字符串派生 AES key。任何拿到磁盘上 `store.json` 的人都能解出 API Key。

- **建议**：
  - 主路径走 `electron.safeStorage.encryptString` / `decryptString`，让 Keychain / DPAPI / libsecret 接管；
  - 保留现有 `enc:v2:` 作为 fallback（当 safeStorage 不可用），主路径打 `enc:v3:` 标识；
  - `store.ts` 增加 v2 → v3 透明迁移；
  - 同步修订 OVERVIEW 15 节描述，避免文档说一套、代码做另一套。
- **回归测试**：macOS 首次启动会弹 Keychain 授权对话框；Windows 用 `safeStorage.isEncryptionAvailable()` 判定 fallback。

### 1.3 [P0] `shell.openExternal` 未做协议校验

`packages/main/src/services/updater.ts:75` 直接 `shell.openExternal(params.url)`。若上游 release JSON 被劫持或前端某处把任意字符串透传过来，可让用户系统 `open file://...`、`open vscode://...` 等任意 scheme，存在本地命令执行风险。

- **建议**：在主进程新增 `safeOpenExternal(url)`，只放行 `https:`（必要时 `http:`），拒绝其它 scheme 并写 logger 警告。所有 `openExternal` 调用统一走这层。
- **顺带**：`packages/main/src/index.ts` 给主窗口加 `setWindowOpenHandler`，对新窗口 URL 也走同样校验。

### 1.4 [P0] 第三方日志上报缺脱敏

`packages/main/src/services/logger.ts:15`：

```ts
const REPORT_URL = 'https://website-ebon-xi-90.vercel.app/api/logs'
```

`context` 字段直接来自调用方，未做敏感字段过滤；`crash-reporting.ts` 在崩溃时也走 logger，错误栈可能包含 vault 路径、笔记标题、provider 错误信息（OpenAI 错误经常会回显请求体片段）。

- **建议**：
  - 在 `logger.ts` 入口加 redactor：递归遍历 context，对常见键名（`apiKey`、`token`、`authorization`、`secret`、`password`、`session`、`refresh_token`）替换为 `'***'`；
  - 对超长字符串截断（>1 KB）；
  - 上报默认 **opt-in**：第一次启动弹"是否允许匿名错误上报"，写入 `store`；
  - REPORT_URL 改为环境变量或 build-time 注入，避免开发者本地实验数据混入生产服务。
- **配套**：OVERVIEW 第 15 节增加"遥测"小节。

### 1.5 [P1] preload `send()` 接受任意 channel

`packages/main/src/preload.ts:15-17`：

```ts
send: (channel: string, ...args: unknown[]) => {
  ipcRenderer.send(channel, ...args)
}
```

等价于把"任意 channel 通讯"开放给 BrowserWindow。攻击面：若未来某个组件 XSS（例如 AI 渲染的 Markdown 中混入未被消毒的 `<script>`），就能通过 `window.api.send('any-channel', ...)` 与主进程任意通道交互。

- **建议**：维护白名单（如 `window:*`、`ai-task-control` 等），其它直接拒绝并 `logger.warn`。或直接砍掉 `send`，改成对应的具名 API。

### 1.6 [P1] 路径校验未抵御 symlink

`packages/main/src/ipc/file-path.ts` 用 `path.resolve + relative` 校验路径是否在 vault 内，但全仓 `grep "lstat"` 无命中。若 vault 内有指向 vault 外的 symlink（从 Obsidian 迁移或用户手动 `ln -s` 时常见），`file:delete/rename/write` 可能跨越 vault 边界。

- **建议**：增加 `assertNoSymlinkEscape(path, vaultRoot)`：用 `lstat` 沿父目录回溯，对每一级若是 symlink 则 `realpath` 后再次校验是否仍在 vault 内。所有 `file:write/create/delete/rename/restore-trash` 都走这一层。

### 1.7 [P1] IPC 入参缺 schema 校验

`packages/shared/src/types/ipc.ts` 只是 TypeScript 类型，主进程拿到 IPC 入参就当成已校验值用。但 IPC 边界对主进程而言相当于"外部输入"。例如 `kanban:create-task` 没限制 title 长度、`file:save-image` 的 `fileName` 仅经过 `safeClipFileName`。

- **建议**：引入轻量校验（zod 或手写 guard），关键写入通道（`file:*`、`kanban:*`、`db:*` 写入）入口加 `validate(channel, params)`，失败直接抛 `Invalid IPC payload`。可与 1.5 的 channel 白名单合并实现。

### 1.8 [P1] WebDAV 明文 Basic 认证 + 无 token 刷新

`packages/main/src/services/cloud/webdav-provider.ts:49` 直接 Base64 拼 `Authorization: Basic`。

- **建议**：settings UI 检测 URL `http://` 时弹警告"建议改用 HTTPS"；密码字段走 1.2 的 v3 加密；S3 端考虑接入临时凭证（STS）替代长期 access key。

### 1.9 [P2] 缺 codesign / notarize

`electron-builder.yml` 中 macOS `identity: null`、Windows `sign: false`。用户首次启动会被 Gatekeeper / SmartScreen 拦。

- **建议**：CI 注入证书，加 `notarize: true`；如果暂时无证书，至少在 README 加 Gatekeeper 绕过说明。

---

## 2. 主进程架构

### 2.1 [P1] `ai.ipc.ts` 3426 行：必须拆分

这是全仓最大的"上帝文件"。它一个文件同时承载了：

- 26 个 IPC handler 的注册；
- Agent tool 大 switch（约 50 个工具，`ai.ipc.ts:1862-3216`）；
- 流式响应 + stale 隔离 + 取消语义；
- 工具参数 normalize、tool schema 定义、错误归一。

**改造方向**（参考目录建议）：

```
packages/main/src/ipc/ai/
  index.ts                 // 注册入口 registerAIHandlers
  handlers/
    chat.ts                // ai:chat / ai:chat-agent / ai:stop
    edit.ts                // ai:edit / ai:detect-intent / ai:complete
    notes.ts               // ai:plan-note-batches / ai:generate-notes
    links.ts               // ai:infer-links / ai:infer-global-links / ai:generate-graph
    memory.ts              // ai:generate-memories
    flashcards.ts          // ai:generate-flashcards
    provider.ts            // ai:get-providers / save / validate / detect-local-config
  tools/
    registry.ts            // toolHandlers = new Map<string, ToolFn>()
    note-tools.ts
    graph-tools.ts
    task-tools.ts
    maintenance-tools.ts
    schemas.ts             // 所有 tool JSON schema 集中定义
  streams/
    cancellation.ts        // isStopped / abortIfNeeded 复用
    stream-runner.ts       // for-await + try/catch + done/error 标准模板
```

**预期收益**：
- 单文件回到 300–600 行，typecheck 与编辑器响应明显变快；
- 新增工具只需在 `tools/*.ts` 注册一条；
- 取消、错误、流模板一处维护。

**风险与节奏**：拆分时保持 `executeToolCall` 的 case 顺序不变、保留 stopped check 覆盖率。建议分两个 PR：第一个只提取 `streams/` + `tools/registry.ts`，第二个按域拆 handler。

### 2.2 [P1] `db.ipc.ts` 941 行：四域混杂

`db.ipc.ts` 同时承载笔记索引/搜索、看板、闪卡、聊天历史。

- **建议**：抽出 `ipc/kanban.ipc.ts`、`ipc/chat-history.ipc.ts`、`ipc/flashcards.ipc.ts`；`db.ipc.ts` 只做核心索引/搜索/属性查询。
- **顺带**：在 `index.ts` 注册位置统一改为 `registerXxxHandlers(ipcMain)`，目前散落各处。

### 2.3 [P1] `database.ts`：`ensureColumn` 重复调用 50+ 次

`packages/main/src/services/database.ts:216-277` 大量 `ensureColumn(db, 'kanban_tasks', 'priority', '...')` 是历史迁移层的痕迹。

- **建议**：
  - 引入 `ensureColumns(db, table, { col: def, ... })` 批量版本；
  - 把每个迁移版本写成命名函数（`migrateV4`、`migrateV5` …），按 `SCHEMA_VERSION` 顺序跑；
  - 在 `tests/database-migration.test.ts` 加 fixture：装一个 v3 旧库 → 跑迁移 → 断言 schema 完整。

### 2.4 [P1] `indexer.ts` 866 行：解析 + 写库 + 链接解析 + 别名 + 任务抽取混在一起

- **建议**：拆 `indexer/parsers/`（wikilinks、tags、tasks、frontmatter、dataview-inline 各一个）与 `indexer/persistence.ts`（只做事务写入）。
- **顺带**：当前 transaction 内部多次 `db.prepare(...)`，建议把 statement cache 提到模块顶层，重复利用。

### 2.5 [P1] 重复模板：错误处理、stopped check、stream 模板

- `getErrorMessage` 在 `ai.ipc.ts` 与 `db.ipc.ts` 等多文件重复定义 → 提到 `packages/shared/src/utils/errors.ts`；
- `if (window.isDestroyed() || controller.signal.aborted) break/skip` 在 `ai.ipc.ts` 出现约 20 次 → 封装 `shouldAbort(window, controller)`；
- AI provider stream 消费在 `ai:chat / ai:edit / ai:generate-graph / ai:generate-notes` 4 处几乎相同结构 → 封装 `consumeStream(window, channel, requestId, asyncIterable)`。

### 2.6 [P2] AI Agent tool 大 switch → registry

`ai.ipc.ts:1862-3216`。如 2.1 所述，单独拎出来本身就是收益。

```ts
// tools/registry.ts
type ToolFn = (args: unknown, ctx: ToolContext) => Promise<ToolResult>
const tools = new Map<string, ToolFn>()
export function registerTool(name: string, fn: ToolFn) { tools.set(name, fn) }
export function executeTool(name: string, args: unknown, ctx: ToolContext) {
  const fn = tools.get(name)
  if (!fn) return { content: `unknown tool: ${name}` }
  return fn(args, ctx)
}
```

- **收益**：增加工具不再改 3000 行文件；可在测试里 mock 单个 tool；prompt 中工具列表可从 registry 自动生成，避免 prompt 与代码漂移。

---

## 3. 性能

### 3.1 [P1] `maintenance-queue.ts`：9 次独立遍历应合并

`packages/main/src/services/ai/maintenance-queue.ts:79-346` 有 9 个独立的 `getXxxByPath` 函数，每个都对全量 task 数组做一次 forEach + Map 构造。对含数万任务的 vault，单次 plan 调用会做 9N 次扫描。

- **建议**：写一个 `indexTasksByPath(tasks, todayIso, upcomingDays)`，单次遍历产出 `{ overdue, dueToday, started, blocked, scheduled, recurring, high, upcoming, elevated }` 一组 Map。`buildKnowledgeMaintenanceQueue` 直接复用。
- **预期收益**：复杂度 9N → N；本地 50k tasks vault 估计能从数百毫秒降到几十毫秒。

### 3.2 [P1] `embedding.ts` TF-IDF 在主线程跑

`packages/main/src/services/embedding.ts:208-264` 的 `buildTfIdfIndex` 是同步重 CPU。在大 vault 触发"重新索引"时会卡主进程，进而冻结 IPC（影响所有 UI 操作）。

- **建议**：
  - 把整个 TF-IDF 构建移到 `packages/main/src/workers/embedding-worker.ts`（已有 `workers/` 目录），用 `worker_threads`；
  - 增量更新：只对新增/修改的笔记重算，并合并到主索引；
  - 顺便把 `MAX_CACHE_CHUNKS = 2000`（`embedding.ts:6`）改为基于 vault 大小动态分配，或加 LRU。

### 3.3 [P1] better-sqlite3：prepared statement 未集中复用

`indexer.ts` / `db.ipc.ts` 多处在 handler 内 `db.prepare(...)`，每次调用都重新查 cache。

- **建议**：每个 service 模块顶层维护 `let stmts: { upsertNote: Statement, deleteLinks: Statement, ... }`，在 `getDatabase()` 完成迁移后一次性 prepare。`db.prepare` 自身有 cache，但仍多了 hashing/查找开销，集中化更清晰、也方便排查。

### 3.4 [P1] 全文搜索 fallback 用 `readFileSync` 遍历

`db.ipc.ts:224-281` 的 fallback 路径在 FTS 不可用时同步扫描所有 markdown 文件。

- **建议**：
  - 优先保证 FTS5 一定可用（启动时自检并提示重建）；
  - 真要 fallback，使用 `fs.promises.readFile` + 限并发（如 8），每读 32 个文件 `await setImmediate()` 让出事件循环；
  - 大文件（>1 MB）跳过或只扫前 N KB。

### 3.5 [P2] `db-query-cache.ts` 命中策略

`packages/main/src/services/db-query-cache.ts` 仅 50 行，是个简单 Map。看 vault 切换时是否 invalidate；如不 invalidate，会出现"换 vault 后仍看到旧搜索结果"。OVERVIEW 第 8 节已声称会清空缓存，需在测试中固化这一行为，并补一条 `tests/db-query-cache-invalidation.test.ts`。

### 3.6 [P2] 渲染层 Zustand 大对象 selector

`packages/renderer/src/App.tsx:101` 一次解构 `useUIStore()` 拿 20+ 字段。任意字段变化都会触发整个 App 重渲染（包括懒加载视图的"门面"）。

- **建议**：每个字段单独订阅 `useUIStore(s => s.xxx)`，或用 `useShallow` 做浅比较。
- **影响范围**：还需巡检 `ChatPanel.tsx`、`Settings.tsx`、`KanbanPanel.tsx` 是否存在相同问题。

### 3.7 [P2] 长对话消息列表无虚拟滚动

`ChatPanel.tsx` 渲染 `ChatMessages` 没看到 windowing。对于上千轮对话、批量生成进度刷屏的场景，DOM 会膨胀。

- **建议**：引入 `react-virtuoso` 或自实现的简单 windowing；同时 `MessageBubble` 用 `React.memo` 包一层避免上层 re-render 时全量重渲。

---

## 4. 前端组件

### 4.1 [P1] `ChatPanel.tsx` 2267 行 / 27+ useState / 16+ useRef

这个组件做了对话、会话、附件、编辑模式、批量计划、流式、停止、源、草稿、session title……

**拆分蓝图**：

```
components/ai/
  ChatPanel.tsx              // 只做布局 + 路由 + 顶层 context
  chat/
    useChatSession.ts        // session CRUD + 切换
    useChatStream.ts         // ai:stream/done/error 订阅 + stale 隔离
    useChatAttachments.ts    // 附件管理
    useEditMode.ts           // editMode + diff + apply
    useBatchPlan.ts          // pendingBatch / 进度 / 取消
    ChatComposer.tsx         // 输入框 + 附件按钮
    ChatMessagesList.tsx     // 消息列表 + 虚拟滚动
    ChatSourceList.tsx
    ChatBatchPanel.tsx
```

- **优先做**：先把 `useChatStream`（流事件订阅与 stale 隔离）抽走，因为它是 race condition 高发区。

### 4.2 [P1] `Settings.tsx` 1967 行

- **建议**：按"设置分类"切成子组件：`ProvidersSection`、`CloudSyncSection`、`AppearanceSection`、`ShortcutsSection`、`PluginsSection`。每个独立懒加载。
- **顺带**：把硬编码验证文案（如 `'请填写提供商名称'`）放进 `i18n/zh-CN.json`，配合即将国际化的诉求。

### 4.3 [P1] `CanvasView.tsx` 1890 行 + `GraphView.tsx` 1118 行

- 拆 `useCanvasLayout`、`useCanvasGroups`、`useCanvasInteraction`；
- `GraphView.tsx:122-127` 把 `showLabelsRef.current = showLabels` 直接写在函数体里属于副作用，应放到 `useEffect`；
- 大量节点拖拽过程中 d3.force 与 React state 同步要确保 throttle，避免 60 fps 每帧都进 React reconciler。

### 4.4 [P1] `KanbanPanel.tsx` 1575 行：useEffect 依赖混乱

- `line:72-75` 通过 `getState()` 绕开 deps 是反模式，会让 React Strict mode / Dev Tools 警告失效；
- `line:84-91` 的 effect 修改了自身依赖，潜在死循环；
- **建议**：把"加载 board / 监听 columns 变化 / 输入框聚焦"拆成 3 个独立 hook，依赖各自封闭。

### 4.5 [P1] 全局事件监听清理

`App.tsx:110-327` 注册了 15 个 `window.addEventListener` / `window.api.on`。逐一确认 cleanup：

- `plugin-panel-open`、`index-and-show-graph`、`generate-graph` 等 handler 闭包内引用 `t()` 但 `t` 不在依赖数组里，i18n 切换后会用旧文案；
- 多个 effect 各管一个事件，建议合并成 `useGlobalEvents()` hook，一次性注册/清理。

### 4.6 [P2] 硬编码中文

虽然项目用 i18next，但 `App.tsx:49,62`、`Settings.tsx`、`KanbanPanel.tsx:208,220`、`Editor.tsx:142` 等仍直接写中文。

- **建议**：写一个 eslint 规则 `no-literal-cjk` 或简单 grep CI 步骤，阻止再增量；存量按域分批迁移到 i18n。

### 4.7 [P2] 可访问性

- 主要交互按钮缺 `aria-label`（`App.tsx:453-459` 等纯图标按钮）；
- Settings 中颜色（`PRIORITY_COLOR` 用 oklch）需要走 axe-core / Lighthouse 校验 WCAG AA；
- 命令面板、QuickSwitcher 应支持 `aria-activedescendant`。

---

## 5. 测试覆盖

### 5.1 [P1] 大文件无集成测试

`tests/` 共 50+ 文件，但 `ai.ipc.ts`（3426 行）、`Settings.tsx`、`CanvasView.tsx`、`KanbanPanel.tsx`、整个 `cloud/*-provider.ts` 集成路径几乎无覆盖。

- **建议**：
  - 用 vitest + jsdom 写 `tests/chat-stream-cancel.test.ts`：模拟 provider 流，断言取消后不再写入 store；
  - 用真实 sqlite + 临时 vault 写 `tests/db-ipc-integration.test.ts`，覆盖 kanban / flashcards / search；
  - Cloud provider 用 `nock` 或本地 http mock 写传输层测试。

### 5.2 [P1] 数据库迁移测试缺位

无 `tests/database-migration.test.ts`。配合 2.3 的迁移函数化，落一个 fixture-based 测试：装 v3 / v5 / v7 vault → 跑迁移 → 比对 schema。

### 5.3 [P2] 安全回归测试

- 加 `tests/file-path-symlink.test.ts`：构造 vault 内 symlink 指向 vault 外，断言写入被拒；
- 加 `tests/preload-send-whitelist.test.ts`：断言未知 channel 被拒。

---

## 6. 构建、CI、依赖

### 6.1 [P1] `pnpm audit` 未在 CI

- **建议**：`.github/workflows/build.yml` 增加一个 job 跑 `pnpm audit --prod`，失败仅 warn（不阻塞）；同时加 dependabot 周期更新。
- **2026-05-24 进展**：质量门基线已在 `.github/workflows/ci.yml` 落地（push/PR 触发，跑 `typecheck` + `test`，详见 OPTIMIZATION.md #19）；`pnpm audit` 与 dependabot 仍待补。

### 6.2 [P1] electron-builder 未签名

- **建议**：注入 `CSC_LINK / CSC_KEY_PASSWORD`（macOS）与 Windows 证书 secret，配置 `notarize: true`。短期没证书的话，在 README 注明用户首次启动需 `xattr -d com.apple.quarantine` 或右键打开。

### 6.3 [P2] dist 目录被 commit 到仓库？

仓库根有 `dist/` 与 `out/`。建议确认是否在 `.gitignore` 内；若不是，整理一次干净的 ignore 列表，避免 PR 噪声。

### 6.4 [P2] `package.json` postinstall 自动 rebuild

`scripts/rebuild-native.mjs` 通过 postinstall 自动执行。优点是开箱即用，缺点是 CI 安装慢、新贡献者克隆时若环境缺 Python/MSVC 直接报错。

- **建议**：把 postinstall 改成"仅在缺 prebuilt binary 时 rebuild"，并提供 `pnpm install --ignore-scripts` 绕路文档说明。

---

## 7. 文档与流程

### 7.1 [P1] OVERVIEW vs 实现一致性巡检

本轮审计已发现 1 处不一致：`docs/PROJECT_OVERVIEW.md` 第 15 节说"API Key 通过 Electron safeStorage 加密存储"，但 `secret.ts` 实际是硬编码字符串派生 key。修 1.2 后同步改文档。

建议建立 **"文档对照表"**：把 OVERVIEW 中每个事实断言（"X 走 Y"）映射到测试用例。任何代码改动若让断言失效，CI 失败。

### 7.2 [P2] `FEATURES.md` 已超 57 KB

可读性下降。建议拆 `FEATURES/00-editor.md`、`FEATURES/01-ai.md`、`FEATURES/02-graph.md` …，按子系统索引。

### 7.3 [P2] AGENT 阅读路径

`docs/PROJECT_OVERVIEW.md` 第 19 节"AI Agent 快速上下文"很有价值。建议同步把 `CLAUDE.md`（项目根）做成更短的 *index*（不重复 OVERVIEW），只列：阅读顺序、禁区、调试命令。

---

## 8. 落地建议（90 天 roadmap）

| 时间窗 | 主题 | 包含项 |
| --- | --- | --- |
| **第 1-2 周** | 安全底座 | 1.1 sandbox / 1.2 safeStorage / 1.3 openExternal / 1.4 日志脱敏 / 1.5 preload 白名单 |
| **第 3-5 周** | 主进程拆分 | 2.1 ai.ipc 拆分 / 2.5 公共模板抽取 / 2.3 迁移函数化 + 测试 |
| **第 6-7 周** | 性能 | 3.1 maintenance 单遍 / 3.2 embedding worker / 3.3 prepared statements / 3.4 fts fallback |
| **第 8-10 周** | 前端瘦身 | 4.1 ChatPanel 拆分 / 4.2 Settings 分域 / 4.5 全局事件聚合 / 4.4 KanbanPanel hooks |
| **第 11-12 周** | 质量基线 | 5.1/5.2 测试补全 / 6.1 pnpm audit / 6.2 签名 / 7.1 文档对照表 |

每两周一次小节点，避免长 PR。安全相关（第 1-2 周）建议独立小 PR 逐条合入，方便 review 与回滚。

---

## 9. 不在本次范围

下列内容已扫描但暂未发现明显问题，仅记录以备后续 review：

- `services/cloud/supabase-provider.ts`：错误处理结构良好，未深挖；
- `services/web-clipper.ts`：已绑定 127.0.0.1 且有 body size 限制，仅需补 1.7 的 IPC 校验；
- `packages/shared/src/markdown/*`：单元测试覆盖较好；
- `tests/` 目录的现有用例：质量整体可接受，无需重写。

---

## 附录 A：与 [OPTIMIZATION.md](./OPTIMIZATION.md) 的关系

`OPTIMIZATION.md` 是过去已落地的 18 项优化清单（语义搜索、ChatPanel debounce、SQLite 迁移、FTS5 分词等）。本文是 v0.4.0 全仓审计后 **新发现** 的待办项，二者互补：

- 已完成项不在本文重复；
- 本文落地后建议把对应条目挪到 `OPTIMIZATION.md` 表中标记 ✅，保留单一历史脉络。

如需把任意一节拆成具体 issue 模板（含验收标准、测试用例、回归 checklist），告诉我对应章节号即可。
