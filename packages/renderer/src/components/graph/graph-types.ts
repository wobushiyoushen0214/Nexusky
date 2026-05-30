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

export const GRAPH_RASTER_NODE_THRESHOLD = 420
export const GRAPH_RASTER_EDGE_THRESHOLD = 900
export const GRAPH_RASTER_DOM_ELEMENT_THRESHOLD = 900

export function shouldUseGraphRasterRenderer(options: {
  visibleNodeCount: number
  visibleLinkCount: number
}): boolean {
  const nodeCount = Math.max(0, options.visibleNodeCount)
  const linkCount = Math.max(0, options.visibleLinkCount)
  return (
    nodeCount >= GRAPH_RASTER_NODE_THRESHOLD ||
    linkCount >= GRAPH_RASTER_EDGE_THRESHOLD ||
    nodeCount + linkCount >= GRAPH_RASTER_DOM_ELEMENT_THRESHOLD
  )
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

const GRAPH_CANVAS_BASE_PADDING = 2400

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
  node: { id: string; type: 'file' | 'folder'; folder?: string },
  nodeToFolder: ReadonlyMap<string, string>,
  activeFolderPath?: string | null,
): string | undefined {
  if (node.type === 'folder') return node.id
  if (node.folder != null) return getGraphFolderNodeId(node.folder)
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
