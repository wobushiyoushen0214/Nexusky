import { contextBridge, ipcRenderer } from 'electron'
import type { IPCChannelMap, IPCChannel } from '@shared/types/ipc'

type InvokeFunction = <K extends IPCChannel>(
  channel: K,
  params: IPCChannelMap[K]['params']
) => Promise<IPCChannelMap[K]['result']>

const invoke: InvokeFunction = (channel, params) => {
  return ipcRenderer.invoke(channel, params)
}

const api = {
  invoke,
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
  onFileChanged: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
  },
  onVaultChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('vault:files-changed', handler)
    return () => ipcRenderer.removeListener('vault:files-changed', handler)
  },
  onAiStream: (callback: (event: { type: string; content: string }) => void) => {
    const handler = (_event: unknown, data: { type: string; content: string }) => callback(data)
    ipcRenderer.on('ai:stream', handler)
    return () => ipcRenderer.removeListener('ai:stream', handler)
  },
  onAiSources: (callback: (sources: any[]) => void) => {
    const handler = (_event: unknown, data: any[]) => callback(data)
    ipcRenderer.on('ai:sources', handler)
    return () => ipcRenderer.removeListener('ai:sources', handler)
  },
  onAiGraphProgress: (callback: (data: { content: string }) => void) => {
    const handler = (_event: unknown, data: { content: string }) => callback(data)
    ipcRenderer.on('ai:graph-progress', handler)
    return () => ipcRenderer.removeListener('ai:graph-progress', handler)
  },
  onAiGraphDone: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('ai:graph-done', handler)
    return () => ipcRenderer.removeListener('ai:graph-done', handler)
  },
  onAiNotesProgress: (callback: (data: { stage: string; message: string; plan?: any[]; current?: number; total?: number }) => void) => {
    const handler = (_event: unknown, data: any) => callback(data)
    ipcRenderer.on('ai:generate-notes-progress', handler)
    return () => ipcRenderer.removeListener('ai:generate-notes-progress', handler)
  },
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
