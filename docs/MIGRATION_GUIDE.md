# Nexusky 迁移指南

本指南面向已经有 Markdown 或 Obsidian vault 的用户。目标不是把你的资料搬进一个封闭系统，而是在不丢失可迁移性的前提下，让 Nexusky 为现有文件建立索引、健康反馈、维护队列和有来源的 AI 工作流。

## 迁移方式

| 场景 | 推荐方式 | 影响 |
| --- | --- | --- |
| 想继续把原 vault 当主数据源 | 直接打开现有 Markdown/Obsidian 文件夹 | Nexusky 会在本地建立 `.nexusky` 索引和派生状态；Markdown 文件仍留在原文件夹 |
| 想先试用、不想触碰原 vault | 复制一份 vault 后打开副本 | 最安全，适合第一次试用或大 vault 回归 |
| 想把 Obsidian vault 合并到一个新的 Nexusky vault | 在 Command Palette 执行 `Import Obsidian vault` | 会复制 Markdown、附件和 Canvas；跳过 `.obsidian`、`.git`、`.trash` |
| 想导入阅读来源 | 使用 Readwise、Pocket 或 Notion 导入命令 | 内容会进入 `Imports/Readwise`、`Imports/Pocket` 或 `Imports/Notion` |

## 打开前检查

1. 先备份原 vault，推荐用完整文件夹复制、Time Machine、Git 或你已经信任的备份工具。
2. 第一次试用时，优先打开副本，不要直接打开工作中的唯一 vault。
3. 暂停会同时写入同一目录的自动同步工具，等 Nexusky 完成首次索引后再恢复。
4. 保留 Obsidian 配置目录 `.obsidian`，但不要指望 Nexusky 读取插件设置；它会把 Markdown 文件本身当作主数据。
5. 如果 vault 很大，先确认磁盘空间足够保存 `.nexusky` 索引、`.history` 快照和 `.trash` 恢复文件。

## 第一次打开流程

1. 在 Nexusky 中打开目标 vault 文件夹。
2. 等待索引完成。普通 vault 索引只扫描非隐藏目录里的 `.md` 文件，隐藏目录不会进入普通 Markdown 索引。
3. 查看 Vault Health。健康页不要求配置 AI Provider，会先展示 note、link、orphan、task、duplicate、missing memory、stale note 和 Health Score。
4. 进入 Maintenance，先处理最前面的少量建议。维护写入会走 preview/apply/undo，而不是直接批量改文件。
5. 需要问 AI 时，先检查外发预览。Chat/Agent 会展示 Provider、模式、附件、检索片段、长期上下文和 token 粗估。

## Obsidian 兼容边界

Nexusky 的编辑器和索引已经覆盖常见 Obsidian/Markdown 结构：

- wikilink、frontmatter、Dataview inline 字段、Tasks 插件日期、callout、脚注、嵌入、KaTeX、Mermaid。
- 普通打开 vault 时，`.obsidian` 不参与 Markdown 索引。
- Obsidian 导入命令会复制 Markdown 和附件，跳过 `.obsidian`、`.git`、`.trash` 和 `.DS_Store`。
- Obsidian Canvas 会保留原 `.canvas` 文件，并额外生成一个可索引的 `.canvas.md` 摘要文件。
- Obsidian callout 在导入时会转成更通用的 Markdown 引用标题格式。

建议第一次迁移后先打开几篇包含复杂语法的代表性笔记，确认保存前后的 Markdown 符合你的预期。

## 忽略与同步规则

| 路径 | 建议 | 原因 |
| --- | --- | --- |
| `.nexusky/index.db`、`.nexusky/*.db-wal`、`.nexusky/*.db-shm` | 不要手动同步或提交 | SQLite 是本地索引，可重建，不是主数据 |
| `.nexusky/memories/*.json` | 可以随 BYO sync 同步 | 这是长期记忆派生状态，Nexusky 的同步文件选择会允许 memory JSON |
| `.history/` | 保留本地或纳入你信任的备份 | Markdown 写入前会保存恢复快照 |
| `.trash/` | 保留本地，定期检查后清理 | 删除和同步删除恢复会先移动到本地回收目录 |
| `.obsidian/` | 保留给 Obsidian；Nexusky 同步默认跳过 | 避免把插件配置当作 Nexusky 数据 |
| `.git/` | 由 Git 自己管理；Nexusky 导入和同步默认跳过 | 避免污染版本库内部状态 |
| `.attachments/` | 可同步 | Nexusky 同步规则允许这个隐藏附件目录 |
| 其他隐藏目录或隐藏文件 | 默认不要依赖 Nexusky 处理 | 普通索引和同步会跳过大多数隐藏路径 |

## AI 数据边界

- Vault Health、搜索、图谱和 Maintenance 扫描可以在没有 AI Provider 的情况下工作。
- AI 请求会发送用户输入、被检索到的 note snippets、用户选择的附件/图片文本、长期上下文片段，以及开启 Vault 工具时的工具定义提示。
- 请求前外发预览会在发送前展示这些内容摘要，确认后才进入 Chat/Agent 流程。
- API Key 等敏感配置通过本地配置和 Electron `safeStorage` 处理；Nexusky 不把明文密钥写进 Markdown vault。
- BYO sync 只会上传到你显式配置的后端；托管备份和托管发布仍是未来能力，不是当前迁移前提。

## 恢复路径

- Markdown 文件写入前会保存 `.history` 快照。
- 文件删除会进入 `.trash`，并保留原始路径元数据。
- 同步删除恢复也会先把本地文件移入 vault trash。
- Maintenance 和 Agent 写入走 preview-first，并保存可撤销信息。
- 如果 SQLite 索引损坏，Nexusky 会重建索引；真实 Markdown 文件仍是主数据。

## 迁移后 30 分钟

1. 看 Vault Health 分数和主要扣分项。
2. 在 Maintenance 里只处理前 3 个建议，先验证 preview 和 undo 是否符合预期。
3. 用 Chat 问一个需要引用来源的问题，并检查 sources 是否能回到原笔记。
4. 如果你继续使用 Obsidian，同一时间只让一个应用编辑同一篇复杂笔记。
5. 恢复你原有的同步或备份流程，并确认忽略规则不会上传 `.nexusky/index.db`。

## 最小验收清单

- [ ] 原 vault 已备份或已复制副本。
- [ ] Nexusky 首次索引完成。
- [ ] Vault Health 可以解释当前健康分和主要扣分项。
- [ ] 一篇复杂 Markdown 笔记保存后格式仍可接受。
- [ ] Maintenance 的 preview/apply/undo 已试过至少一次。
- [ ] AI 外发预览能说明本次会发送哪些片段。
- [ ] 同步/备份忽略规则已覆盖 `.nexusky` 索引、`.history` 和 `.trash`。
