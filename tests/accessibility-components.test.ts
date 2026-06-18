import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Settings, NoAiModePanel, CloudSyncHealthPanel, CloudSyncBoundaryNotice, CloudSyncConflictList, NO_AI_MODE_LOCAL_FEATURES, NO_AI_MODE_PROVIDER_FEATURES, classifyProviderSetupError, getSettingsDialogTabTarget } from '../packages/renderer/src/components/settings/Settings'
import { PublishScopeDialog, buildPublishScope, summarizePublishPreview } from '../packages/renderer/src/components/PublishScopeDialog'
import { WelcomeScreen } from '../packages/renderer/src/components/WelcomeScreen'
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
    expect(NO_AI_MODE_PROVIDER_FEATURES).toEqual(['chat', 'edit', 'tools', 'memory'])
    expect(html).toContain('No AI provider configured')
    expect(html).toContain('Files')
    expect(html).toContain('Search')
    expect(html).toContain('Graph')
    expect(html).toContain('Vault Health')
    expect(html).toContain('Maintenance')
    expect(html).toContain('Chat answers')
    expect(html).toContain('AI edit')
    expect(html).toContain('Vault tools')
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
      lastError: 'timeout',
      preflightRisks: []
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

  it('renders workflow sample vault actions on the welcome screen', async () => {
    await i18n.changeLanguage('en')
    const target = new EventTarget()
    Object.defineProperty(globalThis, 'window', {
      value: Object.assign(target, { api: { invoke: vi.fn().mockResolvedValue([]) } }),
      configurable: true
    })

    const html = renderToStaticMarkup(createElement(WelcomeScreen))

    expect(html).toContain('Workflow samples')
    expect(html).toContain('Research')
    expect(html).toContain('Writing')
    expect(html).toContain('Developer')
    expect(html).toContain('Learning')
    expect(html).toContain('Create a sample vault with real notes')
  })

  it('renders publish scope selection with accessible dialog labels', async () => {
    await i18n.changeLanguage('en')

    const html = renderToStaticMarkup(createElement(PublishScopeDialog, { open: true, onClose: () => {} }))

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('id="publish-scope-dialog-title"')
    expect(html).toContain('Publish preview')
    expect(html).toContain('Preview')
    expect(html).toContain('Preview is required before publishing')
    expect(html).toContain('Entire vault')
    expect(html).toContain('Folder')
    expect(html).toContain('Tag')
    expect(html).toContain('Property')
    expect(html).not.toContain('commandPalette.publishScope')
  })

  it('builds structured publish scopes from the dialog input state', () => {
    expect(buildPublishScope('all', '', '', '', '')).toEqual({ type: 'all' })
    expect(buildPublishScope('folder', ' Writing/Series ', '', '', '')).toEqual({ type: 'folder', folderPath: 'Writing/Series' })
    expect(buildPublishScope('tag', '', '#publish', '', '')).toEqual({ type: 'tag', tag: 'publish' })
    expect(buildPublishScope('property', '', '', ' published ', ' true ')).toEqual({ type: 'property', key: 'published', value: 'true' })
    expect(buildPublishScope('property', '', '', 'published', '')).toEqual({ type: 'property', key: 'published' })
  })

  it('summarizes publish preview counts for confirmation copy', () => {
    expect(summarizePublishPreview(null)).toEqual({ notes: 0, assets: 0, links: 0, issues: 0 })
    expect(summarizePublishPreview({
      scopeLabel: '全部 vault',
      notes: [
        { title: 'One', relPath: 'One.md', href: 'One.html', linkCount: 2, missingLinkCount: 1 },
        { title: 'Two', relPath: 'Two.md', href: 'Two.html', linkCount: 1, missingLinkCount: 0 }
      ],
      assets: ['assets/logo.png'],
      linkCount: 3,
      missingLinks: [{
        sourceTitle: 'One',
        sourcePath: 'One.md',
        target: 'Missing',
        line: 2,
        context: 'See [[Missing]]',
        kind: 'wikilink'
      }],
      missingAssets: [{
        sourceTitle: 'Two',
        sourcePath: 'Two.md',
        target: 'assets/missing.png',
        line: 4,
        context: '![Missing](assets/missing.png)'
      }],
      risks: [
        { kind: 'unresolved_wikilink', severity: 'blocker', count: 1, examples: ['One.md:2 -> Missing'] },
        { kind: 'unpublished_asset', severity: 'blocker', count: 1, examples: ['Two.md:4 -> assets/missing.png'] }
      ]
    })).toEqual({ notes: 2, assets: 1, links: 3, issues: 2 })
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
