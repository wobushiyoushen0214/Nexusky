export type SyncProviderType = 'supabase' | 'icloud' | 'onedrive' | 'webdav'

export interface SyncFileInfo {
  path: string
  hash: string
  updatedAt: string
}

export interface SyncConflict {
  path: string
  localHash: string
  remoteHash: string
  remoteUpdatedAt: string
}

export interface SyncResult {
  total: number
  pushed: number
  pulled: number
  conflicts: SyncConflict[]
  errors: string[]
}

export interface SyncProvider {
  readonly type: SyncProviderType
  readonly name: string

  isConfigured(): boolean
  testConnection(): Promise<{ ok: boolean; error?: string }>

  pushFile(vaultPath: string, filePath: string): Promise<boolean>
  pullFile(vaultPath: string, relPath: string): Promise<boolean>

  listRemoteFiles(): Promise<SyncFileInfo[]>

  syncAll(vaultPath: string): Promise<SyncResult>
  pullAll(vaultPath: string): Promise<SyncResult>
}
