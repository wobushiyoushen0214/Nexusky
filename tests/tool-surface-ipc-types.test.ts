import { describe, expect, it } from 'vitest'
import type {
  IPCChannelMap,
  ToolSurfaceEntry,
  ToolSurfaceRunResult
} from '../packages/shared/src/types/ipc'

describe('tool-surface IPC types', () => {
  it('types ai:list-tool-surface and ai:run-tool channels', () => {
    const entry: ToolSurfaceEntry = {
      name: 'search_notes',
      kind: 'read_only',
      category: 'note',
      labelKey: 'commandPalette.toolSurface.search_notes.label',
      keywords: ['search', 'find'],
      requiresCurrentNote: false
    }

    const listResult: IPCChannelMap['ai:list-tool-surface']['result'] = {
      entries: [entry]
    }

    const runParams: IPCChannelMap['ai:run-tool']['params'] = {
      vaultPath: '/tmp/vault',
      toolName: 'search_notes',
      args: { query: 'electron' },
      currentFilePath: null
    }
    const runOk: ToolSurfaceRunResult = {
      ok: true,
      content: '...',
      sources: [{ title: 't', filePath: 'p.md', chunk: 'c', score: 0.9 }]
    }
    const runFail: ToolSurfaceRunResult = { ok: false, error: 'tool not allowed' }
    const runResult: IPCChannelMap['ai:run-tool']['result'] = runOk

    expect(listResult.entries[0].kind).toBe('read_only')
    expect(runParams.toolName).toBe('search_notes')
    expect(runResult.ok).toBe(true)
    expect(runFail.ok).toBe(false)
  })
})
