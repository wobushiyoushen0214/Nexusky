# P0 修复工单清单

- 日期：2026-05-29
- 分支：`fix/p0-data-safety`
- 来源：[Nexusky 全项目分析报告](./PROJECT_ANALYSIS_2026-05.md)
- 全部结论均经第二个独立 Agent 读码复核（CONFIRMED）

## 进度总览

| 工单 | 标题 | 严重度 | 状态 | commit |
|---|---|---|---|---|
| P0-1 | index.db 二进制同步损坏 | critical | ✅ 已修复 | `c919753` |
| P0-2 | 删除复活 / 不传播 | critical | 🔧 待修复 | — |
| P0-3 | Agent 写入数据丢失三连 | critical | 🔧 待修复 | — |
| P0-4 | 安全链：任意读 + 明文密钥 + 无 CSP | critical | 🔧 待修复 | — |
| P0-5 | 编辑器 Markdown 往返非保真 | high | 🔧 待修复 | — |

---

## P0-1　index.db 二进制同步损坏　✅ 已修复（c919753）

- 严重度：critical（数据损坏，默认 provider 触发，可级联到删库）
- 验证：CONFIRMED

### 问题
所有 cloud provider 用 UTF-8 文本通道读写文件。二进制 SQLite `index.db` 经 `res.text()` / `readFileSync(...,'utf-8')` / `writeFileSync(...,'utf-8')` 时，非法字节被替换为 U+FFFD，文件损坏。

### 影响
- 默认 Supabase 双向损坏；OneDrive 双向；S3/WebDAV 下行损坏；iCloud 安全。
- 损坏 db 下次开 vault 时 `integrity_check` 失败 → `database.ts:26-41` 自动 `unlinkSync` 删库重建 → 索引/“嵌入”静默清空。
- 每次 `vault:get` 与索引重建后自动触发，错误被 `.catch(()=>{})` 吞掉。

### 证据
`manager.ts:151-188`、`supabase-provider.ts:88,129-132`、`s3-provider.ts:192`、`webdav-provider.ts:183-186,202`、`onedrive-provider.ts:90,216,236-240`、`icloud-provider.ts:102`、`database.ts:26-41`

### 已实施修复
- push 读取改 `readFileSync(path)`（去 `'utf-8'`）。
- download 改 `Buffer.from(await res.arrayBuffer())`（替代 `.text()`）。
- write 改 `writeFileSync(path, buffer)`（去 `'utf-8'`）。
- OneDrive `graphRequest` 新增 `{ raw }` 选项，raw 时返回 `Buffer.from(await response.arrayBuffer())`；`pullFile` 用 `graphRequest<Buffer>(..., { raw: true })`，push 的 Content-Type 改 `application/octet-stream`。
- listRemoteFiles 中算 hash 的读取（WebDAV/iCloud）改 Buffer。
- 对文本 `.md/.json`，`md5(Buffer) == md5(utf-8 字符串)`，哈希语义与冲突判定不变。

### 验收
- [x] `pnpm typecheck` 通过
- [x] `node scripts/vitest-electron.mjs run cloud` 6/6 通过
- [ ] （建议补）二进制往返回归测试：构造含非 UTF-8 字节的 buffer，经 fake provider push→pull，断言字节一致

---

## P0-2　删除复活 / 删除不传播　🔧

- 严重度：critical（多设备删除意图永久丢失）
- 验证：CONFIRMED（5 provider 一致）

### 问题
`syncAll` 末尾对“远端有、本地无”的文件一律 `pullFile` 拉回（判据仅 `!existsSync`，无法区分“我删了”与“远端新增”）；本地删除（watcher `unlink` / `file:delete`）从不通知云端，`SyncProvider` 接口无 `deleteRemote`；无 tombstone / manifest。

### 影响
删一篇笔记 → 同步 → 它从云端回到原位；多设备间删除永久丢失。

### 证据
`supabase-provider.ts:203-216`、`s3-provider.ts:243-248`、`webdav-provider.ts:248-254`、`icloud-provider.ts:158-165`、`onedrive-provider.ts:322-329`、`watcher.ts:102-115`、`provider.ts:24-38`

### 修复方案
1. 引入“上次成功同步基线 manifest”：`<vault>/.nexusky/sync-state.json`，记录 `path → { hash, syncedAt }`。
2. `syncAll` 三态判定：远端有+本地无+**基线里有** ⇒ 远端是被删（删远端，或生成 tombstone）；远端有+本地无+基线里无 ⇒ 真·远端新增（拉回）。
3. `SyncProvider` 增加 `deleteRemote(relPath)`；watcher `unlink` 入队删除（经离线队列）。
4. 提供“镜像删除”开关，默认开但首次弹确认。

### 验收
- [ ] A 删笔记→同步→B 同步后该笔记消失（不复活）
- [ ] manifest 缺失/损坏时安全降级（退回当前“只增不删”行为，不误删）
- [ ] 新增 syncAll 删除语义单测

### 工作量：中（建议先在一个 provider + manager 落地，再推广）

---

## P0-3　Agent 写入数据丢失三连　🔧

- 严重度：critical（AI 误删/覆盖用户已编辑内容，不可恢复）
- 验证：CONFIRMED（A/B/C 全部）

### 问题
- A：`file_create` 回滚无条件 `unlinkSync(targetPath)`，不校验内容是否被用户改过 → “Rollback All” 整删用户已写满内容的文件。`701d7df` 把伤害从“清空”升级为“硬删”，未走 `.trash`。
- B：对已完成 `file_write`/`note_edit` 点 `retry-step`，用 plan 内容覆盖用户改动，并把“用户改动版”记成新 `previousContent` → 原始永久丢失。
- C：回滚时 `previousContent` 缺失则 `writeFileSync(targetPath,'')` 清空文件而非中止。

### 证据
`executor.ts:263-268`、`agent.ipc.ts:230-246`、`agent-store.ts:286-296`；对照未用的 trash 软删 `file.ipc.ts:139-156`

### 修复方案
1. 写步骤记录 `(filePath, beforeHash)`；回滚/重试前校验磁盘现状 hash == 期望 hash，不符则拒绝并提示“文件已被外部修改”。
2. `file_create` 回滚改 `shell.trashItem`（替代 `unlinkSync`）。
3. C：`previousContent` 非字符串时返回 `{ ok:false, error:'rollback_data_invalid' }`（对齐 `task_update` 分支），禁止写空串。
4. B：`retry-step` 对已 `completed` 的写步骤要求先 rollback，或保留首次 `previousContent` 不被覆盖。
5. （战略）所有写经统一“vault 写入网关”：`assertPathInsideVault`(realpath) + 指纹守卫 + trash + `.bak` + 审计。

### 验收
- [ ] Agent 建文件→用户编辑→回滚：文件进 trash 且内容保留（或拒绝删除）
- [ ] 已完成写步骤 retry：用户改动不被静默覆盖
- [ ] 损坏 rollbackData：回滚中止而非清空
- [ ] 新增对应单测（现有 `agent-executor.test.ts` 仅覆盖 happy path）

### 工作量：中

---

## P0-4　安全链：任意路径读取 + 明文密钥回传 + 零 CSP　🔧

- 严重度：critical（XSS → 偷本地文件 + 全部密钥）
- 验证：CONFIRMED（A/B/C）

### 问题
- A 任意读：`file:read`/`file:stat`/`file:extract-document-text` 无 `vaultPath` 参数，直接 `readFile(params.path)`。
- B 明文密钥：`cloud:get-config` 返回明文 `serviceRoleKey`，`ai:get-providers` 返回明文 `apiKey`，`ai:detect-local-config` 明文回传本地 token。
- C 零 CSP：无 `Content-Security-Policy`/`onHeadersReceived`，DOMPurify 是唯一防线。
- 配套：便携加密硬编码静态密钥；自动更新无签名；日志器无 opt-out + 持久 device_id。

### 证据
`file.ipc.ts:78-89`、`cloud.ipc.ts:30-32`、`ai/provider.ts:8-10,98-119`、`index.html`、`preload.ts:9-19`、`secret.ts:8-10`、`logger.ts:16-51`、`electron-builder.yml`

### 修复方案
1. 抽 `withVaultGuard(handler)`：从 store 读可信 `vaultPath`，对所有 path 入参 `assertPathInsideVault`，强制所有读/写 IPC 走它（一处覆盖 ~200 个 handler）。
2. 所有 `get-*-config` 改为只返回 `hasKey: boolean`（复用 OneDrive `hasToken` 写法）；验证/连接动作留在主进程；`detect-local-config` 只回“检测到 N 个可导入”。
3. 生产 `onHeadersReceived` 注入 CSP：`default-src 'self'; script-src 'self'; connect-src 'self' <已知 AI 域>; img-src 'self' data:`。
4. DOMPurify 改白名单（`ALLOWED_TAGS/ATTR`）。
5. 便携加密派生机器绑定熵；启用代码签名 + 更新验签；遥测加首启同意 + 可关闭。

### 验收
- [ ] `file:read('/etc/passwd')` 被拒
- [ ] 渲染进程无法取得任何明文 key（grep 渲染层无明文 key 落点）
- [ ] CSP 头存在，inline script 被拦
- [ ] 遥测可在设置中关闭

### 工作量：中（建议拆成“IPC 守卫 + 密钥隔离”“CSP + DOMPurify”“分发签名 + 遥测”三个子任务）

---

## P0-5　编辑器 Markdown 往返非保真　🔧

- 严重度：high（损坏用户真实笔记，违背 Obsidian 兼容承诺）
- 验证：CONFIRMED（机制确认；受损语法精确清单需 round-trip 用例验证）

### 问题
`onUpdate` 每次把正文整段 `TipTap→Markdown` 重序列化后写盘（仅 frontmatter 用正则保回），`html:false` 丢弃内联 HTML。callout/嵌入/脚注/Dataview 等在“打开→编辑无关段落→自动保存”后被改写/丢失。

### 证据
`Editor.tsx:151,175-181`、`editor-store.ts:199-204`

### 修复方案
1. 短期止血：先加 round-trip 测试矩阵（每种 Obsidian 语法 `parse→getMarkdown` 断言不变），暴露具体受损项。
2. 为 callout/embed/footnote/dataview 建真实 TipTap 节点（带 `parseMarkdown`/`renderMarkdown`），保证往返保真。
3. 中期：基于 ProseMirror step 的增量保存，仅序列化实际改动范围。

### 验收
- [ ] round-trip 测试覆盖 wikilink/frontmatter/dataview/tasks/callout/footnote/embed/katex/mermaid
- [ ] “打开→不改动→保存”字节级幂等

### 工作量：大

---

## 附录：P1 速修（一并建议尽快处理）

| 项 | 一句话修复 | 证据 |
|---|---|---|
| 主动建议限流失效 | 限流基准 `shown_at` → `created_at` | `proactive-policy.ts:122-159` |
| 并发写静默丢失 | 全连接 `db.pragma('busy_timeout=5000')`；watcher `catch{}` 加日志/重试 | `database.ts:22-41`、`watcher.ts:87` |
| 存储无限增长 | `runVaultLongContextMaintenance` 收尾调 `pruneExpired` + 事件 GC | `background.ts`、`proactive-store.ts:350` |
| RAG 注入 | 检索片段用 `<retrieved_notes trust="low">` 包裹 + 系统声明“非指令” | `ai.ipc.ts:121-145` |
| lint 坏掉 | 根目录加 eslint + flat config，并加进 `ci.yml` | `package.json`、`ci.yml` |
| reduced-motion | `globals.css` 加 `@media (prefers-reduced-motion: reduce)` | `globals.css:589-651` |
| 对比度 | `--text-tertiary` 提到 ≥ `#8a8a8a` | `globals.css:31` |
