# Nexusky 项目提分优化计划

> 审计日期：2026-05-25
> 审计范围：根 Electron 应用、`packages/main`、`packages/renderer`、`packages/shared`、`website`、`browser-extension`、`scripts`、CI、构建配置、依赖与现有文档。
> 目标：找出当前最能提升安全分、工程分、性能分、可维护性分和发布成熟度的优化项，并按优先级给出可执行计划。
> 说明：`docs/OPTIMIZATION_PLAN.md` 中很多历史项已经落地，本文件只记录本轮基于当前代码重新扫描后的待办。

## 0. 当前基线

### 0.1 扫描结论

- 当前源码规模约 64,892 行（排除 `node_modules`、`dist`、`out`、`.next`），测试文件 99 个。
- 主应用 TypeScript 类型检查通过，测试通过，生产构建通过。
- 根项目 `lint` 命令不可用，官网没有纳入根 workspace / 根 CI。
- 依赖审计发现主应用 5 个 moderate 漏洞，官网 1 个 moderate 漏洞。
- 老安全项中，Electron sandbox、`openExternal` 白名单、secret v3/safeStorage、symlink 防护、日志脱敏等已经部分或全部落地；本轮更大的风险集中在 Web Clipper 本地端口、文件 IPC 边界、遥测 opt-in、官网日志入口和供应链。

### 0.2 命令证据

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `git status --short` | 通过 | 审计开始时无未提交变更 |
| `pnpm run typecheck` | 通过 | shared/main/renderer 三个 tsconfig 均通过 |
| `pnpm test` | 通过 | 99 个测试文件、582 个用例通过；macOS 有 Electron codesign 噪声 |
| `pnpm run build` | 通过 | 有 Vite chunk 警告和 700KB-1MB 级大 chunk |
| `pnpm run lint` | 失败 | `eslint: command not found`，根项目依赖/配置缺失 |
| `pnpm -C website run lint` | 通过 | 官网 lint 通过 |
| `pnpm -C website run build` | 通过 | 沙箱内 Turbopack 绑定内部端口失败；放开后通过，仍有 workspace root 与 `middleware` 弃用警告 |
| `pnpm audit --prod` | 失败 | 主应用 5 个 moderate：`mermaid <=11.14.0`、`ws <8.20.1` |
| `pnpm -C website audit --prod` | 失败 | 官网 1 个 moderate：`next > postcss 8.4.31`，patched `postcss >=8.5.10` |

### 0.3 提分优先级模型

| 优先级 | 定义 | 处理窗口 |
| --- | --- | --- |
| P0 | 安全、隐私、供应链或本地数据边界风险，影响信任与发布评分 | 立即到 2 周 |
| P1 | CI、性能、可维护性、发布质量，影响长期交付和用户体验 | 2 到 6 周 |
| P2 | 文档、体验细节、度量完善，收益明确但不阻塞当前发布 | 6 周以后或穿插处理 |

## 1. 优先级总览

| ID | 优先级 | 方向 | 优化项 | 预估提分 | 工作量 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | 安全 | Web Clipper 本地 HTTP 接口加认证、收窄 CORS、校验来源 | +10 | M |
| P0-2 | P0 | 安全 | 文件 IPC 统一以主进程当前 vault 为信任源，补齐读/列举/加密等边界校验 | +12 | M |
| P0-3 | P0 | 供应链 | 修复主应用与官网生产依赖漏洞，补 Mermaid 渲染防护 | +8 | S-M |
| P0-4 | P0 | 隐私/运维 | 遥测默认 opt-in、官网日志 POST 鉴权/限流/服务端脱敏 | +9 | M |
| P0-5 | P0 | 官网安全 | 官网登录禁止默认密钥、增加限流和常量时间比较 | +6 | S |
| P1-1 | P1 | 工程质量 | 修复根 lint，纳入 CI，建立格式和静态规则基线 | +8 | S-M |
| P1-2 | P1 | CI/仓库 | 将 `website` 纳入 workspace 或独立 CI，补 build/audit gates | +7 | S-M |
| P1-3 | P1 | 性能 | 调整 Vite manual chunks，建立 bundle 预算与可视化报告 | +8 | M |
| P1-4 | P1 | 性能 | TF-IDF 搜索索引移出主线程，避免大 vault 阻塞 IPC | +7 | M |
| P1-5 | P1 | 可维护性 | 拆分 `db.ipc.ts` 多领域处理器，收敛 IPC 入参校验 | +7 | M |
| P1-6 | P1 | 可维护性 | 拆分超大前端组件，抽 hooks/service 层，降低回归成本 | +6 | L |
| P1-7 | P1 | 发布 | 启用 macOS notarize / Windows signing，补发布 smoke test | +7 | M-L |
| P2-1 | P2 | 文档 | 更新 README / OVERVIEW / GUIDE 中过期技术栈与版本说明 | +3 | S |
| P2-2 | P2 | 官网 | 替换 create-next-app 默认 README，补部署与日志后台说明 | +2 | S |
| P2-3 | P2 | 质量度量 | 增加覆盖率、bundle size、audit 报告归档 | +4 | S-M |

## 2. P0 立即处理

### P0-1 Web Clipper 本地接口认证与 CORS 收敛

**证据**

- 扩展固定向 `http://127.0.0.1:17321/clip` 发 POST：`browser-extension/background.js:1`、`browser-extension/background.js:35-39`。
- 主进程服务监听 `127.0.0.1:17321`：`packages/main/src/services/web-clipper.ts:213`。
- 服务端对所有响应返回 `Access-Control-Allow-Origin: *`，且只要当前有 vault 就直接写入剪藏：`packages/main/src/services/web-clipper.ts:148-154`、`packages/main/src/services/web-clipper.ts:177-200`。

**风险**

任意网页都可能尝试向本机 `127.0.0.1:17321/clip` 写入内容。当前虽然只能写入 `Clippings`，但这仍是未经授权的本地数据写入入口；若后续 Markdown 渲染链出现绕过，会放大为持久化内容注入。

**改造方案**

1. 在主进程 store 生成 `webClipper.secret`，默认启用时创建，用户重置时轮换。
2. 扩展请求增加 `X-Nexusky-Clipper-Token`；服务端只接受 token 正确的 POST。
3. CORS 不再返回 `*`。对普通网页 Origin 返回 403；对扩展 Origin 或无 Origin 的合法客户端按白名单处理。
4. 对 payload 做 runtime schema：`title/url/selection/text/html` 类型、长度、URL 协议、总大小全部限制。
5. 新增设置页开关：关闭 Web Clipper 时不监听端口。
6. 测试覆盖：缺 token 401、错 token 401、非法 Origin 403、超长 payload 413、合法剪藏成功。

**验收**

- `pnpm test -- tests/web-clipper.test.ts`
- `pnpm run typecheck`
- 手测扩展点击保存页面、保存选区；普通网页 `fetch("http://127.0.0.1:17321/clip")` 被拒绝。

### P0-2 文件 IPC 以主进程 vault 为信任边界

**证据**

- `file:read`、`file:extract-document-text`、`file:stat` 直接读 renderer 传入路径：`packages/main/src/ipc/file.ipc.ts:78-89`。
- `file:list`、`file:list-shallow` 直接列举 renderer 传入目录：`packages/main/src/ipc/file.ipc.ts:115-120`。
- `file:reveal` 直接调用 `shell.showItemInFolder`：`packages/main/src/ipc/file.ipc.ts:138-140`。
- `file:restore-history`、`file:encrypt`、`file:decrypt` 未做 vault 边界校验：`packages/main/src/ipc/file.ipc.ts:220-239`。
- `file:write/create/delete/rename` 只有在 renderer 传入 `vaultPath` 时才校验：`packages/main/src/ipc/file.ipc.ts:96-98`、`packages/main/src/ipc/file.ipc.ts:123-126`、`packages/main/src/ipc/file.ipc.ts:142-145`。

**风险**

Electron 已启用 sandbox 和 contextIsolation，这是好基线。但一旦渲染层发生 XSS 或第三方内容注入，攻击者可以通过 `window.api.invoke` 触发文件 IPC。文件类通道不能相信 renderer 传来的 `vaultPath`，应该由主进程当前 vault 决定。

**改造方案**

1. 新增 `getCurrentVaultPathOrThrow()`，只从 `store.get('vaultPath')` 读取当前 vault。
2. 文件 IPC 默认不再接受 renderer 传来的 `vaultPath` 作为信任来源；保留参数只用于兼容，但必须与 store 当前 vault 完全一致。
3. 所有文件读、写、列举、stat、reveal、history、encrypt/decrypt、trash、image save 都调用 `assertPathInsideVault`，并使用 canonical path。
4. 外部导入类通道只允许通过主进程 `dialog` 选择外部源路径，不允许 renderer 任意传外部路径。
5. 给 `file:read/list/stat/reveal/encrypt/decrypt/restore-history` 增加越界和 symlink 测试。

**验收**

- `pnpm test -- tests/file-path.test.ts tests/file-path-symlink.test.ts`
- 新增 `tests/file-ipc-boundary.test.ts`
- 手测打开 vault、读写文件、历史恢复、加密解密、图片粘贴、导入 Notion/Readwise/Pocket。

### P0-3 修复生产依赖漏洞

**证据**

- `package.json` 当前直接依赖 `mermaid ^11.14.0`、`ws ^8.20.0`：`package.json:63`、`package.json:69`。
- `pnpm audit --prod` 报 5 个 moderate：
  - `mermaid >=11.0.0-alpha.1 <=11.14.0`，patched `>=11.15.0`，包含 Gantt DoS、CSS/HTML injection。
  - `ws >=8.0.0 <8.20.1`，patched `>=8.20.1`，uninitialized memory disclosure。
- `pnpm why ws` 显示 `ws 8.20.0` 为直接依赖，并被 `openai 6.37.0` peer 使用。
- 官网 `pnpm -C website audit --prod` 报 `next > postcss 8.4.31`，patched `postcss >=8.5.10`。

**改造方案**

1. 主应用升级 `mermaid >=11.15.0`、`ws >=8.20.1`，更新 lockfile。
2. Mermaid 渲染补强：
   - 初始化时显式设置 `securityLevel: 'strict'` 或等效安全配置；
   - 限制单个 diagram 字符数和渲染超时；
   - 对 Gantt 等高风险图形加失败兜底。
3. 官网升级 Next 补丁版本，或在可验证兼容时用 `pnpm.overrides` 固定 `postcss >=8.5.10`。
4. CI 加 `pnpm audit --prod --audit-level moderate`，官网单独跑一次。

**验收**

- `pnpm audit --prod` 无 moderate 及以上漏洞。
- `pnpm -C website audit --prod` 无 moderate 及以上漏洞。
- `pnpm test`
- 手测 Mermaid：flowchart、sequence、gantt、class diagram 渲染和错误兜底。

### P0-4 遥测 opt-in 与官网日志入口加固

**证据**

- 桌面端固定上报地址写死：`packages/main/src/services/logger.ts:16`。
- 任何 logger 调用都会入队并 `fetch(REPORT_URL)`：`packages/main/src/services/logger.ts:35-51`、`packages/main/src/services/logger.ts:62-76`。
- 官网 `/api/logs` 的 POST 无鉴权，只校验 `message` 后写入 Supabase：`website/src/app/api/logs/route.ts:5-28`。
- `vercel.json` 对 `/api/logs` 允许任意 Origin：`website/vercel.json:4-8`。

**风险**

桌面端虽然有 redaction，但缺少用户 opt-in 与上报目标配置；官网 POST 公开且无限流，容易被刷库、污染日志或扩大隐私风险。

**改造方案**

1. 桌面端新增 `telemetry.enabled`，默认 false；首次 crash/error 后提示用户是否允许匿名错误上报。
2. `REPORT_URL` 改为 build-time 环境变量；开发环境默认不上报。
3. 日志队列增加最大长度、指数退避、离线丢弃策略，避免长期内存堆积。
4. `/api/logs` POST 增加 HMAC 或 ingestion token；桌面端带签名，服务端验签。
5. 服务端也做 redaction、长度限制、schema 校验、rate limit。
6. CORS 改为只允许实际应用来源；如果桌面端直接 POST，不需要开放 `*` 给浏览器网页。

**验收**

- `telemetry.enabled=false` 时不会发出网络请求。
- 无 token 的 `/api/logs` POST 返回 401/403。
- 过长 `message/stack/context` 被拒绝或截断。
- `pnpm -C website run lint && pnpm -C website run build`。

### P0-5 官网登录与 JWT 密钥硬化

**证据**

- `AUTH_SECRET` 缺失时回退到固定字符串：`website/src/lib/auth.ts:4`、`website/src/middleware.ts:4-6`。
- 登录只做一次明文字符串比较，无限流：`website/src/app/api/auth/route.ts:4-8`。

**风险**

如果生产环境漏配 `AUTH_SECRET`，所有部署共享同一 JWT 签名密钥；登录接口可被暴力尝试。

**改造方案**

1. 生产环境启动时如果缺 `AUTH_SECRET` 或 `ADMIN_PASSWORD`，直接抛错。
2. 用 `crypto.timingSafeEqual` 做密码比较，避免明显时序差异。
3. 按 IP + User-Agent 做简单 rate limit，连续失败后延迟或锁定。
4. 登录成功轮换 cookie，失败统一返回相同错误。
5. 补 API route 测试：缺 env、错密码、限流、正确登录、JWT 验证。

**验收**

- `pnpm -C website run lint`
- `pnpm -C website run build`
- 手测 `/login` 与 `/logs`。

## 3. P1 重要优化

### P1-1 修复根 lint 与静态规则基线

**证据**

- 根 `package.json` 有 `"lint": "eslint . --ext .ts,.tsx"`：`package.json:28`。
- 根 devDependencies 没有 `eslint`；本地运行结果为 `sh: eslint: command not found`。
- 当前 CI 只跑 typecheck 和 test：`.github/workflows/ci.yml:34-38`。

**改造方案**

1. 选择 ESLint 9 flat config 或 Biome。建议先用 ESLint 9，避免和官网 Next ESLint 分裂。
2. 根安装 `eslint`、`typescript-eslint`、`eslint-plugin-react-hooks` 等必要依赖。
3. `eslint.config.mjs` 覆盖 `packages/**/*.{ts,tsx}`、`tests/**/*.ts`、`scripts/**/*.mjs`，排除 `out/dist/node_modules`。
4. 第一版规则先以 correctness 为主：no floating promises、no unsafe any、React hooks、no restricted imports、no unused vars。
5. CI 加 `pnpm run lint`，并把 lint 输出作为 PR 必过门禁。

**验收**

- `pnpm run lint`
- `pnpm run typecheck`
- `.github/workflows/ci.yml` 包含 lint 步骤。

### P1-2 把官网纳入 workspace / CI

**证据**

- 根 workspace 只包含 `packages/*`：`pnpm-workspace.yaml:1-2`。
- 官网有自己的 lockfile、workspace 文件和独立依赖；根 CI 完全不跑官网 lint/build/audit。
- 官网 build 警告 Next.js 误判 workspace root，并提示设置 `turbopack.root`；还提示 `middleware` 文件约定已弃用。
- `website/next.config.ts` 为空配置：`website/next.config.ts:1-7`。
- 官网仍使用 `src/middleware.ts`：`website/src/middleware.ts:8-26`。

**改造方案**

1. 二选一：
   - 方案 A：根 `pnpm-workspace.yaml` 纳入 `website`，合并依赖治理；
   - 方案 B：保留独立 lockfile，但 CI 加 `website` job，明确 cache 和 install 目录。
2. `website/next.config.ts` 设置 `turbopack.root`，消除 workspace root 警告。
3. 将 `middleware.ts` 迁移到 Next 16 推荐的 `proxy` 文件约定。
4. CI 增加：
   - `pnpm -C website install --frozen-lockfile`
   - `pnpm -C website run lint`
   - `pnpm -C website run build`
   - `pnpm -C website audit --prod --audit-level moderate`

**验收**

- 官网 build 无 workspace root 与 middleware 弃用警告。
- PR 上官网变更会触发官网 CI。

### P1-3 Bundle 与 chunk 优化

**证据**

- `electron.vite.config.ts` 手写 `manualChunks`：`electron.vite.config.ts:50-57`。
- `pnpm run build` 报：
  - `Circular chunk: vendor-tiptap -> vendor-react -> vendor-tiptap`
  - `toast-store` 动态 import 因静态 import 失效
  - 多个大 chunk：`vendor-tiptap` 约 1,028 KB、`cytoscape.esm` 约 957 KB、`wardley` 约 944 KB、`mermaid.core` 约 807 KB、`index` 约 709 KB、`vendor-react` 约 674 KB。
- App 壳层确实 lazy 了很多视图：`packages/renderer/src/App.tsx:29-45`，但共享依赖和手动 chunk 仍在放大初始包。

**改造方案**

1. 增加 bundle analyzer（如 `rollup-plugin-visualizer`），把 HTML 报告作为 build artifact。
2. 重写 manualChunks：
   - `react` 独立；
   - `tiptap/prosemirror` 避免和 `react` 循环；
   - `mermaid` 保持真正按需加载，按 diagram 子模块拆分优先；
   - D3 仅由 GraphView 使用时随 GraphView chunk。
3. 清理无效动态 import：`CommandPalette` 里反复 `await import('../stores/toast-store')` 但文件顶部已静态 import。
4. 建立 bundle budget：初始 renderer JS 目标 < 500 KB gzip；单 lazy chunk < 350 KB gzip；超过时 CI 警告。
5. 对 `MermaidRenderer` 加 diagram size limit，减少 DoS 风险和首渲染波动。

**验收**

- `pnpm run build` 无 circular chunk 警告。
- 构建报告中初始 chunk 明显下降。
- Mermaid、Graph、Canvas、Chat、Settings 首次打开功能正常。

### P1-4 TF-IDF 搜索索引移到 worker

**证据**

- `buildTfIdfIndex` 在主进程同步读取最多 `MAX_CACHE_CHUNKS=2000` 并构建 token/df/idf/norm：`packages/main/src/services/embedding.ts:208-263`。
- 查询时 `tfidfSearch` 同步遍历 docs 打分和排序：`packages/main/src/services/embedding.ts:266-309`。
- 当前已有 `index-vault-worker.ts`，说明项目已经接受 worker 作为重任务隔离方式。

**风险**

大 vault 首次语义搜索或缓存失效后，主进程同步 CPU 会阻塞 IPC，用户感知为界面卡顿。

**改造方案**

1. 新增 `packages/main/src/workers/tfidf-worker.ts`，负责 tokenize、df/idf、norm、topK 打分。
2. 主进程只发 vaultPath/query/topK/requestId，worker 返回结果；支持 abort/stale request。
3. cache 存在 worker 内，主进程用 `invalidateEmbeddingCache` 发消息失效。
4. 查询失败时降级到 `keywordFallbackSearch`。
5. 增加 10k/50k chunks synthetic benchmark 测试，记录 p50/p95。

**验收**

- 大 vault 语义搜索时窗口仍能响应。
- `tests/embedding.test.ts` 保持通过，并新增 worker 搜索测试。
- `pnpm run typecheck && pnpm test`。

### P1-5 拆分 `db.ipc.ts` 并统一 IPC 校验

**证据**

- `db.ipc.ts` 当前 1,455 行。
- 它同时处理索引/搜索/图谱：`packages/main/src/ipc/db.ipc.ts:212-320`。
- 同一文件还处理 Kanban：`packages/main/src/ipc/db.ipc.ts:432-620`。
- 同一文件还处理 chat history/session：`packages/main/src/ipc/db.ipc.ts:1135-1208`。
- 部分通道已使用 validators，部分通道没有。例如 `kanban:create-task` 做了长度校验，但 `kanban:delete-task`、`move-task`、chat session 类入口较薄。

**改造方案**

1. 拆分为：
   - `ipc/db/index.ipc.ts`：索引、搜索、图谱、属性；
   - `ipc/kanban.ipc.ts`：看板列、任务、关系、AI plan；
   - `ipc/flashcards.ipc.ts`：闪卡；
   - `ipc/chat-history.ipc.ts`：对话历史和 session；
   - `ipc/long-context.ipc.ts`：长期上下文。
2. 每个模块导出 `registerXxxIPC()`，在主入口统一注册。
3. 把 validators 从“点状调用”改为“每个通道入口必须校验”的清单式覆盖。
4. 增加 IPC payload 测试，至少覆盖写入型通道。

**验收**

- `db.ipc.ts` 或新的 db index 文件 < 500 行。
- 每个写入型 IPC 有负向 payload 测试。
- `pnpm test -- tests/ipc-validators.test.ts tests/*ipc*.test.ts`。

### P1-6 拆分超大前端组件

**证据**

当前最大文件：

- `packages/renderer/src/components/ai/ChatPanel.tsx`：2,267 行。
- `packages/renderer/src/components/settings/Settings.tsx`：1,995 行。
- `packages/renderer/src/components/canvas/CanvasView.tsx`：1,890 行。
- `packages/renderer/src/components/KanbanPanel.tsx`：1,618 行。

**问题**

这些组件承担 UI、状态编排、IPC 调用、流处理、列表渲染、错误处理等多重责任。短期能跑，但长期会增加回归成本，也让局部优化难以隔离。

**改造方案**

1. ChatPanel：
   - `useChatSessions`
   - `useChatStreaming`
   - `useBatchGeneration`
   - `ChatComposer`
   - `ChatHeader`
   - `ChatTranscript`
2. Settings：
   - provider 设置、cloud 设置、theme 设置、proactive 设置拆成 tab 组件；
   - provider 表单抽 `ProviderEditor`。
3. CanvasView：
   - layout engine、grouping、routing worker 通信、render layer 分离。
4. KanbanPanel：
   - board state hook、column/task components、AI preview modal 分离。
5. 每次拆分只做等价移动，不混入行为改动；用现有测试兜底。

**验收**

- 最大组件目标 < 800 行。
- 每个拆分 PR 保持 `pnpm run typecheck && pnpm test` 通过。
- 手测 Chat、Settings、Canvas、Kanban 主流程。

### P1-7 发布签名、notarize 和 smoke test

**证据**

- Windows `sign: false`：`electron-builder.yml:23`。
- macOS `identity: null`：`electron-builder.yml:33`。
- release workflow 只 build/package，不做安装包 smoke test：`.github/workflows/build.yml:23-26`、`.github/workflows/build.yml:47-50`、`.github/workflows/build.yml:68-71`、`.github/workflows/build.yml:89-91`。

**改造方案**

1. macOS 配置 Developer ID、notarize，CI secrets 注入。
2. Windows 配置代码签名证书或云签名服务。
3. Linux AppImage 增加 smoke：启动 `--version` 或 `--smoke-test` 后退出。
4. Electron 主进程增加无窗口 smoke flag：加载主 bundle、打开临时 vault、初始化 DB 后退出。
5. README 增加未签名测试包说明，生产 release 只发布签名产物。

**验收**

- macOS Gatekeeper 不再拦截正式包。
- Windows SmartScreen 信任逐步积累。
- CI artifacts 产出后自动 smoke 通过。

## 4. P2 后续优化

### P2-1 更新过期文档

**证据**

- 审计时 README 与部分文档仍使用旧运行时和旧版本描述。
- 当前 `package.json` devDependency 是 Electron 39：`package.json:86`。
- `docs/PROJECT_OVERVIEW.md` 已更新到 v0.5.0 后视角，README 已重写为当前入口。

**计划**

1. README、GUIDE、PROJECT_OVERVIEW 统一更新到当前版本。
2. 在文档头部增加“最后验证命令”和“最后核对日期”。
3. 把已完成的老优化项从待办文档中归档，避免 AI agent 误读。

### P2-2 官网 README 与部署文档

**证据**

`website/README.md` 仍是 create-next-app 默认内容，没有说明日志后台、Supabase schema、环境变量、部署与安全要求。

**计划**

1. 重写 `website/README.md`：
   - 环境变量；
   - 本地启动；
   - Vercel 部署；
   - Supabase 表结构；
   - 日志 ingestion 安全模型。
2. 和根 README 互链。

### P2-3 质量度量归档

**计划**

1. CI 保存：
   - test summary；
   - audit JSON；
   - bundle analyzer HTML；
   - coverage report。
2. 建立阈值：
   - moderate 漏洞为失败；
   - 新增大 chunk 超阈值为警告；
   - 关键纯函数包覆盖率不低于 80%。

## 5. 推荐执行节奏

### 第 1 周：先关安全洞

1. P0-1 Web Clipper token + CORS + schema。
2. P0-2 文件 IPC 边界校验。
3. P0-3 依赖漏洞升级。
4. 跑：`pnpm run typecheck && pnpm test && pnpm run build && pnpm audit --prod`。

### 第 2 周：隐私和官网安全

1. P0-4 telemetry opt-in、日志 POST 鉴权、服务端限流。
2. P0-5 官网 auth hardening。
3. 官网 CI 补 `lint/build/audit`。

### 第 3-4 周：工程门禁与性能

1. P1-1 根 lint。
2. P1-2 workspace/CI 收敛。
3. P1-3 bundle analyzer 和 chunk 修正。
4. P1-4 TF-IDF worker。

### 第 5-6 周：可维护性和发布成熟度

1. P1-5 `db.ipc.ts` 拆分。
2. P1-6 超大前端组件拆分。
3. P1-7 签名/notarize/smoke test。
4. P2 文档更新穿插完成。

## 6. 最小验收清单

每个阶段结束至少跑：

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm audit --prod
pnpm -C website run lint
pnpm -C website run build
pnpm -C website audit --prod
```

额外手测：

- 新建/打开 vault、文件树读写、重命名、删除、恢复、历史。
- AI chat、AI edit、批量生成、Agent 工具调用。
- Web Clipper 保存页面和选区。
- Mermaid/KaTeX/表格/任务列表渲染。
- Graph、Canvas、Kanban、Settings、Search。
- 官网 `/login`、`/logs`、`/api/logs` 鉴权。

## 7. 不建议先做的事

- 不建议先继续大规模功能扩展。当前最大提分来自安全边界、依赖漏洞、CI 门禁和构建体积。
- 不建议直接跑 `pnpm audit --fix`。Electron + Next 双项目需要逐项升级并验证渲染、打包和原生依赖。
- 不建议把所有重构塞进一个 PR。P0 安全项应小 PR 快速合入；组件拆分和 IPC 拆分应等价移动、分批验收。
