import { ipcMain } from 'electron'
import { store } from '../services/store'

export interface KeybindingEntry {
  id: string
  label: string
  key: string
  description: string
}

const DEFAULT_KEYBINDINGS: KeybindingEntry[] = [
  { id: 'save-note', label: '保存笔记', key: 'Cmd+S', description: '保存当前笔记' },
  { id: 'new-note', label: '新建笔记', key: 'Cmd+N', description: '创建新笔记' },
  { id: 'search', label: '搜索', key: 'Cmd+F', description: '打开搜索面板' },
  { id: 'command-palette', label: '命令面板', key: 'Cmd+P', description: '打开命令面板' },
  { id: 'toggle-sidebar', label: '切换侧边栏', key: 'Cmd+B', description: '显示/隐藏侧边栏' }
]

function getStoredKeybindings(): Record<string, string> {
  return (store.get('keybindings') as Record<string, string> | undefined) || {}
}

function mergeKeybindings(): KeybindingEntry[] {
  const custom = getStoredKeybindings()
  return DEFAULT_KEYBINDINGS.map(binding => ({
    ...binding,
    key: custom[binding.id] || binding.key
  }))
}

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:get-keybindings', () => {
    return mergeKeybindings()
  })

  ipcMain.handle('settings:set-keybinding', (_event, params: { id: string; key: string }) => {
    const custom = getStoredKeybindings()
    custom[params.id] = params.key
    store.set('keybindings', custom)
    return { ok: true }
  })

  ipcMain.handle('settings:reset-keybinding', (_event, params: { id: string }) => {
    const custom = getStoredKeybindings()
    delete custom[params.id]
    store.set('keybindings', custom)
    return { ok: true }
  })
}
