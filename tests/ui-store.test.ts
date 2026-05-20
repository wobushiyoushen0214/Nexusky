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
  return mock
}

describe('ui store workspace widths', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('stores file sidebar widths per vault file-panel scope', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setSidebarWidthScope('files:/vault/a')
    store.setSidebarWidth(300)

    store.setSidebarWidthScope('files:/vault/b')
    expect(useUIStore.getState().sidebarWidth).toBe(240)
    store.setSidebarWidth(360)

    store.setSidebarWidthScope('files:/vault/a')
    expect(useUIStore.getState().sidebarWidth).toBe(300)

    store.setSidebarWidthScope('files:/vault/b')
    expect(useUIStore.getState().sidebarWidth).toBe(360)
    expect(localStorage.getItem('nexusky-sidebar-width')).toBeNull()
    expect(JSON.parse(localStorage.getItem('nexusky-sidebar-widths') || '{}')).toEqual({
      'files:/vault/a': 300,
      'files:/vault/b': 360,
    })
  })

  it('stores workspace layout per vault scope', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/a')
    store.setMainView('graph')
    store.toggleSidebar()
    store.setRightPanel('chat')

    store.setWorkspaceScope('workspace:/vault/b')
    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().rightPanel).toBe('none')
    store.setRightPanel('tags')

    store.setWorkspaceScope('workspace:/vault/a')
    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().rightPanel).toBe('chat')

    store.setWorkspaceScope('workspace:/vault/b')
    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().rightPanel).toBe('tags')
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'graph', rightPanel: 'chat', sidebarCollapsed: true },
      'workspace:/vault/b': { mainView: 'editor', rightPanel: 'tags', sidebarCollapsed: false },
    })
  })

  it('keeps note-scoped right panels unavailable outside the editor view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/a')
    store.setRightPanel('tags')
    expect(useUIStore.getState().rightPanel).toBe('tags')

    store.setMainView('graph')
    expect(useUIStore.getState().rightPanel).toBe('none')

    store.setRightPanel('tags')
    expect(useUIStore.getState().rightPanel).toBe('none')
    store.toggleRightPanel('outline')
    expect(useUIStore.getState().rightPanel).toBe('none')

    store.setRightPanel('chat')
    expect(useUIStore.getState().rightPanel).toBe('chat')
    store.setMainView('canvas')
    expect(useUIStore.getState().rightPanel).toBe('chat')

    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'canvas', rightPanel: 'chat', sidebarCollapsed: false },
    })
  })

  it('sanitizes saved note-scoped panels when restoring non-editor views', async () => {
    localStorage.setItem('nexusky-workspace-layouts', JSON.stringify({
      'workspace:/vault/a': { mainView: 'graph', rightPanel: 'tags', sidebarCollapsed: true },
    }))
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')

    useUIStore.getState().setWorkspaceScope('workspace:/vault/a')

    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  })

  it('uses legacy global workspace layout only as a fallback', async () => {
    localStorage.setItem('nexusky-workspace-main-view', 'canvas')
    localStorage.setItem('nexusky-workspace-right-panel', 'chat')
    localStorage.setItem('nexusky-workspace-sidebar-collapsed', 'true')
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/a')
    expect(useUIStore.getState().mainView).toBe('canvas')
    expect(useUIStore.getState().rightPanel).toBe('chat')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    store.setMainView('editor')
    expect(localStorage.getItem('nexusky-workspace-main-view')).toBe('canvas')
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'editor', rightPanel: 'chat', sidebarCollapsed: true },
    })
  })

  it('uses the legacy global sidebar width only as a fallback', async () => {
    localStorage.setItem('nexusky-sidebar-width', '315')
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setSidebarWidthScope('files:/vault/a')
    expect(useUIStore.getState().sidebarWidth).toBe(315)

    store.setSidebarWidth(330)
    expect(localStorage.getItem('nexusky-sidebar-width')).toBe('315')
    expect(JSON.parse(localStorage.getItem('nexusky-sidebar-widths') || '{}')).toEqual({
      'files:/vault/a': 330,
    })
  })

  it('resets saved widths without losing the active sidebar scope', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setSidebarWidthScope('files:/vault/a')
    store.setWorkspaceScope('workspace:/vault/a')
    store.setMainView('graph')
    store.setSidebarWidth(300)
    store.resetWorkspaceLayout()

    expect(useUIStore.getState().workspaceScope).toBe('workspace:/vault/a')
    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().sidebarWidthScope).toBe('files:/vault/a')
    expect(useUIStore.getState().sidebarWidth).toBe(240)
    expect(localStorage.getItem('nexusky-workspace-layouts')).toBeNull()
    expect(localStorage.getItem('nexusky-sidebar-widths')).toBeNull()

    store.resizeSidebar(10)
    expect(JSON.parse(localStorage.getItem('nexusky-sidebar-widths') || '{}')).toEqual({
      'files:/vault/a': 250,
    })
  })
})
