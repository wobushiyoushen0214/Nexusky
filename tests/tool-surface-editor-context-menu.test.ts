import { describe, expect, it, vi } from 'vitest'
import {
  EDITOR_CONTEXT_TOOL_NAMES,
  buildEditorToolMenuItems
} from '../packages/renderer/src/components/tool-surface/editor-tool-menu'
import { TOOL_SURFACE_REGISTRY } from '../packages/main/src/services/tool-surface/registry'

describe('editor context-menu tool list', () => {
  it('has exactly 7 entries', () => {
    expect(EDITOR_CONTEXT_TOOL_NAMES.length).toBe(7)
  })

  it('every entry maps to a registry tool that requires the current note', () => {
    for (const name of EDITOR_CONTEXT_TOOL_NAMES) {
      const entry = TOOL_SURFACE_REGISTRY.find((e) => e.name === name)
      expect(entry, `${name} missing from registry`).toBeTruthy()
      expect(entry?.requiresCurrentNote).toBe(true)
    }
  })

  it('disables every item when vaultPath or currentFilePath is missing', () => {
    const t = (key: string) => key
    const items = buildEditorToolMenuItems({
      t: t as never,
      vaultPath: null,
      currentFilePath: null
    })
    expect(items.length).toBe(7)
    expect(items.every((item) => item.disabled)).toBe(true)
  })

  it('enables every item when both vaultPath and currentFilePath are present', () => {
    const t = (key: string) => key
    const items = buildEditorToolMenuItems({
      t: t as never,
      vaultPath: '/tmp/vault',
      currentFilePath: '/tmp/vault/note.md'
    })
    expect(items.every((item) => !item.disabled)).toBe(true)
  })

  it('clicking an item dispatches a tool-surface-result CustomEvent via window.api.invoke', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      content: '# Result',
      sources: []
    })
    const dispatched: Event[] = []
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: { invoke, platform: 'darwin', send: vi.fn() },
        dispatchEvent: (event: Event) => { dispatched.push(event); return true }
      },
      configurable: true,
      writable: true
    })

    const t = (key: string) => key
    const items = buildEditorToolMenuItems({
      t: t as never,
      vaultPath: '/tmp/vault',
      currentFilePath: '/tmp/vault/note.md'
    })
    items[0].onClick()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(invoke).toHaveBeenCalledWith('ai:run-tool', expect.objectContaining({
      vaultPath: '/tmp/vault',
      currentFilePath: '/tmp/vault/note.md'
    }))
    expect(dispatched.length).toBe(1)
    expect((dispatched[0] as CustomEvent).type).toBe('tool-surface-result')
  })
})
