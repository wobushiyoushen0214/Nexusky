import { useEffect } from 'react'
import { useVaultStore } from './stores/vault-store'
import { useUIStore } from './stores/ui-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'
import { QuickSwitcher } from './components/QuickSwitcher'
import { GraphView } from './components/graph/GraphView'
import { ChatPanel } from './components/ai/ChatPanel'
import { Settings } from './components/settings/Settings'
import { SearchPanel } from './components/SearchPanel'
import { OutlinePanel } from './components/editor/OutlinePanel'

export default function App() {
  const { vaultPath, loadVault } = useVaultStore()
  const { rightPanel, quickSwitcherOpen, settingsOpen, searchOpen, toggleRightPanel, setQuickSwitcherOpen, setSettingsOpen, setSearchOpen } = useUIStore()

  useEffect(() => {
    loadVault()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        setQuickSwitcherOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        toggleRightPanel('graph')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        toggleRightPanel('chat')
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault()
        setSettingsOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      <TitleBar />
      {vaultPath ? (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <main style={{ flex: 1, overflow: 'hidden', background: 'var(--editor-bg)' }}>
            <Editor />
          </main>
          {rightPanel !== 'none' && (
            <aside className="animate-slide-in-right" style={{ width: 360, height: '100%', borderLeft: '1px solid var(--border-glow)', background: 'var(--bg-glass-solid)', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', flexShrink: 0, display: 'flex', flexDirection: 'column', boxShadow: 'inset 1px 0 0 var(--border-shine), var(--shadow-md)' } as React.CSSProperties}>
              <div style={{ height: 40, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                  {rightPanel === 'graph' ? '知识图谱' : rightPanel === 'chat' ? 'AI 对话' : '大纲'}
                </span>
                <button
                  onClick={() => toggleRightPanel(rightPanel)}
                  style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {rightPanel === 'graph' && <GraphView />}
                {rightPanel === 'chat' && <ChatPanel />}
                {rightPanel === 'outline' && <OutlinePanel />}
              </div>
            </aside>
          )}
        </div>
      ) : (
        <WelcomeScreen />
      )}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
