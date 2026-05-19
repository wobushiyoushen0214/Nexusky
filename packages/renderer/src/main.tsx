import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installTauriApi } from './tauri-api'
import './styles/globals.css'

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const root = document.getElementById('root')
  if (!root) return

  ReactDOM.createRoot(root).render(
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e1e1e', color: '#dcddde', padding: 32 }}>
      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>应用启动失败</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: '#999999', whiteSpace: 'pre-wrap' }}>{message}</div>
      </div>
    </div>
  )
}

async function bootstrap() {
  try {
    installTauriApi()
    const { default: App } = await import('./App')

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    )
  } catch (error) {
    console.error('[bootstrap]', error)
    renderFatalError(error)
  }
}

void bootstrap()
