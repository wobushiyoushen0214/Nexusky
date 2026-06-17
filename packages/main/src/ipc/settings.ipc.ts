import { ipcMain } from 'electron'
import type { ProactiveConfig } from '@shared/types/ipc'
import { store } from '../services/store'
import { getProactivePrefs, setProactivePrefs } from '../services/proactive/proactive-prefs'

export interface KeybindingEntry {
  id: string
  label: string
  key: string
  description: string
}

export interface MemoryConfig {
  enabled: boolean
  autoGenerate: boolean
  retentionDays: number
  maxTokens: number
}

const DEFAULT_KEYBINDINGS: KeybindingEntry[] = [
  { id: 'save-note', label: '保存笔记', key: 'Cmd+S', description: '保存当前笔记' },
  { id: 'new-note', label: '新建笔记', key: 'Cmd+N', description: '创建新笔记' },
  { id: 'search', label: '搜索', key: 'Cmd+F', description: '打开搜索面板' },
  { id: 'command-palette', label: '命令面板', key: 'Cmd+P', description: '打开命令面板' },
  { id: 'toggle-sidebar', label: '切换侧边栏', key: 'Cmd+B', description: '显示/隐藏侧边栏' }
]

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  autoGenerate: false,
  retentionDays: 90,
  maxTokens: 100000
}

const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  frequency: 'medium',
  categories: []
}

const VALID_PROACTIVE_FREQUENCIES = new Set<ProactiveConfig['frequency']>(['low', 'medium', 'high'])

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

function getMemoryConfig(): MemoryConfig {
  const stored = store.get('memoryConfig') as Partial<MemoryConfig> | undefined
  return { ...DEFAULT_MEMORY_CONFIG, ...stored }
}

function normalizeProactiveConfig(input: Partial<ProactiveConfig> | undefined): ProactiveConfig {
  const frequency = input?.frequency && VALID_PROACTIVE_FREQUENCIES.has(input.frequency)
    ? input.frequency
    : DEFAULT_PROACTIVE_CONFIG.frequency
  const categories = Array.isArray(input?.categories)
    ? Array.from(new Set(input.categories.filter((category): category is string => typeof category === 'string' && category.length > 0)))
    : DEFAULT_PROACTIVE_CONFIG.categories

  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : DEFAULT_PROACTIVE_CONFIG.enabled,
    frequency,
    categories
  }
}

function getProactiveConfig(): ProactiveConfig {
  const stored = store.get('proactiveConfig') as Partial<ProactiveConfig> | undefined
  return normalizeProactiveConfig({
    ...DEFAULT_PROACTIVE_CONFIG,
    enabled: getProactivePrefs().enabled,
    ...stored
  })
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

  ipcMain.handle('settings:get-memory-config', () => {
    return getMemoryConfig()
  })

  ipcMain.handle('settings:save-memory-config', (_event, params: MemoryConfig) => {
    store.set('memoryConfig', params)
    return { ok: true }
  })

  ipcMain.handle('settings:get-proactive-config', () => {
    return getProactiveConfig()
  })

  ipcMain.handle('settings:save-proactive-config', (_event, params: ProactiveConfig) => {
    const next = normalizeProactiveConfig(params)
    store.set('proactiveConfig', next)
    setProactivePrefs({ enabled: next.enabled })
    return { ok: true }
  })
}
