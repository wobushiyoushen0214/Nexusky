import { useEffect, useState } from 'react'
import { useVaultStore } from './stores/vault-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'
import { QuickSwitcher } from './components/QuickSwitcher'
import { GraphView } from './components/graph/GraphView'
import { ChatPanel } from './components/ai/ChatPanel'
import { Settings } from './components/settings/Settings'

export default function App() {
  const { vaultPath, loadVault } = useVaultStore()
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rightPanel, setRightPanel] = useState<'none' | 'graph' | 'chat'>('none')

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
        setRightPanel((p) => p === 'graph' ? 'none' : 'graph')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        setRightPanel((p) => p === 'chat' ? 'none' : 'chat')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      <TitleBar />
      {vaultPath ? (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden bg-[var(--editor-bg)]">
            <Editor />
          </main>
          {rightPanel === 'graph' && (
            <aside className="w-[360px] h-full border-l border-[var(--border-subtle)] bg-[var(--bg-base)] shrink-0">
              <div className="h-9 px-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
                <span className="text-[12px] text-[var(--text-secondary)] font-medium">知识图谱</span>
                <button
                  onClick={() => setRightPanel('none')}
                  className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="h-[calc(100%-36px)]">
                <GraphView />
              </div>
            </aside>
          )}
          {rightPanel === 'chat' && (
            <aside className="w-[380px] h-full border-l border-[var(--border-subtle)] bg-[var(--bg-base)] shrink-0 flex flex-col">
              <div className="h-9 px-3 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
                <span className="text-[12px] text-[var(--text-secondary)] font-medium">AI 对话</span>
                <button
                  onClick={() => setRightPanel('none')}
                  className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel />
              </div>
            </aside>
          )}
        </div>
      ) : (
        <WelcomeScreen />
      )}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
