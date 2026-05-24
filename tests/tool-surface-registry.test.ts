import { describe, expect, it } from 'vitest'
import {
  TOOL_SURFACE_REGISTRY,
  findToolSurfaceEntry,
  listToolSurfaceEntries
} from '../packages/main/src/services/tool-surface/registry'

describe('tool-surface registry', () => {
  it('contains exactly 25 entries', () => {
    expect(TOOL_SURFACE_REGISTRY.length).toBe(25)
  })

  it('entry names are unique', () => {
    const seen = new Set<string>()
    for (const entry of TOOL_SURFACE_REGISTRY) {
      expect(seen.has(entry.name)).toBe(false)
      seen.add(entry.name)
    }
  })

  it('every entry has a labelKey under commandPalette.toolSurface', () => {
    for (const entry of TOOL_SURFACE_REGISTRY) {
      expect(entry.labelKey.startsWith('commandPalette.toolSurface.')).toBe(true)
    }
  })

  it('findToolSurfaceEntry finds an entry by name', () => {
    expect(findToolSurfaceEntry('search_notes')?.category).toBe('note')
    expect(findToolSurfaceEntry('list_orphan_notes')?.category).toBe('graph')
    expect(findToolSurfaceEntry('plan_knowledge_maintenance')?.kind).toBe('preview_write')
  })

  it('returns undefined for unknown tool names', () => {
    expect(findToolSurfaceEntry('definitely_not_a_real_tool')).toBeUndefined()
  })

  it('listToolSurfaceEntries returns a defensive copy', () => {
    const copy = listToolSurfaceEntries()
    expect(copy.length).toBe(TOOL_SURFACE_REGISTRY.length)
    copy[0].keywords.push('mutation-test')
    expect(TOOL_SURFACE_REGISTRY[0].keywords).not.toContain('mutation-test')
  })

  it('every tool name is a case in executeToolCall', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/main/src/ipc/tools/execute-tool-call.ts'),
      'utf-8'
    )
    for (const entry of TOOL_SURFACE_REGISTRY) {
      const needle = `case '${entry.name}':`
      expect(source.includes(needle), `${entry.name} missing from executeToolCall`).toBe(true)
    }
  })

  it('all categories are valid', () => {
    const valid = new Set(['note', 'graph', 'memory', 'task', 'maintenance'])
    for (const entry of TOOL_SURFACE_REGISTRY) {
      expect(valid.has(entry.category)).toBe(true)
    }
  })

  it('requiresCurrentNote is set for note-scoped tools', () => {
    const currentNoteTools = TOOL_SURFACE_REGISTRY.filter((entry) => entry.requiresCurrentNote)
    expect(currentNoteTools.length).toBeGreaterThanOrEqual(7)
    expect(currentNoteTools.every((entry) => /current/.test(entry.name) || /similar|memory_related|connection/.test(entry.name))).toBe(true)
  })
})
