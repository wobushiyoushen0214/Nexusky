import { create } from 'zustand'

type Panel = 'none' | 'graph' | 'chat' | 'outline'
type Theme = 'dark' | 'light'

interface UIState {
  rightPanel: Panel
  quickSwitcherOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  theme: Theme
  setRightPanel: (panel: Panel) => void
  toggleRightPanel: (panel: Panel) => void
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
  quickSwitcherOpen: false,
  settingsOpen: false,
  searchOpen: false,
  theme: initialTheme,

  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => set({ rightPanel: get().rightPanel === panel ? 'none' : panel }),
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
}))
