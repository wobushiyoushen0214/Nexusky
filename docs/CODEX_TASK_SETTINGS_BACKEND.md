# Codex Task: 实现 Settings 页面后端

## 任务概述
为 Settings 的 5 个页面实现后端 IPC 接口和业务逻辑。

---

## 1. KeysSettings（快捷键设置）- 优先级 P0

### 前端已实现
- UI: `/packages/renderer/src/components/settings/pages/KeysSettings.tsx`
- 样式: `/packages/renderer/src/components/settings/pages/KeysSettings.css`

### 需要实现的 IPC 接口

#### 1.1 获取快捷键列表
```typescript
'settings:get-keybindings': {
  params: undefined
  result: Array<{
    id: string
    label: string
    key: string
    description: string
  }>
}
```

**说明**：
- 返回所有快捷键绑定
- `id`: 快捷键唯一标识（如 'save-note', 'new-note'）
- `label`: 显示名称（如 '保存笔记', '新建笔记'）
- `key`: 当前绑定的快捷键（如 'Cmd+S', 'Ctrl+N'）
- `description`: 描述文字

**默认快捷键建议**：
```json
[
  { "id": "save-note", "label": "保存笔记", "key": "Cmd+S", "description": "保存当前笔记" },
  { "id": "new-note", "label": "新建笔记", "key": "Cmd+N", "description": "创建新笔记" },
  { "id": "search", "label": "搜索", "key": "Cmd+F", "description": "打开搜索面板" },
  { "id": "command-palette", "label": "命令面板", "key": "Cmd+P", "description": "打开命令面板" },
  { "id": "toggle-sidebar", "label": "切换侧边栏", "key": "Cmd+B", "description": "显示/隐藏侧边栏" }
]
```

#### 1.2 设置快捷键
```typescript
'settings:set-keybinding': {
  params: { id: string; key: string }
  result: { ok: boolean; error?: string }
}
```

**说明**：
- 保存用户自定义的快捷键
- 存储位置：建议存在用户配置文件或数据库
- 需要验证快捷键格式
- 需要检查冲突（可选）

#### 1.3 重置快捷键
```typescript
'settings:reset-keybinding': {
  params: { id: string }
  result: { ok: boolean }
}
```

**说明**：
- 重置为默认快捷键
- 从配置中删除用户自定义值

---

## 2. CloudSyncSettings（云端同步）- 优先级 P1

### 前端已实现
- UI: `/packages/renderer/src/components/settings/pages/CloudSyncSettings.tsx`
- 当前状态：显示"未配置"占位符

### 需要实现的功能

#### 2.1 获取同步状态
```typescript
'settings:get-sync-status': {
  params: undefined
  result: {
    configured: boolean
    provider?: 'supabase' | 'webdav' | 's3'
    lastSync?: number
    status?: 'idle' | 'syncing' | 'error'
    error?: string
  }
}
```

#### 2.2 配置同步
```typescript
'settings:configure-sync': {
  params: {
    provider: 'supabase' | 'webdav' | 's3'
    config: Record<string, string>
  }
  result: { ok: boolean; error?: string }
}
```

**说明**：
- 这个功能可能需要较大改动
- 建议先返回占位数据
- 完整实现需要同步引擎

---

## 3. PluginsSettings（插件管理）- 优先级 P2

### 需要实现的 IPC 接口

#### 3.1 获取已安装插件
```typescript
'settings:get-installed-plugins': {
  params: undefined
  result: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
    description?: string
  }>
}
```

#### 3.2 切换插件启用状态
```typescript
'settings:toggle-plugin': {
  params: { id: string; enabled: boolean }
  result: { ok: boolean }
}
```

**说明**：
- 如果还没有插件系统，返回空数组
- 后续可以扩展

---

## 4. ProactiveSettings（主动建议）- 优先级 P2

### 需要实现的 IPC 接口

#### 4.1 获取主动建议配置
```typescript
'settings:get-proactive-config': {
  params: undefined
  result: {
    enabled: boolean
    frequency: 'low' | 'medium' | 'high'
    categories: string[]
  }
}
```

#### 4.2 保存主动建议配置
```typescript
'settings:save-proactive-config': {
  params: {
    enabled: boolean
    frequency: 'low' | 'medium' | 'high'
    categories: string[]
  }
  result: { ok: boolean }
}
```

---

## 5. LongContextSettings（记忆账本）- 优先级 P1

### 需要实现的 IPC 接口

#### 5.1 获取记忆配置
```typescript
'settings:get-memory-config': {
  params: undefined
  result: {
    enabled: boolean
    autoGenerate: boolean
    retentionDays: number
    maxTokens: number
  }
}
```

#### 5.2 保存记忆配置
```typescript
'settings:save-memory-config': {
  params: {
    enabled: boolean
    autoGenerate: boolean
    retentionDays: number
    maxTokens: number
  }
  result: { ok: boolean }
}
```

---

## 实现建议

### 优先级
1. **P0: KeysSettings** - 最独立，最容易实现
2. **P1: LongContextSettings** - 与现有 Memory Timeline 相关
3. **P1: CloudSyncSettings** - 重要但复杂
4. **P2: PluginsSettings** - 依赖插件系统
5. **P2: ProactiveSettings** - 依赖 AI 功能

### 存储方案
- 快捷键：`~/.nexusky/keybindings.json`
- 其他配置：`~/.nexusky/settings.json` 或数据库

### 类型定义
所有类型添加到：`/packages/shared/src/types/ipc.ts`

---

## 验收标准

### KeysSettings
- [ ] 能加载默认快捷键列表
- [ ] 能自定义快捷键
- [ ] 能重置到默认值
- [ ] 配置持久化保存

### 其他页面
- [ ] 返回占位数据或真实数据
- [ ] 不会报错
- [ ] 类型定义完整

---

## 测试要求

创建测试文件验证：
1. 获取默认快捷键
2. 修改快捷键
3. 重置快捷键
4. 配置持久化

---

请按优先级实现，优先完成 **KeysSettings (P0)**。
