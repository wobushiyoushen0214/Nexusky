import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_DISPLAY_STATE,
  buildGraphMaintenanceSignals,
  buildGraphRelationLinkCountMap,
  getGraphMaintenanceFocusNodeIds,
  getGraphCanvasWorld,
  getGraphFolderNodeId,
  getGraphNodeGroupId,
  getStableGraphGroupIndex,
  isGraphCrossClusterRelation,
  isGraphLabelHidden,
  isGraphNodeHiddenByMaintenanceFocus,
  isGraphNodeHiddenByDisplay,
  isGraphNodeHiddenByGroup,
  seedGraphNodeFallbackPositions,
  seedNodePositionsFromCaches,
  shouldUseGraphRasterRenderer,
  shouldSkipGraphAutoZoom
} from '../packages/renderer/src/components/graph/graph-types'
import { buildGraphGroupColorMap } from '../packages/renderer/src/components/graph/graph-colors'

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
      showFolderEdges: false
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

  it('summarizes graph maintenance signals from relation edges', () => {
    const signals = buildGraphMaintenanceSignals({
      nodes: [
        { id: 'folder-research', title: 'Research', type: 'folder' },
        { id: 'folder-writing', title: 'Writing', type: 'folder' },
        { id: 'note-a', title: 'A', type: 'file', folder: 'Research' },
        { id: 'note-b', title: 'B', type: 'file', folder: 'Writing' },
        { id: 'note-c', title: 'C', type: 'file', folder: 'Writing' },
        { id: 'note-d', title: 'D', type: 'file', folder: 'Archive' },
      ],
      edges: [
        { source: 'folder-research', target: 'note-a', linkType: 'folder' },
        { source: 'folder-writing', target: 'note-b', linkType: 'folder' },
        { source: 'note-a', target: 'note-b', linkType: 'explicit' },
        { source: 'note-b', target: 'note-c', linkType: 'inferred' },
      ],
    })

    expect(signals.orphanNoteCount).toBe(1)
    expect([...signals.orphanNoteIds]).toEqual(['note-d'])
    expect(signals.orphanSamples).toEqual(['D'])
    expect(signals.crossFolderBridgeCount).toBe(1)
    expect([...signals.crossFolderBridgeNodeIds].sort()).toEqual(['note-a', 'note-b'])
    expect(signals.crossFolderBridgeSamples).toEqual(['A -> B'])
    expect(signals.inferredRelationCount).toBe(1)
    expect([...signals.inferredRelationNodeIds].sort()).toEqual(['note-b', 'note-c'])
    expect(signals.inferredRelationSamples).toEqual(['B -> C'])
  })

  it('returns focused maintenance node ids for graph task views', () => {
    const signals = buildGraphMaintenanceSignals({
      nodes: [
        { id: 'note-a', title: 'A', type: 'file', folder: 'Research' },
        { id: 'note-b', title: 'B', type: 'file', folder: 'Writing' },
        { id: 'note-c', title: 'C', type: 'file', folder: 'Writing' },
        { id: 'note-d', title: 'D', type: 'file', folder: 'Archive' },
      ],
      edges: [
        { source: 'note-a', target: 'note-b', linkType: 'explicit' },
        { source: 'note-b', target: 'note-c', linkType: 'inferred' },
      ],
    })

    expect(getGraphMaintenanceFocusNodeIds('all', signals)).toBeNull()
    expect([...(getGraphMaintenanceFocusNodeIds('orphans', signals) ?? [])]).toEqual(['note-d'])
    expect([...(getGraphMaintenanceFocusNodeIds('bridges', signals) ?? [])].sort()).toEqual(['note-a', 'note-b'])
    expect([...(getGraphMaintenanceFocusNodeIds('inferred', signals) ?? [])].sort()).toEqual(['note-b', 'note-c'])
  })

  it('hides non-focused graph nodes while keeping folder context for focused notes', () => {
    const focusedNodeIds = new Set(['note-a'])
    const focusedGroupIds = new Set(['folder:Research'])

    expect(isGraphNodeHiddenByMaintenanceFocus(
      { id: 'note-a', type: 'file', group: 'folder:Research' },
      focusedNodeIds,
      focusedGroupIds
    )).toBe(false)
    expect(isGraphNodeHiddenByMaintenanceFocus(
      { id: 'note-b', type: 'file', group: 'folder:Writing' },
      focusedNodeIds,
      focusedGroupIds
    )).toBe(true)
    expect(isGraphNodeHiddenByMaintenanceFocus(
      { id: 'folder:Research', type: 'folder' },
      focusedNodeIds,
      focusedGroupIds
    )).toBe(false)
    expect(isGraphNodeHiddenByMaintenanceFocus(
      { id: 'folder:Writing', type: 'folder' },
      focusedNodeIds,
      focusedGroupIds
    )).toBe(true)
    expect(isGraphNodeHiddenByMaintenanceFocus(
      { id: 'note-b', type: 'file', group: 'folder:Writing' },
      null,
      focusedGroupIds
    )).toBe(false)
  })

  it('recognizes explicit and inferred links across folder groups as graph relations', () => {
    const source = { id: 'note-a', type: 'file' as const, group: 'folder-a' }
    const target = { id: 'note-b', type: 'file' as const, group: 'folder-b' }
    const sameGroup = { id: 'note-c', type: 'file' as const, group: 'folder-a' }

    expect(isGraphCrossClusterRelation({ linkType: 'explicit' }, source, target)).toBe(true)
    expect(isGraphCrossClusterRelation({ linkType: 'inferred' }, source, target)).toBe(true)
    expect(isGraphCrossClusterRelation({ linkType: 'explicit' }, source, sameGroup)).toBe(false)
    expect(isGraphCrossClusterRelation({ linkType: 'folder' }, { id: 'folder-a', type: 'folder' as const }, source)).toBe(false)
  })

  it('assigns direct file nodes to the active folder scope when scoped graphs omit folder edges', () => {
    const nodeToFolder = new Map<string, string>()

    expect(getGraphFolderNodeId('Projects/AI')).toBe('folder:Projects/AI')
    expect(getGraphNodeGroupId({ id: 'note-a', type: 'file' }, nodeToFolder, 'Projects/AI')).toBe('folder:Projects/AI')
    expect(getGraphNodeGroupId({ id: 'folder:Projects/AI/Sub', type: 'folder' }, nodeToFolder, 'Projects/AI')).toBe('folder:Projects/AI/Sub')
  })

  it('derives a file node group from its own folder field even without ownership edges', () => {
    const nodeToFolder = new Map<string, string>()

    expect(getGraphNodeGroupId({ id: 'note-a', type: 'file', folder: 'Projects/AI' }, nodeToFolder)).toBe('folder:Projects/AI')
    expect(getGraphNodeGroupId({ id: 'note-b', type: 'file', folder: '' }, nodeToFolder)).toBe('folder:.')
  })

  it('uses stable group palette indexes for the same folder across graph scopes', () => {
    expect(getStableGraphGroupIndex('Projects/AI', 10)).toBe(getStableGraphGroupIndex('Projects/AI', 10))
    expect(getStableGraphGroupIndex('Projects/AI', 0)).toBe(0)
  })

  it('generates deterministic non-repeating colors for many graph groups', () => {
    const groups = Array.from({ length: 32 }, (_, index) => ({
      id: `folder:${index}`,
      seed: `Projects/Group ${index}`,
    }))

    const colors = buildGraphGroupColorMap(groups)
    const reversedColors = buildGraphGroupColorMap([...groups].reverse())

    expect(colors).toEqual(reversedColors)
    expect(new Set(colors.values()).size).toBe(groups.length)
    expect(colors.get('folder:0')).toMatch(/^oklch\(/)
  })

  it('creates a larger DOM canvas world around the graph viewport', () => {
    const world = getGraphCanvasWorld(800, 600, 64)

    expect(world.minX).toBeLessThan(0)
    expect(world.minY).toBeLessThan(0)
    expect(world.width).toBeGreaterThan(800)
    expect(world.height).toBeGreaterThan(600)
  })

  it('switches dense graphs to the raster renderer before DOM elements explode', () => {
    expect(shouldUseGraphRasterRenderer({ visibleNodeCount: 120, visibleLinkCount: 180 })).toBe(false)
    expect(shouldUseGraphRasterRenderer({ visibleNodeCount: 420, visibleLinkCount: 120 })).toBe(true)
    expect(shouldUseGraphRasterRenderer({ visibleNodeCount: 180, visibleLinkCount: 900 })).toBe(true)
    expect(shouldUseGraphRasterRenderer({ visibleNodeCount: 360, visibleLinkCount: 540 })).toBe(true)
  })

  it('seeds fallback DOM node positions without overwriting cached layout', () => {
    const nodes = [
      { id: 'cached', type: 'file' as const, x: 12, y: 34 },
      { id: 'new', type: 'folder' as const },
    ]

    seedGraphNodeFallbackPositions(nodes, 800, 600)

    expect(nodes[0]).toMatchObject({ x: 12, y: 34 })
    expect(nodes[1].x).toEqual(expect.any(Number))
    expect(nodes[1].y).toEqual(expect.any(Number))
  })

  it('hides low-signal labels earlier on dense graphs while keeping hubs visible', () => {
    expect(isGraphLabelHidden({ type: 'file', linkCount: 2 }, true, false, {
      zoom: 1,
      nodeCount: 140,
    })).toBe(true)
    expect(isGraphLabelHidden({ type: 'file', linkCount: 5 }, true, false, {
      zoom: 1,
      nodeCount: 140,
    })).toBe(false)
  })
})
