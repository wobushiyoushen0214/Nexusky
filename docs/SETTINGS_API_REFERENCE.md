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
