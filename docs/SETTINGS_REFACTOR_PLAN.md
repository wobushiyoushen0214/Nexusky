# 设置系统完整重构方案

> 日期：2026-06-11  
> 目标：统一设置 UI 风格，对齐 ActivityBar 设计，重构 AI Provider 逻辑

---

## 🎯 重构目标

### UI 侧（我负责）
1. 创建类似 ActivityBar 的侧边栏导航
2. 统一所有设置页面的样式
3. 简化 AI Provider 配置界面
4. 移除冗余代码，保持简洁

### 后端侧（Codex 负责）
1. 重构 AI Provider 存储逻辑
2. 简化 Provider 配置结构
3. 优化 Provider 测试流程
4. 统一错误处理

---

## 📐 UI 设计规范

### 布局结构

```
┌─────────────────────────────────────┐
│ 设置                          [×]   │
├──────────┬──────────────────────────┤
│          │                          │
│  [图] 外观 │  外观设置内容区域          │
│  [图] AI  │                          │
│  [图] 云端 │  - 主题选择               │
│  [图] 插件 │  - 强调色                │
│  [图] 快捷键│  - CSS 片段              │
│  [图] 主动 │                          │
│  [图] 记忆 │                          │
│          │                          │
│  200px   │       auto               │
└──────────┴──────────────────────────┘
```

### 侧边栏样式
- 宽度：200px
- 背景：`var(--bg-secondary)`
- 激活项：`var(--accent)`，白色文字
- Hover：`var(--bg-hover)`
- 图标 + 文字布局，类似 ActivityBar

### 内容区样式
- Padding：32px
- 最大宽度：800px
- 卡片式布局
- 统一间距和圆角

---

## 🔧 AI Provider 重构

### 当前问题
1. 配置界面复杂（2719 行代码）
2. Provider 类型太多，逻辑分散
3. 错误处理不统一
4. 测试流程繁琐

### 新的 Provider 结构（后端）

```typescript
// 简化的 Provider 配置
interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom' | 'ollama'
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}

// IPC 接口
interface AIProviderIPC {
  'ai:get-providers': () => AIProviderConfig[]
  'ai:save-provider': (config: AIProviderConfig) => void
  'ai:delete-provider': (params: { id: string }) => void
  'ai:test-provider': (config: AIProviderConfig) => TestResult
}

interface TestResult {
  ok: boolean
  text: string
  latencyMs?: number
  model?: string
}
```

### UI 简化方案

**卡片列表视图**：
- 显示已配置的 Provider
- 卡片显示：名称、模型、状态
- 操作：编辑、删除、测试

**编辑弹窗**：
- 基本信息：名称、API Key、Base URL、模型
- 快速设置按钮：OpenAI、Claude、DeepSeek 等
- 测试按钮：验证连接
- 保存按钮

---

## 📋 所有设置页面清单

### 1. 外观 (Appearance)
- 主题选择（11 个主题）
- 强调色选择器
- 主题包管理
- CSS 片段管理
- 语言切换

### 2. AI 提供商 (AI)
- Provider 列表
- 添加/编辑 Provider
- 测试连接
- 删除 Provider

### 3. 云端同步 (Cloud)
- 同步状态
- 冲突处理
- 同步历史

### 4. 插件 (Plugins)
- 已安装插件列表
- 启用/禁用插件
- 插件设置

### 5. 快捷键 (Keys)
- 快捷键列表
- 自定义快捷键
- 重置默认

### 6. 主动建议 (Proactive)
- 主动功能开关
- 建议频率设置

### 7. 记忆账本 (Long Context)
- 记忆调试面板
- 记忆统计

---

## 🎨 UI 组件结构

```
components/settings/
├── Settings.tsx              // 主容器
├── SettingsSidebar.tsx       // 侧边栏导航
├── SettingsSidebar.css
├── pages/
│   ├── AppearanceSettings.tsx
│   ├── AIProviderSettings.tsx
│   ├── CloudSyncSettings.tsx
│   ├── PluginsSettings.tsx
│   ├── KeysSettings.tsx
│   ├── ProactiveSettings.tsx
│   └── LongContextSettings.tsx
└── shared/
    ├── SettingsPage.css      // 共享样式
    └── SettingsCard.tsx      // 卡片组件
```

---

## 🚀 实施计划

### Phase 1: 基础框架（我）
- [x] 创建 SettingsSidebar 组件
- [ ] 创建 Settings 主容器
- [ ] 创建共享样式系统
- [ ] 创建 SettingsCard 组件

### Phase 2: AI Provider（我 + Codex）
**我的部分**：
- [ ] 创建 AIProviderSettings UI
- [ ] Provider 列表卡片
- [ ] 编辑弹窗
- [ ] 测试按钮

**Codex 的部分**：
- [ ] 简化 AIProviderConfig 类型
- [ ] 实现 `ai:get-providers` IPC
- [ ] 实现 `ai:save-provider` IPC
- [ ] 实现 `ai:delete-provider` IPC
- [ ] 实现 `ai:test-provider` IPC
- [ ] 重构 Provider 存储逻辑
- [ ] 统一错误处理

### Phase 3: 其他页面（我）
- [ ] AppearanceSettings（主题、强调色、CSS）
- [ ] CloudSyncSettings（同步状态）
- [ ] PluginsSettings（插件管理）
- [ ] KeysSettings（快捷键）
- [ ] ProactiveSettings（主动建议）
- [ ] LongContextSettings（记忆调试）

### Phase 4: 集成测试
- [ ] 端到端测试
- [ ] 样式一致性检查
- [ ] 性能优化

---

## 📝 Codex 任务清单

### 1. 简化 AIProviderConfig 类型

**当前类型**（太复杂）：
```typescript
// 省略，有多个字段和复杂的类型联合
```

**目标类型**（简化）：
```typescript
interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom' | 'ollama'
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}
```

### 2. 实现新的 IPC 接口

**需要实现的接口**：
```typescript
'ai:get-providers': () => AIProviderConfig[]
'ai:save-provider': (config: AIProviderConfig) => void
'ai:delete-provider': (params: { id: string }) => void
'ai:test-provider': (config: AIProviderConfig) => { ok: boolean; text: string; latencyMs?: number }
```

**存储位置**：
- 建议存储在数据库或配置文件中
- 支持多个 Provider 配置
- 支持启用/禁用状态

### 3. Provider 测试逻辑

**测试内容**：
- 发送简单的测试请求
- 验证 API Key 有效性
- 检查 Base URL 连通性
- 测量响应延迟
- 返回模型信息

**错误处理**：
- 统一错误格式
- 明确错误类型（API Key 错误、网络错误、模型不存在等）
- 提供友好的错误提示

### 4. 迁移现有配置

**兼容性**：
- 读取旧的 Provider 配置
- 自动迁移到新格式
- 保持向后兼容

---

## ✅ 验收标准

### UI 标准
- [ ] 所有页面样式统一
- [ ] 侧边栏导航流畅
- [ ] 响应式布局正常
- [ ] 无样式冲突

### 功能标准
- [ ] AI Provider 增删改查正常
- [ ] Provider 测试功能正常
- [ ] 所有设置页面功能完整
- [ ] 无类型错误

### 性能标准
- [ ] 设置弹窗打开 <200ms
- [ ] Provider 测试 <3s
- [ ] 无内存泄漏

---

## 📊 估算工作量

### UI 部分（我）
- 基础框架：2小时
- AI Provider UI：3小时
- 其他页面：6小时
- 集成测试：2小时
**总计：13小时**

### 后端部分（Codex）
- 简化类型：1小时
- IPC 实现：3小时
- 测试逻辑：2小时
- 迁移逻辑：2小时
**总计：8小时**

---

**下一步**：我继续创建基础框架，Codex 开始重构 Provider 后端逻辑。
