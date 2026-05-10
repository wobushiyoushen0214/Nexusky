export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface IPCChannelMap {
  'file:read': { params: { path: string }; result: string }
  'file:write': { params: { path: string; content: string }; result: void }
  'file:list': { params: { dirPath: string }; result: FileEntry[] }
  'file:create': { params: { path: string; content?: string }; result: void }
  'file:delete': { params: { path: string }; result: void }
  'file:rename': { params: { oldPath: string; newPath: string }; result: void }
  'vault:select': { params: undefined; result: string | null }
  'vault:get': { params: undefined; result: string | null }
}

export type IPCChannel = keyof IPCChannelMap
