import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerSettingsIPC } from '../packages/main/src/ipc/settings.ipc'
import { store } from '../packages/main/src/services/store'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../packages/main/src/services/store', () => ({
  store: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

describe('Settings Memory Config IPC', () => {
  let handlers: Map<string, Function>

  beforeEach(() => {
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    vi.mocked(store.get).mockReturnValue(undefined)
    registerSettingsIPC()
  })

  describe('settings:get-memory-config', () => {
    it('returns default memory config when no custom config exists', async () => {
      vi.mocked(store.get).mockReturnValue(undefined)
      const handler = handlers.get('settings:get-memory-config')!
      const result = await handler({}, undefined)

      expect(result).toEqual({
        enabled: true,
        autoGenerate: false,
        retentionDays: 90,
        maxTokens: 100000
      })
    })

    it('merges partial custom config with defaults', async () => {
      vi.mocked(store.get).mockReturnValue({
        enabled: false,
        retentionDays: 60
      })
      const handler = handlers.get('settings:get-memory-config')!
      const result = await handler({}, undefined)

      expect(result).toEqual({
        enabled: false,
        autoGenerate: false,
        retentionDays: 60,
        maxTokens: 100000
      })
    })

    it('returns full custom config when all fields are set', async () => {
      vi.mocked(store.get).mockReturnValue({
        enabled: false,
        autoGenerate: true,
        retentionDays: 30,
        maxTokens: 50000
      })
      const handler = handlers.get('settings:get-memory-config')!
      const result = await handler({}, undefined)

      expect(result).toEqual({
        enabled: false,
        autoGenerate: true,
        retentionDays: 30,
        maxTokens: 50000
      })
    })
  })

  describe('settings:save-memory-config', () => {
    it('saves memory config to store', async () => {
      const handler = handlers.get('settings:save-memory-config')!
      const config = {
        enabled: false,
        autoGenerate: true,
        retentionDays: 30,
        maxTokens: 50000
      }
      const result = await handler({}, config)

      expect(result).toEqual({ ok: true })
      expect(store.set).toHaveBeenCalledWith('memoryConfig', config)
    })

    it('saves all memory config fields', async () => {
      const handler = handlers.get('settings:save-memory-config')!
      const config = {
        enabled: true,
        autoGenerate: false,
        retentionDays: 120,
        maxTokens: 200000
      }
      await handler({}, config)

      expect(store.set).toHaveBeenCalledWith('memoryConfig', config)
    })
  })

  describe('integration: get after save', () => {
    it('retrieves saved config correctly', async () => {
      let savedConfig: any = undefined
      vi.mocked(store.set).mockImplementation((key, value) => {
        if (key === 'memoryConfig') savedConfig = value
      })
      vi.mocked(store.get).mockImplementation((key) => {
        if (key === 'memoryConfig') return savedConfig
        return undefined
      })

      const saveHandler = handlers.get('settings:save-memory-config')!
      const getHandler = handlers.get('settings:get-memory-config')!

      const config = {
        enabled: false,
        autoGenerate: true,
        retentionDays: 45,
        maxTokens: 75000
      }

      await saveHandler({}, config)
      const result = await getHandler({}, undefined)

      expect(result).toEqual(config)
    })
  })
})
