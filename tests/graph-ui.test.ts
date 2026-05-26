import { describe, expect, it } from 'vitest'
import { isGraphNodeHiddenByGroup, seedNodePositionsFromCaches, shouldSkipGraphAutoZoom } from '../packages/renderer/src/components/graph/graph-types'

describe('graph UI layout helpers', () => {
  it('seeds node positions from the active layout cache before falling back to last known positions', () => {
    const nodes = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]
    const activeCache = new Map<string, [number, number]>([
      ['a', [10, 20]],
    ])
    const lastKnown = new Map<string, [number, number]>([
      ['a', [100, 200]],
      ['b', [30, 40]],
    ])

    const result = seedNodePositionsFromCaches(nodes, activeCache, lastKnown)

    expect(result).toEqual({ hits: 2, hitRate: 2 / 3 })
    expect(nodes).toEqual([
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 30, y: 40 },
      { id: 'c' },
    ])
  })

  it('skips auto-zoom for visibility-only group rerenders', () => {
    expect(shouldSkipGraphAutoZoom(0, true)).toBe(true)
    expect(shouldSkipGraphAutoZoom(0.8, false)).toBe(true)
    expect(shouldSkipGraphAutoZoom(0.79, false)).toBe(false)
  })

  it('uses group membership to hide existing graph nodes without changing layout data', () => {
    const hiddenGroups = new Set(['folder-a'])

    expect(isGraphNodeHiddenByGroup({ id: 'folder-a', type: 'folder' }, hiddenGroups)).toBe(true)
    expect(isGraphNodeHiddenByGroup({ id: 'note-a', type: 'file', group: 'folder-a' }, hiddenGroups)).toBe(true)
    expect(isGraphNodeHiddenByGroup({ id: 'note-b', type: 'file', group: 'folder-b' }, hiddenGroups)).toBe(false)
    expect(isGraphNodeHiddenByGroup({ id: 'note-c', type: 'file' }, hiddenGroups)).toBe(false)
  })
})
