import { create } from 'zustand'
import { safeGetJSON, safeRemove, safeSetJSON } from '../utils/storage'

export interface KeyBinding {
  id: string
  label: string
  defaultKey: string
  customKey: string | null
}

const DEFAULT_BINDINGS: KeyBinding[] = [
  { id: 'save', label: '保存', defaultKey: 'Ctrl+S', customKey: null },
  { id: 'new-note', label: '新建笔记', defaultKey: 'Ctrl+N', customKey: null },
  { id: 'quick-switch', label: '快速切换', defaultKey: 'Ctrl+O', customKey: null },
  { id: 'search', label: '全文搜索', defaultKey: 'Ctrl+Shift+F', customKey: null },
  { id: 'graph', label: '知识图谱', defaultKey: 'Ctrl+G', customKey: null },
  { id: 'bases', label: '属性视图', defaultKey: 'Ctrl+Shift+D', customKey: null },
  { id: 'chat', label: 'AI 对话', defaultKey: 'Ctrl+L', customKey: null },
  { id: 'outline', label: '大纲', defaultKey: 'Ctrl+E', customKey: null },
  { id: 'settings', label: '设置', defaultKey: 'Ctrl+,', customKey: null },
  { id: 'command-palette', label: '命令面板', defaultKey: 'Ctrl+Shift+P', customKey: null },
  { id: 'sidebar', label: '切换侧边栏', defaultKey: 'Ctrl+Shift+B', customKey: null },
  { id: 'sync', label: '云端同步', defaultKey: 'Ctrl+Shift+S', customKey: null },
  { id: 'find-replace', label: '搜索替换', defaultKey: 'Ctrl+H', customKey: null },
  { id: 'focus', label: '聚焦模式', defaultKey: 'F11', customKey: null },
]

interface KeyBindingState {
  bindings: KeyBinding[]
  getKey: (id: string) => string
  setCustomKey: (id: string, key: string | null) => void
  resetAll: () => void
}

function loadBindings(): KeyBinding[] {
  const custom = safeGetJSON<Record<string, string>>('nexusky-keybindings', {})
  return DEFAULT_BINDINGS.map((b) => ({ ...b, customKey: custom[b.id] || null }))
}

function saveBindings(bindings: KeyBinding[]): void {
  const custom: Record<string, string> = {}
  for (const b of bindings) {
    if (b.customKey) custom[b.id] = b.customKey
  }
  safeSetJSON('nexusky-keybindings', custom)
}

export const useKeyBindingStore = create<KeyBindingState>((set, get) => ({
  bindings: loadBindings(),

  getKey: (id) => {
    const b = get().bindings.find((b) => b.id === id)
    return b?.customKey || b?.defaultKey || ''
  },

  setCustomKey: (id, key) => {
    if (key) {
      const conflict = get().bindings.find((b) => b.id !== id && (b.customKey || b.defaultKey) === key)
      if (conflict) {
        const { toast } = require('./toast-store')
        toast(`快捷键 ${key} 与「${conflict.label}」冲突`, 'error')
        return
      }
    }
    const bindings = get().bindings.map((b) => b.id === id ? { ...b, customKey: key } : b)
    saveBindings(bindings)
    set({ bindings })
  },

  resetAll: () => {
    const bindings = DEFAULT_BINDINGS.map((b) => ({ ...b, customKey: null }))
    safeRemove('nexusky-keybindings')
    set({ bindings })
  },
}))
