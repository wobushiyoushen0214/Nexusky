# P0 修复工单清单

- 日期：2026-05-29
- 分支：`fix/p0-data-safety`
- 来源：[Nexusky 全项目分析报告](./PROJECT_ANALYSIS_2026-05.md)
- 全部结论均经第二个独立 Agent 读码复核（CONFIRMED）

## 进度总览

| 工单 | 标题 | 严重度 | 状态 | commit |
|---|---|---|---|---|
| P0-1 | index.db 二进制同步损坏 | critical | ✅ 已修复 | `c919753` |
| P0-2 | 删除复活 / 不传播 | critical | ✅ 已修复 | `4cb8e4e`/`3599408`/`ef28373` |
| P0-3 | Agent 写入数据丢失三连 | critical | ✅ 已修复 | `3ac2cae` |
| P0-4 | 安全链：任意读 + 明文密钥 + 无 CSP | critical | ✅ 已修复 | `a9118de`/`65e725e` |
| P0-5 | 编辑器 Markdown 往返非保真 | high | ✅ 已修复 | `b3debd3` |

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

## P0-2　删除复活 / 删除不传播　✅ 已修复（4cb8e4e / 3599408 / ef28373）

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
- [x] manifest 缺失/损坏时安全降级（planSync 空 manifest ≡ 旧 two-way，首次同步不删任何文件）
- [x] reconcile/执行器单测（planSync 9 + executeSyncPlan 4），全量 643/643 通过
- [x] 删除双向传播（planSync 产出 deleteRemote/deleteLocal）+ 全 5 provider 实现 deleteRemote
- [ ] 端到端多设备往返集成测试（fake provider）—— 后续补强

### 实施
`sync-reconcile.ts` 的 `planSync`（三方决策：local/remote/manifest 基线，空基线退化为两路，故首次同步永不删除）+ `sync-manifest.ts`（per-provider 基线读写，出错降级 `{}`）+ `sync-execute.ts` 的 `executeSyncPlan`（统一执行，删本地用 `unlinkSync`，删远端用各 provider 的 `deleteRemote`）。基线仅在无错误的同步后推进。
> 注：OneDrive 仍有独立的 hash 体系不匹配问题（远端 `sha256Hash`/`eTag` vs 本地 md5），影响其 push/pull 判定（非删除逻辑），单列为后续工单。

### 工作量：中（已完成）

---

## P0-3　Agent 写入数据丢失三连　✅ 已修复（3ac2cae）

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
- [x] Agent 建文件→用户编辑→回滚：拒绝删除（`file_modified_since_create`），用户内容保留
- [x] 已完成写步骤 retry：先安全回滚（指纹守卫），用户改动不被静默覆盖
- [x] 损坏/缺失 rollbackData：回滚中止（`rollback_data_invalid`）而非清空
- [x] 新增 2 个数据安全回归测试（edit-after-create / edit-after-write）；全量 645/645

### 实施
统一内容指纹守卫：`file_create` 记 `createdHash`、`file_write`/`note_edit`/`task_update` 记 `afterHash`；回滚前比对磁盘现状与该 hash，不符则中止（`file_modified_since_create` / `file_modified_since_write`）。`retry-step` 对已完成写步骤先经守卫回滚再重跑。
> 后续（已降为 P1）：apply-fix 已对齐预览/undo/`.trash` 标准；Agent `file_create` 回滚已改走 vault `.trash` 并保留指纹守卫；单步失败自动回滚选项仍可继续收口。

### 工作量：中（已完成）

---

## P0-4　安全链：任意路径读取 + 明文密钥回传 + 零 CSP　✅ 已修复（a9118de / 65e725e）

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
- [x] `file:read('/etc/passwd')` 被拒（`tests/p0-security.test.ts` 覆盖当前 vault 外路径）
- [x] 渲染进程无法通过配置读取 IPC 取得已存明文 key（AI/cloud get 接口只回 `has*`，本地检测在主进程内导入）
- [x] CSP 头 / meta 存在，`script-src 'self'` 禁止 inline script
- [x] 遥测默认关闭，设置中可显式开启/关闭；关闭时不生成/发送持久 `device_id`

### 已实施修复
- 新增 `vault-guard.ts`，所有普通 `file:*` 读/写/列目录/历史/回收站/加密解密 IPC 均从主进程 store 读取可信当前 vault，并用 `assertPathInsideVault` 做 realpath/symlink 校验；渲染层伪造 `vaultPath` 会被拒。
- `file:read` / `file:stat` / `file:extract-document-text` 不再接受 vault 外路径；导入类 IPC 不再接受渲染层传入任意 `sourcePath`，改由主进程文件选择器产生导入源。
- `ai:get-providers`、`cloud:get-config`、`cloud:get-webdav-config`、`cloud:get-s3-config` 只回传 `hasApiKey` / `has*Key` / `hasPassword` 标记；保存时空输入保留主进程已存 secret；`ai:detect-local-config` 改为主进程内检测并导入，只返回数量。
- 主进程 `onHeadersReceived` 注入 CSP，并在 `index.html` 加 CSP meta；Markdown 渲染 DOMPurify 改显式白名单。
- 日志遥测默认 opt-out，设置页新增“发送匿名错误报告”开关；关闭时清空队列，且 `device_id` 只在启用并实际发送时生成。
- portable v2 secret key 改为静态种子 + 主机名 + 用户名 + home 目录派生；保留 legacy v2 解密 fallback，避免旧配置丢失。
- `65e725e` 补齐 P0-4 后续硬化：CSP 构造抽到 `services/csp.ts`，生产继续保持 `script-src 'self'`，dev 模式只为 Vite/React Refresh 放开 inline preamble 和 localhost websocket；同时 vault 文件读取/索引失败改为可恢复错误态，侧边栏提供重试/重新选择，避免当前 vault 权限异常时整屏不可用。

### 验证
- [x] `pnpm typecheck` 通过
- [x] `pnpm test -- p0-security` 通过（实际跑全量：109 files / 649 tests）
- [x] `65e725e` 后重新验证：`pnpm typecheck` 通过；`pnpm test -- p0-security vault-store` 实际跑全量 110 files / 655 tests 通过

> 后续（分发侧，需证书/发布流水线配合）：Windows 代码签名与更新验签策略仍待补齐；macOS 发布流水线已要求 Developer ID 签名、公证与 zip 更新产物。本次提交已修复应用内 “XSS → 任意读 → 明文 key → 无 CSP/遥测外发” 安全链。

### 工作量：中（已完成）

---

## P0-5　编辑器 Markdown 往返非保真　✅ 已修复（b3debd3）

- 严重度：high（损坏用户真实笔记，违背 Obsidian 兼容承诺）
- 验证：CONFIRMED（保存链路与 round-trip 回归用例覆盖）

### 问题
`onUpdate` 每次把正文整段 `TipTap→Markdown` 重序列化后写盘（仅 frontmatter 用正则保回），`html:false` 丢弃内联 HTML。callout/嵌入/脚注/Dataview 等在“打开→编辑无关段落→自动保存”后被改写/丢失。

### 证据
`Editor.tsx:151,175-181`、`editor-store.ts:199-204`

### 修复方案
1. 保存层不再直接用整篇 `TipTap→Markdown` 覆盖文件正文，而是以上一次 TipTap 序列化结果为基线，对比下一次序列化结果，只把真实编辑过的行补回原始 Markdown。
2. 原始文件中未被编辑触碰的区域继续保留原始字节，包括 frontmatter、wikilink/embed、Dataview 代码块、Tasks、callout、footnote definition、KaTeX、Mermaid、内联 HTML 与 CRLF。
3. 后续可继续为 callout/embed/footnote/dataview 建真实 TipTap 节点，提升直接编辑这些块时的语义体验；但 P0 数据损坏链路已由源文本保留式保存切断。

### 验收
- [x] round-trip 保存测试覆盖 wikilink/frontmatter/dataview/tasks/callout/footnote/embed/katex/mermaid/inline HTML/CRLF
- [x] “打开→不改动→保存”字节级幂等（序列化无变化时返回原文）
- [x] “编辑无关段落→保存”只改目标段落，未触碰的 Obsidian 语法保持原样

### 已实施修复
- 新增 `markdown-roundtrip.ts`，基于 `diffLines(previousSerialized, nextSerialized)` 将 TipTap 的实际编辑映射回原始 Markdown body，未匹配/未触碰的源行原样保留。
- `Editor.tsx` 记录每次加载/外部刷新后的 `serializedBodyRef`；`onUpdate` 保存时调用 `mergeEditorMarkdownContent`，替代旧的 `frontmatter + getMarkdown()` 整篇覆盖。
- 新增 `tests/markdown-roundtrip.test.ts`，覆盖空改动幂等、无关段落编辑保留 Obsidian 语法、footnote definition 被 markdown-it 隐藏时仍保留、CRLF 不被 LF 改写。

### 验证
- [x] `pnpm typecheck` 通过
- [x] `pnpm test -- markdown-roundtrip` 通过（实际跑全量：110 files / 653 tests）

### 工作量：大（已完成）

---

## 附录：P1 速修

| 项 | 一句话修复 | 状态 |
|---|---|---|
| 主动建议限流失效 | 渲染层送达时回写 `shown_at`（限流逻辑本身正确，非改 created_at） | ✅ c219629 |
| 并发写静默丢失 | 全连接 `busy_timeout=5000`；watcher `catch{}` 改记日志 | ✅ ecd1e44 |
| 存储无限增长 | 维护收尾调 `pruneExpired` + `deleteExpiredSuggestions` | ✅ da9565d |
| reduced-motion / 对比度 / focus | media query + `--text-tertiary`→`#8a8a8a` + 恢复焦点环 | ✅ 3c0f45f |
| RAG 注入 | 检索片段用 `<retrieved_notes trust="low">` 包裹 + 声明“非指令”，并转义检索内容中的标签边界 | ✅ 已修复（本提交） |
| 批量生成失败统计 | `ai:generate-notes` 返回 `failed/total/failedItems`，前端显示部分失败 | ✅ 已修复（本提交） |
| provider 工具能力声明 | `BaseAIProvider.capabilities.toolCalling` 显式声明；不支持工具调用时 Agent 直接报错 | ✅ 已修复（本提交） |
| apply-fix 预览/撤销 | maintenance apply-fix 先预览再应用，写入前校验 preview hash，应用后保留 undo 记录；create_target 撤销进入 `.trash` | ✅ 已修复（本提交） |
| Agent file_create 回滚 trash | 未被用户改动的 Agent 新建文件回滚时移入 vault `.trash`，仍用 createdHash 阻止误删用户编辑 | ✅ 已修复（本提交） |
| 向量检索命名漂移 | 不接伪 embedding；改名为本地词法相关检索，删除 cosine/embedding schema 死代码，UI/IPC/测试同步改名 | ✅ 已修复（本提交） |
| Token/成本统计 | provider 流式事件透出真实 usage；所有 chat/agent 调用写入本地 usage store；Settings 支持本月 tokens/成本摘要与单价配置 | ✅ 已修复（本提交） |
| 属性表查询卡主线程 | 索引时缓存 frontmatter/Dataview 属性快照，`getPropertyRows` 只读 SQLite；未链接提及查询保持 FTS 内容通道 | ✅ 已修复（本提交） |
| 本地检索/记忆关联扩展性 | 搜索合并 TF-IDF 与 FTS fallback，旧笔记不再被 2000 chunk 缓存窗口遮蔽；相似笔记和 memory 关联改倒排候选对 | ✅ 已修复（本提交） |
| 重命名/移动保持身份 | 同内容新路径复用已消失旧路径 note id，同步看板/上下文/AI 关系路径引用；watcher 延迟 unlink，避免 move 被当删除 | ✅ 已修复（本提交） |
| 图谱大图 Canvas 降级 | 可见节点/边超过阈值时用视口大小 Canvas 绘制，保留小图 DOM 和大图点击/悬停/拖动，避免数千 DOM 元素卡死 | ✅ 已修复（本提交） |
| mac 签名/公证发布 | mac 构建移除 ad-hoc 签名，强制 Developer ID 签名和 notarize，发布 `dmg+zip+latest-mac.yml`；缺少 secrets 时 CI 失败 | ✅ 已修复（本提交） |
| lint 坏掉 | 按当前要求不处理 eslint；保留现有 typecheck/build/test CI 覆盖 | ⏭ 跳过（用户要求不用 eslint） |
| 关系候选 O(N) 扫描 | 关键词候选改 FTS5 `MATCH`；chunk 相似候选先 FTS 召回 note id，再只读取候选 chunks 评分 | ✅ 已修复（本提交） |
