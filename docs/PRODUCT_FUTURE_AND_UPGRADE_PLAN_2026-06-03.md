# Nexusky 产品未来发展方向与现有功能升级文档

> 日期：2026-06-03  
> 当前版本：v0.8.3
> 分析范围：`README.md`、`PRODUCT.md`、`docs/*`、`packages/main`、`packages/renderer`、`packages/shared`、`browser-extension`、`website`、`tests`。  
> 目标：在当前项目已经完成一轮功能收束、信任修复、认知伙伴 MVP 和部分商业化基础后，给出下一阶段产品方向、现有功能升级方案、优先级、验收标准和指标体系。

## 1. 结论

Nexusky 当前已经从“带 AI 的 Markdown 笔记应用”升级为一个本地优先的 AI 知识工作台。根据当前代码和文档，最明确的未来方向仍然是：

> 本地 Markdown vault 的 AI 认知维护伙伴。

这个定位比“更好的 Obsidian”“本地 Notion”“AI Chat for notes”都更准确。Nexusky 的核心资产不是单个编辑器、单个图谱或单个聊天框，而是一条可重复的信任闭环：

1. 打开真实 Markdown vault。
2. 快速索引文件、链接、任务、属性、记忆和图谱。
3. 看到 Vault Health 和今天最值得处理的 3 个维护动作。
4. 向 AI 提问并获得带来源、带长期上下文、带边界说明的回答。
5. 对维护或编辑动作先预览，再执行，可撤销或回滚。
6. 每周通过 Cognitive Review 看到知识库如何变好。

未来 6 到 12 个月，产品不要再横向增加主入口。应继续围绕 Files、Search、Chat、Graph、Maintenance、Vault Health 这几条主线，把现有能力做深、做稳、做可解释。

## 2. 当前项目状态判断

### 2.1 已经成立的产品基础

| 模块 | 当前状态 | 产品含义 |
| --- | --- | --- |
| 本地 vault | Markdown 文件是真实数据源，SQLite 是索引和派生状态 | 用户可迁移、可退出、可用其他编辑器读取 |
| 默认入口 | ActivityBar 默认收束为 Files、Search、Chat、Graph、Maintenance | 产品心智已从多面板工具箱回到核心知识闭环 |
| Vault Health | 打开 vault 后按 7 天节奏展示健康概览和下一步动作 | 首次价值点更清晰，无 AI Provider 也能成立 |
| Maintenance Queue | 支持 links/tasks/properties/memory/structure/bridge 分组扫描、缓存、partial results、预览和撤销 | 维护从“问题列表”升级为可执行任务 |
| AI Chat | 支持多 Provider、RAG、sources、长期上下文注入、无 Provider 路径说明和错误归因 | AI 能力可控，适合 power user 和隐私敏感用户 |
| Memory Ledger / Context Pack | 支持 Hot/Warm/Cold context、关系 evidence/reason/confidence、反馈和 snooze | 差异化核心已出现，不只是检索增强聊天 |
| Agent | 已进入 Maintenance -> Agent plan -> preview -> execute -> undo 路径 | Agent 不再抢主入口，而是成为高级执行引擎 |
| 同步和恢复 | 已有同步健康、冲突恢复、版本恢复、删除恢复、BYO sync 边界 | 信任基础比单纯“能同步”更接近可商业化 |
| 发布 | 支持范围选择、预览、增量发布、撤回和私有 noindex | 适合成为未来 hosted publish 增值基础 |
| Workflow samples | Research、Writing、Developer、Learning 样例 vault 和模板规则已加入 | 新用户可在没有真实 vault 时理解产品价值 |
| 官网 | 已改为 Vault Health demo 和 workflow packs 叙事 | 对外定位和应用内核心闭环开始一致 |

### 2.2 仍然存在的主要风险

| 风险 | 表现 | 影响 |
| --- | --- | --- |
| 巨石组件 | `ChatPanel.tsx`、`CanvasView.tsx`、`GraphView.tsx`、`db.ipc.ts`、`execute-tool-call.ts` 都超过 1000 行 | 迭代速度下降，回归风险变高 |
| 真实大 vault 回归不足 | 目前已有性能缓存和分组扫描，但仍需要 10k+ vault 手动回归 | 大用户是目标客群，性能不稳会直接损伤信任 |
| 维护任务仍偏“系统视角” | top 3、skip/snooze/not relevant 已进入闭环，但同类问题合并、完成历史和预计耗时还可以更强 | 长期留存依赖维护体验不制造负担 |
| AI 来源边界还可更显性 | 已有 sources 和 retrieved notes guard，但用户未必知道本次发送了哪些片段 | 隐私敏感用户需要更强的请求前透明度 |
| 真语义检索未上线 | 当前默认是 keyword/FTS/本地词法相关检索，embedding 已有 provider 抽象、请求预览和 hybrid 评估 harness，但仍不默认启用 | 若对外称“语义搜索”会再次产生信任风险 |
| 分发信任仍未完全闭环 | v0.8.3 仍为 unsigned packaging 路径，长期商业化仍需要签名、公证、更新可信链 | 影响非开发者用户安装和升级信任 |
| 插件生态尚未产品化 | 本地插件 API 存在，但不应过早市场化 | 过早平台化会稀释核心闭环 |

## 3. 未来产品方向

### 3.1 推荐定位

中文定位：

> Nexusky 是一个本地优先的 Markdown 知识工作台。你的笔记仍然是自己的文件，Nexusky 负责索引、连接、维护，并让 AI 在有来源、有解释、可预览、可撤销的边界内协助你长期思考。

英文定位：

> Nexusky turns your local Markdown vault into an AI-maintained knowledge system: searchable, connected, explainable, and safe to act on.

### 3.2 目标用户顺序

| 优先级 | 用户 | 为什么优先 |
| --- | --- | --- |
| P0 | Obsidian / Markdown vault 重度用户 | 已有真实资料和维护痛点，最能感知 Vault Health、RAG、图谱和可撤销写入 |
| P0 | 研究者、写作者、独立开发者、产品经理 | 有长期知识资产和来源追踪需求，愿意配置 AI Provider |
| P1 | AI power user | 会理解 BYO Provider、Context Pack、Agent、工具调用和本地边界 |
| P1 | 隐私敏感个人用户 | 本地优先和 BYO sync 是强差异点 |
| 暂缓 | 团队协作文档用户 | 需要权限、评论、实时协作、审计和组织管理，短期会分散产品 |
| 暂缓 | 轻量备忘录用户 | 不会为维护闭环付出学习成本 |
| 暂缓 | 移动端捕捉优先用户 | 当前桌面端价值链更完整，移动端会带来新的同步和编辑复杂度 |

### 3.3 战略主线

未来产品应围绕四条主线推进：

1. **Trust First：信任优先**
   - 所有写入必须 preview-first。
   - 所有 AI 来源必须可见。
   - 所有同步/发布动作必须有恢复路径。
   - 所有外发数据必须说明边界。

2. **Maintenance Loop：每周维护闭环**
   - 用户打开 vault 后不是看到一堆功能，而是知道今天先做什么。
   - 维护任务要少、准、可完成、可跳过。
   - 让用户看到健康趋势和已修复资产，形成“离开会损失积累”的保留感。

3. **Explainable Memory：可解释长期记忆**
   - AI 不是只看当前检索结果，还能用长期关系、主题和复盘补充上下文。
   - 每个关系都要保留 evidence、reason、confidence、feedback。
   - 低置信关系应是可反馈的假设，不应包装成事实。

4. **Safe Execution：安全执行**
   - Agent 不作为独立主卖点，而作为维护、批量整理、迁移和发布前检查的执行引擎。
   - 执行历史、逐步预览、rollback data、风险分级是核心。

## 4. 现有功能升级方案

### 4.1 Vault Health 升级

当前状态：

- 已能统计 note/link/unresolved/orphan/open task/duplicate/missing memory/stale note。
- 已能计算 0-100 Health Score，并解释主要扣分因子。
- 已能保存 Vault Health snapshot，Maintenance 页面展示最近 8 周趋势。
- 已作为 7 天节奏的打开 vault 后健康页。
- 已能根据 score factor impact 和当前 vault 信号动态生成 3 个下一步动作，优先处理链接、结构、任务、记忆和陈旧内容；健康良好时回落到来源问答、图谱和维护队列。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | Health Score 公式产品化 | 从纯计数升级为 0-100 分，按链接质量、任务状态、记忆新鲜度、结构密度和同步健康加权 | 同一 vault 多次扫描分数稳定；用户能看到分数变化原因 |
| P0 | 健康趋势 | 保存每日/每周 health snapshot | Maintenance 页面展示最近 8 周趋势 |
| P0 | 今日 3 件事更智能（第一版已完成） | 按 Health Score 扣分影响和当前 vault 信号排序，优先展示可处理的 3 个 next steps | top 3 能随 links/tasks/memory/structure/freshness 信号变化；后续补预计耗时和本地完成率统计 |
| P1 | 工作流感知规则 | Research/Writing/Developer/Learning 可有不同 required properties 和任务权重 | 样例 vault 的维护建议明显不同 |
| P1 | Health -> Publish/Sync 风险 | 发布前和同步前复用 health signals | 发布预览能指出缺失链接、私有标签、过期来源 |

不建议：

- 不要把 Health 做成复杂仪表盘。
- 不要把所有问题一次性铺开给新用户。
- 不要让 AI Provider 成为 Health 的前置条件。

### 4.2 Maintenance Queue 升级

当前状态：

- 已支持 19 类维护类型。
- 已按 scan group 分批加载 partial results。
- 已有 preview/apply/undo。
- 已可把 top 3 交给 Agent 生成计划。
- 已内置 Weekly Cognitive Review。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 完成/跳过/稍后/不相关状态 | 维护任务需要状态，而不是刷新后反复出现 | 用户反馈能持久影响同类建议排序 |
| P0 | 同类问题合并 | 重复未解析链接、重复标题、同类任务按组展示 | 100+ 问题 vault 不会刷屏 |
| P0 | 维护历史 | 展示过去 7/30 天完成了什么、撤销了什么 | 用户能看到积累感和可恢复记录 |
| P1 | 任务风险分级 | open-only、metadata write、content write、move/delete、merge 分级 | 高风险 action 需要更明显确认 |
| P1 | 批量安全执行模板 | 对重复链接、批量 alias、属性补全提供结构化批量预览 | 批量前后 diff 清晰，可整批撤销 |
| P2 | 维护规则编辑器 | 从 Markdown rules 逐步升级为可视化规则配置 | 用户可配置必填属性、过期天数、忽略路径 |

行为设计原则：

- 默认显示 3 件事，降低决策成本。
- 完成后展示小型反馈，例如“已减少 7 个断链风险”。
- 跳过和不相关要容易，让用户感觉系统听得懂。
- 连续 7 天或连续 4 周处理维护任务后，展示健康趋势，强化积累感。

### 4.3 AI Chat 与 RAG 升级

当前状态：

- 支持 OpenAI、OpenAI Responses、Claude、Ollama、自定义 OpenAI 兼容接口、Codex CLI。
- 已有 Provider setup checklist、probe question、错误归因、用量统计。
- 检索片段已用 `<retrieved_notes trust="low">` 隔离，并有 sources 显示。
- 长期上下文 sources 和检索 sources 会合并。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 请求前数据边界预览 | 在发送前展示将发送的 note snippets、附件、长期上下文数量和 Provider 名称 | 用户能在 Chat 输入区附近打开“本次会发送什么” |
| P0 | 无来源回答策略更强 | 没有检索结果时明确说未找到，而不是自信补全 | 自动测试覆盖 no-source response prompt |
| P0 | Source 可追溯交互 | 点击 source 打开对应 note，并定位片段或附近行 | 用户能从回答回到证据 |
| P1 | Context Pack 可视化 | 把 Hot/Warm/Cold context 显示成可折叠说明 | 用户能知道 AI 为什么想起这条关系 |
| P1 | 对话级成本预算（已完成） | 每次发送前估算 tokens/cost，支持月预算提醒 | 用量超阈值前提示，不能静默超支 |
| P1 | Provider 能力驱动 UI | 根据 toolCalling、vision、document、transcription 能力启用/禁用功能 | 不支持工具调用的 Provider 不显示 Agent 执行入口 |

不建议：

- 不要默认启用远程 embedding。
- 不要把“AI 自动整理整个 vault”作为早期承诺。
- 不要让 Chat 成为所有功能的唯一入口，命令和维护任务仍应可直接执行。

### 4.4 Memory Ledger / Context Pack 升级

当前状态：

- 已有关系发现、主题抽取、关系排序、Hot/Warm/Cold context pack。
- 关系有类型、置信度、score、reason、evidence。
- Related Context 支持 useful/not related/wrong reason/dismissed/snoozed 等反馈。
- Weekly Cognitive Review 能生成并保存复盘 Markdown。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | Memory Ledger 首页化但不新增入口 | 在 Maintenance context tab 中展示当前笔记和 vault 级记忆状态 | 用户知道记忆是怎么来的、是否过期 |
| P0 | 反馈闭环可见 | 用户反馈后显示“已降权/已隐藏到某日期/已标为不相关” | 下一次刷新不会立即重复出现 |
| P1 | 关系 provenance | 区分 authored、inferred、imported、review-generated | 图谱和 Context Pack 都能显示来源类型 |
| P1 | 关系老化和复活机制 | 长期不用的关系降温，有新证据时重新浮现 | Cold context 不长期占用 token |
| P1 | Cognitive Review 对话化 | 复盘生成后可追问“为什么这周浮现这些主题” | 复盘 sources 可回跳 |
| P2 | 记忆隐私等级 | 支持路径/标签级排除，不进入 AI context | 隐私目录不会出现在 Context Pack |

### 4.5 Graph / Properties / Timeline 升级

当前状态：

- Graph 是唯一关系地图入口。
- Properties View 和 Timeline 复用 CanvasView 布局引擎。
- Generic Canvas、Kanban、Reader、Flashcards、Calendar/Daily Note visible routes 已被收束或移除。
- Graph 支持显式边、推断边、目录边、分组钻取、大图 Canvas 降级。
- Graph 画布已加入 AI 维护提示第一版，可按孤岛、跨目录桥接和 AI 推断关系聚焦检查。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | Graph 任务化（第一版已完成） | 图谱默认回答“哪里断裂、哪里孤立、哪里跨域连接”；画布主动提示可聚焦孤岛、跨目录桥接和 AI 推断关系 | Graph 默认 filter 与维护信号联动；后续补 Graph -> Maintenance 任务创建 |
| P0 | Edge provenance 统一 | 显式链接、AI 推断、目录归属、review 生成边视觉区分一致 | 用户不靠颜色也能识别边类型 |
| P1 | 从 Graph 直接创建维护任务 | 右键孤岛、弱关系、重复节点可加入维护队列 | 图谱不只是浏览，而能产生行动 |
| P1 | Properties 扩展为 Markdown 属性视图 | 支持按 frontmatter property 过滤、排序、批量补字段 | 保持 Markdown/frontmatter，不引入重对象系统 |
| P2 | Timeline 与 review 结合 | 时间线展示本周新增、变更、复盘和维护成果 | Weekly Review 可从 Timeline 打开 |

### 4.6 Editor 与 Obsidian 兼容升级

当前状态：

- TipTap 富文本编辑，保存层已修复 Markdown round-trip 非保真问题。
- 支持 wikilink、frontmatter、Dataview inline fields、Tasks 日期、callout、脚注、嵌入、KaTeX、Mermaid 等。
- 编辑器底部链接概览默认折叠，减少写作干扰。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 保存可靠性继续加测试 | 扩展 round-trip fixture，覆盖更多 Obsidian 插件语法 | 新增语法不会被无关编辑破坏 |
| P0 | 片段级 source 定位 | Chat source 和 unlinked mention 能定位到编辑器附近文本 | 点击 source 后用户能看到证据上下文 |
| P1 | AI edit 统一写入管道 | AI edit、maintenance apply-fix、Agent step 共用 `VaultMutation` 抽象 | 所有写入都有 preview/apply/undo/audit |
| P1 | Frontmatter 批量编辑 | 与 Properties View 联动，支持批量添加/修正字段 | 批量前可预览所有文件 diff |
| P2 | 编辑器性能 profile | 大文件、复杂 Mermaid/KaTeX、长表格手动回归 | 10MB 级 Markdown 不应卡死主工作区 |

### 4.7 Sync / Backup / Publish 升级

当前状态：

- 同步支持 Supabase、iCloud、OneDrive、WebDAV、S3。
- 已有同步健康卡片、冲突恢复、覆盖前版本保存、删除进回收站。
- 已有 docs 和官网迁移指南，覆盖 Obsidian/Markdown vault 的安全打开、备份、忽略规则和 AI 数据边界。
- 已有 10k+ vault fixture 生成脚本、手动性能回归 runbook 和可选服务级 smoke 测试。
- 已有 sync disaster recovery fixture、自动演练测试和恢复 runbook，覆盖删除、覆盖、远端旧版本和冲突停机。
- Publish 支持范围选择、预览、增量、撤回、public/private noindex。
- 商业边界已明确：BYO sync 免费，managed sync / backup / hosted publish 是未来付费候选。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 迁移指南 D3.4 | Obsidian/Markdown 用户如何安全打开 vault、备份、配置忽略规则 | 官网和 docs 均有迁移指南 |
| P0 | 同步灾难恢复演练（已完成） | 人为制造删除、冲突、远端旧版本、本地改动覆盖 | 文档和测试覆盖恢复路径 |
| P1 | Managed backup MVP | 在本地恢复强之后，提供只备份不协作的托管方案 | 用户可看到版本、恢复点、加密边界 |
| P1 | Hosted publish MVP | 在静态发布成熟后提供托管发布目标 | 支持撤回、私有 noindex、范围更新 |
| P2 | 设备间同步配置迁移 | API key 和 Provider config 的跨设备安全迁移策略 | 不回传明文密钥，失败状态可解释 |

商业化建议：

- v0.9 之前不要卖协作。
- 第一个付费能力应是“可信恢复 + 托管备份”，不是“更多 AI 调用”。
- Hosted publish 可以作为第二个付费能力，但必须继承本地 publish 的预览和撤回逻辑。

### 4.8 Workflow Samples / Templates 升级

当前状态：

- 已有 Research、Writing、Developer、Learning 四个样例 vault。
- 每个样例包含模板和 `Maintenance/Workflow Rules.md`，规则中的 `maintenance.requiredProperties` / `ignorePaths` / 阈值会驱动维护队列。
- Welcome Screen 可创建样例 vault。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 样例内置首次任务 | 每个样例打开后 Vault Health 都能出现有意义的 top 3 | 用户不用导入真实 vault 也能体验闭环 |
| P1 | 模板和维护规则联动（已完成） | 根据 workflow rules 自动影响 maintenance required properties | 样例规则不是静态说明，而能驱动队列 |
| P1 | 工作流导入向导 | 用户选择研究/写作/开发/学习后生成模板和规则到现有 vault | 不破坏用户原有结构 |
| P2 | 社区 workflow pack | 允许本地导入 pack，但不做市场 | 保持本地文件格式和安全审查 |

### 4.9 Plugin API 升级

当前状态：

- 已有本地插件 API 和插件面板。
- 设置页已有精选插件入口，但它是内置本地 JSON 插件包；会显示来源、声明式权限、风险等级和安装说明，不联网下载或执行远程代码。
- 产品主线没有把远程插件市场作为核心。

升级方向：

| 优先级 | 升级项 | 说明 | 验收标准 |
| --- | --- | --- | --- |
| P1 | 插件权限模型 | 文件读写、命令、面板、网络访问需要声明 | UI 能显示插件权限 |
| P1 | 插件隔离和失败恢复 | 插件错误不能拖垮主应用 | 插件加载失败有可见错误和禁用入口 |
| P2 | 内置插件示例 | 只提供少量高质量本地插件模板 | 开发者能复制模式 |
| 暂缓 | 插件市场 | 核心闭环未商业化前不做 | 避免平台化分散 |

## 5. 路线图建议

### 5.1 v0.8.3：Trust Polish，2026-06

目标：把 v0.8.3 已经落地的核心闭环打磨到可被真实用户放心试用。

必须完成：

- D3.4 迁移指南：Obsidian/Markdown vault 安全迁移、备份、忽略目录、AI 数据边界。
- 请求前数据边界预览：Chat/Agent/AI edit 显示本次外发内容摘要。
- Maintenance 状态持久化：done、skip、snooze、not relevant。
- Health Score 和健康趋势第一版。
- 10k+ vault 手动性能回归：打开、索引、Health、Search、Graph、Maintenance、Chat sources。
- 分发说明：清楚解释 unsigned 包、系统安全提示和未来签名计划。

退出标准：

- 新用户能在 10 分钟内完成：打开/创建样例 vault -> 看 Health -> 完成一个 preview-first 维护动作 -> 问一个带来源问题。
- 无 AI Provider 用户也能完成 Health、Search、Graph、Maintenance 路径。
- 大 vault 打开不被维护扫描阻塞。

### 5.2 v0.9：Weekly Maintenance Product，2026-07 至 2026-08

目标：让用户每周回来处理少量高价值维护任务。

必须完成：

- Maintenance history 和健康趋势图。
- 同类问题合并和批量预览。
- Cognitive Review 可追问、可回跳 source。
- Context Pack 可视化和关系 provenance。
- Graph -> Maintenance 的任务创建。
- AI cost budget 和 Provider capability driven UI。

退出标准：

- 用户能清楚看到“上周修了什么、本周建议做什么、为什么重要”。
- top 3 维护任务完成率可被本地指标统计。
- feedback 会真实影响后续建议。

### 5.3 v1.0：Commercial Trust，2026-09 至 2026-12

目标：围绕信任能力商业化，而不是卖功能堆叠。

必须完成：

- 签名、公证、可信自动更新链路。
- Managed backup MVP，优先恢复能力，不做协作。
- Hosted publish MVP，继承本地发布预览、范围和撤回。
- 迁移和恢复文档完整。
- `VaultMutation` 统一写入管道。
- 巨石组件拆分第一轮：ChatPanel、GraphView、db.ipc、execute-tool-call。

退出标准：

- 非开发者可以安装、升级、备份、恢复，不需要读 GitHub issue。
- 任意 AI/Agent/Maintenance 写入都能审计、预览、撤销或回滚。
- 商业化说明不与本地免费能力冲突。

### 5.4 v1.x：Ecosystem，2027 以后

可以考虑：

- opt-in local embedding / remote embedding hybrid search。
- workflow pack 导入和分享。
- 本地插件 / workflow pack 分享目录，前提是签名、权限和隔离成熟，不做远程执行市场。
- 移动端 capture companion。
- 只读 publish 站点共享，不进入团队工作区或协作编辑。

前提：

- v1.0 的信任、恢复、分发和核心留存指标已经成立。

## 6. 优先级 Backlog

### P0：必须优先

| ID | 事项 | 原因 |
| --- | --- | --- |
| P0-1 | Chat/Agent 请求前外发内容预览 | 隐私信任是本地优先产品的基础 |
| P0-2 | Maintenance 反馈状态持久化 | 否则主动建议会变成噪音 |
| P0-3 | Health Score + 趋势 | 让用户看到知识库变好，形成回访理由 |
| P0-4 | 迁移指南 | 当前目标用户大多已有 Markdown/Obsidian vault |
| P0-5 | 10k+ vault 手动性能回归 | 目标客群的真实数据规模不能只靠小 fixture |
| P0-6 | source 点击定位 | sources 只有能回到证据才真正可信 |

### P1：下一阶段增强

| ID | 事项 | 原因 |
| --- | --- | --- |
| P1-1 | `VaultMutation` 统一写入管道 | 降低 AI edit / Agent / Maintenance 多套写入风险 |
| P1-2 | Context Pack 可视化 | 让长期记忆从系统能力变成用户可理解的体验 |
| P1-3 | Graph 维护任务化（第一版已完成） | 图谱应产生行动，而不是只做浏览 |
| P1-4 | AI cost budget（已完成） | BYO Provider 用户需要成本透明 |
| P1-5 | Workflow rules 驱动维护队列（已完成） | 样例、模板和维护建议需要闭环 |
| P1-6 | 同步灾难恢复演练（已完成） | 商业化备份前必须证明恢复可靠 |

### P2：可以等待

| ID | 事项 | 原因 |
| --- | --- | --- |
| P2-1 | 真 embedding 检索（评估 harness 已完成） | 需要隐私、成本、质量评估后再进入默认路径 |
| P2-2 | 本地内置插件元数据（已完成） | 只保留本地可审计示例，不进入远程 marketplace 或平台化 |
| P2-3 | 移动端 capture companion | 仅作为未来轻量捕捉入口，不做完整移动编辑器 |

### 长期不做 / 不进入当前路线图

| 事项 | 原因 |
| --- | --- |
| 团队协作、团队权限、评论和实时协作 | 会把 Nexusky 带入 Notion / 企业知识库战场，偏离个人本地 Markdown vault 定位 |
| 移动端完整编辑器 | 当前桌面端维护闭环和同步恢复尚未完全商业化，完整移动编辑会引入新的同步和编辑复杂度 |
| 对象化数据库系统 / 对象 OS / supertag-first | 会偏离 Markdown source of truth；只保留 frontmatter / properties 的轻量结构化能力 |
| 远程插件 marketplace / 插件抽成 | 核心闭环、权限、签名和隔离未成熟前会稀释主线 |

## 7. 指标体系

### 7.1 北极星指标

> Weekly useful maintenance actions per active vault.

定义：

- active vault：最近 7 天打开过。
- useful maintenance action：用户完成、应用、接受或保存的维护动作，不包括单纯打开面板。
- 每周统计每个活跃 vault 的有效维护动作数。

为什么不用 AI 调用次数：

- AI 调用次数可能代表成本和噪音，不一定代表知识库变好。
- Nexusky 的差异不是“问得更多”，而是让长期 vault 更可搜索、可连接、可维护、可安全执行。

### 7.2 激活指标

| 指标 | 目标 |
| --- | --- |
| Vault Open Success Rate | 用户成功打开或创建 vault |
| First Health Seen | 第一次看到 Health Summary |
| First Useful Action | 第一次打开 source、完成维护、或提问有来源 |
| No-AI Activation Rate | 未配置 AI Provider 仍继续使用 Files/Search/Graph/Maintenance |
| Provider Setup Completion | 进入 AI 设置后成功通过测试问题 |

### 7.3 留存指标

| 指标 | 目标 |
| --- | --- |
| Weekly Health Return | 每周回到 Health/Maintenance |
| Maintenance Completion Rate | top 3 任务完成比例 |
| Snooze / Not Relevant Rate | 建议噪音水平 |
| Cognitive Review Saved | 每周复盘保存比例 |
| Source Click-through | AI 回答后点击来源比例 |

### 7.4 信任指标

| 指标 | 目标 |
| --- | --- |
| Preview Apply Rate | 用户看到预览后应用的比例 |
| Undo Rate | 撤销比例，过高代表建议质量或风险说明有问题 |
| Provider Error Rate | AI Provider 请求失败比例 |
| Sync Conflict Recovery Success | 冲突解决成功比例 |
| Restore Usage Success | 历史版本/回收站恢复成功比例 |

### 7.5 性能指标

| 指标 | 目标 |
| --- | --- |
| Vault Open to Health Time | 打开 vault 到 Health 可用时间 |
| Maintenance Partial Result Time | 第一批维护结果出现时间 |
| Search Response Time | 搜索首屏结果时间 |
| Graph First Render Time | 图谱首屏渲染时间 |
| AI Source Preparation Time | 发送前检索和 context pack 组装时间 |

## 8. 不做清单

未来 3 到 6 个月不建议做：

- 新增一线 ActivityBar 入口。
- 独立 Kanban、Calendar、Daily Note、Flashcards、Reader Inbox 的回归。
- 默认远程 embedding。
- 团队协作、团队权限、评论和实时协作。
- 移动端完整编辑器。
- 远程插件 marketplace 或插件抽成。
- 对象化数据库系统、supertag-first 或云端专有数据库替代 Markdown 文件。
- 没有预览和撤销的 AI 自动写入。

## 9. 工程支撑建议

### 9.1 模块拆分

优先拆分：

| 文件 | 当前问题 | 拆分方向 |
| --- | --- | --- |
| `ChatPanel.tsx` | 聊天、批量生成、附件、错误、导出、草稿都在一个巨石组件 | 拆为 chat state、composer、stream handling、attachments、batch flows、export |
| `GraphView.tsx` | 图谱数据、布局、渲染、交互、过滤耦合 | 拆为 data adapter、layout worker bridge、renderer、controls |
| `CanvasView.tsx` | Properties/Timeline 复用但边界不清 | 拆为 layout engine、properties mode、time mode |
| `db.ipc.ts` | DB、搜索、图谱、聊天历史、long-context IPC 混杂 | 按 domain 拆 IPC registration |
| `execute-tool-call.ts` | 近 1500 行工具执行器 | 每类工具独立模块，保留统一 schema 和 result envelope |

### 9.2 写入管道统一

建议抽象：

```ts
interface VaultMutation {
  id: string
  risk: 'open' | 'metadata' | 'content' | 'move' | 'delete' | 'merge'
  preview(): Promise<MutationPreview>
  apply(expectedHash?: string): Promise<MutationResult>
  undo(token: string): Promise<MutationResult>
}
```

适用范围：

- Maintenance apply-fix。
- Agent step execution。
- AI edit。
- template/daily note。
- publish/write support files。
- sync overwrite recovery hooks。

收益：

- 统一 realpath vault guard。
- 统一 content hash 并发守卫。
- 统一 `.trash` / `.history` / undo token。
- 统一审计日志和 UI 文案。

### 9.3 测试与回归

必须补充：

- 10k+ vault 手动测试脚本和记录模板。
- Chat source click-through 测试。
- Maintenance feedback persistence 测试。
- Health Score deterministic tests。
- Provider capability UI tests。
- Sync disaster recovery fixture。（已完成）
- Publish scoped output regression。

继续保持：

- 不把 ESLint 作为当前阻塞项，除非单独开 lint 修复。
- Typecheck 和 focused tests 作为每个功能提交的最低门槛。

## 10. 产品叙事升级

### 10.1 首页和 README 应强调

优先表达：

- Open a real Markdown vault。
- See Vault Health first。
- Fix the top 3 maintenance issues。
- Ask with sources。
- Preview before AI writes。
- Bring your own provider and sync。

减少表达：

- Agent 作为独立大卖点。
- 抽象“AI knowledge base”。
- 插件、协作、移动端、全能编辑器。
- 过早承诺语义搜索。

### 10.2 应用内文案原则

- 少讲系统术语，多讲用户收益。
- `Memory Ledger` 可以保留，但要用“为什么想起这条”解释。
- `Maintenance` 不要像审判清单，要像今日可完成的小任务。
- `AI` 文案必须同时说明来源、边界和可撤销。
- `Sync` 文案必须优先说明恢复，而不是只说已同步。

## 11. 最终建议

Nexusky 下一阶段的成功不取决于再增加多少功能，而取决于能否把已经具备的强能力组织成稳定、可理解、可重复的用户习惯：

> 每周打开 Nexusky，看到知识库哪里变好了，处理少量高价值维护任务，然后放心地让 AI 基于有来源的上下文协助下一步写作、研究或整理。

短期最重要的不是平台化，而是把信任闭环做到可演示、可回归、可迁移、可恢复。等这个闭环成立后，再发展托管备份、托管发布、workflow packs、插件和更高级的语义检索，商业化才不会和本地优先定位冲突。

## 12. 执行记录

| 日期 | 项目 | 状态 | 变更 | 验证 |
| --- | --- | --- | --- | --- |
| 2026-06-03 | P0-1 Chat/Agent 请求前外发内容预览 | 完成 | 新增 `ai:preview-outbound` IPC 和本地 preview builder；Chat 输入区新增“外发预览”入口，首次发送会先展示 Provider、模式、附件/图片数量、检索到的 note snippets、长期上下文 Hot/Warm/Cold 数量、Vault 工具定义提示和约 token 数，用户确认后才继续现有 Chat/Agent 发送流程；预览阶段检索使用 local-only 模式，不提前触发 AI rerank 或对话摘要压缩。 | `pnpm test -- tests/ai-outbound-preview.test.ts tests/retrieved-notes-context.test.ts tests/ai-system-context.test.ts`；`pnpm typecheck` |
| 2026-06-03 | P0-2 Maintenance 反馈状态持久化 | 完成 | 新增 `maintenance_feedback` SQLite 表和 `maintenance:record-feedback` IPC；维护队列支持 `done`、`skipped`、`snoozed`、`not_relevant` 四种反馈，队列扫描会自动过滤已完成、跳过、不相关和未到期的稍后事项；反馈签名进入维护队列缓存键，点击后不会被旧缓存重新带回；Maintenance 卡片新增完成、稍后、跳过、不相关按钮，并补齐中英文文案。 | `pnpm test -- tests/maintenance-feedback.test.ts tests/maintenance-cache-key.test.ts tests/maintenance-queue-ipc.test.ts tests/proactive-schema.test.ts tests/long-context-schema.test.ts`；`pnpm typecheck` |
| 2026-06-03 | P0-3 Health Score + 趋势 | 完成 | Vault Health 从纯计数升级为稳定 0-100 分，权重为链接质量 25、记忆覆盖 20、结构密度 20、任务负担 15、内容新鲜度 10、同步健康 10；同步未配置且无待处理工作时不扣分；新增 `vault_health_snapshots` SQLite 表，每天 upsert 一条 snapshot；趋势按最近 8 个周桶展示每周最新 snapshot；Vault Health 首屏展示健康分和主要扣分项，Maintenance 顶部展示最近 8 周趋势、周变化和前两个扣分因子。 | `pnpm test -- tests/vault-health.test.ts tests/ai-onboarding-prompts.test.ts tests/proactive-schema.test.ts tests/long-context-schema.test.ts`；`pnpm typecheck` |
| 2026-06-03 | P0-4 迁移指南 | 完成 | 新增 `docs/MIGRATION_GUIDE.md`，覆盖直接打开、复制试用、Obsidian 导入、首次索引、忽略/同步规则、AI 外发边界和恢复路径；README 文档入口加入迁移指南；官网新增 `/migration-guide` 页面，并在首页导航、hero CTA 和 footer 提供轻量入口，避免新增应用主入口。 | `pnpm test -- tests/docs-links.test.ts tests/website-homepage.test.ts`；`pnpm -C website lint`；`pnpm -C website build`；`pnpm typecheck` |
| 2026-06-03 | P0-5 10k+ vault 手动性能回归 | 完成 | 新增 `scripts/create-large-vault-fixture.mjs` 和 `pnpm fixture:large-vault`，可生成确定性的 10k Markdown vault，包含 folder 分布、wikilink、未解析链接、frontmatter、inline fields、任务、长笔记、stale mtime 和附件；新增 `docs/10K_VAULT_PERFORMANCE_REGRESSION.md`，覆盖打开/索引、Vault Health、Search、Graph、Maintenance、Chat sources 的手动回归步骤和结果模板；新增默认跳过的 `large-vault-performance-smoke`，设置 `NEXUSKY_PERF_VAULT` 后可记录 index、health、search 服务级耗时，`NEXUSKY_PERF_INCLUDE_HEAVY=1` 时追加 graph 和 maintenance；回归发现首次 10k 索引瓶颈在全库 SQL 链接解析，已将批量 `indexVault` 改为写完所有 note/link 后用 O(notes + aliases + links) map 统一解析。 | `pnpm test -- tests/large-vault-fixture.test.ts tests/docs-links.test.ts`；`pnpm test -- tests/vault-indexer.test.ts tests/indexer.test.ts tests/graph-modes.test.ts tests/large-vault-fixture.test.ts`；`pnpm fixture:large-vault -- --out /tmp/nexusky-10k-vault --notes 10000 --folders 80 --links-per-note 3 --force`；`NEXUSKY_PERF_VAULT=/tmp/nexusky-10k-vault pnpm test -- tests/large-vault-performance-smoke.test.ts`（10k clean fixture: `indexVault` 7453ms, `scanVaultHealth` 12ms, `lexicalSearch` 4ms）；`pnpm typecheck` |
| 2026-06-03 | P0-6 source 点击定位 | 完成 | Chat source row 和 tool result sources 现在点击后切回 Editor 并打开对应 Markdown；`ChatSource` 增加可选 `line/endLine/heading/blockId` 定位字段以兼容未来片段级来源，当前已有历史 source 会用 `chunk` 文本回退到最接近的正文段落或 Markdown 行；Editor store 新增一次性 `openFileAt` pending target，文件打开成功后由 Editor 消费并居中定位，文件不存在时自动清理 pending target，避免旧定位污染下一次打开。 | `pnpm test -- tests/source-navigation.test.ts`（脚本实际跑完全量：134 files / 778 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-03 | P1-1 `VaultMutation` 统一写入管道（第一阶段） | 部分完成 | 新增 `vault-mutation` 服务，统一 Markdown 内容写入的 hash、preview、apply、restore-before-state、索引刷新和创建撤销时的 trash fallback；Maintenance `apply-fix` 的 preview/apply/undo 已切到共享 mutation；Agent executor 的 `file_create`、`file_write`、`task_update`、`note_edit`、`apply_tag`、`update_frontmatter`、`create_link` 和 `merge_notes` 目标写入已复用同一写盘路径，同时 rollback 校验兼容旧 md5 与新 sha256 hash；后续仍需把 ChatPanel 的 AI edit 应用、BacklinksPanel 快捷写入和高风险 move/delete/rename 统一到同一审计模型。 | `pnpm test -- tests/vault-mutation.test.ts tests/maintenance-apply-fix.test.ts tests/maintenance-queue-ipc.test.ts`；`pnpm test -- tests/agent-executor.test.ts tests/vault-mutation.test.ts tests/maintenance-apply-fix.test.ts`（脚本实际跑完全量：135 files / 780 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-03 | P1-1 `VaultMutation` 统一写入管道（AI edit 接入） | 完成 | AI edit 生成结果现在返回预览时的 sha256 `beforeHash`；ChatPanel 的新笔记生成不再绕过确认直接 `file:create`，而是进入现有预览区，用户确认后调用新增 `ai:apply-edit` IPC；后端 `applyAiEditMutation` 统一执行 vault guard、创建/更新 mutation、预览 hash 并发校验、历史快照、索引刷新和文件变更通知；`VaultMutation` 更新写入会先保存 `.history` 快照；修复 trash metadata 在移动文件后再计算原路径导致记录为 `../../...` 的问题。后续仍需把 BacklinksPanel 快捷写入和高风险 move/delete/rename 统一到同一审计模型。 | `pnpm test -- tests/ai-edit-application.test.ts tests/vault-mutation.test.ts tests/version-recovery.test.ts tests/chat-panel.test.ts tests/ai-language-prompts.test.ts`（脚本实际跑完全量：136 files / 783 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-03 | P1-1 `VaultMutation` 统一写入管道（BacklinksPanel 快捷写入） | 完成 | 新增通用 `file-content-mutation` 服务和 `file:read-with-hash` / `file:apply-content-mutation` IPC，读取返回 sha256 hash，应用时统一执行 vault guard、创建/更新 mutation、历史快照、索引刷新和变更通知；AI edit 应用服务复用该通用 content mutation，减少重复写入逻辑；BacklinksPanel 的单条未链接提及转换、批量转换和缺失出链目标创建不再直接调用 `file:write` / `file:create`，而是带读取时 hash 进入 mutation apply，预览后文件发生变化会拒绝覆盖。后续仍需把高风险 move/delete/rename 统一到同一审计模型。 | `pnpm test -- tests/file-content-mutation.test.ts tests/ai-edit-application.test.ts tests/backlinks-panel.test.ts tests/ai-language-prompts.test.ts`（脚本实际跑完全量：137 files / 786 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-03 | P1-1 `VaultMutation` 统一写入管道（高风险文件操作） | 完成 | 新增 `file-operation-mutation` 服务，统一 move、rename、delete 的 vault guard、trash metadata、索引刷新、文件变更通知和 `.nexusky/file-operations.jsonl` 审计记录；`file:delete` / `file:rename` IPC 改为复用该服务，Markdown rename 会通过同一路径更新 wikilink；Agent 的 `move_file`、`rename_file`、`delete_file` 和 `merge_notes` 源文件删除也改为共享文件操作管道，rollback 继续使用 hash 并发守卫，rename rollback 会拒绝覆盖执行后被用户改动的引用文件；补齐 macOS `/var` 与 `/private/var` realpath 差异下的绝对路径和未来路径校验。 | `pnpm test -- tests/file-operation-mutation.test.ts tests/agent-executor.test.ts tests/file-content-mutation.test.ts tests/vault-mutation.test.ts`（脚本实际跑完全量：138 files / 790 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-03 | P1-2 Context Pack 可视化 | 完成 | Related Context 面板新增可折叠 Context Pack 可视化区，默认显示本次可进入 Chat 的 Active/Nearby/Archive 记忆数量和 token 预算；展开后可按 Hot/Warm/Cold 层级查看每条记忆的标题、关系类型、confidence、score、reason 和 evidence，让用户在编辑器上下文里理解 AI 为什么想起这些关系；补齐中英文文案和 helper 测试，保持设置页 debug/tuning 入口不变。 | `pnpm test -- tests/related-context-panel.test.ts tests/long-context-ui.test.ts tests/long-context-pack.test.ts`（脚本实际跑完全量：138 files / 792 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-04 | P1-3 Graph 维护任务化（第一版） | 完成 | Graph helper 新增维护信号统计，区分孤岛笔记、跨目录桥接边和 AI 推断关系；GraphView 新增显式 `maintenanceFocus` 状态，聚焦后画布只保留相关文件节点和对应文件夹上下文，并自动打开必要的孤岛/推断边显示条件；Graph 画布新增可折叠 AI 维护提示浮层，展示最优先信号、数量和样例，点击即可在图谱中过滤检查，不占用左侧控制栏；补齐中英文文案和 helper 测试。 | `pnpm vitest run tests/graph-ui.test.ts`；`pnpm typecheck` |
| 2026-06-04 | P1-4 AI cost budget | 完成 | `AIOutboundPreview` 新增 `cost` 对象，发送前估算输入 tokens、预期输出 tokens、按 Provider 配置费率计算本次预计成本；主进程新增 `ai:get-cost-budget` / `ai:set-cost-budget` IPC 和本地月预算存储，外发预览会结合本月 usage summary 给出 projected monthly cost、near/over budget 状态和提醒；Settings 的本月用量卡新增月预算 USD 与提醒阈值配置；Chat 外发预览新增预计成本、月预算进度和未计价历史记录提示。 | `pnpm vitest run tests/ai-usage.test.ts tests/ai-outbound-preview.test.ts tests/ai-provider-types.test.ts`；`pnpm typecheck` |
| 2026-06-04 | P1-5 Workflow rules 驱动维护队列 | 完成 | 新增维护规则解析服务，读取 `Maintenance/Workflow Rules.md` 和 `.nexusky` 规则文件中的 `maintenance.requiredProperties`、`ignorePaths`、长笔记阈值和 upcoming days；维护队列会把规则与调用参数合并，按 ignored paths 过滤候选笔记，缺失属性任务会说明来源是 Workflow Rules，缓存键纳入规则签名和忽略路径；四个 workflow sample 的规则文件补齐机器可读配置，和模板中的 `type/status/tags` 形成闭环。 | `pnpm test -- tests/maintenance-workflow-rules.test.ts tests/maintenance-cache-key.test.ts tests/workflow-samples.test.ts tests/ai-maintenance-queue.test.ts`（脚本实际跑完全量：139 files / 799 tests passed，large vault smoke skipped）；`pnpm typecheck` |
| 2026-06-04 | P1-6 同步灾难恢复演练 | 完成 | 新增 `fixture:sync-disaster-recovery` 脚本，生成本地 `vault/`、fake `remote/`、baseline manifest 和 5 个事故场景；新增同步灾难恢复自动演练，复用 `planSync`、`executeSyncPlan`、`.history` 和 `.trash` 恢复路径，覆盖远端删除、本地删除、远端旧版本、本地被远端覆盖前保存历史、近同时编辑冲突不自动覆盖；新增 `docs/SYNC_DISASTER_RECOVERY_DRILL.md` runbook 并在 README 加入口。 | `pnpm test -- tests/sync-disaster-recovery.test.ts tests/sync-reconcile.test.ts tests/sync-execute.test.ts tests/version-recovery.test.ts tests/docs-links.test.ts`；`pnpm typecheck` |
| 2026-06-04 | P2-1 真 embedding 检索（评估 harness） | 完成 | 新增 `semantic-search` 服务层，定义真实 embedding provider 接口、远程 embedding 请求预览、provider 向量维度校验、embedding 排名和 RRF hybrid 融合；`evaluateSemanticRetrieval` 可在 fixture/未来 opt-in UI 中比较 embedding 与 lexical routes，但不改变默认 keyword/FTS/本地词法检索，也不默认外发任何 note text；语义检索评估文档同步更新为 code-backed 隐私契约。 | `pnpm vitest run tests/semantic-search-evaluation.test.ts`；`pnpm typecheck` |
| 2026-06-04 | P2-2 本地内置插件元数据 | 完成 | 插件入口明确收束为 `bundled_local` 本地内置包；`PluginLocalPackItem` 新增 `source`、`permissions`、`riskLevel` 和 `installNote`，IPC 会从声明式 commands/panels/editorExtensions 推导 `ai_prompt`、`read_only_panel`、`editor_extension_declaration` 权限；设置页本地内置包卡片显示来源、风险和权限 chips；插件文档补充“不联网下载、不执行远程代码”的本地包边界，避免误读为远程插件市场。 | `pnpm vitest run tests/plugin-api.test.ts`；`pnpm typecheck` |
| 2026-06-04 | 产品路线图边界校正 | 完成 | 从 P2 “可以等待”表中移除团队协作、完整移动编辑和对象化数据库系统，新增“长期不做 / 不进入当前路线图”说明；README 和项目全景入口文档不再把独立看板、闪卡、阅读收件箱、Generic Knowledge Space 或远程插件市场作为当前主能力宣传，统一回到本地 Markdown vault、维护闭环、可解释 AI 和 preview-first 安全执行主线。 | `pnpm vitest run tests/docs-links.test.ts` |
| 2026-06-04 | 产品偏离点审查与入口修复 | 完成 | 新增 `docs/PRODUCT_ALIGNMENT_AUDIT_2026-06-04.md`，记录 Agent 默认问答、插件/模板 marketplace 措辞和历史策略文档三类偏离；Chat 默认关闭工具调用，来源问答/Vault Health/Chat hint/Reader digest 显式走普通 RAG chat；用户可见 Agent chat 开关改为 Vault 工具；插件和模板包文案改为本地内置包；旧策略分析标记为历史快照。 | `pnpm vitest run tests/ai-onboarding-prompts.test.ts tests/ai-outbound-preview.test.ts tests/plugin-api.test.ts tests/docs-links.test.ts`；`pnpm typecheck` |
| 2026-06-04 | 产品目标一致性亮点与 No-AI 边界文案 | 完成 | 新增 `docs/PRODUCT_ALIGNMENT_HIGHLIGHTS_2026-06-04.md`，整理 Vault Health、来源问答、外发预览、Maintenance、Workflow Rules、VaultMutation、Memory Ledger/Context Pack、Graph 维护焦点、10k vault 回归和同步灾难演练等符合目标的亮点；Vault Health Ask AI prompt 改为 local search + Context Pack；No-AI toast 和设置页 Provider 需求从 Agent actions 改为 Vault tools / 可审查执行。 | `pnpm vitest run tests/ai-onboarding-prompts.test.ts tests/accessibility-components.test.ts tests/docs-links.test.ts`；`pnpm typecheck` |
| 2026-06-04 | Vault tools Provider 能力驱动 | 完成 | 新增 Chat 侧 Provider 能力 helper，根据当前启用 Provider 的 `capabilities.toolCalling` 判断 `Vault 工具` 是否可用；不支持工具调用、未配置 Provider 或未打开 vault 时禁用工具开关，并在请求路径中回退到普通来源问答，避免用户发送后才遇到不支持工具调用的错误。 | `pnpm vitest run tests/chat-panel.test.ts tests/ai-provider-types.test.ts tests/ai-onboarding-prompts.test.ts tests/accessibility-components.test.ts tests/docs-links.test.ts`；`pnpm typecheck` |
| 2026-06-04 | P0 今日 3 件事更智能（第一版） | 完成 | Vault Health 下一步动作从固定 Ask AI / 修链接 / 看图谱，升级为根据当前 `VaultHealthSummary` 和 score factor impact 动态排序的 Top 3；链接、结构、任务、Memory Ledger 和陈旧笔记会按扣分影响进入首屏行动，健康良好时回落到来源问答、图谱和维护队列；补齐中英文文案和纯函数测试。 | `pnpm vitest run tests/ai-onboarding-prompts.test.ts`；`pnpm typecheck` |
| 2026-06-04 | 对齐候选闭合：来源解释、样例首启、边界回归 | 完成 | Chat sources 合并本地搜索与 Context Pack provenance，同一条来源能显示关系类型、Hot/Warm/Cold、reason 和 evidence；四个 workflow sample README 的首启路径压缩为 Vault Health -> Ask with sources -> Maintenance top 3；新增 Properties View 文案边界回归，避免 Properties 入口回到对象数据库或 supertag-first 心智。 | `pnpm vitest run tests/long-context-pack.test.ts tests/long-context-ui.test.ts tests/workflow-samples.test.ts tests/product-boundary-copy.test.ts`；`pnpm typecheck` |
