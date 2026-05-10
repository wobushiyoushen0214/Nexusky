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
  onFileChanged: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
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
