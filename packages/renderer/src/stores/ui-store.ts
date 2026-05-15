import { create } from 'zustand'

type Panel = 'none' | 'chat' | 'outline' | 'tags' | 'calendar' | 'kanban' | 'history'
type Theme = 'dark' | 'light' | 'ocean' | 'amber' | 'forest' | 'rose' | 'minimal'
type MainView = 'editor' | 'graph'

interface UIState {
  rightPanel: Panel
  mainView: MainView
  sidebarCollapsed: boolean
  sidebarWidth: number
  rightPanelWidth: number
  focusMode: boolean
  previewMode: boolean
  quickSwitcherOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  commandPaletteOpen: boolean
  theme: Theme
  setRightPanel: (panel: Panel) => void
  toggleRightPanel: (panel: Panel) => void
  setMainView: (view: MainView) => void
  toggleSidebar: () => void
  toggleFocusMode: () => void
  togglePreviewMode: () => void
  setSidebarWidth: (width: number) => void
  setRightPanelWidth: (width: number) => void
  setCommandPaletteOpen: (open: boolean) => void
  resizeSidebar: (delta: number) => void
  resizeRightPanel: (delta: number) => void
  setQuickSwitcherOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('nexusky-theme')
    if (saved && ['dark', 'light', 'ocean', 'amber', 'forest', 'rose', 'minimal'].includes(saved)) return saved as Theme
  } catch {}
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  try {
    localStorage.setItem('nexusky-theme', theme)
  } catch {}
}

function getInitialSidebarWidth(): number {
  try {
    const saved = localStorage.getItem('nexusky-sidebar-width')
    if (saved) return Math.max(180, Math.min(400, Number(saved)))
  } catch {}
  return 240
}

function getInitialRightPanelWidth(): number {
  try {
    const saved = localStorage.getItem('nexusky-right-panel-width')
    if (saved) return Math.max(260, Math.min(600, Number(saved)))
  } catch {}
  return 360
}

const initialTheme = getInitialTheme()
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
}

export const useUIStore = create<UIState>((set, get) => ({
  rightPanel: 'none',
  mainView: 'editor' as MainView,
  sidebarCollapsed: false,
  sidebarWidth: getInitialSidebarWidth(),
  rightPanelWidth: getInitialRightPanelWidth(),
  focusMode: false,
  previewMode: false,
  quickSwitcherOpen: false,
  settingsOpen: false,
  searchOpen: false,
  commandPaletteOpen: false,
  theme: initialTheme,

  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => set({ rightPanel: get().rightPanel === panel ? 'none' : panel }),
  setMainView: (view) => set({ mainView: view }),
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  toggleFocusMode: () => {
    const entering = !get().focusMode
    set({ focusMode: entering, sidebarCollapsed: entering ? true : false, rightPanel: entering ? 'none' : get().rightPanel })
  },
  togglePreviewMode: () => set({ previewMode: !get().previewMode }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(400, width)) }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(260, Math.min(600, width)) }),
  resizeSidebar: (delta: number) => {
    const width = Math.max(180, Math.min(400, get().sidebarWidth + delta))
    localStorage.setItem('nexusky-sidebar-width', String(width))
    set({ sidebarWidth: width })
  },
  resizeRightPanel: (delta: number) => {
    const width = Math.max(260, Math.min(600, get().rightPanelWidth + delta))
    localStorage.setItem('nexusky-right-panel-width', String(width))
    set({ rightPanelWidth: width })
  },
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => {
    const themes: Theme[] = ['dark', 'light', 'ocean', 'amber', 'forest', 'rose', 'minimal']
    const idx = themes.indexOf(get().theme)
    const next = themes[(idx + 1) % themes.length]
    applyTheme(next)
    set({ theme: next })
  },
}))
