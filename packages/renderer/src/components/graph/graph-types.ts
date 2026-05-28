import type { GraphEdgeLinkType } from '@shared/types/ipc'

export interface SimNode {
  id: string
  title: string
  filePath?: string
  type: 'file' | 'folder'
  group?: string
  color?: string
  colors?: string[]
  gradientId?: string
  x?: number
  y?: number
  anchorX?: number
  anchorY?: number
  fx?: number | null
  fy?: number | null
  linkCount: number
}

export interface SimLink {
  source: string | SimNode
  target: string | SimNode
  weight?: number
  linkType: GraphEdgeLinkType
}

export interface GraphFilterMaps {
  multiFilterIds: Map<number, string>
  multiHoverFilterIds: Map<number, string>
  folderFilterIds: Map<string, string>
  folderHoverFilterIds: Map<string, string>
  fileFilterIds: Map<string, string>
  fileHoverFilterIds: Map<string, string>
  fileLevelFilterIds: Map<string, Map<number, string>>
}

export interface GraphDisplayState {
  showLabels: boolean
  showOrphans: boolean
  showArrows: boolean
  showFolders: boolean
  showExplicitEdges: boolean
  showInferredEdges: boolean
  showFolderEdges: boolean
}

export const DEFAULT_GRAPH_DISPLAY_STATE: GraphDisplayState = {
  showLabels: true,
  showOrphans: true,
  showArrows: false,
  showFolders: true,
  showExplicitEdges: true,
  showInferredEdges: true,
  showFolderEdges: false,
}

export const FILE_BRIGHTNESS_LEVELS = [
  { outerBlur: 2, outerOpacity: 0.12, innerOpacity: 0.15 },
  { outerBlur: 3, outerOpacity: 0.25, innerOpacity: 0.3 },
  { outerBlur: 4, outerOpacity: 0.4, innerOpacity: 0.5 },
  { outerBlur: 5, outerOpacity: 0.55, innerOpacity: 0.6 },
  { outerBlur: 6, outerOpacity: 0.7, innerOpacity: 0.75 },
] as const

export interface GraphCanvasWorld {
  minX: number
  minY: number
  width: number
  height: number
}

export interface GroupedGraphLayoutNode {
  id: string
  title?: string
  type: 'file' | 'folder'
  group?: string
  linkCount?: number
  x?: number
  y?: number
}

export interface GraphAnchoredLayoutNode extends GroupedGraphLayoutNode {
  anchorX?: number
  anchorY?: number
}

interface GraphLayoutGroup<T extends GroupedGraphLayoutNode> {
  id: string
  title: string
  folder?: T
  files: T[]
  radius: number
}

const GRAPH_CANVAS_BASE_PADDING = 2400
const UNGROUPED_GRAPH_GROUP_ID = '__ungrouped__'

export function getGraphCanvasWorld(
  viewportWidth: number,
  viewportHeight: number,
  nodeCount: number,
): GraphCanvasWorld {
  const width = Math.max(1, viewportWidth)
  const height = Math.max(1, viewportHeight)
  const densityPadding = Math.ceil(Math.sqrt(Math.max(nodeCount, 1)) * 220)
  const padding = Math.max(GRAPH_CANVAS_BASE_PADDING, densityPadding)
  return {
    minX: -padding,
    minY: -padding,
    width: width + padding * 2,
    height: height + padding * 2,
  }
}

export function seedGraphNodeFallbackPositions<T extends { x?: number; y?: number; type?: 'file' | 'folder' }>(
  nodes: T[],
  viewportWidth: number,
  viewportHeight: number,
): void {
  const centerX = Math.max(1, viewportWidth) / 2
  const centerY = Math.max(1, viewportHeight) / 2
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  nodes.forEach((node, index) => {
    if (node.x != null && node.y != null) return
    const radiusStep = node.type === 'folder' ? 48 : 30
    const radius = Math.sqrt(index + 1) * radiusStep
    const angle = index * goldenAngle
    node.x = centerX + Math.cos(angle) * radius
    node.y = centerY + Math.sin(angle) * radius
  })
}

function getGroupedLayoutRadius(fileCount: number, hasFolder: boolean): number {
  if (fileCount <= 0) return hasFolder ? 84 : 44

  const baseRadius = hasFolder ? 92 : 48
  let remaining = fileCount
  let ringIndex = 0
  let radius = baseRadius

  while (remaining > 0) {
    const capacity = ringIndex === 0
      ? Math.min(fileCount <= 8 ? fileCount : 8, remaining)
      : Math.min(10 + ringIndex * 4, remaining)
    radius = baseRadius + ringIndex * 58
    remaining -= Math.max(1, capacity)
    ringIndex += 1
  }

  return radius + (hasFolder ? 50 : 34)
}

function compareGraphLayoutNodes(a: GroupedGraphLayoutNode, b: GroupedGraphLayoutNode): number {
  const linkDelta = (b.linkCount ?? 0) - (a.linkCount ?? 0)
  if (linkDelta !== 0) return linkDelta
  return (a.title || a.id).localeCompare(b.title || b.id)
}

export function layoutGraphNodesByGroup<T extends GroupedGraphLayoutNode>(
  nodes: T[],
  viewportWidth: number,
  viewportHeight: number,
): void {
  const groups = new Map<string, GraphLayoutGroup<T>>()

  for (const node of nodes) {
    if (node.type !== 'folder') continue
    groups.set(node.id, {
      id: node.id,
      title: node.title || node.id,
      folder: node,
      files: [],
      radius: 0,
    })
  }

  for (const node of nodes) {
    if (node.type === 'folder') continue
    const groupId = node.group || UNGROUPED_GRAPH_GROUP_ID
    const group = groups.get(groupId) ?? {
      id: groupId,
      title: groupId,
      files: [],
      radius: 0,
    }
    group.files.push(node)
    groups.set(groupId, group)
  }

  const orderedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      files: [...group.files].sort(compareGraphLayoutNodes),
      radius: getGroupedLayoutRadius(group.files.length, !!group.folder),
    }))
    .sort((a, b) => {
      if (a.id === UNGROUPED_GRAPH_GROUP_ID) return 1
      if (b.id === UNGROUPED_GRAPH_GROUP_ID) return -1
      return a.title.localeCompare(b.title)
    })

  if (orderedGroups.length === 0) return

  const width = Math.max(1, viewportWidth)
  const height = Math.max(1, viewportHeight)
  const maxRadius = Math.max(...orderedGroups.map((group) => group.radius))
  const aspect = Math.max(0.8, Math.min(1.8, width / Math.max(height, 1)))
  const columns = Math.max(1, Math.ceil(Math.sqrt(orderedGroups.length * aspect)))
  const rows = Math.ceil(orderedGroups.length / columns)
  const cellWidth = Math.max(320, maxRadius * 2 + 112)
  const cellHeight = Math.max(260, maxRadius * 2 + 96)
  const startX = width / 2 - ((columns - 1) * cellWidth) / 2
  const startY = height / 2 - ((rows - 1) * cellHeight) / 2

  orderedGroups.forEach((group, groupIndex) => {
    const col = groupIndex % columns
    const row = Math.floor(groupIndex / columns)
    const centerX = startX + col * cellWidth
    const centerY = startY + row * cellHeight
    const files = group.files

    if (group.folder) {
      group.folder.x = centerX
      group.folder.y = centerY
    } else if (files.length === 1) {
      files[0].x = centerX
      files[0].y = centerY
      return
    }

    const baseRadius = group.folder ? 92 : 48
    let nodeIndex = 0
    let ringIndex = 0

    while (nodeIndex < files.length) {
      const remaining = files.length - nodeIndex
      const ringCount = ringIndex === 0
        ? Math.min(files.length <= 8 ? files.length : 8, remaining)
        : Math.min(10 + ringIndex * 4, remaining)
      const ringRadius = baseRadius + ringIndex * 58
      const angleOffset = ringIndex % 2 === 0 ? 0 : Math.PI / Math.max(1, ringCount)

      for (let indexInRing = 0; indexInRing < ringCount; indexInRing += 1) {
        const node = files[nodeIndex + indexInRing]
        if (!node) continue
        const angle = ringCount === 1
          ? -Math.PI / 2
          : -Math.PI / 2 + angleOffset + (indexInRing / ringCount) * Math.PI * 2
        node.x = centerX + Math.cos(angle) * ringRadius
        node.y = centerY + Math.sin(angle) * ringRadius
      }

      nodeIndex += ringCount
      ringIndex += 1
    }
  })
}

export function assignGraphClusterAnchors<T extends GraphAnchoredLayoutNode>(nodes: T[]): void {
  const folderAnchors = new Map<string, { x: number; y: number }>()
  const groupSums = new Map<string, { x: number; y: number; count: number }>()

  for (const node of nodes) {
    if (node.x == null || node.y == null) continue
    const groupId = node.type === 'folder' ? node.id : node.group
    if (!groupId) continue
    const current = groupSums.get(groupId) ?? { x: 0, y: 0, count: 0 }
    current.x += node.x
    current.y += node.y
    current.count += 1
    groupSums.set(groupId, current)
    if (node.type === 'folder') {
      folderAnchors.set(node.id, { x: node.x, y: node.y })
    }
  }

  for (const node of nodes) {
    if (node.x == null || node.y == null) continue
    const groupId = node.type === 'folder' ? node.id : node.group
    const groupSum = groupId ? groupSums.get(groupId) : undefined
    const anchor = groupId
      ? folderAnchors.get(groupId) ?? (groupSum ? { x: groupSum.x / groupSum.count, y: groupSum.y / groupSum.count } : undefined)
      : undefined
    node.anchorX = anchor?.x ?? node.x
    node.anchorY = anchor?.y ?? node.y
  }
}

export function getGraphForceLayoutLinks(links: SimLink[]): SimLink[] {
  return links.filter((link) => link.linkType !== 'folder')
}

export function getLinkLevel(linkCount: number): number {
  if (linkCount >= 8) return 4
  if (linkCount >= 5) return 3
  if (linkCount >= 3) return 2
  if (linkCount >= 1) return 1
  return 0
}

export function getNodeRadius(d: { type: 'file' | 'folder'; linkCount: number }): number {
  if (d.type === 'folder') return 24
  if (d.linkCount >= 8) return 12
  if (d.linkCount >= 5) return 9
  if (d.linkCount >= 3) return 7
  if (d.linkCount >= 1) return 5
  return 3
}

export function buildGraphRelationLinkCountMap(
  edges: Array<{ source: string; target: string; linkType: GraphEdgeLinkType }>,
): Map<string, number> {
  const linkCountMap = new Map<string, number>()
  edges.forEach((edge) => {
    if (edge.linkType === 'folder') return
    linkCountMap.set(edge.source, (linkCountMap.get(edge.source) || 0) + 1)
    linkCountMap.set(edge.target, (linkCountMap.get(edge.target) || 0) + 1)
  })
  return linkCountMap
}

export function getGraphFolderNodeId(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return `folder:${normalized || '.'}`
}

export function getGraphNodeGroupId(
  node: { id: string; type: 'file' | 'folder' },
  nodeToFolder: ReadonlyMap<string, string>,
  activeFolderPath?: string | null,
): string | undefined {
  if (node.type === 'folder') return node.id
  return nodeToFolder.get(node.id) ?? (activeFolderPath != null ? getGraphFolderNodeId(activeFolderPath) : undefined)
}

export function getGraphNodeClusterId(node: { id: string; type: 'file' | 'folder'; group?: string }): string {
  return node.type === 'folder' ? node.id : node.group || node.id
}

export function isGraphCrossClusterRelation(
  link: { linkType: GraphEdgeLinkType },
  source: { id: string; type: 'file' | 'folder'; group?: string },
  target: { id: string; type: 'file' | 'folder'; group?: string },
): boolean {
  return link.linkType !== 'folder' && getGraphNodeClusterId(source) !== getGraphNodeClusterId(target)
}

export function getStableGraphGroupIndex(value: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % paletteSize
}

export type GraphNodePosition = [number, number]

export function seedNodePositionsFromCaches<T extends { id: string; x?: number; y?: number }>(
  nodes: T[],
  primary?: ReadonlyMap<string, GraphNodePosition>,
  fallback?: ReadonlyMap<string, GraphNodePosition>,
): { hits: number; hitRate: number } {
  let hits = 0
  for (const node of nodes) {
    const position = primary?.get(node.id) ?? fallback?.get(node.id)
    if (!position) continue
    node.x = position[0]
    node.y = position[1]
    hits++
  }
  return { hits, hitRate: nodes.length === 0 ? 0 : hits / nodes.length }
}

export function shouldSkipGraphAutoZoom(positionSeedHitRate: number, isVisibilityOnlyRerender: boolean): boolean {
  return positionSeedHitRate >= 0.8 || isVisibilityOnlyRerender
}

export interface GraphLabelVisibilityOptions {
  zoom?: number
  nodeCount?: number
  isHovered?: boolean
  isConnected?: boolean
  isSearchMatch?: boolean
}

export function isGraphNodeHiddenByGroup(
  node: { id: string; type: 'file' | 'folder'; group?: string } | null | undefined,
  hiddenGroupIds: ReadonlySet<string>,
): boolean {
  if (!node) return false
  const groupId = node.group ?? (node.type === 'folder' ? node.id : undefined)
  return !!groupId && hiddenGroupIds.has(groupId)
}

export function isGraphLabelHidden(
  node: { type: 'file' | 'folder'; linkCount?: number },
  showLabels: boolean,
  isCurrentNode: boolean,
  options: GraphLabelVisibilityOptions = {},
): boolean {
  if (node.type === 'folder') return false
  if (isCurrentNode || options.isHovered || options.isConnected || options.isSearchMatch) return false
  if (!showLabels) return true

  const zoom = options.zoom ?? 1
  const nodeCount = options.nodeCount ?? 0
  const linkCount = node.linkCount ?? 0

  if (zoom < 0.5) return true
  if (nodeCount >= 300 && zoom < 1.35 && linkCount < 8) return true
  if (nodeCount >= 180 && zoom < 1.2 && linkCount < 5) return true
  if (nodeCount >= 100 && zoom < 1.05 && linkCount < 3) return true
  if (nodeCount >= 60 && zoom < 0.9 && linkCount < 2) return true

  return false
}

export function isGraphNodeHiddenByDisplay(
  node: { type: 'file' | 'folder'; linkCount: number },
  options: Pick<GraphDisplayState, 'showFolders' | 'showOrphans'> & { minLinks: number },
): boolean {
  if (node.type === 'folder') return !options.showFolders
  if (!options.showOrphans && node.linkCount === 0) return true
  if (options.minLinks > 0 && node.linkCount < options.minLinks) return true
  return false
}
