import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useVaultStore } from './stores/vault-store'
import { useUIStore } from './stores/ui-store'
import { useEditorStore } from './stores/editor-store'
import { useSyncStore } from './stores/sync-store'
import { toast } from './stores/toast-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'
import { QuickSwitcher } from './components/QuickSwitcher'
import { ResizeHandle } from './components/ResizeHandle'
import { ToastContainer } from './components/Toast'
import { Onboarding, shouldShowOnboarding } from './components/Onboarding'
import { GraphGenerator } from './components/GraphGenerator'

const GraphView = lazy(() => import('./components/graph/GraphView').then((m) => ({ default: m.GraphView })))
const ChatPanel = lazy(() => import('./components/ai/ChatPanel').then((m) => ({ default: m.ChatPanel })))
const Settings = lazy(() => import('./components/settings/Settings').then((m) => ({ default: m.Settings })))
const SearchPanel = lazy(() => import('./components/SearchPanel').then((m) => ({ default: m.SearchPanel })))
const OutlinePanel = lazy(() => import('./components/editor/OutlinePanel').then((m) => ({ default: m.OutlinePanel })))
const TagsPanel = lazy(() => import('./components/TagsPanel').then((m) => ({ default: m.TagsPanel })))
const CalendarPanel = lazy(() => import('./components/CalendarPanel').then((m) => ({ default: m.CalendarPanel })))
const KanbanPanel = lazy(() => import('./components/KanbanPanel').then((m) => ({ default: m.KanbanPanel })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
const TrashPanel = lazy(() => import('./components/TrashPanel').then((m) => ({ default: m.TrashPanel })))
const CommandPalette = lazy(() => import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })))

interface FileEntry { name: string; path: string; isDirectory: boolean; children?: FileEntry[] }
function flatMdPaths(entries: FileEntry[]): string[] {
  const result: string[] = []
  for (const e of entries) {
    if (e.isDirectory && e.children) result.push(...flatMdPaths(e.children))
    else if (e.name.endsWith('.md')) result.push(e.path)
  }
  return result
}

export default function App() {
  const { vaultPath, loadVault } = useVaultStore()
  const { rightPanel, sidebarCollapsed, sidebarWidth, rightPanelWidth, focusMode, mainView, quickSwitcherOpen, settingsOpen, searchOpen, commandPaletteOpen, toggleRightPanel, toggleSidebar, toggleFocusMode, resizeSidebar, resizeRightPanel, setQuickSwitcherOpen, setSettingsOpen, setSearchOpen, setCommandPaletteOpen, setMainView } = useUIStore()
  const [trashOpen, setTrashOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding)
  const [graphGenPaths, setGraphGenPaths] = useState<string[]>([])

  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, isDirectory } = (e as CustomEvent).detail || {}
      if (!path) return
      if (isDirectory) {
        const files = await window.api.invoke('file:list', { dirPath: path })
        const mdPaths = flatMdPaths(files)
        if (mdPaths.length === 0) { toast('该文件夹下没有 .md 文件', 'info'); return }
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
    loadVault()
  }, [])

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
    const handleOnline = () => window.api.invoke('cloud:set-online' as any, { online: true })
    const handleOffline = () => window.api.invoke('cloud:set-online' as any, { online: false })
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  useEffect(() => {
    const cleanup = window.api.onVaultChanged(() => {
      useVaultStore.getState().refreshFiles()
    })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      if (mod && (e.key === 'o' || e.key === 'p') && !e.shiftKey) {
        e.preventDefault()
        setQuickSwitcherOpen(true)
      }
      if (mod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        if (e.shiftKey) {
          const state = useUIStore.getState()
          if (state.mainView === 'graph') {
            setMainView('editor')
          } else {
            if (state.rightPanel === 'graph') toggleRightPanel('graph')
            setMainView('graph')
          }
        } else {
          toggleRightPanel('graph')
        }
      }
      if (mod && e.key === 'l') {
        e.preventDefault()
        toggleRightPanel('chat')
      }
      if (mod && e.key === 'e' && !e.shiftKey) {
        e.preventDefault()
        toggleRightPanel('outline')
      }
      if (mod && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault()
        setSettingsOpen(true)
      }
      if (mod && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (mod && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        toggleSidebar()
      }
      if (mod && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('create-new-note'))
      }
      if (mod && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        const vault = useVaultStore.getState().vaultPath
        if (vault) window.api.invoke('cloud:sync', { vaultPath: vault })
      }
      if (e.key === 'F11' || (mod && e.shiftKey && e.key === 'Enter')) {
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
        if (file.name.endsWith('.md') && (file as any).path) {
          useEditorStore.getState().openFile((file as any).path)
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
    try { return Number(localStorage.getItem('nexusky-auto-sync') || '0') } catch { return 0 }
  })

  useEffect(() => {
    const handler = () => {
      try { setAutoSyncInterval(Number(localStorage.getItem('nexusky-auto-sync') || '0')) } catch {}
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
          if (result.pushed > 0 || result.pulled > 0) toast(`同步完成: ↑${result.pushed} ↓${result.pulled}`, 'success')
        } else {
          setError(result.errors[0])
          toast(`同步出错: ${result.errors[0]}`, 'error')
        }
      } catch (e: any) {
        setError(e.message)
        toast(`同步失败: ${e.message}`, 'error')
      }
    }, autoSyncInterval * 60 * 1000)

    return () => { if (syncTimerRef.current) clearInterval(syncTimerRef.current) }
  }, [vaultPath, autoSyncInterval])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {!focusMode && <TitleBar />}
      {vaultPath ? (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: 'var(--sidebar-bg)', minHeight: 0, alignItems: 'stretch' }}>
          {!sidebarCollapsed && (
            <>
              <Sidebar width={sidebarWidth} />
              <ResizeHandle side="left" onResize={(delta) => resizeSidebar(delta)} />
            </>
          )}
          <main style={{ flex: 1, overflow: 'hidden', background: 'var(--editor-bg)', borderRadius: '12px 12px 0 0', marginLeft: 4, marginRight: 4, minWidth: 0 }}>
            {mainView === 'editor' ? <Editor /> : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>知识图谱</span>
                  <button
                    onClick={() => setMainView('editor')}
                    style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    返回编辑器
                  </button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Suspense fallback={null}><GraphView /></Suspense>
                </div>
              </div>
            )}
          </main>
          {rightPanel !== 'none' && (
            <>
              <ResizeHandle side="right" onResize={(delta) => resizeRightPanel(delta)} />
              <aside style={{ width: rightPanelWidth, background: 'var(--editor-bg)', borderRadius: '12px 12px 0 0', marginRight: 4, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 44, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {rightPanel === 'graph' ? '知识图谱' : rightPanel === 'chat' ? 'AI 对话' : rightPanel === 'tags' ? '标签' : rightPanel === 'calendar' ? '日历' : rightPanel === 'kanban' ? '看板' : rightPanel === 'history' ? '版本历史' : '大纲'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {rightPanel === 'graph' && (
                    <button
                      onClick={() => { setMainView('graph'); toggleRightPanel('graph') }}
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                      title="全屏图谱"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => toggleRightPanel(rightPanel)}
                    style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <Suspense fallback={null}>
                {rightPanel === 'graph' && <GraphView />}
                {rightPanel === 'chat' && <ChatPanel />}
                {rightPanel === 'outline' && <OutlinePanel />}
                {rightPanel === 'tags' && <TagsPanel />}
                {rightPanel === 'calendar' && <CalendarPanel />}
                {rightPanel === 'kanban' && <KanbanPanel />}
                {rightPanel === 'history' && <HistoryPanel />}
                </Suspense>
              </div>
            </aside>
            </>
          )}
        </div>
      ) : (
        <WelcomeScreen />
      )}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <Suspense fallback={null}>
        {settingsOpen && <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        {searchOpen && <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />}
        {commandPaletteOpen && <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />}
        {trashOpen && <TrashPanel open={trashOpen} onClose={() => setTrashOpen(false)} />}
      </Suspense>
      <ToastContainer />
      <GraphGenerator open={graphGenPaths.length > 0} filePaths={graphGenPaths} onClose={() => setGraphGenPaths([])} />
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
    </div>
  )
}
