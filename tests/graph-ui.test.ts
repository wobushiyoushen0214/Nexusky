import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_DISPLAY_STATE,
  assignGraphClusterAnchors,
  buildGraphRelationLinkCountMap,
  getGraphCanvasWorld,
  getGraphForceLayoutLinks,
  getGraphFolderNodeId,
  getGraphNodeGroupId,
  getStableGraphGroupIndex,
  isGraphCrossClusterRelation,
  isGraphLabelHidden,
  isGraphNodeHiddenByDisplay,
  isGraphNodeHiddenByGroup,
  layoutGraphNodesByGroup,
  seedGraphNodeFallbackPositions,
  seedNodePositionsFromCaches,
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

  it('seeds graph nodes into stable folder groups before force layout takes over', () => {
    const nodes = [
      { id: 'folder-a', title: 'A', type: 'folder' as const, linkCount: 0 },
      { id: 'folder-b', title: 'B', type: 'folder' as const, linkCount: 0 },
      { id: 'a1', title: 'A1', type: 'file' as const, group: 'folder-a', linkCount: 4 },
      { id: 'a2', title: 'A2', type: 'file' as const, group: 'folder-a', linkCount: 1 },
      { id: 'b1', title: 'B1', type: 'file' as const, group: 'folder-b', linkCount: 2 },
    ]

    layoutGraphNodesByGroup(nodes, 900, 600)

    const folderA = nodes.find((node) => node.id === 'folder-a')!
    const folderB = nodes.find((node) => node.id === 'folder-b')!
    const aFiles = nodes.filter((node) => node.group === 'folder-a')
    const bFiles = nodes.filter((node) => node.group === 'folder-b')

    expect(folderA.x).toEqual(expect.any(Number))
    expect(folderA.y).toEqual(expect.any(Number))
    expect(folderB.x).toEqual(expect.any(Number))
    expect(folderB.y).toEqual(expect.any(Number))
    expect(Math.abs((folderA.x ?? 0) - (folderB.x ?? 0)) + Math.abs((folderA.y ?? 0) - (folderB.y ?? 0))).toBeGreaterThan(240)
    expect(aFiles.every((node) => node.x != null && node.y != null)).toBe(true)
    expect(bFiles.every((node) => node.x != null && node.y != null)).toBe(true)
  })

  it('anchors graph force layout to folder clusters instead of folder ownership edges', () => {
    const nodes = [
      { id: 'folder-a', title: 'A', type: 'folder' as const, linkCount: 0, x: 100, y: 120 },
      { id: 'folder-b', title: 'B', type: 'folder' as const, linkCount: 0, x: 520, y: 120 },
      { id: 'a1', title: 'A1', type: 'file' as const, group: 'folder-a', linkCount: 1, x: 140, y: 160 },
      { id: 'b1', title: 'B1', type: 'file' as const, group: 'folder-b', linkCount: 1, x: 560, y: 160 },
      { id: 'loose', title: 'Loose', type: 'file' as const, linkCount: 0, x: 300, y: 420 },
    ]

    assignGraphClusterAnchors(nodes)

    expect(nodes[0]).toMatchObject({ anchorX: 100, anchorY: 120 })
    expect(nodes[2]).toMatchObject({ anchorX: 100, anchorY: 120 })
    expect(nodes[3]).toMatchObject({ anchorX: 520, anchorY: 120 })
    expect(nodes[4]).toMatchObject({ anchorX: 300, anchorY: 420 })
  })

  it('keeps folder ownership edges out of force layout links to reduce hairball pull', () => {
    const forceLinks = getGraphForceLayoutLinks([
      { source: 'folder-a', target: 'a1', linkType: 'folder' },
      { source: 'a1', target: 'b1', linkType: 'explicit' },
      { source: 'a2', target: 'b2', linkType: 'inferred' },
    ])

    expect(forceLinks).toEqual([
      { source: 'a1', target: 'b1', linkType: 'explicit' },
      { source: 'a2', target: 'b2', linkType: 'inferred' },
    ])
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
