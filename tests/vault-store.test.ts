import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileEntry } from '../packages/shared/src/types/ipc'

function installLocalStorageMock() {
  const store = new Map<string, string>()
  const mock: Storage = {
    get length() {
      return store.size
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true
  })
}

function installWindowMock(invoke: ReturnType<typeof vi.fn>) {
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', {
    value: Object.assign(target, { api: { invoke } }),
    configurable: true
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('vault store file refresh', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('emits a local refresh event after replacing the file tree', async () => {
    const files: FileEntry[] = [{ name: 'Note.md', path: '/vault/Note.md', isDirectory: false }]
    const invoke = vi.fn().mockResolvedValue(files)
    installWindowMock(invoke)
    const { useVaultStore, VAULT_FILES_REFRESHED_EVENT } = await import('../packages/renderer/src/stores/vault-store')
    const events: string[] = []
    window.addEventListener(VAULT_FILES_REFRESHED_EVENT, (event) => {
      events.push((event as CustomEvent<{ vaultPath: string }>).detail.vaultPath)
    })

    useVaultStore.getState().setVaultPath('/vault')
    await useVaultStore.getState().refreshFiles()

    expect(useVaultStore.getState().files).toEqual(files)
    expect(events).toEqual(['/vault'])
    expect(invoke).toHaveBeenCalledWith('file:list-shallow', { dirPath: '/vault' })
  })

  it('ignores stale refresh responses so older lists cannot hide new files', async () => {
    const slow = deferred<FileEntry[]>()
    const fast = deferred<FileEntry[]>()
    const invoke = vi.fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise)
    installWindowMock(invoke)
    const { useVaultStore } = await import('../packages/renderer/src/stores/vault-store')
    useVaultStore.getState().setVaultPath('/vault')

    const first = useVaultStore.getState().refreshFiles()
    const second = useVaultStore.getState().refreshFiles()

    const newest = [{ name: 'AI.md', path: '/vault/AI.md', isDirectory: false }]
    fast.resolve(newest)
    await second
    slow.resolve([{ name: 'Old.md', path: '/vault/Old.md', isDirectory: false }])
    await first

    expect(useVaultStore.getState().files).toEqual(newest)
  })
})
