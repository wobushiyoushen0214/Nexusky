import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProactiveSuggestion } from '../packages/shared/src/types/ipc'

function makeSuggestion(over: Partial<ProactiveSuggestion> = {}): ProactiveSuggestion {
  return {
    id: 'sug-1',
    kind: 'relation',
    sourceRef: 'rel-1',
    entityType: 'note',
    entityId: 'note-1',
    title: 'Suggestion title',
    body: 'Suggestion body',
    ctaAction: 'open_note',
    ctaPayload: {},
    importance: 70,
    status: 'pending',
    snoozeUntil: null,
    shownAt: null,
    respondedAt: null,
    signature: 'relation|rel-1|note-1',
    createdAt: 1_800_000_000,
    updatedAt: 1_800_000_000,
    ...over
  }
}

function installApi(invoke: ReturnType<typeof vi.fn>) {
  const api = {
    invoke,
    send: vi.fn(),
    onProactiveEmitted: vi.fn(() => () => undefined),
    platform: 'darwin' as const
  }
  Object.defineProperty(globalThis, 'window', {
    value: { api },
    configurable: true,
    writable: true
  })
  return api
}

describe('proactive renderer store', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refresh loads pending/shown suggestions from the IPC channel', async () => {
    const suggestion = makeSuggestion()
    const invoke = vi.fn().mockResolvedValue([suggestion])
    installApi(invoke)

    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    await useProactiveStore.getState().refresh('/tmp/vault')

    expect(invoke).toHaveBeenCalledWith('proactive:list', {
      vaultPath: '/tmp/vault',
      status: ['pending', 'shown'],
      limit: 100
    })
    expect(useProactiveStore.getState().suggestions).toEqual([suggestion])
    expect(useProactiveStore.getState().lastLoadedVault).toBe('/tmp/vault')
  })

  it('upsertSuggestion prepends a new suggestion and replaces matching id', async () => {
    installApi(vi.fn())
    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    const first = makeSuggestion({ id: 'a', title: 'A' })
    const second = makeSuggestion({ id: 'b', title: 'B' })
    useProactiveStore.getState().upsertSuggestion(first)
    useProactiveStore.getState().upsertSuggestion(second)

    expect(useProactiveStore.getState().suggestions.map((s) => s.id)).toEqual(['b', 'a'])

    const updated = makeSuggestion({ id: 'a', title: 'A2' })
    useProactiveStore.getState().upsertSuggestion(updated)
    expect(useProactiveStore.getState().suggestions.find((s) => s.id === 'a')?.title).toBe('A2')
  })

  it('respond removes dismissed suggestions from the in-memory list', async () => {
    const suggestion = makeSuggestion()
    const invoke = vi.fn()
      .mockResolvedValueOnce([suggestion])
      .mockResolvedValueOnce({ ...suggestion, status: 'dismissed' })
    installApi(invoke)

    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    await useProactiveStore.getState().refresh('/tmp/vault')
    await useProactiveStore.getState().respond('/tmp/vault', suggestion.id, 'dismissed')

    expect(useProactiveStore.getState().suggestions.length).toBe(0)
    expect(invoke).toHaveBeenLastCalledWith('proactive:respond', {
      vaultPath: '/tmp/vault',
      id: suggestion.id,
      status: 'dismissed',
      snoozeUntil: undefined
    })
  })

  it('respond removes snoozed suggestions from the active list and passes snoozeUntil', async () => {
    const suggestion = makeSuggestion({ id: 'snooze-target' })
    const invoke = vi.fn()
      .mockResolvedValueOnce([suggestion])
      .mockResolvedValueOnce({ ...suggestion, status: 'snoozed' })
    installApi(invoke)

    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    await useProactiveStore.getState().refresh('/tmp/vault')
    await useProactiveStore.getState().respond('/tmp/vault', suggestion.id, 'snoozed', 1_900_000_000)

    expect(useProactiveStore.getState().suggestions.length).toBe(0)
    expect(invoke).toHaveBeenLastCalledWith('proactive:respond', {
      vaultPath: '/tmp/vault',
      id: suggestion.id,
      status: 'snoozed',
      snoozeUntil: 1_900_000_000
    })
  })

  it('respondAll clears active suggestions through the bulk IPC channel', async () => {
    const first = makeSuggestion({ id: 'bulk-a' })
    const second = makeSuggestion({ id: 'bulk-b' })
    const invoke = vi.fn()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce({ changed: 2 })
    installApi(invoke)

    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    await useProactiveStore.getState().refresh('/tmp/vault')
    const changed = await useProactiveStore.getState().respondAll('/tmp/vault', 'opened')

    expect(changed).toBe(2)
    expect(useProactiveStore.getState().suggestions).toEqual([])
    expect(invoke).toHaveBeenLastCalledWith('proactive:respond-all', {
      vaultPath: '/tmp/vault',
      status: 'opened'
    })
  })

  it('setDrawerOpen toggles drawer visibility', async () => {
    installApi(vi.fn())
    const { useProactiveStore } = await import('../packages/renderer/src/stores/proactive-store')

    expect(useProactiveStore.getState().drawerOpen).toBe(false)
    useProactiveStore.getState().setDrawerOpen(true)
    expect(useProactiveStore.getState().drawerOpen).toBe(true)
    useProactiveStore.getState().setDrawerOpen(false)
    expect(useProactiveStore.getState().drawerOpen).toBe(false)
  })
})
