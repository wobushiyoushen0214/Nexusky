import { contextBridge, ipcRenderer } from 'electron'
import type { AINotesProgress, AIStreamEvent, AgentStepUpdateEvent, ChatSource, EmbeddingStatus, IPCChannelMap, IPCChannel, ProactiveSuggestion } from '@shared/types/ipc'

type InvokeFunction = <K extends IPCChannel>(
  channel: K,
  params: IPCChannelMap[K]['params']
) => Promise<IPCChannelMap[K]['result']>

const invoke: InvokeFunction = (channel, params) => {
  return ipcRenderer.invoke(channel, params)
}

const SEND_ALLOWLIST: ReadonlySet<string> = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:new',
  'theme:change',
])

const safeSend = (channel: string, ...args: unknown[]) => {
  if (typeof channel !== 'string' || !SEND_ALLOWLIST.has(channel)) {
    // Swallow disallowed channels silently in the renderer; the main
    // process side does not even register handlers for them. This makes
    // a hijacked renderer unable to reach arbitrary ipcMain.on listeners
    // that may be added in the future.
    console.warn('[preload] blocked send to disallowed channel', channel)
    return
  }
  ipcRenderer.send(channel, ...args)
}

const api = {
  invoke,
  send: safeSend,
  onFileChanged: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path)
    ipcRenderer.on('file:changed', handler)
    return () => { ipcRenderer.removeListener('file:changed', handler) }
  },
  onVaultChanged: (callback: (changedPaths: string[]) => void) => {
    const handler = (_event: unknown, changedPaths?: string[]) => callback(changedPaths || [])
    ipcRenderer.on('vault:files-changed', handler)
    return () => { ipcRenderer.removeListener('vault:files-changed', handler) }
  },
  onAiStream: (callback: (event: AIStreamEvent) => void) => {
    const handler = (_event: unknown, data: AIStreamEvent) => callback(data)
    ipcRenderer.on('ai:stream', handler)
    return () => { ipcRenderer.removeListener('ai:stream', handler) }
  },
  onAiSources: (callback: (sources: ChatSource[]) => void) => {
    const handler = (_event: unknown, data: ChatSource[]) => callback(data)
    ipcRenderer.on('ai:sources', handler)
    return () => { ipcRenderer.removeListener('ai:sources', handler) }
  },
  onAiEditStream: (callback: (event: { type: string; content?: string }) => void) => {
    const handler = (_event: unknown, data: { type: string; content?: string }) => callback(data)
    ipcRenderer.on('ai:edit-stream', handler)
    return () => { ipcRenderer.removeListener('ai:edit-stream', handler) }
  },
  onAiGraphProgress: (callback: (data: { content: string }) => void) => {
    const handler = (_event: unknown, data: { content: string }) => callback(data)
    ipcRenderer.on('ai:graph-progress', handler)
    return () => { ipcRenderer.removeListener('ai:graph-progress', handler) }
  },
  onAiGraphDone: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('ai:graph-done', handler)
    return () => { ipcRenderer.removeListener('ai:graph-done', handler) }
  },
  onAiNotesProgress: (callback: (data: AINotesProgress) => void) => {
    const handler = (_event: unknown, data: AINotesProgress) => callback(data)
    ipcRenderer.on('ai:generate-notes-progress', handler)
    return () => { ipcRenderer.removeListener('ai:generate-notes-progress', handler) }
  },
  onAiMemoryProgress: (callback: (data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => void) => {
    const handler = (_event: unknown, data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => callback(data)
    ipcRenderer.on('ai:memory-progress', handler)
    return () => { ipcRenderer.removeListener('ai:memory-progress', handler) }
  },
  onEmbedProgress: (callback: (data: EmbeddingStatus) => void) => {
    const handler = (_event: unknown, data: EmbeddingStatus) => callback(data)
    ipcRenderer.on('embed:progress', handler)
    return () => { ipcRenderer.removeListener('embed:progress', handler) }
  },
  onUpdaterAvailable: (callback: (data: { version: string }) => void) => {
    const handler = (_event: unknown, data: { version: string }) => callback(data)
    ipcRenderer.on('updater:available', handler)
    return () => { ipcRenderer.removeListener('updater:available', handler) }
  },
  onUpdaterProgress: (callback: (data: { percent: number }) => void) => {
    const handler = (_event: unknown, data: { percent: number }) => callback(data)
    ipcRenderer.on('updater:progress', handler)
    return () => { ipcRenderer.removeListener('updater:progress', handler) }
  },
  onUpdaterDownloaded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('updater:downloaded', handler)
    return () => { ipcRenderer.removeListener('updater:downloaded', handler) }
  },
  onQuickCapture: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('quick-capture', handler)
    return () => { ipcRenderer.removeListener('quick-capture', handler) }
  },
  onProactiveEmitted: (callback: (suggestion: ProactiveSuggestion) => void) => {
    const handler = (_event: unknown, data: ProactiveSuggestion) => callback(data)
    ipcRenderer.on('proactive:emitted', handler)
    return () => { ipcRenderer.removeListener('proactive:emitted', handler) }
  },
  onAgentStepUpdate: (callback: (event: AgentStepUpdateEvent) => void) => {
    const handler = (_event: unknown, data: AgentStepUpdateEvent) => callback(data)
    ipcRenderer.on('agent:step-update', handler)
    return () => { ipcRenderer.removeListener('agent:step-update', handler) }
  },
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    newWindow: () => ipcRenderer.send('window:new')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
