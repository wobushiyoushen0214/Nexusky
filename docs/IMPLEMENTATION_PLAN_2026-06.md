# Nexusky 产品升级实施计划

> 基于 PRODUCT_STRATEGY_2026-06.md  
> 开始日期：2026-06-11

## 一、P0 任务（立刻做，0-3 个月）

### 任务 1：Vault Transformation Showcase 🔥

**目标**：让用户 30 秒看到"从混乱到有序"的效果

**Codex 负责（逻辑）**：
1. 创建 3 个混乱 vault fixture：
   - `scripts/create-messy-research-vault.mjs`：500 篇论文笔记，大量断链、孤岛
   - `scripts/create-messy-developer-vault.mjs`：技术笔记散乱，缺少结构
   - `scripts/create-messy-writer-vault.mjs`：草稿多，缺少分类

2. 实现"一键修复"逻辑：
   - `packages/main/src/services/demo-transformation.ts`
   - 输入：混乱 vault 路径
   - 输出：修复后的 vault + Before/After 统计
   - 功能：
     - 自动修复断链
     - 连接孤岛笔记
     - 补充缺失属性
     - 生成知识图谱优化建议

3. IPC 接口：
   ```typescript
   // packages/shared/src/types/ipc.ts
   'demo:get-sample-vaults': () => Promise<SampleVault[]>
   'demo:run-transformation': (vaultId: string) => Promise<TransformationResult>
   'demo:get-before-after-stats': (vaultId: string) => Promise<ComparisonStats>
   ```

**UI 负责（界面）**：
1. 欢迎页新增"Try Demo Vault"入口：
   - `packages/renderer/src/components/WelcomeScreen.tsx`
   - 显示 3 个样本卡片（研究者/开发者/作家）

2. Demo 流程界面：
   - `packages/renderer/src/components/demo/DemoTransformationFlow.tsx`
   - 步骤 1：选择样本 vault
   - 步骤 2：扫描健康问题（显示混乱状态）
   - 步骤 3："Apply AI Fix"按钮
   - 步骤 4：Before/After 对比（带动画）

3. Before/After 对比视图：
   - 左右分屏显示 Graph 对比
   - 统计数据对比（断链数、孤岛数、健康分）
   - 高亮修复内容

**验收标准**：
- ✅ 用户点击"Try Demo"后 30 秒内看到完整流程
- ✅ Before/After 对比有视觉冲击力
- ✅ 可导出为 60 秒营销视频素材

**时间**：2 周

---

### 任务 2：产品叙事调整（正向化）

**目标**：从"维护"→"知识健康"，从负向→正向

**Codex 负责（逻辑）**：
1. 调整健康分计算逻辑：
   - `packages/main/src/services/vault-health.ts`
   - 新增：相对排名（"你的 vault 比 X% 用户更健康"）
   - 新增：成长指标（"本周新增 X 个有效链接"）
   - 新增：趋势计算（健康分周环比）

2. 维护队列改为"成长机会"：
   - `packages/main/src/services/ai/maintenance-queue.ts`
   - 调整优先级算法：正向机会排前（桥接建议、连接机会）
   - 调整类型命名：
     ```typescript
     // 旧
     type: 'broken-links' | 'orphan-notes'
     // 新
     type: 'connection-opportunities' | 'knowledge-islands-to-bridge'
     ```

**UI 负责（界面）**：
1. 全局文案替换：
   - `packages/renderer/src/i18n/zh-CN/`
   - `packages/renderer/src/i18n/en/`
   ```diff
   - "Vault Health" → "Knowledge Vitality"
   - "Maintenance Queue" → "Growth Opportunities"
   - "Problems found" → "Opportunities to grow"
   - "Fix issues" → "Unlock potential"
   ```

2. Overview 界面调整：
   - `packages/renderer/src/components/overview/OverviewPanel.tsx`
   - 健康分显示：大数字 + 相对排名 + 趋势箭头
   - "Growth Opportunities"板块：
     - 卡片式布局
     - 每个机会有图标 + 标题 + 潜在收益
     - "Start Growing"按钮（不是"Fix"）

3. Vitality 徽章动画：
   - 健康分提升时显示 celebrate 动画
   - 完成成长机会时显示 progress 动画

**验收标准**：
- ✅ 所有用户可见文案已正向化
- ✅ 健康分显示相对排名和趋势
- ✅ Growth Opportunities 有视觉吸引力

**时间**：1 周

---

### 任务 3：Memory Timeline（长期上下文可视化）

**目标**：让用户看到"AI 记住了什么"，建立信任

**Codex 负责（逻辑）**：
1. Memory Timeline 数据接口：
   - `packages/main/src/services/long-context/memory-timeline.ts`
   ```typescript
   interface MemoryCard {
     id: string
     title: string              // "你在 2024-03 研究了 React Hooks"
     period: { start: Date; end: Date }
     sources: NoteReference[]   // 来源笔记
     tier: 'Hot' | 'Warm' | 'Cold'
     confidence: number         // 0-1
     userActions: {
       archived: boolean        // 用户标记已过期
       pinned: boolean          // 用户标记重要
     }
   }
   ```

2. IPC 接口：
   ```typescript
   'memory:get-timeline': () => Promise<MemoryCard[]>
   'memory:update-card': (id: string, actions: UserActions) => Promise<void>
   'memory:explain-card': (id: string) => Promise<string>  // 解释为什么记住
   ```

3. AI 对话中展示记忆：
   - `packages/main/src/ipc/ai.ipc.ts`
   - 在 `ai:chat` 前检查相关 Memory Card
   - 返回时附带 `relatedMemories: MemoryCard[]`
   - Chat 界面显示："我记得你之前研究过这个，要基于这个背景回答吗？"

**UI 负责（界面）**：
1. Memory Timeline 主界面：
   - `packages/renderer/src/components/memory/MemoryTimelinePanel.tsx`
   - 时间轴布局（垂直滚动）
   - Memory Card 组件：
     - 标题 + 时间范围
     - Hot/Warm/Cold 徽章（颜色区分）
     - 来源笔记列表（可点击跳转）
     - 操作按钮：Archive / Pin / Explain

2. Chat 中的 Memory 提示：
   - `packages/renderer/src/components/ai/ChatMemoryPrompt.tsx`
   - 对话框顶部显示相关记忆
   - 用户可选择"Yes, use this context" / "No, fresh perspective"

3. Memory Card 详情弹窗：
   - 显示完整来源
   - 显示推断过程（透明度）
   - 显示置信度

**验收标准**：
- ✅ Memory Timeline 可视化完整
- ✅ AI 对话中主动展示相关记忆
- ✅ 用户可标记（Archive/Pin）

**时间**：3 周

---

### 任务 4：Demo 视频制作

**目标**：60 秒营销素材

**UI 负责（视频制作）**：
1. 脚本：
   - 0-10s：开场："你的笔记是这样吗？"（展示混乱 Graph）
   - 10-20s：问题呈现："断链、孤岛、缺少连接"
   - 20-35s：Nexusky 演示："一键诊断 → AI 修复"
   - 35-50s：效果展示："Before/After 对比"
   - 50-60s：Call to Action："让你的知识永远健康"

2. 录制：
   - 使用 Demo Transformation Showcase
   - 突出视觉对比（混乱→有序）
   - 配音 + 字幕（中英文）

3. 输出：
   - 60 秒完整版（YouTube/Twitter）
   - 30 秒短版（Instagram/TikTok）
   - 15 秒预告版（广告）

**验收标准**：
- ✅ 60 秒视频完成
- ✅ 视觉冲击力强
- ✅ 可用于社交媒体营销

**时间**：1 周

---

## 二、P1 任务（3-6 个月）

### 任务 5：Workflow Packs（Pro 版核心功能）

**Codex 负责**：
1. Workflow Pack 架构：
   - `packages/main/src/services/workflow-packs/`
   - 基础接口：
   ```typescript
   interface WorkflowPack {
     id: string
     name: string
     description: string
     features: Feature[]
     templates: Template[]
     aiPrompts: AIPrompt[]
   }
   ```

2. 三个 Pack 实现：
   - `research-pack.ts`：论文管理、文献引用、自动摘要
   - `developer-pack.ts`：代码笔记、API 文档、技术学习路径、简化版 Kanban
   - `writer-pack.ts`：草稿管理、写作灵感连接、出版准备

3. Pro 版权限控制：
   - `packages/main/src/services/licensing.ts`
   - 免费版：100 次 AI / 月
   - Pro 版：无限 AI + Workflow Packs

**UI 负责**：
1. Workflow Pack 选择界面：
   - `packages/renderer/src/components/workflow/WorkflowPackSelector.tsx`
   - 三个 Pack 卡片展示
   - 每个卡片显示功能列表

2. Pack 激活流程：
   - 选择 Pack → 应用模板 → 配置 AI prompts

3. Pro 版升级入口：
   - 免费版达到 100 次限制时提示
   - Workflow Pack 页面有"Upgrade to Pro"按钮

**验收标准**：
- ✅ 三个 Workflow Pack 功能完整
- ✅ Pro 版付费流程通顺
- ✅ 免费版限制清晰

**时间**：6 周

---

### 任务 6：Privacy-First AI 技术品牌

**Codex 负责**：
1. 技术博客系列（4 篇）：
   - 《为什么我们不把你的笔记发送到云端》
   - 《本地 AI vs 云端 AI：隐私与性能对比》
   - 《Nexusky 的技术架构：SQLite + BYOK》
   - 《如何安全地使用 AI 管理你的知识库》

2. 对比表数据收集：
   - Nexusky vs Notion AI vs Mem
   - 维度：隐私、性能、成本、功能

**UI 负责**：
1. 官网"Privacy-First"页面：
   - `website/src/app/privacy/page.tsx`
   - 展示技术架构图
   - 对比表可视化
   - "Your notes never leave your machine"大标题

2. 应用内隐私说明：
   - Settings → Privacy
   - 显示哪些数据会发送到哪里（OpenAI/Claude）
   - 用户可查看 API 调用历史

**验收标准**：
- ✅ 4 篇技术博客发布
- ✅ 官网 Privacy 页面上线
- ✅ 对比表可视化完成

**时间**：4 周

---

### 任务 7：Obsidian 社区合作

**Codex 负责**：
1. 轻量级 Obsidian 插件：
   - 名称："Nexusky Health Check"
   - 功能：
     - 扫描 vault 健康问题（断链、孤岛）
     - 显示简单统计
     - "Open in Nexusky for deep fix"按钮
   - 仓库：单独 GitHub repo

2. 教程文档：
   - 《如何用 Nexusky 维护 10k+ 笔记的 Obsidian vault》
   - 《从 Obsidian 迁移到 Nexusky（保留所有数据）》

**UI 负责**：
1. Obsidian vault 导入优化：
   - 检测到 `.obsidian` 文件夹时显示友好提示
   - "Import Obsidian vault"专用流程
   - 显示兼容性报告

2. 社区资源页面：
   - 官网 `/obsidian` 页面
   - 展示教程、插件、迁移指南

**验收标准**：
- ✅ Obsidian 插件发布到 Community Plugins
- ✅ 2 篇教程发布到 Obsidian 论坛
- ✅ 官网 Obsidian 页面上线

**时间**：4 周

---

## 三、技术实施细节

### 数据库 Schema 变更（Codex）

```sql
-- Memory Timeline
CREATE TABLE IF NOT EXISTS memory_cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  tier TEXT CHECK(tier IN ('Hot', 'Warm', 'Cold')),
  confidence REAL,
  archived INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_card_sources (
  memory_card_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  relevance REAL,
  FOREIGN KEY (memory_card_id) REFERENCES memory_cards(id),
  FOREIGN KEY (note_id) REFERENCES notes(id)
);

-- Demo Transformation
CREATE TABLE IF NOT EXISTS demo_transformations (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  before_stats TEXT NOT NULL,  -- JSON
  after_stats TEXT NOT NULL,   -- JSON
  applied_fixes TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL
);

-- Workflow Packs
CREATE TABLE IF NOT EXISTS workflow_pack_activations (
  id TEXT PRIMARY KEY,
  vault_path TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  activated_at INTEGER NOT NULL
);
```

### UI 组件结构

```
packages/renderer/src/components/
├── demo/
│   ├── DemoTransformationFlow.tsx       # Demo 主流程
│   ├── SampleVaultCard.tsx              # 样本 vault 卡片
│   └── BeforeAfterComparison.tsx        # 对比视图
├── memory/
│   ├── MemoryTimelinePanel.tsx          # Timeline 主界面
│   ├── MemoryCard.tsx                   # 单个 Memory Card
│   └── MemoryExplanationModal.tsx       # 解释弹窗
├── workflow/
│   ├── WorkflowPackSelector.tsx         # Pack 选择
│   ├── WorkflowPackCard.tsx             # Pack 卡片
│   └── ProUpgradeModal.tsx              # 升级提示
└── overview/
    └── OverviewPanel.tsx                # 更新：Vitality + Growth
```

---

## 四、时间线总览

```
Week 1-2:   P0-1 Demo Showcase（Codex + UI）
Week 2-3:   P0-2 产品叙事调整（UI 主导）
Week 3-5:   P0-3 Memory Timeline（Codex + UI）
Week 6:     P0-4 Demo 视频制作（UI）

Week 7-12:  P1-5 Workflow Packs（Codex + UI）
Week 9-12:  P1-6 Privacy 品牌（Codex 博客 + UI 网站）
Week 11-14: P1-7 Obsidian 合作（Codex 插件 + UI 页面）
```

---

## 五、验收标准汇总

### P0 验收（3 个月内）
- [ ] Demo Showcase：3 个样本 + 完整流程
- [ ] 产品叙事：全部文案正向化
- [ ] Memory Timeline：可视化 + 用户操作
- [ ] Demo 视频：60 秒营销素材

### P1 验收（6 个月内）
- [ ] Workflow Packs：Research/Developer/Writer 三个 Pack
- [ ] Privacy 品牌：4 篇博客 + 官网页面
- [ ] Obsidian 合作：插件发布 + 2 篇教程

---

**下一步**：Codex 开始实施逻辑层，UI 同步开始界面设计。
