import type { AINotesProgress, AIStreamEvent, ChatSource, EmbeddingStatus, IPCChannel, IPCChannelMap } from '@shared/types/ipc'
import type { ElectronAPI } from '../../main/src/preload'

type TauriUnlisten = () => void

interface TauriEvent<T = unknown> {
  event: string
  id: number
  payload: T
}

interface TauriGlobal {
  core: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  }
  event: {
    listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<TauriUnlisten>
    emit(event: string, payload?: unknown): Promise<void>
  }
  window: {
    getCurrentWindow(): {
      minimize(): Promise<void>
      toggleMaximize(): Promise<void>
      close(): Promise<void>
    }
  }
}

function getTauri(): TauriGlobal | null {
  const maybeWindow = window as Window & { __TAURI__?: TauriGlobal }
  return maybeWindow.__TAURI__ ?? null
}

function getPlatform(): NodeJS.Platform {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('win')) return 'win32'
  if (platform.includes('linux')) return 'linux'
  return 'linux'
}

function listen<T>(eventName: string, callback: (payload: T) => void): () => void {
  const tauri = getTauri()
  if (!tauri) return () => {}

  let disposed = false
  let unlisten: TauriUnlisten | null = null

  tauri.event.listen<T>(eventName, (event) => {
    callback(event.payload)
  }).then((cleanup) => {
    if (disposed) cleanup()
    else unlisten = cleanup
  }).catch(() => {})

  return () => {
    disposed = true
    unlisten?.()
  }
}

type InvokeFunction = <K extends IPCChannel>(
  channel: K,
  params: IPCChannelMap[K]['params']
) => Promise<IPCChannelMap[K]['result']>

function createTauriApi(tauri: TauriGlobal): ElectronAPI {
  const invoke: InvokeFunction = (channel, params) => {
    return tauri.core.invoke('api_invoke', { channel, params })
  }

  const currentWindow = tauri.window.getCurrentWindow()

  return {
    invoke,
    send: (channel: string, ...args: unknown[]) => {
      void tauri.event.emit(channel, args)
    },
    onFileChanged: (callback: (path: string) => void) => listen<string>('file:changed', callback),
    onVaultChanged: (callback: () => void) => listen<unknown>('vault:files-changed', () => callback()),
    onAiStream: (callback: (event: AIStreamEvent) => void) => listen<AIStreamEvent>('ai:stream', callback),
    onAiSources: (callback: (sources: ChatSource[]) => void) => listen<ChatSource[]>('ai:sources', callback),
    onAiEditStream: (callback: (event: { type: string; content?: string }) => void) => listen<{ type: string; content?: string }>('ai:edit-stream', callback),
    onAiGraphProgress: (callback: (data: { content: string }) => void) => listen<{ content: string }>('ai:graph-progress', callback),
    onAiGraphDone: (callback: () => void) => listen<unknown>('ai:graph-done', () => callback()),
    onAiNotesProgress: (callback: (data: AINotesProgress) => void) => listen<AINotesProgress>('ai:generate-notes-progress', callback),
    onAiMemoryProgress: (callback: (data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => void) => {
      return listen<{ current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }>('ai:memory-progress', callback)
    },
    onEmbedProgress: (callback: (data: EmbeddingStatus) => void) => listen<EmbeddingStatus>('embed:progress', callback),
    onUpdaterAvailable: (callback: (data: { version: string }) => void) => listen<{ version: string }>('updater:available', callback),
    onUpdaterProgress: (callback: (data: { percent: number }) => void) => listen<{ percent: number }>('updater:progress', callback),
    onUpdaterDownloaded: (callback: () => void) => listen<unknown>('updater:downloaded', () => callback()),
    onQuickCapture: (callback: () => void) => listen<unknown>('quick-capture', () => callback()),
    platform: getPlatform(),
    windowControls: {
      minimize: () => { void currentWindow.minimize() },
      maximize: () => { void currentWindow.toggleMaximize() },
      close: () => { void currentWindow.close() }
    }
  }
}

export function installTauriApi(): void {
  if (window.api) return
  const tauri = getTauri()
  if (!tauri) return
  window.api = createTauriApi(tauri)
}
