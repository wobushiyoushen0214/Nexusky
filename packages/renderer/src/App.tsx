import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useVaultStore } from './stores/vault-store'
import { useUIStore } from './stores/ui-store'
import { useEditorStore } from './stores/editor-store'
import { useSyncStore } from './stores/sync-store'
import { useKeyBindingStore } from './stores/keybinding-store'
import { toast } from './stores/toast-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { ActivityBar } from './components/sidebar/ActivityBar'
import { Editor } from './components/editor/Editor'
import { EditorTabs } from './components/editor/EditorTabs'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'
import { QuickSwitcher } from './components/QuickSwitcher'
import { ResizeHandle } from './components/ResizeHandle'
import { ToastContainer } from './components/Toast'
import { Onboarding, shouldShowOnboarding } from './components/Onboarding'
import { VaultHealthScreen } from './components/VaultHealthScreen'
import { GraphGenerator } from './components/GraphGenerator'
import { NotificationCenter } from './components/proactive/NotificationCenter'
import { ProactiveToast } from './components/proactive/ProactiveToast'
import { ToolResultPanel } from './components/tool-surface/ToolResultPanel'
import { getErrorMessage } from './utils/errors'
import { applyCssSnippets, CSS_SNIPPETS_UPDATED } from './utils/css-snippets'
import { applyThemePackage, THEME_PACKAGES_UPDATED } from './utils/theme-packages'
import { matchesShortcut } from './utils/shortcuts'
import { safeGet } from './utils/storage'
import type { LocalPlugin, PluginPanel } from '@shared/types/ipc'

const GraphView = lazy(() => import('./components/graph/GraphView').then((m) => ({ default: m.GraphView })))
const ChatPanel = lazy(() => import('./components/ai/ChatPanel').then((m) => ({ default: m.ChatPanel })))
const Settings = lazy(() => import('./components/settings/Settings').then((m) => ({ default: m.Settings })))
const SearchPanel = lazy(() => import('./components/SearchPanel').then((m) => ({ default: m.SearchPanel })))
const OutlinePanel = lazy(() => import('./components/editor/OutlinePanel').then((m) => ({ default: m.OutlinePanel })))
const PropertiesPanel = lazy(() => import('./components/editor/PropertiesPanel').then((m) => ({ default: m.PropertiesPanel })))
const TagsPanel = lazy(() => import('./components/TagsPanel').then((m) => ({ default: m.TagsPanel })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
const TrashPanel = lazy(() => import('./components/TrashPanel').then((m) => ({ default: m.TrashPanel })))
const CommandPalette = lazy(() => import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })))
const PublishScopeDialog = lazy(() => import('./components/PublishScopeDialog').then((m) => ({ default: m.PublishScopeDialog })))
const VaultOverview = lazy(() => import('./components/overview/VaultOverview').then((m) => ({ default: m.VaultOverview })))
const AgentRunPanel = lazy(() => import('./components/agent/AgentRunPanel').then((m) => ({ default: m.AgentRunPanel })))

interface FileEntry { name: string; path: string; isDirectory: boolean; children?: FileEntry[] }
type FileWithPath = File & { path?: string }
type ActivePluginPanel = { plugin: LocalPlugin; panel: PluginPanel }

const FILE_REQUIRED_RIGHT_PANELS = new Set(['outline', 'properties', 'tags', 'history'])

function PluginPanelView({ active }: { active: ActivePluginPanel | null }) {
  const { t } = useTranslation()
  if (!active) {
    return <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 12 }}>{t('common.pluginPanelEmpty')}</div>
  }
  const { plugin, panel } = active
  return (
    <div style={{ padding: 16, overflow: 'auto', fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{panel.title}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>{plugin.name}{plugin.version ? ` · ${plugin.version}` : ''}</div>
      </div>
      {panel.description && <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{panel.description}</p>}
      {panel.content ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', color: 'var(--text-primary)' }}>{panel.content}</pre>
      ) : (
        <div style={{ color: 'var(--text-tertiary)' }}>{t('common.pluginPanelNoContent')}</div>
      )}
    </div>
  )
}

function flatMdPaths(entries: FileEntry[]): string[] {
  const result: string[] = []
  for (const e of entries) {
    if (e.isDirectory && e.children) result.push(...flatMdPaths(e.children))
    else if (e.name.endsWith('.md')) result.push(e.path)
  }
  return result
}

export default function App() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadVault = useVaultStore((s) => s.loadVault)
  const { rightPanel, sidebarCollapsed, sidebarWidth, rightPanelWidth, focusMode, mainView, quickSwitcherOpen, settingsOpen, searchOpen, commandPaletteOpen, publishScopeOpen, toggleRightPanel, toggleSidebar, toggleFocusMode, resizeSidebar, resizeRightPanel, setQuickSwitcherOpen, setSettingsOpen, setSearchOpen, setCommandPaletteOpen, setPublishScopeOpen, setMainView, setRightPanel, setWorkspaceScope, setSidebarWidthScope } = useUIStore(
    useShallow((s) => ({
      rightPanel: s.rightPanel,
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarWidth: s.sidebarWidth,
      rightPanelWidth: s.rightPanelWidth,
      focusMode: s.focusMode,
      mainView: s.mainView,
      quickSwitcherOpen: s.quickSwitcherOpen,
      settingsOpen: s.settingsOpen,
      searchOpen: s.searchOpen,
      commandPaletteOpen: s.commandPaletteOpen,
      publishScopeOpen: s.publishScopeOpen,
      toggleRightPanel: s.toggleRightPanel,
      toggleSidebar: s.toggleSidebar,
      toggleFocusMode: s.toggleFocusMode,
      resizeSidebar: s.resizeSidebar,
      resizeRightPanel: s.resizeRightPanel,
      setQuickSwitcherOpen: s.setQuickSwitcherOpen,
      setSettingsOpen: s.setSettingsOpen,
      setSearchOpen: s.setSearchOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      setPublishScopeOpen: s.setPublishScopeOpen,
      setMainView: s.setMainView,
      setRightPanel: s.setRightPanel,
      setWorkspaceScope: s.setWorkspaceScope,
      setSidebarWidthScope: s.setSidebarWidthScope,
    }))
  )
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const tabCount = useEditorStore((s) => s.tabs.length)
  const [trashOpen, setTrashOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding)
  const [graphGenPaths, setGraphGenPaths] = useState<string[]>([])
  const [chatEverOpened, setChatEverOpened] = useState(false)
  const [activePluginPanel, setActivePluginPanel] = useState<ActivePluginPanel | null>(null)
  const [showVaultHealth, setShowVaultHealth] = useState(false)

  useEffect(() => {
    if (!vaultPath || showOnboarding) {
      setShowVaultHealth(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { lastShownAt } = await window.api.invoke('vault:health-shown', { vaultPath })
        if (cancelled) return
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
        if (lastShownAt < sevenDaysAgo) setShowVaultHealth(true)
      } catch {
        // best effort — failing to read the marker just means we skip the panel
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaultPath, showOnboarding])

  // Track the latest translate function so global event handlers (which are
  // registered once and survive language changes) always read the current
  // i18n table instead of capturing whatever `t` was bound on mount.
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  useEffect(() => {
    if (rightPanel === 'chat') setChatEverOpened(true)
  }, [rightPanel])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ActivePluginPanel>).detail
      if (!detail?.plugin || !detail?.panel) return
      setActivePluginPanel(detail)
      setRightPanel('plugin')
    }
    window.addEventListener('plugin-panel-open', handler)
    return () => window.removeEventListener('plugin-panel-open', handler)
  }, [setRightPanel])

  useEffect(() => {
    if (!currentFilePath && FILE_REQUIRED_RIGHT_PANELS.has(rightPanel)) {
      setRightPanel('none')
    }
  }, [currentFilePath, rightPanel, setRightPanel])

  useEffect(() => {
    setWorkspaceScope(vaultPath ? `workspace:${vaultPath}` : 'workspace')
    setSidebarWidthScope(vaultPath ? `files:${vaultPath}` : 'files')
  }, [vaultPath, setWorkspaceScope, setSidebarWidthScope])

  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, isDirectory } = (e as CustomEvent).detail || {}
      if (!path || !vaultPath) return
      toast(tRef.current('common.indexing'), 'info')
      let mdPaths: string[] = []
      if (isDirectory) {
        const files = await window.api.invoke('file:list', { dirPath: path })
        mdPaths = flatMdPaths(files)
        if (mdPaths.length === 0) { toast(tRef.current('common.noMdFiles'), 'info'); return }
        for (const fp of mdPaths) {
          await window.api.invoke('db:index-file', { vaultPath, filePath: fp })
        }
      } else {
        await window.api.invoke('db:index-file', { vaultPath, filePath: path })
        mdPaths = [path]
      }
      // Open graph immediately with basic links, then enhance with AI
      setMainView('graph')
      toast(tRef.current('common.aiAnalyzing'), 'info')
      try {
        await window.api.invoke('ai:generate-memories', { vaultPath })
        const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
        if (result.success) {
          toast((result.added ?? 0) > 0 ? tRef.current('common.semanticFound', { count: result.added }) : tRef.current('common.semanticDone'), 'success')
          window.dispatchEvent(new CustomEvent('graph-data-updated'))
        } else {
          toast(result.error || tRef.current('common.semanticFailed'), 'info')
        }
      } catch {
        toast(tRef.current('common.semanticFailed'), 'info')
      }
    }
    window.addEventListener('index-and-show-graph', handler)
    return () => window.removeEventListener('index-and-show-graph', handler)
  }, [vaultPath, setMainView])

  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, isDirectory } = (e as CustomEvent).detail || {}
      if (!path) return
      if (isDirectory) {
        const files = await window.api.invoke('file:list', { dirPath: path })
        const mdPaths = flatMdPaths(files)
        if (mdPaths.length === 0) { toast(tRef.current('common.noMdFiles'), 'info'); return }
        setGraphGenPaths(mdPaths)
      } else {
        setGraphGenPaths([path])
      }
    }
    window.addEventListener('generate-graph', handler)
    return () => window.removeEventListener('generate-graph', handler)
  }, [])

  useEffect(() => {
    const handler = () => setTrashOpen(true)
    window.addEventListener('open-trash', handler)
    return () => window.removeEventListener('open-trash', handler)
  }, [])

  useEffect(() => {
    const cleanup = window.api.onQuickCapture(() => {
      window.dispatchEvent(new CustomEvent('create-new-note'))
    })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    loadVault()
  }, [])

  useEffect(() => {
    const applyVaultAppearance = () => {
      applyThemePackage(vaultPath).then(() => applyCssSnippets(vaultPath)).catch(() => {})
    }
    applyVaultAppearance()
    const handler = () => applyVaultAppearance()
    window.addEventListener(CSS_SNIPPETS_UPDATED, handler)
    window.addEventListener(THEME_PACKAGES_UPDATED, handler)
    return () => {
      window.removeEventListener(CSS_SNIPPETS_UPDATED, handler)
      window.removeEventListener(THEME_PACKAGES_UPDATED, handler)
    }
  }, [vaultPath])

  // Save all dirty tabs before window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { tabs, currentFilePath, content } = useEditorStore.getState()
      const dirty = tabs.filter((t) => t.isDirty)
      if (dirty.length > 0 && currentFilePath) {
        useEditorStore.getState().saveFile()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Network status monitoring for offline queue
  useEffect(() => {
    const handleOnline = () => window.api.invoke('cloud:set-online', { online: true })
    const handleOffline = () => window.api.invoke('cloud:set-online', { online: false })
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  useEffect(() => {
    const cleanup = window.api.onVaultChanged((changedPaths) => {
      useVaultStore.getState().refreshFiles(changedPaths)
    })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const getKey = useKeyBindingStore.getState().getKey

      const quickSwitchKey = getKey('quick-switch')
      if (matchesShortcut(e, quickSwitchKey) || (quickSwitchKey === 'Ctrl+O' && matchesShortcut(e, 'Ctrl+P'))) {
        e.preventDefault()
        setQuickSwitcherOpen(true)
      }
      if (matchesShortcut(e, getKey('graph'))) {
        e.preventDefault()
        const state = useUIStore.getState()
        if (state.mainView === 'graph') {
          setMainView('editor')
          if (state.sidebarCollapsed) toggleSidebar()
        } else {
          setMainView('graph')
          if (!state.sidebarCollapsed) toggleSidebar()
        }
      }
      if (matchesShortcut(e, getKey('bases'))) {
        e.preventDefault()
        setMainView('bases')
        if (!useUIStore.getState().sidebarCollapsed) toggleSidebar()
      }
      if (matchesShortcut(e, getKey('chat'))) {
        e.preventDefault()
        toggleRightPanel('chat')
      }
      if (matchesShortcut(e, getKey('outline'))) {
        e.preventDefault()
        if (useEditorStore.getState().currentFilePath) toggleRightPanel('outline')
      }
      if (matchesShortcut(e, getKey('settings'))) {
        e.preventDefault()
        setSettingsOpen(true)
      }
      if (matchesShortcut(e, getKey('search'))) {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (matchesShortcut(e, getKey('sidebar'))) {
        e.preventDefault()
        toggleSidebar()
      }
      if (matchesShortcut(e, getKey('command-palette'))) {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (matchesShortcut(e, getKey('new-note'))) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('create-new-note'))
      }
      if (matchesShortcut(e, getKey('sync'))) {
        e.preventDefault()
        const vault = useVaultStore.getState().vaultPath
        if (vault) window.api.invoke('cloud:sync', { vaultPath: vault })
      }
      if (matchesShortcut(e, getKey('focus'))) {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Drag & drop .md files to open
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault()
    const handleDrop = (e: DragEvent) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      const textData = e.dataTransfer?.getData('text/plain')
      if (textData && textData.endsWith('.md')) {
        useEditorStore.getState().openFile(textData)
        return
      }
      const files = e.dataTransfer?.files
      if (!files) return
      for (const file of files) {
        const droppedFile = file as FileWithPath
        if (file.name.endsWith('.md') && droppedFile.path) {
          useEditorStore.getState().openFile(droppedFile.path)
          break
        }
      }
    }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Auto sync timer
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [autoSyncInterval, setAutoSyncInterval] = useState(() => {
    return Number(safeGet('nexusky-auto-sync') || '0')
  })

  useEffect(() => {
    const handler = () => {
      setAutoSyncInterval(Number(safeGet('nexusky-auto-sync') || '0'))
    }
    window.addEventListener('storage', handler)
    window.addEventListener('sync-interval-changed', handler)
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('sync-interval-changed', handler) }
  }, [])

  useEffect(() => {
    if (syncTimerRef.current) clearInterval(syncTimerRef.current)

    if (!autoSyncInterval || !vaultPath) return

    syncTimerRef.current = setInterval(async () => {
      const { status, setSyncing, setSuccess, setError } = useSyncStore.getState()
      if (status === 'syncing') return
      setSyncing()
      try {
        const result = await window.api.invoke('cloud:sync', { vaultPath })
        if (result.errors.length === 0) {
          setSuccess()
          if (result.pushed > 0 || result.pulled > 0) toast(t('common.syncDone', { pushed: result.pushed, pulled: result.pulled }), 'success')
        } else {
          setError(result.errors[0])
          toast(t('common.syncError', { error: result.errors[0] }), 'error')
        }
      } catch (e: unknown) {
        const message = getErrorMessage(e, '同步失败')
        setError(message)
        toast(t('common.syncFailed', { error: message }), 'error')
      }
    }, autoSyncInterval * 60 * 1000)

    return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current) }
  }, [vaultPath, autoSyncInterval])

  const showEditorChromeTabs = Boolean(vaultPath && !showVaultHealth && mainView === 'editor' && !focusMode && tabCount > 0)
  const workspaceContentInset = 18
  const activityRailWidth = 56
  const workspacePanelRadius = 20
  const workspaceSidebarWidth = sidebarCollapsed ? activityRailWidth : activityRailWidth + sidebarWidth
  const workspaceTabsLeft = workspaceContentInset + workspaceSidebarWidth + (sidebarCollapsed ? 10 : 8) + workspacePanelRadius
  const workspaceTabsRight = 80 + (rightPanel !== 'none' ? rightPanelWidth + 8 : 0)
  const workspaceContentPadding = showEditorChromeTabs ? '0 18px 18px' : '10px 18px 18px'
  const workspaceSideBackground = 'var(--workspace-rail-surface)'
  const workspaceSideBorder = '1px solid var(--workspace-panel-border-color)'
  const workspaceSideRadius = 20
  const workspaceSideShadow = 'var(--workspace-frame-shadow), var(--glass-divider-border-shadow)'
  const workspaceSideBackdropFilter = 'blur(var(--glass-blur)) saturate(160%)'
  const workspaceMainBackground = showEditorChromeTabs ? 'var(--workspace-tab-surface)' : 'var(--workspace-panel-surface)'
  const workspacePanelBorder = '1px solid var(--workspace-panel-border-color)'
  const workspacePanelShadow = 'var(--workspace-frame-shadow), var(--glass-divider-border-shadow)'
  const workspaceMainShadow = workspacePanelShadow
  const rightPanelTitle = rightPanel === 'chat'
    ? t('panels.chat')
    : rightPanel === 'properties'
      ? t('panels.properties')
      : rightPanel === 'tags'
        ? t('panels.tags')
        : rightPanel === 'history'
          ? t('panels.history')
          : rightPanel === 'agent'
            ? t('panels.agent')
            : rightPanel === 'plugin'
              ? (activePluginPanel?.panel.title || 'Plugin')
              : t('panels.outline')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--workspace-bg)' }}>
      {showOnboarding ? (
        <Onboarding onDone={() => setShowOnboarding(false)} />
      ) : (
        <>
          {!focusMode && (
            <TitleBar>
              {showEditorChromeTabs && (
                <div
                  className="workspace-title-tabs"
                  style={{
                    left: workspaceTabsLeft,
                    right: workspaceTabsRight,
                  }}
                >
                  <EditorTabs />
                </div>
              )}
            </TitleBar>
          )}
          {vaultPath ? (
            showVaultHealth ? (
              <VaultHealthScreen vaultPath={vaultPath} onDismiss={() => setShowVaultHealth(false)} />
            ) : (
        <div className={`workspace-content${showEditorChromeTabs ? ' has-editor-tabs' : ''}`} style={{ display: 'flex', flex: 1, overflow: 'hidden', background: 'transparent', minHeight: 0, alignItems: 'stretch', padding: workspaceContentPadding }}>
          <div className="glass-panel workspace-side-panel" style={{ width: mainView === 'graph' ? 'auto' : workspaceSidebarWidth, height: '100%', display: 'flex', flexShrink: 0, overflow: 'hidden', background: workspaceSideBackground, border: workspaceSideBorder, borderRadius: workspaceSideRadius, boxShadow: workspaceSideShadow, padding: 5, boxSizing: 'border-box', backdropFilter: workspaceSideBackdropFilter, WebkitBackdropFilter: workspaceSideBackdropFilter }}>
            <ActivityBar />
            {mainView === 'graph' ? (
              <div id="graph-panel-slot" style={{ height: '100%', display: 'flex', minWidth: 0 }} />
            ) : (
              !sidebarCollapsed && <Sidebar width={sidebarWidth} />
            )}
          </div>
          {!sidebarCollapsed && mainView !== 'graph' && <ResizeHandle side="left" onResize={(delta) => resizeSidebar(delta)} />}
          <main className={`glass-panel workspace-main-panel${showEditorChromeTabs ? ' has-editor-tabs' : ''}`} style={{ flex: 1, overflow: 'hidden', background: workspaceMainBackground, border: workspacePanelBorder, borderRadius: workspacePanelRadius, boxShadow: workspaceMainShadow, marginLeft: sidebarCollapsed || mainView === 'graph' ? 10 : 0, marginRight: 0, minWidth: 0, backdropFilter: 'blur(var(--glass-blur)) saturate(160%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(160%)' }}>
            {mainView === 'editor' ? (
              <div className="workspace-editor-frame">
                <Editor />
              </div>
            ) : mainView === 'overview' ? (
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <Suspense fallback={null}><VaultOverview /></Suspense>
              </div>
            ) : (
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <Suspense fallback={null}><GraphView /></Suspense>
              </div>
            )}
          </main>
          {rightPanel !== 'none' && (
            <ResizeHandle side="right" onResize={(delta) => resizeRightPanel(delta)} />
          )}
          <aside className={`glass-panel workspace-right-panel${showEditorChromeTabs ? ' has-editor-tabs' : ''}`} style={{ width: rightPanel !== 'none' ? rightPanelWidth : 0, background: 'var(--workspace-panel-surface)', border: workspacePanelBorder, borderRadius: workspacePanelRadius, boxShadow: workspacePanelShadow, marginRight: 0, flexShrink: 0, display: rightPanel !== 'none' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', backdropFilter: 'blur(var(--glass-blur)) saturate(160%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(160%)' }}>
            <div style={{ height: 48, padding: '0 14px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--workspace-panel-header-surface)', boxShadow: 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {rightPanelTitle}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => toggleRightPanel(rightPanel)}
                  style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 0, background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--control-bg)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Suspense fallback={null}>
              {rightPanel === 'outline' && <OutlinePanel />}
              {rightPanel === 'properties' && <PropertiesPanel />}
              {rightPanel === 'tags' && <TagsPanel />}
              {rightPanel === 'history' && <HistoryPanel />}
              {rightPanel === 'agent' && <AgentRunPanel />}
              {rightPanel === 'plugin' && <PluginPanelView active={activePluginPanel} />}
              </Suspense>
              {chatEverOpened && (
                <div style={{ flex: 1, overflow: 'hidden', display: rightPanel === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
                  <Suspense fallback={null}><ChatPanel /></Suspense>
                </div>
              )}
            </div>
          </aside>
        </div>
            )
      ) : (
        <WelcomeScreen />
      )}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <Suspense fallback={null}>
        {settingsOpen && <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        {searchOpen && <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />}
        {commandPaletteOpen && <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />}
        {publishScopeOpen && <PublishScopeDialog open={publishScopeOpen} onClose={() => setPublishScopeOpen(false)} />}
        {trashOpen && <TrashPanel open={trashOpen} onClose={() => setTrashOpen(false)} />}
      </Suspense>
      <ToastContainer />
      <GraphGenerator open={graphGenPaths.length > 0} filePaths={graphGenPaths} onClose={() => setGraphGenPaths([])} />
      <NotificationCenter />
      <ProactiveToast />
      <ToolResultPanel />
        </>
      )}
    </div>
  )
}
