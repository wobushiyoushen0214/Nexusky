import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installTauriApi } from './tauri-api'
import './styles/globals.css'

installTauriApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
