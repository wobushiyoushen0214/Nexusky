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

describe('Settings Keybindings IPC', () => {
  let handlers: Map<string, Function>

  beforeEach(() => {
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    vi.mocked(store.get).mockReturnValue({})
    registerSettingsIPC()
  })

  describe('settings:get-keybindings', () => {
    it('returns default keybindings when no custom bindings exist', async () => {
      vi.mocked(store.get).mockReturnValue({})
      const handler = handlers.get('settings:get-keybindings')!
      const result = await handler({}, undefined)

      expect(result).toHaveLength(5)
      expect(result[0]).toMatchObject({
        id: 'save-note',
        label: '保存笔记',
        key: 'Cmd+S',
        description: '保存当前笔记'
      })
    })

    it('merges custom keybindings with defaults', async () => {
      vi.mocked(store.get).mockReturnValue({
        'save-note': 'Ctrl+S',
        'new-note': 'Ctrl+N'
      })
      const handler = handlers.get('settings:get-keybindings')!
      const result = await handler({}, undefined)

      const saveNote = result.find((b: any) => b.id === 'save-note')
      const newNote = result.find((b: any) => b.id === 'new-note')
      const search = result.find((b: any) => b.id === 'search')

      expect(saveNote.key).toBe('Ctrl+S')
      expect(newNote.key).toBe('Ctrl+N')
      expect(search.key).toBe('Cmd+F')
    })
  })

  describe('settings:set-keybinding', () => {
    it('saves custom keybinding', async () => {
      vi.mocked(store.get).mockReturnValue({})
      const handler = handlers.get('settings:set-keybinding')!
      const result = await handler({}, { id: 'save-note', key: 'Ctrl+S' })

      expect(result).toEqual({ ok: true })
      expect(store.set).toHaveBeenCalledWith('keybindings', {
        'save-note': 'Ctrl+S'
      })
    })

    it('updates existing custom keybinding', async () => {
      vi.mocked(store.get).mockReturnValue({
        'save-note': 'Ctrl+S',
        'new-note': 'Ctrl+N'
      })
      const handler = handlers.get('settings:set-keybinding')!
      await handler({}, { id: 'save-note', key: 'Alt+S' })

      expect(store.set).toHaveBeenCalledWith('keybindings', {
        'save-note': 'Alt+S',
        'new-note': 'Ctrl+N'
      })
    })
  })

  describe('settings:reset-keybinding', () => {
    it('removes custom keybinding', async () => {
      vi.mocked(store.get).mockReturnValue({
        'save-note': 'Ctrl+S',
        'new-note': 'Ctrl+N'
      })
      const handler = handlers.get('settings:reset-keybinding')!
      const result = await handler({}, { id: 'save-note' })

      expect(result).toEqual({ ok: true })
      expect(store.set).toHaveBeenCalledWith('keybindings', {
        'new-note': 'Ctrl+N'
      })
    })

    it('handles resetting non-existent custom keybinding', async () => {
      vi.mocked(store.get).mockReturnValue({})
      const handler = handlers.get('settings:reset-keybinding')!
      const result = await handler({}, { id: 'save-note' })

      expect(result).toEqual({ ok: true })
      expect(store.set).toHaveBeenCalledWith('keybindings', {})
    })
  })
})
