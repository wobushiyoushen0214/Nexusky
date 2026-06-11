# Settings Backend API Reference

## KeysSettings - 快捷键设置

### 获取快捷键列表

```typescript
const keybindings = await window.api.invoke('settings:get-keybindings')
```

**返回值**:
```typescript
Array<{
  id: string          // 'save-note', 'new-note', etc.
  label: string       // '保存笔记', '新建笔记'
  key: string         // 'Cmd+S', 'Ctrl+N'
  description: string // '保存当前笔记'
}>
```

### 设置自定义快捷键

```typescript
const result = await window.api.invoke('settings:set-keybinding', {
  id: 'save-note',
  key: 'Ctrl+S'
})
// result: { ok: true } or { ok: false, error: string }
```

### 重置快捷键为默认值

```typescript
const result = await window.api.invoke('settings:reset-keybinding', {
  id: 'save-note'
})
// result: { ok: true }
```

## 使用示例

```typescript
import { useEffect, useState } from 'react'
import type { KeybindingEntry } from '@shared/types/ipc'

function KeysSettings() {
  const [keybindings, setKeybindings] = useState<KeybindingEntry[]>([])

  useEffect(() => {
    loadKeybindings()
  }, [])

  const loadKeybindings = async () => {
    const data = await window.api.invoke('settings:get-keybindings')
    setKeybindings(data)
  }

  const handleSetKeybinding = async (id: string, key: string) => {
    const result = await window.api.invoke('settings:set-keybinding', { id, key })
    if (result.ok) {
      await loadKeybindings() // 刷新列表
    }
  }

  const handleReset = async (id: string) => {
    await window.api.invoke('settings:reset-keybinding', { id })
    await loadKeybindings() // 刷新列表
  }

  return (
    <div>
      {keybindings.map(binding => (
        <div key={binding.id}>
          <span>{binding.label}</span>
          <span>{binding.key}</span>
          <button onClick={() => handleReset(binding.id)}>重置</button>
        </div>
      ))}
    </div>
  )
}
```

## 默认快捷键

| ID | 标签 | 默认快捷键 | 描述 |
|---|---|---|---|
| save-note | 保存笔记 | Cmd+S | 保存当前笔记 |
| new-note | 新建笔记 | Cmd+N | 创建新笔记 |
| search | 搜索 | Cmd+F | 打开搜索面板 |
| command-palette | 命令面板 | Cmd+P | 打开命令面板 |
| toggle-sidebar | 切换侧边栏 | Cmd+B | 显示/隐藏侧边栏 |

## 注意事项

1. **持久化**: 用户自定义的快捷键会自动保存到 Electron store
2. **合并逻辑**: 自定义快捷键会覆盖默认值，未自定义的保持默认
3. **重置行为**: 重置会删除自定义值，恢复为默认快捷键
4. **跨平台**: 前端需要处理 Cmd (macOS) 和 Ctrl (Windows/Linux) 的显示差异

---

## LongContextSettings - 记忆账本设置

### 获取记忆配置

```typescript
const config = await window.api.invoke('settings:get-memory-config')
```

**返回值**:
```typescript
{
  enabled: boolean       // 是否启用记忆功能
  autoGenerate: boolean  // 是否自动生成记忆
  retentionDays: number  // 记忆保留天数
  maxTokens: number      // 最大 token 数量
}
```

### 保存记忆配置

```typescript
const result = await window.api.invoke('settings:save-memory-config', {
  enabled: true,
  autoGenerate: false,
  retentionDays: 90,
  maxTokens: 100000
})
// result: { ok: true }
```

## 使用示例

```typescript
import { useEffect, useState } from 'react'
import type { MemoryConfig } from '@shared/types/ipc'

function LongContextSettings() {
  const [config, setConfig] = useState<MemoryConfig>({
    enabled: true,
    autoGenerate: false,
    retentionDays: 90,
    maxTokens: 100000
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    const data = await window.api.invoke('settings:get-memory-config')
    setConfig(data)
  }

  const handleSave = async () => {
    const result = await window.api.invoke('settings:save-memory-config', config)
    if (result.ok) {
      // 显示成功消息
    }
  }

  const handleChange = (field: keyof MemoryConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => handleChange('enabled', e.target.checked)}
        />
        启用记忆功能
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.autoGenerate}
          onChange={(e) => handleChange('autoGenerate', e.target.checked)}
        />
        自动生成记忆
      </label>
      <label>
        保留天数:
        <input
          type="number"
          value={config.retentionDays}
          onChange={(e) => handleChange('retentionDays', parseInt(e.target.value))}
        />
      </label>
      <label>
        最大 Tokens:
        <input
          type="number"
          value={config.maxTokens}
          onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
        />
      </label>
      <button onClick={handleSave}>保存</button>
    </div>
  )
}
```

## 默认配置

| 字段 | 默认值 | 说明 |
|---|---|---|
| enabled | true | 记忆功能启用状态 |
| autoGenerate | false | 是否自动生成记忆 |
| retentionDays | 90 | 记忆保留 90 天 |
| maxTokens | 100000 | 最大 10 万 tokens |

## 注意事项

1. **持久化**: 配置自动保存到 Electron store
2. **默认值**: 首次获取时使用默认配置
3. **部分更新**: 保存时会覆盖整个配置对象
4. **验证**: 前端应该验证输入值的范围（如 retentionDays > 0）
