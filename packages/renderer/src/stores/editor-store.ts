import { create } from 'zustand'
import { useVaultStore } from './vault-store'

interface Tab {
  path: string
  content: string
  isDirty: boolean
}

interface EditorState {
  tabs: Tab[]
  activeTabIndex: number
  currentFilePath: string | null
  content: string
  isDirty: boolean
  recentFiles: string[]
  setContent: (content: string) => void
  setCurrentFile: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  openFile: (path: string) => Promise<void>
  closeTab: (index: number) => Promise<void>
  switchTab: (index: number) => void
  saveFile: () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabIndex: -1,
  currentFilePath: null,
  content: '',
  isDirty: false,
  recentFiles: JSON.parse(localStorage.getItem('nexusky-recent') || '[]'),

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

    if (activeTabIndex >= 0 && tabs[activeTabIndex]?.isDirty) {
      await get().saveFile()
    }

    const content = await window.api.invoke('file:read', { path })
    const newTab: Tab = { path, content, isDirty: false }
    const newTabs = [...tabs, newTab]

    const recent = [path, ...get().recentFiles.filter((p) => p !== path)].slice(0, 10)
    localStorage.setItem('nexusky-recent', JSON.stringify(recent))
    set({ tabs: newTabs, activeTabIndex: newTabs.length - 1, currentFilePath: path, content, isDirty: false, recentFiles: recent })
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

  saveFile: async () => {
    const { currentFilePath, content, tabs, activeTabIndex } = get()
    if (!currentFilePath) return
    await window.api.invoke('file:write', { path: currentFilePath, content })

    if (activeTabIndex >= 0 && activeTabIndex < tabs.length) {
      const updated = [...tabs]
      updated[activeTabIndex] = { ...updated[activeTabIndex], isDirty: false }
      set({ isDirty: false, tabs: updated })
    } else {
      set({ isDirty: false })
    }

    const vaultPath = useVaultStore.getState().vaultPath
    if (vaultPath) {
      window.api.invoke('db:index-file', { vaultPath, filePath: currentFilePath })
      window.api.invoke('cloud:push-file', { vaultPath, filePath: currentFilePath })
    }
  }
}))
