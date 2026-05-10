import { useVaultStore } from './stores/vault-store'
import { Sidebar } from './components/sidebar/Sidebar'
import { Editor } from './components/editor/Editor'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TitleBar } from './components/TitleBar'

export default function App() {
  const vaultPath = useVaultStore((s) => s.vaultPath)

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      {vaultPath ? (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <Editor />
          </main>
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  )
}
