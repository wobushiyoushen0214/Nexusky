import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_DISPLAY_STATE,
  buildGraphRelationLinkCountMap,
  getGraphFolderNodeId,
  getGraphNodeGroupId,
  getStableGraphGroupIndex,
  isGraphLabelHidden,
  isGraphNodeHiddenByDisplay,
  isGraphNodeHiddenByGroup,
  seedNodePositionsFromCaches,
  shouldSkipGraphAutoZoom
} from '../packages/renderer/src/components/graph/graph-types'

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

  it('defaults to the full graph view on initial load', () => {
    expect(DEFAULT_GRAPH_DISPLAY_STATE).toMatchObject({
      showLabels: true,
      showOrphans: true,
      showFolders: true,
      showExplicitEdges: true,
      showInferredEdges: true,
      showFolderEdges: true
    })
  })

  it('keeps folder groups visible when hiding file orphans', () => {
    expect(isGraphNodeHiddenByDisplay({ type: 'folder', linkCount: 0 }, {
      showFolders: true,
      showOrphans: false,
      minLinks: 0
    })).toBe(false)
    expect(isGraphNodeHiddenByDisplay({ type: 'folder', linkCount: 0 }, {
      showFolders: true,
      showOrphans: true,
      minLinks: 5
    })).toBe(false)
    expect(isGraphNodeHiddenByDisplay({ type: 'folder', linkCount: 0 }, {
      showFolders: false,
      showOrphans: true,
      minLinks: 0
    })).toBe(true)
  })

  it('can hide labels and optional edge types after the initial render', () => {
    expect({
      ...DEFAULT_GRAPH_DISPLAY_STATE,
      showLabels: false,
      showInferredEdges: false,
      showFolderEdges: false,
    }).toMatchObject({
      showLabels: false,
      showExplicitEdges: true,
      showInferredEdges: false,
      showFolderEdges: false
    })
  })

  it('keeps folder and current labels visible when note labels are hidden', () => {
    expect(isGraphLabelHidden({ type: 'folder' }, false, false)).toBe(false)
    expect(isGraphLabelHidden({ type: 'file' }, false, true)).toBe(false)
    expect(isGraphLabelHidden({ type: 'file' }, false, false)).toBe(true)
    expect(isGraphLabelHidden({ type: 'file' }, true, false)).toBe(false)
  })

  it('filters low-signal graph nodes without relying on opacity-only dimming', () => {
    expect(isGraphNodeHiddenByDisplay({ type: 'folder', linkCount: 3 }, {
      showFolders: false,
      showOrphans: true,
      minLinks: 0
    })).toBe(true)
    expect(isGraphNodeHiddenByDisplay({ type: 'file', linkCount: 0 }, {
      showFolders: true,
      showOrphans: false,
      minLinks: 0
    })).toBe(true)
    expect(isGraphNodeHiddenByDisplay({ type: 'file', linkCount: 1 }, {
      showFolders: true,
      showOrphans: true,
      minLinks: 2
    })).toBe(true)
    expect(isGraphNodeHiddenByDisplay({ type: 'file', linkCount: 3 }, {
      showFolders: true,
      showOrphans: false,
      minLinks: 2
    })).toBe(false)
  })

  it('counts explicit and inferred relations separately from folder membership', () => {
    const counts = buildGraphRelationLinkCountMap([
      { source: 'folder-a', target: 'note-a', linkType: 'folder' },
      { source: 'note-a', target: 'note-b', linkType: 'explicit' },
      { source: 'note-b', target: 'note-c', linkType: 'inferred' }
    ])

    expect(counts.get('folder-a')).toBeUndefined()
    expect(counts.get('note-a')).toBe(1)
    expect(counts.get('note-b')).toBe(2)
    expect(counts.get('note-c')).toBe(1)
  })

  it('assigns direct file nodes to the active folder scope when scoped graphs omit folder edges', () => {
    const nodeToFolder = new Map<string, string>()

    expect(getGraphFolderNodeId('Projects/AI')).toBe('folder:Projects/AI')
    expect(getGraphNodeGroupId({ id: 'note-a', type: 'file' }, nodeToFolder, 'Projects/AI')).toBe('folder:Projects/AI')
    expect(getGraphNodeGroupId({ id: 'folder:Projects/AI/Sub', type: 'folder' }, nodeToFolder, 'Projects/AI')).toBe('folder:Projects/AI/Sub')
  })

  it('uses stable group palette indexes for the same folder across graph scopes', () => {
    expect(getStableGraphGroupIndex('Projects/AI', 10)).toBe(getStableGraphGroupIndex('Projects/AI', 10))
    expect(getStableGraphGroupIndex('Projects/AI', 0)).toBe(0)
  })
})
