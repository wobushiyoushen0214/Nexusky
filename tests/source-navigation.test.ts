import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildChatSourceNavigationTarget, findMarkdownLineForBlockId, findMarkdownLineForHeading, findMarkdownLineForSnippet, resolveVaultSourcePath } from '../packages/renderer/src/utils/source-navigation'
import type { ChatSource } from '../packages/shared/src/types/ipc'

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

function installWindowApiMock(files: Record<string, string>) {
  const invoke = vi.fn(async (channel: string, params: { path?: string }) => {
    if (channel === 'file:stat') {
      const path = params.path || ''
      if (!(path in files)) throw new Error('missing')
      return { size: files[path].length }
    }
    if (channel === 'file:read') {
      const path = params.path || ''
      if (!(path in files)) throw new Error('missing')
      return files[path]
    }
    if (channel === 'file:write') return undefined
    return undefined
  })
  Object.defineProperty(globalThis, 'window', {
    value: { api: { invoke } },
    configurable: true
  })
  return invoke
}

describe('source navigation helpers', () => {
  it('resolves relative source paths inside the current vault', () => {
    expect(resolveVaultSourcePath('/vault', 'Notes/Topic.md')).toBe('/vault/Notes/Topic.md')
    expect(resolveVaultSourcePath('/vault/', '/external/Topic.md')).toBe('/external/Topic.md')
    expect(resolveVaultSourcePath('C:\\Vault', 'Notes\\Topic.md')).toBe('C:/Vault/Notes/Topic.md')
    expect(resolveVaultSourcePath(null, 'Notes/Topic.md')).toBeNull()
  })

  it('builds an editor target from optional source metadata and chunk text', () => {
    const source: ChatSource = {
      title: 'Topic',
      filePath: 'Topic.md',
      chunk: '  The cited paragraph.  ',
      score: 0.8,
      line: 4,
      endLine: 5,
      heading: 'Evidence',
      blockId: '^block-1'
    }

    expect(buildChatSourceNavigationTarget(source)).toEqual({
      line: 4,
      endLine: 5,
      heading: 'Evidence',
      blockId: '^block-1',
      snippet: 'The cited paragraph.'
    })
  })

  it('falls back from a source chunk to the nearest markdown line', () => {
    const content = [
      '# Topic',
      '',
      'Intro paragraph.',
      '',
      '## Evidence',
      'The cited paragraph spans',
      'multiple lines and keeps its meaning.',
      '',
      'Closing.'
    ].join('\n')

    expect(findMarkdownLineForSnippet(content, 'The cited paragraph spans multiple lines and keeps its meaning.')).toBe(6)
    expect(findMarkdownLineForHeading(content, 'Evidence')).toBe(5)
    expect(findMarkdownLineForBlockId(`${content}\nTask line ^todo-1`, 'todo-1')).toBe(10)
    expect(findMarkdownLineForSnippet(content, 'tiny')).toBeNull()
  })
})

describe('editor store source navigation', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('opens a file and keeps one pending navigation target until the editor consumes it', async () => {
    installWindowApiMock({ '/vault/Topic.md': '# Topic\n\nThe cited paragraph.' })
    const { useEditorStore } = await import('../packages/renderer/src/stores/editor-store')

    await useEditorStore.getState().openFileAt('/vault/Topic.md', { snippet: 'The cited paragraph.' })

    expect(useEditorStore.getState().currentFilePath).toBe('/vault/Topic.md')
    expect(useEditorStore.getState().pendingNavigationTarget).toMatchObject({
      path: '/vault/Topic.md',
      snippet: 'The cited paragraph.'
    })

    const target = useEditorStore.getState().consumeNavigationTarget('/vault/Topic.md')

    expect(target).toMatchObject({ path: '/vault/Topic.md', snippet: 'The cited paragraph.' })
    expect(useEditorStore.getState().pendingNavigationTarget).toBeNull()
  })

  it('does not leave a stale target when the source file cannot be opened', async () => {
    installWindowApiMock({})
    const { useEditorStore } = await import('../packages/renderer/src/stores/editor-store')

    await useEditorStore.getState().openFileAt('/vault/Missing.md', { snippet: 'Missing paragraph.' })

    expect(useEditorStore.getState().currentFilePath).toBeNull()
    expect(useEditorStore.getState().pendingNavigationTarget).toBeNull()
  })
})
