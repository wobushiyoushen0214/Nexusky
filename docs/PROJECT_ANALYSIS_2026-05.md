# Nexusky 全项目分析报告

- 日期：2026-05-29
- 范围：`packages/main`（110 个 `.ts`，~24.9K 行）、`packages/renderer`（93 个文件，~25.6K 行）、`packages/shared`、`tests`（106 个测试）、`docs`、`browser-extension`、构建/CI
- 方法：10 个子系统并行深度审计 → 7 项高危结论对抗式独立验证（全部 file:line 读码确认）
- 配套文档：[P0 修复工单](./P0_FIX_TICKETS_2026-05.md)

## 一句话结论

Nexusky 有一流的产品愿景和扎实的架构骨架，但在“AI 改用户数据”和“同步/索引”这两条最该可靠的路径上，存在多个**已验证**的数据丢失/损坏缺陷；同时其招牌能力“向量检索”名不副实。优先级不是加功能，而是先把数据安全的几道闸补上。

---

## 一、核心优势

| 领域 | 优势 | 证据 |
|---|---|---|
| 架构定位 | 本地优先、Markdown 为真数据源、SQLite 仅做索引；数据主权清晰 | `database.ts`、README |
| 进程模型基线 | `sandbox:true` + `contextIsolation:true` + `nodeIntegration:false`；preload 不泄漏 `ipcRenderer`，`send` 走白名单 | `index.ts:74-80`、`preload.ts:13-31` |
| AI 写回安全意识 | 单笔记 `ai:edit` 强制 Diff 预览+确认；应用前重读磁盘做并发冲突检测 | `ChatPanel.tsx:1488-1547` |
| 长期上下文设计 | “启发式召回 + LLM 精排”混合；关系带 evidence+reason+confidence，可解释；注入前有反幻觉 guard | `relation-discovery.ts`、`context-pack-builder.ts:70-74` |
| DB 韧性 | 启动 `integrity_check`；迁移+逐列自修复双保险；config 原子写+`.bak` | `database.ts:26-41,416-549`、`store.ts:193-206` |
| 性能基建 | d3-force 跑 Web Worker、首次索引跑 worker_threads、文件树虚拟化、重型视图懒加载 | `graph-force-worker.ts`、`VirtualFileTree.tsx` |
| 工程基础 | 真 CI（typecheck+test）、原生模块按 Electron ABI 重建、在 Electron 运行时跑测试、IPC 集中校验、safeStorage | `ci.yml`、`rebuild-native.mjs`、`validators.ts` |
| 快速响应力 | 团队 2026-05-28 已真实修复 PROJECT_AUDIT 列的全部 P0 | git `7975549/701d7df/3a22163/b3cbe3a` |

---

## 二、致命缺陷（已逐行验证，按数据安全优先级）

> 状态说明：✅ 已修复 / 🔧 待修复。详细工单见 [P0_FIX_TICKETS_2026-05.md](./P0_FIX_TICKETS_2026-05.md)。

### 🔴 P0-1　云同步损坏 `index.db`，并可能触发自动删库　— ✅ 已修复（commit c919753）
- 机制：`syncIndex` 把二进制 SQLite 当文本同步。默认 Supabase 双向损坏（push `readFileSync(...,'utf-8')`、pull `res.text()`+`writeFileSync(...,'utf-8')`），OneDrive 同样双向，S3/WebDAV 下行损坏；iCloud 用 `copyFileSync` 幸免。
- 放大伤害：损坏 db 下次打开 vault 时 `integrity_check` 失败 → `database.ts:26-41` 直接 `unlinkSync` 删库重建，索引/“嵌入”全部静默清空。
- 触发频率：每次打开 vault（`vault:get`）和索引重建后自动触发，且 `.catch(()=>{})` 静默吞错。
- 证据：`manager.ts:151-188`、`supabase-provider.ts:88,129-132`、`onedrive-provider.ts:216,236-240`、`database.ts:26-41`
- **修复**：所有 provider 的 push/pull/listRemoteFiles 改 Buffer 二进制通道（`readFileSync(path)` / `Buffer.from(await res.arrayBuffer())` / `writeFileSync(path, buf)`；OneDrive `graphRequest` 增加 `{raw}` 选项）。对文本 `.md/.json`，`md5(Buffer)==md5(utf-8)`，哈希与冲突判定不变。typecheck 通过、cloud 测试 6/6 通过。

### 🔴 P0-2　删除不传播 + 已删笔记“复活”　— ✅ 已修复（4cb8e4e / 3599408 / ef28373）
- 机制：`syncAll` 末尾对“远端有、本地无”的文件一律 `pullFile` 拉回（判据仅 `!existsSync`）；本地删除（watcher `unlink` / `file:delete`）从不通知云端，`SyncProvider` 接口无 `deleteRemote`。无 tombstone/manifest。
- 后果：删一篇笔记→同步→它又回到原位；多设备间删除意图永久丢失。
- 证据：`supabase-provider.ts:203-216`、`watcher.ts:102-115`、`provider.ts:24-38`（5 provider 一致）

### 🔴 P0-3　Agent 引擎数据丢失三连　— ✅ 已修复（3ac2cae）
- A：`file_create` 回滚无条件 `unlinkSync`，不校验文件是否已被用户编辑 → “Rollback All” 整删用户已写满内容的文件，不可恢复。`701d7df` 修了“空文件”但把伤害从“清空”升级为“硬删”，且未走 `.trash`。
- B：对已完成的 `file_write`/`note_edit` 点 `retry-step`，用 plan 内容覆盖用户改动，并把“用户改动版”记成新的 `previousContent` → 原始内容永久丢失。
- C：回滚时 `previousContent` 缺失则 `writeFileSync(targetPath,'')` 清空文件而非中止。
- 证据：`executor.ts:263-268`、`agent.ipc.ts:230-246`

### 🔴 P0-4　安全链：任意路径读取 + 明文密钥回传 + 零 CSP　— ✅ 已修复（a9118de / 65e725e）
- 修复：普通 `file:*` IPC 统一走主进程可信 vault guard，配置读取只返回 `has*` 标记，生产响应注入 CSP 且 `index.html` 带 CSP meta，Markdown DOMPurify 改显式白名单，遥测默认关闭；`65e725e` 追加 dev CSP 兼容，生产仍禁 inline script，dev 仅为 Vite/React Refresh 放开必要 inline preamble。
- 验收：`p0-security` 覆盖 vault 外读拒绝、AI/cloud secret 不回传、CSP 存在、遥测 opt-out；typecheck 与全量测试通过；后续 `p0-security vault-store` 重跑全量 655 tests 通过。
- 仍需分发侧配合：macOS/Windows 代码签名与更新验签策略。

### 🔴 P0-5　编辑器 Markdown 往返非保真，破坏 Obsidian 语法　— ✅ 已修复（b3debd3）
- 机制：`onUpdate` 每次把正文整段 `TipTap→Markdown` 重序列化后写盘（仅 frontmatter 用正则保回），`html:false` 丢弃内联 HTML。callout/嵌入/脚注/Dataview 在“打开→编辑无关段落→自动保存”后被改写/丢失。
- 后果：损坏用户真实笔记，违背“兼容 Obsidian”承诺；仓库无 round-trip 测试守护。
- 证据：`Editor.tsx:175-181`、`editor-store.ts:199-204`
- 修复：保存层改为源文本保留式 merge，以上一次 TipTap 序列化正文为基线，只把实际编辑行映射回原始 Markdown；未触碰的 frontmatter、wikilink/embed、Dataview、Tasks、callout、footnote、KaTeX、Mermaid、inline HTML 与 CRLF 原样保留。
- 验收：新增 round-trip 保存测试覆盖无变化字节幂等、无关段落编辑只改目标段落、markdown-it 隐藏 footnote definition 时仍保留、CRLF 不被改写；`pnpm typecheck` 与全量 110 files / 653 tests 通过。

---

## 三、招牌能力名不副实（已验证）

### 🟠 “向量检索/语义搜索”实为词法检索
- `chunks.embedding`/`embedding_model` 列永远写 `null`，`ON CONFLICT` 不更新它们；全仓无 `SELECT embedding`；`cosineSimilarity` 是死代码（仅测试引用）；全仓无任何真实嵌入生成。
- `semanticSearch` 实际 = TF-IDF + 一个硬编码 62 词的中文词典分词 + LLM 文本重排。
- UI 却包装成“建立向量索引”，`getEmbeddingStatus` 只要有 chunk 行就算“已嵌入”。
- 证据：`embedding.ts:470-491,406-429,77-131`、`db.ipc.ts:1056-1136`

### 🟠 主动建议限流整体失效（可配阈值是死参数）
- per-day / per-entity / 全局冷却三道闸全是 `WHERE shown_at IS NOT NULL`，但 `shown_at` 生产路径永不写入（插入恒 `pending`，渲染层只发 opened/snoozed/dismissed）。
- 后果：`maxPerDay`（默认 5）等可配阈值完全不生效，实际“会刷屏”，仅靠 `signature` 去重压住一部分。
- 证据：`proactive-policy.ts:122-159`、`proactive-store.ts:219,305-311`、`NotificationCenter.tsx:127-206`
- 修复（✅ c219629）：限流逻辑（基于 `shown_at`）设计本身正确（测试契约证实），根因是渲染层从不回写 `shown_at`。已让 `NotificationCenter` 在建议送达渲染层时标记 `shown`，使 per-day/per-entity/全局冷却真正生效；全量测试 630/630 通过。（注：初版曾尝试改 `created_at`，但破坏了 snoozed 重新激活语义与既有测试，已回退。）

---

## 四、扩展性缺陷（中小 vault 没事，真实大 vault 会崩）

| 优先级 | 问题 | 证据 |
|---|---|---|
| P1 | TF-IDF 全内存硬上限 2000 chunk（旧笔记搜不到）；`findSimilarNotes`/memory 关联 O(N²) | `embedding.ts:6,525-549`、`memory.ts:136` |
| P1 | 知识图谱用 DOM 渲染节点+边，数千节点卡死，无 Canvas/WebGL 降级 | `GraphView.tsx:952-1009` |
| P1 | 并发写静默丢失：无 `busy_timeout`，首次索引 worker 长事务期间 watcher 写撞 `SQLITE_BUSY` 被 `catch{}` 吞掉 | `watcher.ts:87`、`database.ts:22-41` |
| P1 | 重命名/移动 = 删除+新建（id 绑路径），丢失该笔记的 AI 记忆/关系/看板溯源 | `indexer.ts:147`、`watcher.ts:102-115` |
| P1 | 后台关系发现每次保存做 2000 行 JS 扫描 + 10×`LIKE`；存储无限增长（`pruneExpired` 死代码、无 VACUUM） | `relation-candidates.ts:362-408`、`proactive-store.ts:350` |
| P1 | `getPropertyRows`/未链接提及在主进程同步重读全文，大 vault 卡主线程 | `indexer.ts:211-260,345-386` |
| P2 | 附件/图片根本不同步（`collectLocalFiles` 只收 `.md`+memories），隐性数据缺口 | 各 provider `collectLocalFiles` |

---

## 五、AI 工程缺陷

| 优先级 | 问题 | 证据 |
|---|---|---|
| P1 | 无 token/成本统计：本地优先自带 key 却看不到花了多少 | 各 provider 流式循环 |
| P1 | RAG 检索内容无 prompt injection 防护（long-context 路径有 guard 而检索路径没有，防护不对称） | `ai.ipc.ts:121-145` |
| P1 | 批量生成部分失败静默吞掉，返回值无 failed 计数（✅ 本提交） | `notes.ts:176,183,232` |
| P1 | Codex/Ollama 的 agent 工具静默降级（无 `chatStreamWithTools`），能力差异无声明（✅ 本提交） | `codex-cli-provider.ts`、`ollama-provider.ts` |
| P2 | Codex 子进程无超时/无 SIGKILL/无输出上限，`validate()` 不传 signal 会挂死 IPC | `codex-cli-provider.ts:35-66,154` |
| P2 | 主聊天/agent 路径无请求超时；工具参数 JSON 截断不可恢复；Claude `max_tokens` 硬编码 4096 | `ai.ipc.ts`、`json.ts:10-71`、`claude-provider.ts:128` |
| P2 | memory 仅取内容前 3000 字符，长笔记记忆系统性偏差 | `memory.ts:93` |

---

## 六、可访问性缺陷（违背 PRODUCT.md 明确承诺）

| 优先级 | 问题 | 证据 |
|---|---|---|
| P1 | 全库 0 处 `prefers-reduced-motion`，8 个 keyframes+力导持续动画无法关闭 | `globals.css:589-651` |
| P1 | 默认暗色 `--text-tertiary:#5c5c5c` on `#1e1e1e` = 2.49:1（远低于 AA 4.5），398 处引用 | `globals.css:31`（已验证含计算） |
| P2 | 无 `:focus-visible` 样式 + 36 处 `outline:none` | `globals.css`、各组件 |
| P2 | Toast 无 `aria-live`；Settings 模态无 `role=dialog`/焦点陷阱/无 Esc 关闭 | `Toast.tsx`、`Settings.tsx:219` |
| P2 | 切英文后 `document.documentElement.lang` 仍是 `zh-CN` | `ui-store.ts:390-394` |

> 亮点反例：`VirtualFileTree` 的键盘导航做得很好；i18n key 已 100% 对齐（730/730）。

---

## 七、工程/文档成熟度缺陷

| 优先级 | 问题 | 证据 |
|---|---|---|
| P1 | `pnpm lint` 是坏的：eslint 未安装、无根配置，CI 也不跑 lint | `pnpm run lint` → `command not found` |
| P1 | 核心路径零测试：5 个 AI provider、1485 行 tool 执行器、watcher、updater、5/7 cloud provider | `grep tests/` |
| P2 | CI 不做 `build`/打包冒烟；`build.yml` 不冻结依赖（58 个 `^`、无 `engines`） | `ci.yml`、`build.yml` |
| P2 | mac 自动更新大概率静默失效：ad-hoc 签名 + Squirrel.Mac 要求 Developer ID | `afterPack.js:13-16`、`electron-builder.yml` |
| P2 | 文档漂移：README 文档入口 5/8 死链；PROJECT_OVERVIEW 与 PRODUCT.md 关于 Kanban/Canvas 自相矛盾 | `README.md:86-93` |
| P2 | `save`/`find-replace` 设置可改但 `Editor.tsx:348,366` 硬编码忽略；`Ctrl+Shift+C` 与 `Ctrl+Shift+D` 行为相同 | `Editor.tsx`、`App.tsx:339-348` |

巨石组件：ChatPanel 2267 行 / CanvasView 2003 行 / GraphView 1032 行 / `db.ipc.ts` 1458 行。

---

## 八、未来产品升级方向（战略）

以“信任”为护城河：

1. **统一“可撤销变更”管道（最高战略价值）**：抽象 `VaultMutation { preview(); apply(); undo() }`，让 agent / apply-fix / AI 写回 / cognitive-review 四处写盘全部经它——强制 `assertPathInsideVault`(realpath) + 内容指纹守卫 + `.trash` 回收 + `.bak` 备份 + 审计日志。一举消除 P0-3 全部数据丢失面。
2. **真正的混合 RAG**：接入嵌入模型（本地 ONNX/`@xenova/transformers` 或 provider embeddings，schema 列已就绪）→ vector + FTS5/BM25 双路召回 → RRF 融合 → 重排 + 可观测的检索调试面板。
3. **可靠双向同步**：引入同步基线 manifest/tombstone → 删除传播、移动检测、冲突副本 + 行级 3-way merge；二进制安全传输层（顺带打开附件/图片同步缺口）。
4. **成本与能力透明**：统一 Usage/Cost 总线；`BaseAIProvider` 暴露 `capabilities`，UI 据此禁用不支持的功能而非静默降级。
5. **认知伙伴产品化**：修好限流后建“注意力预算 + 基于反馈的动态重要度”；关系加 `provenance: authored | inferred`；cognitive-review 升级为可对话复盘。
6. **安全分发**：代码签名 + 可验证更新；“凭据代理”模式让密钥永不离开主进程；加 CSP；遥测同意框架。
7. **大规模可视化**：图谱/画布换 Canvas/WebGL + 视口裁剪 + LOD 节点聚合。

> 产品层面：当前功能过宽、激活路径不尖。建议先收敛——把“打开 vault → 索引 → 一次可信的有源 AI 问答”这条主干打磨到无可挑剔，再谈协作/移动端/插件市场。

---

## 九、优先级行动清单

| 优先级 | 行动 | 工作量 | 收益 | 状态 |
|---|---|---|---|---|
| P0 | 同步走 Buffer 通道（修 index.db 损坏 + 打开附件同步） | 小 | 极高 | ✅ c919753 |
| P0 | 同步引入 manifest 基线（修删除复活/不传播） | 中 | 极高 | ✅ ef28373 |
| P0 | Agent 写盘指纹守卫（回滚/重试不毁用户编辑） | 中 | 极高 | ✅ 3ac2cae |
| P1 | apply-fix 写盘加预览/undo（对齐 Agent 安全标准）；file_create 回滚改走 trash | 中 | 中 | 🔧 |
| P0 | 安全三件套：读路径强制 vault 校验 + `get-*-config` 只返回 `hasKey` + 加 CSP | 中 | 极高 | ✅ a9118de / 65e725e |
| P0 | 编辑器增量保存 / Obsidian 语法建节点 + 补 round-trip 测试 | 大 | 极高 | 🔧 |
| P1 | 主动建议限流生效：展示时回写 `shown_at`（修复失效） | 小 | 高 | ✅ c219629 |
| P1 | “向量检索”二选一：接真实 embedding，或重命名+删死代码+改文案 | 中/大 | 高 | 🔧 |
| P1 | 全连接 `busy_timeout` + watcher 的 `catch{}` 加日志 | 小 | 高 | ✅ ecd1e44 |
| P1 | 维护收尾 GC（`pruneExpired` + 删除过期建议，防膨胀） | 小 | 高 | ✅ da9565d |
| P1 | 关系候选改走 embedding/FTS（大 vault 扩展性） | 中 | 高 | 🔧 |
| P1 | Token/成本总线 + provider capabilities 声明 | 中 | 高 | 🔧 |
| P1 | RAG 检索内容加“不可信数据”包裹 | 小 | 高 | ✅ 本提交 |
| P1 | 修 lint + CI 加 lint/build 冒烟；给 provider/tool 执行器补测试 | 中 | 高 | 🔧 |
| P1 | reduced-motion 媒体块 + `--text-tertiary` 提亮 + 全局 `:focus-visible` | 小 | 高 | ✅ 3c0f45f |
| P2 | 图谱 Canvas/WebGL 化；稳定笔记 ID；mac 签名；修文档漂移 | 大/中 | 中-高 | 🔧 |

---

## 十、修复进度记录

| 日期 | 项 | commit | 说明 |
|---|---|---|---|
| 2026-05-29 | P0-1 index.db 二进制同步损坏 | `c919753` | 5 个 provider push/pull/listRemoteFiles 改 Buffer 通道；typecheck + cloud 测试通过 |
| 2026-05-29 | P1 并发写静默丢失（busy_timeout + watcher 日志） | `ecd1e44` | 全连接 busy_timeout=5000；watcher catch 改记日志 |
| 2026-05-29 | P1 主动建议限流失效（展示回写 shown_at） | `c219629` | NotificationCenter 送达即标 shown；630/630 测试通过 |
| 2026-05-29 | P1 主动建议存储无限增长 | `da9565d` | 维护收尾激活 pruneExpired + 物理删除过期建议 |
| 2026-05-29 | P1 可访问性（reduced-motion/对比度/focus） | `3c0f45f` | media query + text-tertiary #8a8a8a + 恢复焦点环 |
| 2026-05-29 | P0-2 删除复活/不传播 | `4cb8e4e` `3599408` `ef28373` | 三方 reconcile（planSync）+ per-provider manifest 基线 + 全 provider deleteRemote；13 个新测试；643/643 通过 |
| 2026-05-29 | P0-3 Agent 回滚/重试数据丢失 | `3ac2cae` | 内容指纹守卫：写步骤记 afterHash，回滚/重试前校验，文件被用户改过则中止；2 个新测试；645/645 |
| 2026-05-29 | P0-4 安全链（任意读/密钥/CSP/遥测） | `a9118de` `65e725e` | vault guard + secret redaction + CSP + DOMPurify 白名单 + telemetry opt-out；dev CSP 兼容 Vite/React Refresh；vault 读取/索引失败可恢复；p0-security/vault-store 覆盖 |
| 2026-05-29 | P0-5 编辑器 Markdown 往返非保真 | `b3debd3` | 源文本保留式 Markdown merge；round-trip 保存测试覆盖 Obsidian 语法与 CRLF；653/653 通过 |
| 2026-05-29 | P1 RAG 检索 prompt injection 防护 | 本提交 | 检索片段统一进入 `<retrieved_notes trust="low">`，声明其为非指令数据，并转义 `&/< />` 防止笔记内容逃出边界；retrieved-notes-context 测试 3/3、typecheck 通过 |
| 2026-05-29 | P1 批量生成部分失败可见化 | 本提交 | `ai:generate-notes` 对单篇生成/写盘失败计数并返回 `failed/total/failedItems`；前端显示部分失败而非误判为停止/成功；generate-notes-result 测试 4/4、typecheck 通过 |
| 2026-05-29 | P1 provider 工具能力声明 | 本提交 | `BaseAIProvider.capabilities` 暴露 `toolCalling`，OpenAI/Responses/Claude 标记支持，Codex/Ollama 不再静默降级为普通 chat；ai-provider-types 6/6、typecheck 通过 |
