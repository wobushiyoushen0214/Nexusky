import { create } from 'zustand'
import i18n from '../i18n'
import { safeGet, safeRemove, safeSet } from '../utils/storage'

type Panel = 'none' | 'chat' | 'outline' | 'properties' | 'tags' | 'calendar' | 'kanban' | 'history' | 'graph'
export const THEME_IDS = ['dark', 'light', 'ocean', 'amber', 'forest', 'rose', 'minimal', 'obsidian', 'nord', 'solarized', 'contrast'] as const

export type Theme = typeof THEME_IDS[number]
type MainView = 'editor' | 'graph' | 'bases' | 'canvas'
type Language = 'zh-CN' | 'en'

const WORKSPACE_KEYS = {
  mainView: 'nexusky-workspace-main-view',
  rightPanel: 'nexusky-workspace-right-panel',
  sidebarCollapsed: 'nexusky-workspace-sidebar-collapsed',
}

const PANEL_IDS: Panel[] = ['none', 'chat', 'outline', 'properties', 'tags', 'calendar', 'kanban', 'history', 'graph']
const MAIN_VIEW_IDS: MainView[] = ['editor', 'graph', 'bases', 'canvas']

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
  language: Language
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
  setLanguage: (lang: Language) => void
  resetWorkspaceLayout: () => void
}

function getInitialTheme(): Theme {
  const saved = safeGet('nexusky-theme')
  if (saved && (THEME_IDS as readonly string[]).includes(saved)) return saved as Theme
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  safeSet('nexusky-theme', theme)
}

function getInitialSidebarWidth(): number {
  const saved = safeGet('nexusky-sidebar-width')
  if (saved) return Math.max(180, Math.min(400, Number(saved)))
  return 240
}

function getInitialRightPanelWidth(): number {
  const saved = safeGet('nexusky-right-panel-width')
  if (saved) return Math.max(260, Math.min(600, Number(saved)))
  return 360
}

function getInitialMainView(): MainView {
  const saved = safeGet(WORKSPACE_KEYS.mainView)
  return saved && MAIN_VIEW_IDS.includes(saved as MainView) ? saved as MainView : 'editor'
}

function getInitialRightPanel(): Panel {
  const saved = safeGet(WORKSPACE_KEYS.rightPanel)
  return saved && PANEL_IDS.includes(saved as Panel) ? saved as Panel : 'none'
}

function getInitialSidebarCollapsed(): boolean {
  return safeGet(WORKSPACE_KEYS.sidebarCollapsed) === 'true'
}

function persistWorkspace(partial: Partial<Pick<UIState, 'mainView' | 'rightPanel' | 'sidebarCollapsed'>>) {
  if (partial.mainView) safeSet(WORKSPACE_KEYS.mainView, partial.mainView)
  if (partial.rightPanel) safeSet(WORKSPACE_KEYS.rightPanel, partial.rightPanel)
  if (partial.sidebarCollapsed !== undefined) safeSet(WORKSPACE_KEYS.sidebarCollapsed, String(partial.sidebarCollapsed))
}

const initialTheme = getInitialTheme()
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
}

export const useUIStore = create<UIState>((set, get) => ({
  rightPanel: getInitialRightPanel(),
  mainView: getInitialMainView(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  sidebarWidth: getInitialSidebarWidth(),
  rightPanelWidth: getInitialRightPanelWidth(),
  focusMode: false,
  previewMode: false,
  quickSwitcherOpen: false,
  settingsOpen: false,
  searchOpen: false,
  commandPaletteOpen: false,
  theme: initialTheme,
  language: (safeGet('nexusky-language') || 'zh-CN') as Language,

  setRightPanel: (panel) => {
    persistWorkspace({ rightPanel: panel })
    set({ rightPanel: panel })
  },
  toggleRightPanel: (panel) => {
    const next = get().rightPanel === panel ? 'none' : panel
    persistWorkspace({ rightPanel: next })
    set({ rightPanel: next })
  },
  setMainView: (view) => {
    persistWorkspace({ mainView: view })
    set({ mainView: view })
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    persistWorkspace({ sidebarCollapsed: next })
    set({ sidebarCollapsed: next })
  },
  toggleFocusMode: () => {
    const entering = !get().focusMode
    set({ focusMode: entering, sidebarCollapsed: entering ? true : false, rightPanel: entering ? 'none' : get().rightPanel })
  },
  togglePreviewMode: () => set({ previewMode: !get().previewMode }),
  setSidebarWidth: (width) => {
    const next = Math.max(180, Math.min(400, width))
    safeSet('nexusky-sidebar-width', String(next))
    set({ sidebarWidth: next })
  },
  setRightPanelWidth: (width) => {
    const next = Math.max(260, Math.min(600, width))
    safeSet('nexusky-right-panel-width', String(next))
    set({ rightPanelWidth: next })
  },
  resizeSidebar: (delta: number) => {
    const width = Math.max(180, Math.min(400, get().sidebarWidth + delta))
    safeSet('nexusky-sidebar-width', String(width))
    set({ sidebarWidth: width })
  },
  resizeRightPanel: (delta: number) => {
    const width = Math.max(260, Math.min(600, get().rightPanelWidth + delta))
    safeSet('nexusky-right-panel-width', String(width))
    set({ rightPanelWidth: width })
  },
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => {
    const idx = THEME_IDS.indexOf(get().theme)
    const next = THEME_IDS[(idx + 1) % THEME_IDS.length]
    applyTheme(next)
    set({ theme: next })
  },
  setLanguage: (lang) => {
    i18n.changeLanguage(lang)
    safeSet('nexusky-language', lang)
    set({ language: lang })
  },
  resetWorkspaceLayout: () => {
    safeRemove(WORKSPACE_KEYS.mainView)
    safeRemove(WORKSPACE_KEYS.rightPanel)
    safeRemove(WORKSPACE_KEYS.sidebarCollapsed)
    safeRemove('nexusky-sidebar-width')
    safeRemove('nexusky-right-panel-width')
    set({
      mainView: 'editor',
      rightPanel: 'none',
      sidebarCollapsed: false,
      sidebarWidth: 240,
      rightPanelWidth: 360,
      focusMode: false
    })
  },
}))
