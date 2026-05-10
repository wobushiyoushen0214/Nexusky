import { create } from 'zustand'

type Panel = 'none' | 'graph' | 'chat' | 'outline'
type Theme = 'dark' | 'light'
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
    if (saved === 'light' || saved === 'dark') return saved
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

const initialTheme = getInitialTheme()
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
}

export const useUIStore = create<UIState>((set, get) => ({
  rightPanel: 'none',
  mainView: 'editor' as MainView,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  rightPanelWidth: 360,
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
  resizeSidebar: (delta: number) => set((s) => ({ sidebarWidth: Math.max(180, Math.min(400, s.sidebarWidth + delta)) })),
  resizeRightPanel: (delta: number) => set((s) => ({ rightPanelWidth: Math.max(260, Math.min(600, s.rightPanelWidth + delta)) })),
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
}))
