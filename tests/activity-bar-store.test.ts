import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('activity bar store', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('keeps overview first when loading legacy visible item order', async () => {
    localStorage.setItem('nexusky-activity-bar', JSON.stringify({
      visibleIds: ['files', 'search', 'chat', 'overview', 'graph']
    }))

    const { useActivityBarStore } = await import('../packages/renderer/src/stores/activity-bar-store')

    expect(useActivityBarStore.getState().visibleIds).toEqual(['overview', 'files', 'search', 'chat', 'graph'])
  })

  it('keeps memory out of fresh defaults while allowing explicit opt-in', async () => {
    const { useActivityBarStore } = await import('../packages/renderer/src/stores/activity-bar-store')

    expect(useActivityBarStore.getState().visibleIds).toEqual(['overview', 'files', 'search', 'chat', 'graph'])

    useActivityBarStore.getState().toggleVisibility('memory')

    expect(useActivityBarStore.getState().visibleIds).toEqual(['overview', 'files', 'search', 'chat', 'graph', 'memory'])
  })
})
