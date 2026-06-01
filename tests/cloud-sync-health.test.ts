import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeData = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../packages/main/src/services/store', () => ({
  store: {
    get: vi.fn((key: string) => storeData.get(key)),
    set: vi.fn((key: string, value: unknown) => { storeData.set(key, value) })
  }
}))

vi.mock('../packages/main/src/services/cloud/supabase-provider', () => {
  class SupabaseSyncProvider {
    readonly type = 'supabase' as const
    readonly name = 'Supabase'
    isConfigured(): boolean { return false }
    async testConnection(): Promise<{ ok: boolean; error?: string }> { return { ok: true } }
    async pushFile(): Promise<boolean> { return true }
    async pullFile(): Promise<boolean> { return true }
    async deleteRemote(): Promise<boolean> { return true }
    async listRemoteFiles(): Promise<never[]> { return [] }
    async syncAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
    async pullAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
  }
  return { SupabaseSyncProvider }
})

vi.mock('../packages/main/src/services/cloud/icloud-provider', () => {
  class ICloudSyncProvider {
    readonly type = 'icloud' as const
    readonly name = 'iCloud Drive'
    isConfigured(): boolean { return false }
    async testConnection(): Promise<{ ok: boolean; error?: string }> { return { ok: true } }
    async pushFile(): Promise<boolean> { return true }
    async pullFile(): Promise<boolean> { return true }
    async deleteRemote(): Promise<boolean> { return true }
    async listRemoteFiles(): Promise<never[]> { return [] }
    async syncAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
    async pullAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
  }
  return { ICloudSyncProvider }
})

vi.mock('../packages/main/src/services/cloud/onedrive-provider', () => {
  class OneDriveSyncProvider {
    readonly type = 'onedrive' as const
    readonly name = 'OneDrive'
    isConfigured(): boolean { return false }
    async testConnection(): Promise<{ ok: boolean; error?: string }> { return { ok: true } }
    async pushFile(): Promise<boolean> { return true }
    async pullFile(): Promise<boolean> { return true }
    async deleteRemote(): Promise<boolean> { return true }
    async listRemoteFiles(): Promise<never[]> { return [] }
    async syncAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
    async pullAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
  }
  return { OneDriveSyncProvider }
})

vi.mock('../packages/main/src/services/cloud/webdav-provider', () => {
  class WebDavSyncProvider {
    readonly type = 'webdav' as const
    readonly name = 'WebDAV'
    isConfigured(): boolean { return false }
    async testConnection(): Promise<{ ok: boolean; error?: string }> { return { ok: true } }
    async pushFile(): Promise<boolean> { return true }
    async pullFile(): Promise<boolean> { return true }
    async deleteRemote(): Promise<boolean> { return true }
    async listRemoteFiles(): Promise<never[]> { return [] }
    async syncAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
    async pullAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
  }
  return { WebDavSyncProvider }
})

vi.mock('../packages/main/src/services/cloud/s3-provider', () => {
  class S3SyncProvider {
    readonly type = 's3' as const
    readonly name = 'S3'
    isConfigured(): boolean { return false }
    async testConnection(): Promise<{ ok: boolean; error?: string }> { return { ok: true } }
    async pushFile(): Promise<boolean> { return true }
    async pullFile(): Promise<boolean> { return true }
    async deleteRemote(): Promise<boolean> { return true }
    async listRemoteFiles(): Promise<never[]> { return [] }
    async syncAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
    async pullAll(): Promise<{ total: number; pushed: number; pulled: number; conflicts: never[]; errors: string[] }> {
      return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    }
  }
  return { S3SyncProvider }
})

describe('cloud sync health', () => {
  beforeEach(() => {
    storeData.clear()
    vi.resetModules()
  })

  it('returns an idle health snapshot before any sync run', async () => {
    const { getSyncHealth } = await import('../packages/main/src/services/cloud/manager')

    const health = getSyncHealth('/vault')

    expect(health.status).toBe('idle')
    expect(health.activeProvider).toBe('supabase')
    expect(health.activeProviderConfigured).toBe(false)
    expect(health.offlineQueueSize).toBe(0)
    expect(health.lastRunAt).toBeNull()
    expect(health.lastError).toBeNull()
  })

  it('records sync failures so the renderer can show the last failure reason', async () => {
    const { getSyncHealth, syncAll } = await import('../packages/main/src/services/cloud/manager')

    const result = await syncAll('/vault')
    const health = getSyncHealth('/vault')

    expect(result.errors[0]).toContain('未配置')
    expect(health.status).toBe('error')
    expect(health.lastDirection).toBe('sync')
    expect(health.lastRunAt).toEqual(expect.any(Number))
    expect(health.lastError).toContain('未配置')
  })

  it('records pull failures with the pull direction', async () => {
    const { getSyncHealth, pullAll } = await import('../packages/main/src/services/cloud/manager')

    const result = await pullAll('/vault')
    const health = getSyncHealth('/vault')

    expect(result.errors[0]).toContain('未配置')
    expect(health.status).toBe('error')
    expect(health.lastDirection).toBe('pull')
    expect(health.errors).toBe(1)
    expect(health.lastError).toContain('未配置')
  })
})
