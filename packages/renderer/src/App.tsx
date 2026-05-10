import { useEffect } from 'react'
import { useVaultStore } from './stores/vault-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'

export default function App() {
  const { vaultPath, loadVault } = useVaultStore()

  useEffect(() => {
    loadVault()
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
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  )
}
