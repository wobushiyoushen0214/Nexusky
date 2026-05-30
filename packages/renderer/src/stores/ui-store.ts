import { create } from 'zustand'
import i18n from '../i18n'
import { safeGet, safeGetJSON, safeRemove, safeSet, safeSetJSON } from '../utils/storage'
import type { GraphMode } from '@shared/types/ipc'

type Panel = 'none' | 'chat' | 'outline' | 'properties' | 'tags' | 'history' | 'graph' | 'plugin' | 'maintenance' | 'agent'
export const THEME_IDS = ['dark', 'light', 'ocean', 'amber', 'forest', 'rose', 'minimal', 'obsidian', 'nord', 'solarized', 'contrast'] as const
const LANGUAGE_IDS = ['zh-CN', 'en'] as const
const ACCENT_STORAGE_KEY = 'nexusky-accent-color'
const GRAPH_MODE_STORAGE_KEY = 'nexusky-graph-mode'
const GRAPH_MODE_IDS: GraphMode[] = ['folder']

export type Theme = typeof THEME_IDS[number]
type MainView = 'editor' | 'graph' | 'bases' | 'timeline'
type Language = typeof LANGUAGE_IDS[number]
type MaintenancePanelSection = 'context' | 'queue'
type WorkspaceLayout = {
  mainView: MainView
  rightPanel: Panel
  sidebarCollapsed: boolean
}

const WORKSPACE_KEYS = {
  mainView: 'nexusky-workspace-main-view',
  rightPanel: 'nexusky-workspace-right-panel',
  sidebarCollapsed: 'nexusky-workspace-sidebar-collapsed',
}
const WORKSPACE_LAYOUTS_KEY = 'nexusky-workspace-layouts'
const SIDEBAR_WIDTHS_KEY = 'nexusky-sidebar-widths'
const RIGHT_PANEL_WIDTHS_KEY = 'nexusky-right-panel-widths'

const PANEL_IDS: Panel[] = ['none', 'chat', 'outline', 'properties', 'tags', 'history', 'graph', 'plugin', 'maintenance', 'agent']
const MAIN_VIEW_IDS: MainView[] = ['editor', 'graph', 'bases', 'timeline']
const NOTE_SCOPED_PANELS = new Set<Panel>(['outline', 'properties', 'tags', 'history'])

interface UIState {
  rightPanel: Panel
  mainView: MainView
  sidebarCollapsed: boolean
  workspaceScope: string
  sidebarWidth: number
  sidebarWidthScope: string
  rightPanelWidth: number
  focusMode: boolean
  previewMode: boolean
  quickSwitcherOpen: boolean
  settingsOpen: boolean
  settingsInitialTab: string | null
  searchOpen: boolean
  commandPaletteOpen: boolean
  theme: Theme
  accentColor: string | null
  language: Language
  graphMode: GraphMode
  maintenancePanelSection: MaintenancePanelSection
  pendingAgentGoal: { goal: string; description?: string } | null
  pendingBasesFocus: { filePath: string } | null
  setRightPanel: (panel: Panel) => void
  toggleRightPanel: (panel: Panel) => void
  setMainView: (view: MainView) => void
  setWorkspaceScope: (scope: string) => void
  toggleSidebar: () => void
  toggleFocusMode: () => void
  togglePreviewMode: () => void
  setSidebarWidth: (width: number) => void
  setSidebarWidthScope: (scope: string) => void
  setRightPanelWidth: (width: number) => void
  setCommandPaletteOpen: (open: boolean) => void
  resizeSidebar: (delta: number) => void
  resizeRightPanel: (delta: number) => void
  setQuickSwitcherOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSettingsInitialTab: (tab: string | null) => void
  setSearchOpen: (open: boolean) => void
  setTheme: (theme: Theme) => void
  setAccentColor: (color: string) => void
  resetAccentColor: () => void
  toggleTheme: () => void
  setLanguage: (lang: Language) => void
  setGraphMode: (mode: GraphMode) => void
  setMaintenancePanelSection: (section: MaintenancePanelSection) => void
  resetWorkspaceLayout: () => void
  sendToAgent: (payload: { goal: string; description?: string }) => void
  consumePendingAgentGoal: () => { goal: string; description?: string } | null
  focusInBases: (filePath: string) => void
  consumePendingBasesFocus: () => { filePath: string } | null
}

function getInitialTheme(): Theme {
  const saved = safeGet('nexusky-theme')
  if (saved && (THEME_IDS as readonly string[]).includes(saved)) return saved as Theme
  return 'dark'
}

function getInitialGraphMode(): GraphMode {
  const saved = safeGet(GRAPH_MODE_STORAGE_KEY)
  if (saved && (GRAPH_MODE_IDS as readonly string[]).includes(saved)) return saved as GraphMode
  return 'folder'
}

function normalizeLanguage(value: string | null): Language {
  return value && (LANGUAGE_IDS as readonly string[]).includes(value) ? value as Language : 'zh-CN'
}

function applyDocumentLanguage(lang: Language): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    applyAccentColor(safeGet(ACCENT_STORAGE_KEY))
  }
  safeSet('nexusky-theme', theme)
}

function normalizeHexColor(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const short = trimmed.match(/^#?([0-9a-fA-F]{3})$/)
  if (short) return `#${short[1].split('').map((ch) => ch + ch).join('').toLowerCase()}`
  const full = trimmed.match(/^#?([0-9a-fA-F]{6})$/)
  return full ? `#${full[1].toLowerCase()}` : null
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ]
}

function mixColor(hex: string, target: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [tr, tg, tb] = hexToRgb(target)
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount)
  return `#${[mix(r, tr), mix(g, tg), mix(b, tb)].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((part) => {
    const channel = part / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function applyAccentColor(value: string | null) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const color = normalizeHexColor(value)
  const vars = ['--accent', '--accent-hover', '--accent-muted', '--accent-text', '--accent-glow']
  if (!color) {
    vars.forEach((name) => root.style.removeProperty(name))
    return
  }
  const bright = luminance(color) > 0.45
  root.style.setProperty('--accent', color)
  root.style.setProperty('--accent-hover', mixColor(color, bright ? '#000000' : '#ffffff', 0.16))
  root.style.setProperty('--accent-muted', rgba(color, 0.14))
  root.style.setProperty('--accent-text', mixColor(color, bright ? '#000000' : '#ffffff', 0.28))
  root.style.setProperty('--accent-glow', rgba(color, 0.08))
}

function clampSidebarWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(180, Math.min(400, width)) : 240
}

function getSavedSidebarWidths(): Record<string, number> {
  return safeGetJSON<Record<string, number>>(SIDEBAR_WIDTHS_KEY, {})
}

function getInitialSidebarWidth(scope = 'files'): number {
  const scoped = getSavedSidebarWidths()[scope]
  if (typeof scoped === 'number') return clampSidebarWidth(scoped)
  const saved = safeGet('nexusky-sidebar-width')
  if (saved) return clampSidebarWidth(Number(saved))
  return 240
}

function saveSidebarWidth(scope: string, width: number): number {
  const next = clampSidebarWidth(width)
  safeSetJSON(SIDEBAR_WIDTHS_KEY, { ...getSavedSidebarWidths(), [scope]: next })
  return next
}

function clampRightPanelWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(260, Math.min(600, width)) : 360
}

function getSavedRightPanelWidths(): Partial<Record<Exclude<Panel, 'none'>, number>> {
  return safeGetJSON<Partial<Record<Exclude<Panel, 'none'>, number>>>(RIGHT_PANEL_WIDTHS_KEY, {})
}

function getInitialRightPanelWidth(panel: Panel = 'none'): number {
  if (panel !== 'none') {
    const savedForPanel = getSavedRightPanelWidths()[panel]
    if (typeof savedForPanel === 'number') return clampRightPanelWidth(savedForPanel)
  }
  const saved = safeGet('nexusky-right-panel-width')
  if (saved) return clampRightPanelWidth(Number(saved))
  return 360
}

function saveRightPanelWidth(panel: Panel, width: number): number {
  const next = clampRightPanelWidth(width)
  if (panel !== 'none') {
    safeSetJSON(RIGHT_PANEL_WIDTHS_KEY, { ...getSavedRightPanelWidths(), [panel]: next })
  }
  return next
}

function normalizeMainView(value: string | null | undefined): MainView | null {
  if (value === 'canvas') return 'bases'
  if (value === 'kanban' || value === 'reader') return 'editor'
  return value && MAIN_VIEW_IDS.includes(value as MainView) ? value as MainView : null
}

function getInitialMainView(): MainView {
  return normalizeMainView(safeGet(WORKSPACE_KEYS.mainView)) || 'editor'
}

function getInitialRightPanel(): Panel {
  return normalizeRightPanel(safeGet(WORKSPACE_KEYS.rightPanel)) || 'none'
}

function getInitialSidebarCollapsed(): boolean {
  return safeGet(WORKSPACE_KEYS.sidebarCollapsed) === 'true'
}

function getSavedWorkspaceLayouts(): Record<string, WorkspaceLayout> {
  return safeGetJSON<Record<string, WorkspaceLayout>>(WORKSPACE_LAYOUTS_KEY, {})
}

function normalizeRightPanel(value: string | null | undefined): Panel | null {
  if (value === 'context') return 'maintenance'
  if (value === 'calendar') return 'none'
  return value && PANEL_IDS.includes(value as Panel) ? value as Panel : null
}

function getInitialWorkspaceLayout(scope = 'workspace'): WorkspaceLayout {
  const scoped = getSavedWorkspaceLayouts()[scope]
  const scopedRightPanel = normalizeRightPanel(scoped?.rightPanel as string | undefined)
  const scopedMainView = normalizeMainView(scoped?.mainView)
  if (scoped && scopedMainView && scopedRightPanel && typeof scoped.sidebarCollapsed === 'boolean') {
    return { ...scoped, mainView: scopedMainView, rightPanel: getAvailableRightPanel(scopedMainView, scopedRightPanel) }
  }
  return {
    mainView: getInitialMainView(),
    rightPanel: getAvailableRightPanel(getInitialMainView(), getInitialRightPanel()),
    sidebarCollapsed: getInitialSidebarCollapsed(),
  }
}

function isRightPanelAvailable(mainView: MainView, panel: Panel): boolean {
  return panel === 'none' || mainView === 'editor' || !NOTE_SCOPED_PANELS.has(panel)
}

function getAvailableRightPanel(mainView: MainView, panel: Panel): Panel {
  return isRightPanelAvailable(mainView, panel) ? panel : 'none'
}

function saveWorkspaceLayout(scope: string, partial: Partial<WorkspaceLayout>): WorkspaceLayout {
  const nextRaw = { ...getInitialWorkspaceLayout(scope), ...partial }
  const next = { ...nextRaw, rightPanel: getAvailableRightPanel(nextRaw.mainView, nextRaw.rightPanel) }
  safeSetJSON(WORKSPACE_LAYOUTS_KEY, { ...getSavedWorkspaceLayouts(), [scope]: next })
  return next
}

function removeWorkspaceLayout(scope: string): void {
  const layouts = getSavedWorkspaceLayouts()
  delete layouts[scope]
  if (Object.keys(layouts).length === 0) safeRemove(WORKSPACE_LAYOUTS_KEY)
  else safeSetJSON(WORKSPACE_LAYOUTS_KEY, layouts)
}

function resetSidebarWidth(scope: string): void {
  const widths = getSavedSidebarWidths()
  delete widths[scope]
  if (Object.keys(widths).length === 0) safeRemove(SIDEBAR_WIDTHS_KEY)
  else safeSetJSON(SIDEBAR_WIDTHS_KEY, widths)
}

const initialTheme = getInitialTheme()
const initialAccentColor = normalizeHexColor(safeGet(ACCENT_STORAGE_KEY))
const initialWorkspaceLayout = getInitialWorkspaceLayout()
const initialLanguage = normalizeLanguage(safeGet('nexusky-language'))
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
  applyAccentColor(initialAccentColor)
  applyDocumentLanguage(initialLanguage)
}

export const useUIStore = create<UIState>((set, get) => ({
  rightPanel: initialWorkspaceLayout.rightPanel,
  mainView: initialWorkspaceLayout.mainView,
  sidebarCollapsed: initialWorkspaceLayout.sidebarCollapsed,
  workspaceScope: 'workspace',
  sidebarWidthScope: 'files',
  sidebarWidth: getInitialSidebarWidth(),
  rightPanelWidth: getInitialRightPanelWidth(initialWorkspaceLayout.rightPanel),
  focusMode: false,
  previewMode: false,
  quickSwitcherOpen: false,
  settingsOpen: false,
  settingsInitialTab: null,
  searchOpen: false,
  commandPaletteOpen: false,
  theme: initialTheme,
  accentColor: initialAccentColor,
  language: initialLanguage,
  graphMode: getInitialGraphMode(),
  maintenancePanelSection: 'queue',
  pendingAgentGoal: null,
  pendingBasesFocus: null,

  setRightPanel: (panel) => {
    if (!isRightPanelAvailable(get().mainView, panel)) return
    const layout = saveWorkspaceLayout(get().workspaceScope, { rightPanel: panel })
    set({ rightPanel: layout.rightPanel, ...(layout.rightPanel !== 'none' ? { rightPanelWidth: getInitialRightPanelWidth(layout.rightPanel) } : {}) })
  },
  toggleRightPanel: (panel) => {
    if (!isRightPanelAvailable(get().mainView, panel)) return
    const next = get().rightPanel === panel ? 'none' : panel
    const layout = saveWorkspaceLayout(get().workspaceScope, { rightPanel: next })
    set({ rightPanel: layout.rightPanel, ...(layout.rightPanel !== 'none' ? { rightPanelWidth: getInitialRightPanelWidth(layout.rightPanel) } : {}) })
  },
  setMainView: (view) => {
    const currentPanel = get().rightPanel
    const rightPanel = getAvailableRightPanel(view, currentPanel)
    const layout = saveWorkspaceLayout(get().workspaceScope, { mainView: view, rightPanel })
    set({ mainView: layout.mainView, rightPanel: layout.rightPanel, ...(layout.rightPanel !== 'none' ? { rightPanelWidth: getInitialRightPanelWidth(layout.rightPanel) } : {}) })
  },
  setWorkspaceScope: (scope) => {
    const nextScope = scope.trim() || 'workspace'
    const layout = getInitialWorkspaceLayout(nextScope)
    set({
      workspaceScope: nextScope,
      mainView: layout.mainView,
      rightPanel: layout.rightPanel,
      sidebarCollapsed: layout.sidebarCollapsed,
      rightPanelWidth: getInitialRightPanelWidth(layout.rightPanel),
    })
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    saveWorkspaceLayout(get().workspaceScope, { sidebarCollapsed: next })
    set({ sidebarCollapsed: next })
  },
  toggleFocusMode: () => {
    const entering = !get().focusMode
    set({ focusMode: entering, sidebarCollapsed: entering ? true : false, rightPanel: entering ? 'none' : get().rightPanel })
  },
  togglePreviewMode: () => set({ previewMode: !get().previewMode }),
  setSidebarWidth: (width) => {
    const next = saveSidebarWidth(get().sidebarWidthScope, width)
    set({ sidebarWidth: next })
  },
  setSidebarWidthScope: (scope) => {
    const nextScope = scope.trim() || 'files'
    set({ sidebarWidthScope: nextScope, sidebarWidth: getInitialSidebarWidth(nextScope) })
  },
  setRightPanelWidth: (width) => {
    const next = saveRightPanelWidth(get().rightPanel, width)
    set({ rightPanelWidth: next })
  },
  resizeSidebar: (delta: number) => {
    const width = saveSidebarWidth(get().sidebarWidthScope, get().sidebarWidth + delta)
    set({ sidebarWidth: width })
  },
  resizeRightPanel: (delta: number) => {
    const width = saveRightPanelWidth(get().rightPanel, get().rightPanelWidth + delta)
    set({ rightPanelWidth: width })
  },
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSettingsInitialTab: (tab) => set({ settingsInitialTab: tab }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  setAccentColor: (color) => {
    const normalized = normalizeHexColor(color)
    if (!normalized) return
    safeSet(ACCENT_STORAGE_KEY, normalized)
    applyAccentColor(normalized)
    set({ accentColor: normalized })
  },
  resetAccentColor: () => {
    safeRemove(ACCENT_STORAGE_KEY)
    applyAccentColor(null)
    set({ accentColor: null })
  },
  toggleTheme: () => {
    const idx = THEME_IDS.indexOf(get().theme)
    const next = THEME_IDS[(idx + 1) % THEME_IDS.length]
    applyTheme(next)
    set({ theme: next })
  },
  setLanguage: (lang) => {
    const next = normalizeLanguage(lang)
    i18n.changeLanguage(next)
    applyDocumentLanguage(next)
    safeSet('nexusky-language', next)
    set({ language: next })
  },
  setGraphMode: (mode) => {
    const next: GraphMode = GRAPH_MODE_IDS.includes(mode) ? mode : 'folder'
    safeSet(GRAPH_MODE_STORAGE_KEY, next)
    set({ graphMode: next })
  },
  setMaintenancePanelSection: (section) => set({ maintenancePanelSection: section }),
  resetWorkspaceLayout: () => {
    const { workspaceScope, sidebarWidthScope } = get()
    removeWorkspaceLayout(workspaceScope)
    resetSidebarWidth(sidebarWidthScope)
    safeRemove(WORKSPACE_KEYS.mainView)
    safeRemove(WORKSPACE_KEYS.rightPanel)
    safeRemove(WORKSPACE_KEYS.sidebarCollapsed)
    safeRemove('nexusky-sidebar-width')
    safeRemove('nexusky-right-panel-width')
    safeRemove(RIGHT_PANEL_WIDTHS_KEY)
    set({
      mainView: 'editor',
      rightPanel: 'none',
      sidebarCollapsed: false,
      sidebarWidth: 240,
      rightPanelWidth: 360,
      focusMode: false
    })
  },
  sendToAgent: (payload) => {
    const view = get().mainView
    const layout = saveWorkspaceLayout(get().workspaceScope, {
      mainView: view,
      rightPanel: 'agent'
    })
    set({
      pendingAgentGoal: { goal: payload.goal, description: payload.description },
      mainView: layout.mainView,
      rightPanel: layout.rightPanel,
      rightPanelWidth: getInitialRightPanelWidth(layout.rightPanel)
    })
  },
  consumePendingAgentGoal: () => {
    const pending = get().pendingAgentGoal
    if (pending) set({ pendingAgentGoal: null })
    return pending
  },
  focusInBases: (filePath) => {
    const layout = saveWorkspaceLayout(get().workspaceScope, { mainView: 'bases' })
    set({
      pendingBasesFocus: { filePath },
      mainView: layout.mainView,
      rightPanel: layout.rightPanel
    })
  },
  consumePendingBasesFocus: () => {
    const pending = get().pendingBasesFocus
    if (pending) set({ pendingBasesFocus: null })
    return pending
  },
}))
