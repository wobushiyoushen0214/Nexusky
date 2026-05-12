import { create } from 'zustand'
import { useVaultStore } from './vault-store'
import { toast } from './toast-store'

interface Tab {
  path: string
  content: string
  isDirty: boolean
  pinned?: boolean
}

interface EditorState {
  tabs: Tab[]
  activeTabIndex: number
  currentFilePath: string | null
  content: string
  isDirty: boolean
  recentFiles: string[]
  splitPath: string | null
  splitContent: string | null
  setContent: (content: string) => void
  setCurrentFile: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  openFile: (path: string) => Promise<void>
  closeTab: (index: number) => Promise<void>
  closeOtherTabs: (index: number) => void
  closeTabsToRight: (index: number) => void
  switchTab: (index: number) => void
  reorderTab: (from: number, to: number) => void
  saveFile: () => Promise<void>
  openSplit: (path: string) => Promise<void>
  closeSplit: () => void
  pinTab: (index: number) => void
  unpinTab: (index: number) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabIndex: -1,
  currentFilePath: null,
  content: '',
  isDirty: false,
  recentFiles: JSON.parse(localStorage.getItem('nexusky-recent') || '[]'),
  splitPath: null,
  splitContent: null,

  setCurrentFile: (path) => set({ currentFilePath: path }),
  setContent: (content) => {
    const { tabs, activeTabIndex } = get()
    if (activeTabIndex >= 0 && activeTabIndex < tabs.length) {
      const updated = [...tabs]
      updated[activeTabIndex] = { ...updated[activeTabIndex], content, isDirty: true }
      set({ content, isDirty: true, tabs: updated })
    } else {
      set({ content, isDirty: true })
    }
  },
  setDirty: (dirty) => set({ isDirty: dirty }),

  openFile: async (path) => {
    const { tabs, activeTabIndex } = get()

    const existingIndex = tabs.findIndex((t) => t.path === path)
    if (existingIndex >= 0) {
      const tab = tabs[existingIndex]
      set({ activeTabIndex: existingIndex, currentFilePath: path, content: tab.content, isDirty: tab.isDirty })
      return
    }

    try {
      const fileStat = await window.api.invoke('file:stat', { path })
      if (fileStat.size > 512000) {
        toast('大文件加载中，可能需要几秒...', 'info')
      }
    } catch {
      toast('文件不存在或无法访问', 'error')
      return
    }

    if (activeTabIndex >= 0 && tabs[activeTabIndex]?.isDirty) {
      await get().saveFile()
    }

    try {
      const content = await window.api.invoke('file:read', { path })
      const newTab: Tab = { path, content, isDirty: false }
      let newTabs = [...tabs, newTab]

      const MAX_TABS = 30
      if (newTabs.length > MAX_TABS) {
        const closeable = newTabs.findIndex((t, i) => !t.isDirty && !t.pinned && i !== newTabs.length - 1)
        if (closeable >= 0) {
          newTabs = newTabs.filter((_, i) => i !== closeable)
        }
      }

      const recent = [path, ...get().recentFiles.filter((p) => p !== path)].slice(0, 10)
      localStorage.setItem('nexusky-recent', JSON.stringify(recent))
      set({ tabs: newTabs, activeTabIndex: newTabs.length - 1, currentFilePath: path, content, isDirty: false, recentFiles: recent })
    } catch (e: any) {
      toast(`打开文件失败: ${e.message || '未知错误'}`, 'error')
    }
  },

  closeTab: async (index) => {
    const { tabs, activeTabIndex } = get()
    if (index < 0 || index >= tabs.length) return

    if (tabs[index].isDirty) {
      const prev = get().currentFilePath
      set({ currentFilePath: tabs[index].path, content: tabs[index].content })
      await get().saveFile()
      if (prev !== tabs[index].path) set({ currentFilePath: prev })
    }

    const newTabs = tabs.filter((_, i) => i !== index)
    let newActive = activeTabIndex
    if (newTabs.length === 0) {
      set({ tabs: [], activeTabIndex: -1, currentFilePath: null, content: '', isDirty: false })
      return
    }
    if (index <= activeTabIndex) {
      newActive = Math.max(0, activeTabIndex - 1)
    }
    if (newActive >= newTabs.length) newActive = newTabs.length - 1
    const tab = newTabs[newActive]
    set({ tabs: newTabs, activeTabIndex: newActive, currentFilePath: tab.path, content: tab.content, isDirty: tab.isDirty })
  },

  switchTab: (index) => {
    const { tabs } = get()
    if (index < 0 || index >= tabs.length) return
    const tab = tabs[index]
    set({ activeTabIndex: index, currentFilePath: tab.path, content: tab.content, isDirty: tab.isDirty })
  },

  reorderTab: (from, to) => {
    const { tabs, activeTabIndex } = get()
    if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return
    const newTabs = [...tabs]
    const [moved] = newTabs.splice(from, 1)
    newTabs.splice(to, 0, moved)
    let newActive = activeTabIndex
    if (activeTabIndex === from) newActive = to
    else if (from < activeTabIndex && to >= activeTabIndex) newActive--
    else if (from > activeTabIndex && to <= activeTabIndex) newActive++
    set({ tabs: newTabs, activeTabIndex: newActive })
  },

  closeOtherTabs: (index) => {
    const { tabs } = get()
    if (index < 0 || index >= tabs.length) return
    const kept = tabs[index]
    set({ tabs: [kept], activeTabIndex: 0, currentFilePath: kept.path, content: kept.content, isDirty: kept.isDirty })
  },

  closeTabsToRight: (index) => {
    const { tabs, activeTabIndex } = get()
    if (index < 0 || index >= tabs.length - 1) return
    const newTabs = tabs.slice(0, index + 1)
    const newActive = Math.min(activeTabIndex, newTabs.length - 1)
    const tab = newTabs[newActive]
    set({ tabs: newTabs, activeTabIndex: newActive, currentFilePath: tab.path, content: tab.content, isDirty: tab.isDirty })
  },

  saveFile: async () => {
    const { currentFilePath, content, tabs, activeTabIndex, isDirty } = get()
    if (!currentFilePath || !isDirty) return
    const vaultPath = useVaultStore.getState().vaultPath
    try {
      await window.api.invoke('file:write', { path: currentFilePath, content, vaultPath: vaultPath || undefined })
    } catch (e: any) {
      toast(`保存失败: ${e.message || '未知错误'}`, 'error')
      return
    }

    if (activeTabIndex >= 0 && activeTabIndex < tabs.length) {
      const updated = [...tabs]
      updated[activeTabIndex] = { ...updated[activeTabIndex], isDirty: false }
      set({ isDirty: false, tabs: updated })
    } else {
      set({ isDirty: false })
    }

    if (vaultPath) {
      window.api.invoke('db:index-file', { vaultPath, filePath: currentFilePath }).catch(() => {})
      window.api.invoke('cloud:push-file', { vaultPath, filePath: currentFilePath }).catch(() => {})

      // AI tag suggestion (async, non-blocking)
      if (content.length > 100 && !content.includes('#')) {
        window.api.invoke('ai:suggest-tags', { content: content.slice(0, 2000), existingTags: [] }).then((tags) => {
          if (tags.length > 0) {
            toast(`建议标签: ${tags.map((t) => '#' + t).join(' ')}`, 'info')
          }
        }).catch(() => {})
      }
    }
  },

  openSplit: async (path) => {
    const content = await window.api.invoke('file:read', { path })
    set({ splitPath: path, splitContent: content })
  },

  closeSplit: () => set({ splitPath: null, splitContent: null }),

  pinTab: (index) => {
    const { tabs } = get()
    if (index < 0 || index >= tabs.length) return
    const updated = [...tabs]
    updated[index] = { ...updated[index], pinned: true }
    set({ tabs: updated })
  },

  unpinTab: (index) => {
    const { tabs } = get()
    if (index < 0 || index >= tabs.length) return
    const updated = [...tabs]
    updated[index] = { ...updated[index], pinned: false }
    set({ tabs: updated })
  }
}))
