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
  onAiStream: (callback: (event: { type: string; content: string }) => void) => {
    ipcRenderer.removeAllListeners('ai:stream')
    const handler = (_event: unknown, data: { type: string; content: string }) => callback(data)
    ipcRenderer.on('ai:stream', handler)
    return () => ipcRenderer.removeAllListeners('ai:stream')
  },
  onAiSources: (callback: (sources: any[]) => void) => {
    ipcRenderer.removeAllListeners('ai:sources')
    const handler = (_event: unknown, data: any[]) => callback(data)
    ipcRenderer.on('ai:sources', handler)
    return () => ipcRenderer.removeAllListeners('ai:sources')
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
