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

  it('persists timeline as a main workspace view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.setWorkspaceScope('workspace:/vault/timeline')
    store.setMainView('timeline')

    expect(useUIStore.getState().mainView).toBe('timeline')
    expect(JSON.parse(localStorage.getItem('nexusky-workspace-layouts') || '{}')).toEqual({
      'workspace:/vault/timeline': { mainView: 'timeline', rightPanel: 'none', sidebarCollapsed: false },
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

  it('stores right panel widths per panel without overwriting the legacy fallback', async () => {
    localStorage.setItem('nexusky-right-panel-width', '410')
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

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

    store.setMainView('kanban')
    store.sendToAgent({ goal: 'Refactor splash screen', description: 'priority: high' })

    expect(useUIStore.getState().mainView).toBe('editor')
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

  it('sendToKanban stashes pending task and switches to kanban view', async () => {
    const { useUIStore } = await import('../packages/renderer/src/stores/ui-store')
    const store = useUIStore.getState()

    store.sendToKanban({ title: 'Polish onboarding', description: 'from agent reflect' })

    expect(useUIStore.getState().mainView).toBe('kanban')
    expect(useUIStore.getState().pendingKanbanTask).toEqual({
      title: 'Polish onboarding',
      description: 'from agent reflect'
    })

    const consumed = useUIStore.getState().consumePendingKanbanTask()
    expect(consumed).toEqual({ title: 'Polish onboarding', description: 'from agent reflect' })
    expect(useUIStore.getState().pendingKanbanTask).toBeNull()
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
