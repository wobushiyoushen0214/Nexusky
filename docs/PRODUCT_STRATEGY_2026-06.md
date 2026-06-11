# Nexusky 产品战略讨论记录

> 日期：2026-06-11  
> 参与：维护者 + Codex 产品战略顾问

## 一、核心问题诊断

### 1. "维护"不是性感的购买理由 ⚠️

**问题**：
- 用户购买笔记工具的动机是"创造价值"（写作/思考/管理），不是"清理债务"（维护笔记）
- 维护是**留存驱动因素**，不是**获客驱动因素**
- 类比：Grammarly 成功是因为"让你的英文更好"，而不是"检测语法错误"

**解决方案**：
- 从"维护"→"知识健康"
- 从负向修复→正向成长
- "Vault Health"改为"Knowledge Vitality"
- "Problems to fix"改为"Growth Opportunities"

### 2. 价值感知延迟 ⚠️⚠️⚠️（最严重）

**问题**：
- Vault Health 的价值需要用户**先有混乱 vault** 才能体会
- 新用户打开空 vault，看不到维护价值
- 已有 vault 的用户（Obsidian 用户）已形成习惯，迁移动力不足

**解决方案**：
- 提供"Vault Transformation Showcase"
- 内置 3 个真实的"混乱 vault"样本（研究者/开发者/作家）
- 演示"一键诊断 + AI 修复"全流程（30 秒看到效果）
- 制作 60 秒 Demo 视频用于营销

### 3. 技术优势用户无感

**问题**：
- Hot/Warm/Cold context、Context Pack、关系推断——技术很强但用户不理解
- 大部分用户不关心"为什么 AI 记得"，只想要"正确的答案"

**解决方案**：
- 将长期上下文系统产品化为"Memory Timeline"
- 可视化界面显示"AI 记住了什么"
- AI 对话中主动展示来源（透明度）
- 用户可手动标记（过期/重要）

## 二、竞争格局分析

### 笔记工具市场四象限

|  | 本地优先 | 云优先 |
|---|---|---|
| **知识网络** | Obsidian（插件生态）<br>Logseq（大纲） | Roam（双链）<br>Heptabase（白板） |
| **协作/数据库** | AnyType（P2P） | Notion（协作）<br>Mem（AI-first） |

**Nexusky 位置**：
- 技术上：本地优先 + 知识网络（与 Obsidian/Logseq 重叠）
- 定位上：试图在"本地优先 + AI 维护"建立新类别

### 竞品壁垒

- **Obsidian**：1000+ 插件生态 + 用户惯性 + "Plain Markdown"信仰
- **Notion**：团队协作网络效应 + 模板市场
- **Logseq**：大纲工作流 + 开源社区
- **Mem**：AI-native 设计 + 云端无缝体验

## 三、五个核心建议

### 建议 1：Demo 场景是破局关键 🔥

**实施**：
1. 创建 3 个"混乱 vault"样本：
   - 研究者 vault（500 篇论文，断链/孤岛严重）
   - 开发者 vault（技术笔记散乱）
   - 作家 vault（草稿多，缺分类）

2. 演示全流程：
   - 打开样本 → Health 扫描 → 显示问题
   - "Apply AI Fix" → Before/After 对比
   - 30 秒看到"从混乱到有序"

3. Demo 视频（60 秒）+ 营销素材

### 建议 2：先卖 Workflow Packs，不卖 Backup 🔥

**为什么不卖 Backup**：
- ❌ 不是痛点（Obsidian 用户已有 Git/iCloud）
- ❌ 是 commodity，难以溢价
- ❌ 信任门槛高（新产品卖备份风险大）

**替代方案**：
```
免费版：
- 基础 Vault Health（完全免费）
- AI Chat（100 次/月）
- Graph、Search（无限制）

Pro 版（$9.99/月）：
- Premium Workflow Packs：
  - Research Vault（论文管理、文献引用）
  - Developer Vault（代码笔记、技术学习）
  - Writer Vault（草稿管理、写作灵感）
- 无限 AI 请求
- 高级维护建议（自动修复、批量操作）

Add-on（+$2.99/月，6 个月后）：
- Managed Backup
```

### 建议 3："本地优先"从劣势变优势 🔥

**战略转变**：
- 不要防御性地说"我们也支持本地"
- 进攻性地说"**Your notes never leave your machine**"
- 对标 Signal（隐私通讯）、1Password（本地加密）

**营销角度**：
- 技术博客："为什么我们不把你的笔记发送到云端"
- 对比表：Nexusky vs Notion AI vs Mem（隐私/性能/成本）
- 目标人群：隐私敏感用户（研究者、记者、开发者、律师）

### 建议 4：做 Obsidian 的"伴侣"，不是"替代品"

**战略定位**：
```
❌ 错误：Obsidian 替代品
✅ 正确：Obsidian 的 AI 维护伴侣

口号："Built for serious Obsidian users"
```

**具体行动**：
1. 强调可以直接打开 Obsidian vault（无需迁移）
2. 在 Obsidian 社区发教程
3. 提供轻量级 Obsidian 插件（Health Check → 推荐 Nexusky）

### 建议 5：Memory Timeline（长期上下文可视化）

**产品化方向**：
- 时间轴显示"AI 记住了什么"
- 每个 Context Pack 有卡片：
  - 标题："你在 2024-03 研究了 React Hooks"
  - 来源：3 篇笔记、5 个链接
  - 状态：Hot/Warm/Cold
- 用户可手动标记："已过期"/"重要"
- AI 对话中主动展示：
  > "我记得你在 3 个月前研究过 React Hooks，要基于这个背景回答吗？"

## 四、关键风险

### 风险 1：过度收束 + 维护定位 = 吸引力不足

**问题**：
- 移除 Kanban/Reader/Flashcards 在战略上正确
- 但市场上可能显得"功能单薄"

**应对**：
- 通过 Workflow Packs 提供垂直场景功能
- Developer Pack 有简化版 Kanban
- Learning Pack 有 Flashcards
- 包装为"场景解决方案"，不是"通用功能"

### 风险 2：AI 准确率门槛

**问题**：
- 一次误报（删掉重要链接）就会失去信任
- 负面口碑传播很快

**应对**：
- 初期宁可保守（只标记高置信度问题）
- 每个建议都有"Helpful / Wrong"反馈
- 透明度优先于智能

### 风险 3：与 Obsidian 的竞合关系

**警惕**：
- 如果 Obsidian 社区开发"Vault Health"插件，价值被削弱
- 如果 Obsidian 官方加 AI 功能，会被夹击

**应对**：
- 定位为"专业工作台"，不是替代品
- 与社区合作，不对抗
- 建立独有数据资产（长期上下文、Context Pack）

## 五、实施优先级

### P0：立刻做（0-3 个月）

| ID | 任务 | 负责 | 验收标准 |
|---|---|---|---|
| P0-1 | Vault Transformation Showcase | Codex | 3 个混乱样本 + Demo 流程 |
| P0-2 | 产品叙事调整 | UI | "Vitality" / "Growth" 文案 |
| P0-3 | Memory Timeline 原型 | Codex + UI | 可视化 + 用户标记 |
| P0-4 | Demo 视频（60 秒） | UI | Before/After 营销素材 |

### P1：下一阶段（3-6 个月）

| ID | 任务 | 验收标准 |
|---|---|---|
| P1-1 | Workflow Packs（Research/Developer/Writer） | Pro 版功能完整 |
| P1-2 | Privacy-First AI 技术品牌 | 博客系列 + 社区渗透 |
| P1-3 | Obsidian 社区合作 | 教程 + 轻量级插件 |
| P1-4 | 用户反馈闭环 | 每个建议有 Helpful/Wrong |

### P2：长期（6-12 个月）

- Managed Backup（Add-on，+$2.99/月）
- Workflow Pack Marketplace
- 移动端 Capture Companion

## 六、叙事转变对照表

| 旧叙事（负向） | 新叙事（正向） |
|---|---|
| Vault Health | Knowledge Vitality |
| Maintenance Queue | Growth Opportunities |
| "47 problems found" | "47 opportunities to grow" |
| 健康分扣分逻辑 | "你的 vault 比 80% 用户更健康" |
| "修复断链" | "连接知识孤岛" |
| "AI 维护工作台" | "让你的知识永远健康" |

## 七、关键指标

### 北极星指标（保持不变）
> Weekly vault health improvement actions per active vault.

### 新增关键指标
- **Demo 转化率**：试用 Demo vault → 打开自己 vault 的比例
- **Memory Engagement**：用户查看/标记 Memory Timeline 的频率
- **Workflow Pack 激活率**：Pro 用户使用 Workflow Packs 的比例
- **Obsidian 社区渗透**：从 Obsidian 迁移/共用的用户占比

---

**下一步**：按此文档制定详细实施计划，Codex 负责逻辑，UI 团队负责界面。
