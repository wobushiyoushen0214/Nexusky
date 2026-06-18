import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE_DEFAULT_VERSION = 'overview-first-v8'

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

function installDocumentMock() {
  const root = {
    lang: '',
    attributes: new Map<string, string>(),
    style: {
      removeProperty: vi.fn(),
      setProperty: vi.fn(),
    },
    setAttribute: vi.fn((name: string, value: string) => {
      root.attributes.set(name, value)
      if (name === 'lang') root.lang = value
    }),
  }
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: root },
    configurable: true
  })
  return root
}

function markWorkspaceDefaultsMigrated() {
  localStorage.setItem('nexusky-workspace-default-version', WORKSPACE_DEFAULT_VERSION)
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

    expect(useUIStore.getState().mainView).toBe('overview')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    store.setWorkspaceScope('workspace:/vault/a')
    store.setMainView('graph')
    store.toggleSidebar()
    store.setRightPanel('chat')

    store.setWorkspaceScope('workspace:/vault/b')
    expect(useUIStore.getState().mainView).toBe('overview')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().rightPanel).toBe('none')
    store.setMainView('editor')
    store.setRightPanel('tags')

    store.setWorkspaceScope('workspace:/vault/a')
    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(useUIStore.getState().rightPanel).toBe('chat')

    store.setWorkspaceScope('workspace:/vault/b')
    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().rightPanel).toBe('tags')
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'graph', rightPanel: 'chat', sidebarCollapsed: false },
      'workspace:/vault/b': { mainView: 'editor', rightPanel: 'tags', sidebarCollapsed: true },
    })
  })

  it('persists memory as a collapsed main workspace view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/memory')
    store.setMainView('memory')

    expect(useUIStore.getState().mainView).toBe('memory')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/memory': { mainView: 'memory', rightPanel: 'none', sidebarCollapsed: true },
    })
  })

  it('opens graph with a consumable maintenance focus', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/graph-focus')
    store.setMainView('editor')
    store.setRightPanel('tags')
    store.focusGraphMaintenance('orphans')

    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().pendingGraphMaintenanceFocus).toBe('orphans')
    expect(useUIStore.getState().consumePendingGraphMaintenanceFocus()).toBe('orphans')
    expect(useUIStore.getState().pendingGraphMaintenanceFocus).toBeNull()
    expect(useUIStore.getState().consumePendingGraphMaintenanceFocus()).toBeNull()
  })

  it('keeps note-scoped right panels unavailable outside the editor view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/a')
    store.setMainView('editor')
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
    store.setMainView('bases')
    expect(useUIStore.getState().rightPanel).toBe('chat')

    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'bases', rightPanel: 'chat', sidebarCollapsed: true },
    })
  })

  it('sanitizes saved note-scoped panels when restoring non-editor views', async () => {
    markWorkspaceDefaultsMigrated()
    localStorage.setItem('nexusky-workspace-layouts', JSON.stringify({
      'workspace:/vault/a': { mainView: 'graph', rightPanel: 'tags', sidebarCollapsed: true },
    }))
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')

    useUIStore.getState().setWorkspaceScope('workspace:/vault/a')

    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  })

  it('maps retired calendar panels back to no right panel', async () => {
    markWorkspaceDefaultsMigrated()
    localStorage.setItem('nexusky-workspace-layouts', JSON.stringify({
      'workspace:/vault/a': { mainView: 'graph', rightPanel: 'calendar', sidebarCollapsed: true },
    }))
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')

    useUIStore.getState().setWorkspaceScope('workspace:/vault/a')

    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  })

  it('maps retired standalone workspace layouts back to active views', async () => {
    markWorkspaceDefaultsMigrated()
    localStorage.setItem('nexusky-workspace-layouts', JSON.stringify({
      'workspace:/vault/a': { mainView: 'kanban', rightPanel: 'chat', sidebarCollapsed: true },
      'workspace:/vault/b': { mainView: 'reader', rightPanel: 'none', sidebarCollapsed: false },
      'workspace:/vault/c': { mainView: 'canvas', rightPanel: 'chat', sidebarCollapsed: true },
      'workspace:/vault/d': { mainView: 'maintenance', rightPanel: 'maintenance', sidebarCollapsed: false },
    }))
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')

    useUIStore.getState().setWorkspaceScope('workspace:/vault/a')

    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().rightPanel).toBe('chat')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    useUIStore.getState().setWorkspaceScope('workspace:/vault/b')

    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)

    useUIStore.getState().setWorkspaceScope('workspace:/vault/c')

    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().rightPanel).toBe('chat')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    useUIStore.getState().setWorkspaceScope('workspace:/vault/d')

    expect(useUIStore.getState().mainView).toBe('editor')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('ignores legacy global workspace layout after overview-first migration', async () => {
    localStorage.setItem('nexusky-workspace-main-view', 'canvas')
    localStorage.setItem('nexusky-workspace-right-panel', 'chat')
    localStorage.setItem('nexusky-workspace-sidebar-collapsed', 'true')
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/a')
    expect(useUIStore.getState().mainView).toBe('overview')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('nexusky-workspace-main-view')).toBeNull()
    expect(localStorage.getItem('nexusky-workspace-right-panel')).toBeNull()
    expect(localStorage.getItem('nexusky-workspace-sidebar-collapsed')).toBeNull()

    store.setMainView('editor')
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/a': { mainView: 'editor', rightPanel: 'none', sidebarCollapsed: true },
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

  it('stores right panel widths per panel without overwriting the legacy fallback', async () => {
    localStorage.setItem('nexusky-right-panel-width', '410')
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setMainView('editor')
    store.setRightPanel('chat')
    expect(useUIStore.getState().rightPanelWidth).toBe(410)
    store.setRightPanelWidth(420)

    store.setRightPanel('outline')
    expect(useUIStore.getState().rightPanelWidth).toBe(410)
    store.setRightPanelWidth(300)

    store.setRightPanel('chat')
    expect(useUIStore.getState().rightPanelWidth).toBe(420)

    store.setRightPanel('outline')
    expect(useUIStore.getState().rightPanelWidth).toBe(300)
    expect(localStorage.getItem('nexusky-right-panel-width')).toBe('410')
    expect(JSON.parse(localStorage.getItem('nexusky-right-panel-widths') || '{}')).toEqual({
      chat: 420,
      outline: 300,
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
    expect(useUIStore.getState().mainView).toBe('overview')
    expect(useUIStore.getState().rightPanel).toBe('none')
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(useUIStore.getState().sidebarWidthScope).toBe('files:/vault/a')
    expect(useUIStore.getState().sidebarWidth).toBe(240)
    expect(localStorage.getItem('nexusky-workspace-layouts')).toBeNull()
    expect(localStorage.getItem('nexusky-sidebar-widths')).toBeNull()

    store.resizeSidebar(10)
    expect(JSON.parse(localStorage.getItem('nexusky-sidebar-widths') || '{}')).toEqual({
      'files:/vault/a': 250,
    })
  })

  it('keeps the files sidebar as a session-only surface so startup returns to overview', async () => {
    let module = await import('../packages/renderer/src/stores/ui-store')
    expect(module.useUIStore.getState().mainView).toBe('overview')
    expect(module.useUIStore.getState().sidebarCollapsed).toBe(true)

    module.useUIStore.getState().openFilesSidebar()
    expect(module.useUIStore.getState().mainView).toBe('editor')
    expect(module.useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(localStorage.getItem('nexusky-workspace-layouts')).toBeNull()

    vi.resetModules()
    module = await import('../packages/renderer/src/stores/ui-store')
    expect(module.useUIStore.getState().mainView).toBe('overview')
    expect(module.useUIStore.getState().sidebarCollapsed).toBe(true)
  })
})

describe('ui store language accessibility', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document')
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('syncs the document language on restore and language changes', async () => {
    localStorage.setItem('nexusky-language', 'en')
    const root = installDocumentMock()
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')

    expect(useUIStore.getState().language).toBe('en')
    expect(root.lang).toBe('en')

    useUIStore.getState().setLanguage('zh-CN')

    expect(root.lang).toBe('zh-CN')
    expect(localStorage.getItem('nexusky-language')).toBe('zh-CN')
  })
})

describe('ui store cross-feature jumps', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('sendToAgent stashes pending goal and opens the agent panel', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setMainView('graph')
    store.sendToAgent({ goal: 'Refactor splash screen', description: 'priority: high' })

    expect(useUIStore.getState().mainView).toBe('graph')
    expect(useUIStore.getState().rightPanel).toBe('agent')
    expect(useUIStore.getState().pendingAgentGoal).toEqual({
      goal: 'Refactor splash screen',
      description: 'priority: high'
    })

    const consumed = useUIStore.getState().consumePendingAgentGoal()
    expect(consumed).toEqual({ goal: 'Refactor splash screen', description: 'priority: high' })
    expect(useUIStore.getState().pendingAgentGoal).toBeNull()
    expect(useUIStore.getState().consumePendingAgentGoal()).toBeNull()
  })

  it('focusInBases stashes file path and switches to bases view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.focusInBases('Daily/2026/2026-05-24.md')

    expect(useUIStore.getState().mainView).toBe('bases')
    expect(useUIStore.getState().pendingBasesFocus).toEqual({ filePath: 'Daily/2026/2026-05-24.md' })

    const consumed = useUIStore.getState().consumePendingBasesFocus()
    expect(consumed).toEqual({ filePath: 'Daily/2026/2026-05-24.md' })
    expect(useUIStore.getState().pendingBasesFocus).toBeNull()
  })
})
