import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Settings, NoAiModePanel, CloudSyncHealthPanel, CloudSyncBoundaryNotice, CloudSyncConflictList, NO_AI_MODE_LOCAL_FEATURES, NO_AI_MODE_PROVIDER_FEATURES, classifyProviderSetupError, getSettingsDialogTabTarget } from '../packages/renderer/src/components/settings/Settings'
import { getTrashReasonLabel } from '../packages/renderer/src/components/TrashPanel'
import { ToastViewport } from '../packages/renderer/src/components/Toast'
import { useToastStore } from '../packages/renderer/src/stores/toast-store'
import i18n from '../packages/renderer/src/i18n'
import type { CloudSyncConflict, CloudSyncHealth } from '../packages/shared/src/types/ipc'

describe('accessibility component semantics', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('announces toast messages through live-region roles', () => {
    const html = renderToStaticMarkup(createElement(ToastViewport, {
      toasts: [
        { id: 'error', type: 'error', message: 'Save failed' },
        { id: 'info', type: 'info', message: 'Saved' },
      ],
      onRemove: () => {}
    }))

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="false"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Close notification"')
  })

  it('exposes Settings as a labelled modal dialog', () => {
    const html = renderToStaticMarkup(createElement(Settings, { open: true, onClose: () => {} }))

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="settings-dialog-title"')
    expect(html).toContain('id="settings-dialog-title"')
  })

  it('wraps Settings dialog tab focus at the first and last controls', () => {
    const first = createFocusableElement('first')
    const middle = createFocusableElement('middle')
    const last = createFocusableElement('last')
    const focusable = [first, middle, last]
    const container = {
      querySelectorAll: vi.fn(() => focusable),
      contains: vi.fn((element: Element) => focusable.includes(element as HTMLElement)),
      focus: vi.fn(),
      tabIndex: -1,
    } as unknown as HTMLElement

    expect(getSettingsDialogTabTarget(container, last, false)).toBe(first)
    expect(getSettingsDialogTabTarget(container, first, true)).toBe(last)
    expect(getSettingsDialogTabTarget(container, middle, false)).toBeNull()
    expect(getSettingsDialogTabTarget(container, {} as Element, false)).toBe(first)
  })

  it('classifies provider setup errors for actionable checklist copy', () => {
    expect(classifyProviderSetupError('401 invalid API key')).toBe('api_key')
    expect(classifyProviderSetupError('model not found: gpt-missing')).toBe('model')
    expect(classifyProviderSetupError('fetch failed: ECONNREFUSED')).toBe('network')
    expect(classifyProviderSetupError('429 rate limit exceeded')).toBe('rate_limit')
    expect(classifyProviderSetupError('maximum context length exceeded')).toBe('context')
    expect(classifyProviderSetupError('Request timed out')).toBe('timeout')
    expect(classifyProviderSetupError('unexpected provider failure')).toBe('unknown')
  })

  it('explains which workflows remain available without an AI provider', async () => {
    await i18n.changeLanguage('en')

    const html = renderToStaticMarkup(createElement(NoAiModePanel))

    expect(NO_AI_MODE_LOCAL_FEATURES).toEqual(['files', 'search', 'graph', 'vaultHealth', 'maintenance'])
    expect(NO_AI_MODE_PROVIDER_FEATURES).toEqual(['chat', 'edit', 'agent', 'memory'])
    expect(html).toContain('No AI provider configured')
    expect(html).toContain('Files')
    expect(html).toContain('Search')
    expect(html).toContain('Graph')
    expect(html).toContain('Vault Health')
    expect(html).toContain('Maintenance')
    expect(html).toContain('Chat answers')
    expect(html).toContain('AI edit')
    expect(html).toContain('Agent actions')
    expect(html).toContain('Memory generation')
  })

  it('summarizes cloud sync health with provider, failure, and transfer counts', async () => {
    await i18n.changeLanguage('en')

    const health: CloudSyncHealth = {
      activeProvider: 'webdav',
      activeProviderName: 'WebDAV',
      activeProviderConfigured: true,
      offlineQueueSize: 3,
      status: 'error',
      lastRunAt: Date.UTC(2026, 5, 1, 8, 30),
      lastDirection: 'sync',
      total: 6,
      pushed: 4,
      pulled: 2,
      conflicts: 0,
      errors: 1,
      lastError: 'timeout'
    }
    const html = renderToStaticMarkup(createElement(CloudSyncHealthPanel, {
      health,
      loading: false,
      onRefresh: () => {}
    }))

    expect(html).toContain('Sync health')
    expect(html).toContain('WebDAV')
    expect(html).toContain('Error')
    expect(html).toContain('Failure reason')
    expect(html).toContain('timeout')
    expect(html).toContain('↑4 ↓2')
    expect(html).toContain('3 queued')
    expect(html).toContain('Sync overwrites save the previous Markdown version to History')
  })

  it('states the free boundary for local and bring-your-own sync', async () => {
    await i18n.changeLanguage('en')

    const html = renderToStaticMarkup(createElement(CloudSyncBoundaryNotice))

    expect(html).toContain('What stays free')
    expect(html).toContain('Local vaults and bring-your-own sync stay free')
    expect(html).toContain('managed sync / backup remains a future paid add-on')
  })

  it('explains cloud sync conflicts before presenting resolution actions', async () => {
    await i18n.changeLanguage('en')

    const conflicts: CloudSyncConflict[] = [{
      path: 'Projects/Roadmap.md',
      localHash: '11112222333344445555666677778888',
      localUpdatedAt: '2026-06-01T08:30:00.000Z',
      remoteHash: 'aaaabbbbccccddddeeeeffff00001111',
      remoteUpdatedAt: '2026-06-01T08:30:03.000Z'
    }]
    const html = renderToStaticMarkup(createElement(CloudSyncConflictList, {
      conflicts,
      resolvingPath: null,
      onResolve: () => {}
    }))

    expect(html).toContain('Conflict recovery')
    expect(html).toContain('Both copies changed')
    expect(html).toContain('Projects/Roadmap.md')
    expect(html).toContain('Local updated')
    expect(html).toContain('Remote updated')
    expect(html).toContain('title="2026-06-01T08:30:00.000Z"')
    expect(html).toContain('title="aaaabbbbccccddddeeeeffff00001111"')
    expect(html).toContain('Keep local')
    expect(html).toContain('Pull remote')
  })

  it('labels files that were moved to trash by sync deletion recovery', () => {
    expect(getTrashReasonLabel('sync_remote_delete')).toBe('同步删除')
    expect(getTrashReasonLabel(undefined)).toBeNull()
  })
})

function createFocusableElement(id: string): HTMLElement {
  return {
    id,
    tabIndex: 0,
    hasAttribute: vi.fn(() => false),
    getAttribute: vi.fn(() => null),
    focus: vi.fn(),
  } as unknown as HTMLElement
}
